// Merkezi kimlik doğrulama / yetkilendirme ara katmanları.
//
// Yetki kontrolü uçlara DAĞITILMAZ: /api altındaki tüm trafik `yetkiKapisi`ndan geçer ve
// authorization.service politikasına göre değerlendirilir (varsayılan reddet).
// requireRole / requirePermission, kritik uçlarda ikinci savunma katmanı olarak kullanılır.
const crypto = require('node:crypto')
const { ApiHata } = require('../common/api-error')
const { logla } = require('../common/logger')
const { izinVar, Rol } = require('./roles')
const { acikUcMu, politikaCoz } = require('./authorization.service')
const oturumServisi = require('./session.service')
const denetim = require('../audit/audit.service')

// İstemciden gelen gövdede rol/sağlayıcı taşıyabilecek alan adları.
const ROL_ALANLARI = ['rol', 'role', 'roles', 'yetki', 'yetkiler', 'authProvider', 'auth_provider', 'saglayici', 'isAdmin', 'admin', 'permissions', 'izinler']

/** Durum değiştiren yöntemler — CSRF ve yazma yetkisi kontrolü bunlara uygulanır. */
const YAZMA_YONTEMLERI = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

// ---------------------------------------------------------------------------
// 1) İstemciden gelen rol bilgisini yok say
// ---------------------------------------------------------------------------

// Rol ATAMASININ meşru olduğu tek yer: kullanıcı yönetimi uçları. Bu uçlar zaten
// KULLANICI_YONET izni (yalnızca ADMIN) ister ve rol, isteği YAPANA değil hedef KULLANICI
// KAYDINA uygulanır — kendi yetkisini yükseltme yolu açmaz; denetleyici ayrıca "kendi
// rolünü değiştirme" girişimini reddeder.
const ROL_ATAMASINA_IZINLI = /^\/api\/kullanicilar(\/.*)?$/

/**
 * Rol / yetki alanları istekten TEMİZLENİR.
 *
 * Oturumdaki rol yalnızca sunucuda belirlenir. İstemci gövdede `{"role":"ADMIN"}` gönderse
 * bile bu alanlar denetleyicilere ULAŞMAZ; deneme denetim günlüğüne yazılır.
 *
 * Tek istisna: kullanıcı yönetimi uçlarında gönderilen `rol` değeri, gövdeden silinmeden
 * ÖNCE `req.rolTalebi`ne taşınır. Böylece bir yönetici başka bir hesabın rolünü
 * atayabilirken, "istemci kendi rolünü söyleyemez" kuralı bozulmaz.
 */
function istemciRolunuYokSay(req, res, next) {
  const rolAtanabilir = ROL_ATAMASINA_IZINLI.test(req.path)

  if (rolAtanabilir && req.body && typeof req.body === 'object') {
    const ham = req.body.rol ?? req.body.role
    if (ham != null) req.rolTalebi = String(ham)
  }

  const kaynaklar = [req.body, req.query]
  let denendi = false

  for (const kaynak of kaynaklar) {
    if (!kaynak || typeof kaynak !== 'object') continue
    for (const alan of ROL_ALANLARI) {
      if (Object.prototype.hasOwnProperty.call(kaynak, alan)) {
        denendi = true
        try { delete kaynak[alan] } catch { /* dondurulmuş nesne */ }
      }
    }
  }

  // Kullanıcı yönetiminde rol göndermek normaldir; uyarı yalnızca diğer uçlarda anlamlı.
  if (denendi && !rolAtanabilir) {
    denetim.yaz({
      eylem: denetim.Eylem.ACCESS_DENIED,
      req,
      sonuc: denetim.Sonuc.BASARISIZ,
      kaynak: req.path,
      detay: 'İstemci istek gövdesinde rol/yetki alanı gönderdi; alan yok sayıldı.',
    })
  }
  next()
}

