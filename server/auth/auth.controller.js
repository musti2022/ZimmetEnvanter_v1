// Kimlik doğrulama uçları: POST /login, POST /logout, GET /me, GET /csrf
//
// HATA MESAJI POLİTİKASI (kullanıcı sayımına karşı):
// Giriş başarısızlığının SEBEBİ ne olursa olsun istemciye TEK bir genel mesaj döner:
//   • hesap yok   • parola yanlış   • hesap pasif   • tanımsız rol
// Hepsi → 401 + "Kullanıcı adı, parola veya erişim yetkisi geçersiz."
//
// Amaç kullanıcı sayımını (username enumeration) engellemektir: saldırgan hangi kullanıcı
// adının var olduğunu yanıtlardan ayırt edemez.
const express = require('express')
const { asyncSar } = require('../common/async-handler')
const { ApiHata } = require('../common/api-error')
const { logla } = require('../common/logger')
const { girisAyar, oturumAyar } = require('../config/auth.config')
const { ROL_IZINLERI } = require('./roles')
const kimlikServisi = require('./authentication.service')
const oturumServisi = require('./session.service')
const hizSinir = require('./rate-limit.service')
const denetim = require('../audit/audit.service')
const { girisGerekli } = require('./auth.middleware')

const router = express.Router()

/** İstemciye gönderilecek kullanıcı bağlamı — parola/özet/token İÇERMEZ. */
function baglamCiktisi(req) {
  const k = req.kullanici
  return {
    kullanici: {
      kullaniciId: k.kullaniciId,
      kullaniciAdi: k.kullaniciAdi,
      gorunenAd: k.gorunenAd,
      eposta: k.eposta,
      rol: k.rol,
      authProvider: k.saglayici,
      domain: k.alanAdi || null,
    },
    izinler: ROL_IZINLERI[k.rol] || [],
    oturum: {
      bostaDakika: oturumAyar.bostaDakika,
      mutlakBitis: req.session?.mutlakBitis || null,
    },
  }
}

// ---------------------------------------------------------------------------
// GET /api/auth/csrf — giriş formu için token (anonim oturum oluşturur)
// ---------------------------------------------------------------------------
router.get('/csrf', (req, res) => {
  const token = oturumServisi.csrfTokenUret(req)
  res.json({ csrfToken: token })
})

// ---------------------------------------------------------------------------
// GET /api/auth/me — oturum bağlamı
// ---------------------------------------------------------------------------
router.get('/me', (req, res) => {
  if (!req.kullanici) {
    // Giriş ekranının doğrudan POST edebilmesi için token da verilir.
    return res.status(401).json({
      hata: 'Oturum bulunamadı.',
      kod: 'GIRIS_GEREKLI',
      csrfToken: oturumServisi.csrfTokenUret(req),
    })
  }
  res.json({ ...baglamCiktisi(req), csrfToken: req.session.csrfToken })
})

// ---------------------------------------------------------------------------
// POST /api/auth/login
// ---------------------------------------------------------------------------
router.post('/login', asyncSar(async (req, res) => {
  const hamKullaniciAdi = String(req.body?.kullaniciAdi ?? req.body?.username ?? '')
  const parola = String(req.body?.parola ?? req.body?.password ?? '')
  const ip = denetim.istemciIp(req)

  // Günlük ve hız sınırlama anahtarı için normalize edilmiş ad (parola ASLA loglanmaz).
  const anahtarAdi = hamKullaniciAdi.trim().toLowerCase().slice(0, 100) || '(bos)'

  if (!hamKullaniciAdi.trim() || !parola) {
    await denetim.yaz({
      eylem: denetim.Eylem.LOGIN_FAILED, req, kullaniciAdi: anahtarAdi,
      sonuc: denetim.Sonuc.BASARISIZ, detay: 'kullanıcı adı veya parola boş',
    })
    throw ApiHata.kotuIstek(girisAyar.genelHataMesaji, { kod: 'GIRIS_GECERSIZ' })
  }

  // ---- Hız sınırı: pahalı Argon2 doğrulamasından ÖNCE ----
  const sinir = await hizSinir.girisKontrol(anahtarAdi, ip)
  if (sinir.engelli) {
    await denetim.yaz({
      eylem: denetim.Eylem.LOGIN_RATE_LIMITED, req, kullaniciAdi: anahtarAdi,
      sonuc: denetim.Sonuc.BASARISIZ, detay: sinir.sebep,
    })
    throw ApiHata.cokFazlaIstek(
      `Çok fazla başarısız giriş denemesi. Lütfen ${Math.ceil(sinir.kalanSaniye / 60)} dakika sonra tekrar deneyin.`,
      { kod: 'COK_FAZLA_DENEME', basliklar: { 'Retry-After': String(sinir.kalanSaniye) } },
    )
  }

  // ---- Kimlik doğrulama + sağlayıcı seçimi ----
  const sonuc = await kimlikServisi.girisYap(hamKullaniciAdi, parola)

  if (!sonuc.ok) {
    await hizSinir.basarisizKaydet(anahtarAdi, ip)
    await denetim.yaz({
      eylem: denetim.Eylem.LOGIN_FAILED, req, kullaniciAdi: anahtarAdi,
      saglayici: sonuc.saglayici, sonuc: denetim.Sonuc.BASARISIZ,
      detay: sonuc.sebep, // gerçek sebep YALNIZCA burada
    })
    throw ApiHata.yetkisiz(girisAyar.genelHataMesaji, { kod: 'GIRIS_GECERSIZ', icDetay: sonuc.sebep })
  }

  // ---- Oturum oluştur (kimlik yenilenir → session fixation kapalı) ----
  const csrfToken = await oturumServisi.oturumBaslat(req, sonuc.kimlik)
  req.kullanici = Object.freeze({ ...req.session.kullanici })

  await hizSinir.basariliKaydet(anahtarAdi)

  await denetim.yaz({
    eylem: denetim.Eylem.LOGIN_SUCCESS, req, sonuc: denetim.Sonuc.BASARILI,
    detay: `veritabanı rolü → rol=${sonuc.kimlik.rol}`,
  })

  res.json({ ...baglamCiktisi(req), csrfToken })
}))

// ---------------------------------------------------------------------------
// POST /api/auth/logout — oturumu sunucuda yok eder, çerezi siler
// ---------------------------------------------------------------------------
router.post('/logout', asyncSar(async (req, res) => {
  const vardi = Boolean(req.kullanici)
  if (vardi) {
    await denetim.yaz({ eylem: denetim.Eylem.LOGOUT, req, sonuc: denetim.Sonuc.BASARILI })
  }
  await oturumServisi.oturumKapat(req)
  res.clearCookie(oturumAyar.cerezAdi, {
    httpOnly: true,
    secure: oturumAyar.guvenliCerez,
    sameSite: oturumAyar.sameSite,
    path: '/',
  })
  res.json({ ok: true })
}))

// Çıkış CSRF kontrolünden muaf DEĞİLDİR; ancak oturumu olmayan istemci de 200 alır (idempotent).

// ---------------------------------------------------------------------------
// GET /api/auth/oturum — kalan süre bilgisi (istemci uyarısı için)
// ---------------------------------------------------------------------------
router.get('/oturum', girisGerekli, (req, res) => {
  res.json({
    mutlakBitis: req.session.mutlakBitis,
    bostaBitis: req.session.cookie?.expires || null,
    sunucuZamani: Date.now(),
  })
})

module.exports = router