// ---------------------------------------------------------------------------
// 2) CSRF — senkronizasyon token'ı (SameSite=Lax üzerine ikinci katman)
// ---------------------------------------------------------------------------

function sabitZamanliEsit(a, b) {
  const x = Buffer.from(String(a || ''), 'utf8')
  const y = Buffer.from(String(b || ''), 'utf8')
  if (x.length === 0 || x.length !== y.length) return false
  return crypto.timingSafeEqual(x, y)
}

/**
 * Durum değiştiren her istekte X-CSRF-Token başlığı, oturumdaki token ile karşılaştırılır.
 * Token istemciye yanıt GÖVDESİYLE verilir (çerezle değil) ve bellekte tutulur —
 * böylece başka bir sitenin JavaScript'i onu okuyamaz.
 */
function csrfKontrol(req, res, next) {
  if (!YAZMA_YONTEMLERI.has(req.method)) return next()

  const beklenen = req.session?.csrfToken
  const gelen = req.get('x-csrf-token') || req.body?._csrf

  if (!beklenen || !sabitZamanliEsit(beklenen, gelen)) {
    denetim.yaz({
      eylem: denetim.Eylem.CSRF_REJECTED,
      req,
      sonuc: denetim.Sonuc.BASARISIZ,
      kaynak: req.path,
      detay: beklenen ? 'CSRF token eşleşmedi' : 'Oturumda CSRF token yok',
    })
    return next(ApiHata.yasak('Oturum doğrulaması başarısız. Sayfayı yenileyip tekrar deneyin.', { kod: 'CSRF_GECERSIZ' }))
  }
  next()
}

// ---------------------------------------------------------------------------
// 3) Oturum bağlamı
// ---------------------------------------------------------------------------

/**
 * Oturumdaki kullanıcıyı `req.kullanici`ya yazar. Mutlak ömrü dolan oturum yok edilir.
 * Kimlik doğrulaması ZORUNLU KILMAZ — yalnızca bağlamı çözer.
 */
async function baglamCoz(req, res, next) {
  try {
    if (req.session?.kullanici) {
      if (oturumServisi.mutlakSureDoldu(req)) {
        const kullaniciAdi = req.session.kullanici.kullaniciAdi
        await oturumServisi.oturumKapat(req)
        denetim.yaz({
          eylem: denetim.Eylem.SESSION_EXPIRED,
          req,
          kullaniciAdi,
          sonuc: denetim.Sonuc.BASARISIZ,
          detay: 'Mutlak oturum ömrü doldu',
        })
        return next()
      }
      // Rol ve sağlayıcı YALNIZCA sunucu tarafı oturumdan okunur.
      req.kullanici = Object.freeze({ ...req.session.kullanici })
    }
    next()
  } catch (e) {
    next(e)
  }
}

// ---------------------------------------------------------------------------
// 4) Kapılar
// ---------------------------------------------------------------------------

function girisGerekli(req, res, next) {
  if (!req.kullanici) {
    return next(ApiHata.yetkisiz('Bu işlem için giriş yapmanız gerekiyor.', { kod: 'GIRIS_GEREKLI' }))
  }
  next()
}

/** Belirli rol(ler) şart. */
function rolGerekli(...roller) {
  const izinliRoller = roller.flat()
  return (req, res, next) => {
    if (!req.kullanici) {
      return next(ApiHata.yetkisiz('Bu işlem için giriş yapmanız gerekiyor.', { kod: 'GIRIS_GEREKLI' }))
    }
    if (!izinliRoller.includes(req.kullanici.rol)) {
      denetim.yaz({
        eylem: denetim.Eylem.ACCESS_DENIED,
        req,
        sonuc: denetim.Sonuc.BASARISIZ,
        kaynak: req.path,
        detay: `rol=${req.kullanici.rol}, gereken=${izinliRoller.join('|')}`,
      })
      return next(ApiHata.yasak('Bu işlem için gerekli yetkiye sahip değilsiniz.', { kod: 'YETKI_YOK' }))
    }
    next()
  }
}

/** Belirli izin şart. */
function izinGerekli(izin) {
  return (req, res, next) => {
    if (!req.kullanici) {
      return next(ApiHata.yetkisiz('Bu işlem için giriş yapmanız gerekiyor.', { kod: 'GIRIS_GEREKLI' }))
    }
    if (!izinVar(req.kullanici.rol, izin)) {
      denetim.yaz({
        eylem: denetim.Eylem.ACCESS_DENIED,
        req,
        sonuc: denetim.Sonuc.BASARISIZ,
        kaynak: req.path,
        detay: `izin=${izin} yok (rol=${req.kullanici.rol})`,
      })
      return next(ApiHata.yasak('Bu işlem için gerekli yetkiye sahip değilsiniz.', { kod: 'YETKI_YOK' }))
    }
    next()
  }
}

const adminGerekli = rolGerekli(Rol.ADMIN)

/**
 * MERKEZİ KAPI — /api altındaki tüm istekler buradan geçer.
 *
 * Sıra: açık uç mu? → CSRF → kimlik doğrulaması → politika → izin.
 * Politikada TANIMSIZ uç REDDEDİLİR (varsayılan reddet): yetki kontrolü yazmayı unutmak
 * güvenlik açığı değil, 403 üretir.
 */
function yetkiKapisi(req, res, next) {
  const yol = req.path.replace(/\/+$/, '') || '/'

  // Yol geçişi (path traversal): "/urunler/../kullanicilar" gibi bir yol politika
  // eşleşmesini yanıltmaya çalışabilir. Normalleştirmeye güvenmek yerine doğrudan reddet.
  if (yol.includes('..') || /%2e%2e/i.test(req.originalUrl || '')) {
    denetim.yaz({
      eylem: denetim.Eylem.ACCESS_DENIED, req, sonuc: denetim.Sonuc.BASARISIZ,
      kaynak: `${req.method} ${yol}`, detay: 'Yol geçişi (path traversal) denemesi',
    })
    return next(ApiHata.kotuIstek('Geçersiz istek yolu.', { kod: 'GECERSIZ_YOL' }))
  }

  if (acikUcMu(req.method, yol)) return next()

  if (!req.kullanici) {
    return next(ApiHata.yetkisiz('Bu işlem için giriş yapmanız gerekiyor.', { kod: 'GIRIS_GEREKLI' }))
  }

  const politika = politikaCoz(req.method, yol)

  if (!politika.bulundu) {
    denetim.yaz({
      eylem: denetim.Eylem.ACCESS_DENIED,
      req,
      sonuc: denetim.Sonuc.BASARISIZ,
      kaynak: `${req.method} ${yol}`,
      detay: 'Politikada tanımsız uç — varsayılan reddet',
    })
    logla(`[YETKI] Politikasız uç reddedildi: ${req.method} ${yol} (kullanici=${req.kullanici.kullaniciAdi})`)
    return next(ApiHata.yasak('Bu işlem için gerekli yetkiye sahip değilsiniz.', { kod: 'YETKI_YOK' }))
  }

  if (politika.izin && !izinVar(req.kullanici.rol, politika.izin)) {
    denetim.yaz({
      eylem: denetim.Eylem.ACCESS_DENIED,
      req,
      sonuc: denetim.Sonuc.BASARISIZ,
      kaynak: `${req.method} ${yol}`,
      detay: `izin=${politika.izin} yok (rol=${req.kullanici.rol})`,
    })
    return next(ApiHata.yasak('Bu işlem için gerekli yetkiye sahip değilsiniz.', { kod: 'YETKI_YOK' }))
  }

  next()
}

module.exports = {
  istemciRolunuYokSay,
  csrfKontrol,
  baglamCoz,
  girisGerekli,
  rolGerekli,
  izinGerekli,
  adminGerekli,
  yetkiKapisi,
  YAZMA_YONTEMLERI,
}
