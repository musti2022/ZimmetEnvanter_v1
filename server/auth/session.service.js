// Oturum yönetimi: SQL Server tabanlı oturum deposu + kullanıcı bağlamı + CSRF token'ı.
//
// ÇEREZ GÜVENLİĞİ
//   HttpOnly : JavaScript çereze erişemez → XSS ile oturum çalınamaz.
//   Secure   : yalnızca HTTPS üzerinde gönderilir (üretimde varsayılan açık).
//   SameSite : Lax → siteler arası POST'ta çerez taşınmaz (CSRF'e karşı ilk katman).
//   Token localStorage'da TUTULMAZ; kimlik yalnızca HttpOnly çerezdedir.
//
// OTURUM SABİTLEME (session fixation): girişte oturum kimliği ZORUNLU olarak yenilenir.
// Depoda oturum kimliğinin kendisi değil SHA-256 ÖZETİ saklanır: veritabanı okuması
// (yedek, log, yetkisiz SELECT) doğrudan kullanılabilir oturum kimliği vermez.
const crypto = require('node:crypto')
const session = require('express-session')
const { sql, havuzGetir } = require('../db')
const { oturumAyar } = require('../config/auth.config')
const { logla } = require('../common/logger')

const simdi = () => new Date().toISOString()
const sidOzet = (sid) => crypto.createHash('sha256').update(String(sid)).digest('hex')

// ---------------------------------------------------------------------------
// SQL oturum deposu
// ---------------------------------------------------------------------------

class SqlOturumDeposu extends session.Store {
  async get(sid, cb) {
    try {
      const p = await havuzGetir()
      const r = await p.request()
        .input('id', sql.NVarChar(64), sidOzet(sid))
        .input('simdi', sql.NVarChar(40), simdi())
        .query('SELECT veri FROM dbo.Oturumlar WHERE id = @id AND bitis > @simdi')
      const ham = r.recordset[0]?.veri
      if (!ham) return cb(null, null)
      return cb(null, JSON.parse(ham))
    } catch (e) {
      logla('[OTURUM] get hatası:', e?.message || e)
      return cb(e)
    }
  }

  async set(sid, oturum, cb) {
    try {
      const bitis = oturum?.cookie?.expires
        ? new Date(oturum.cookie.expires).toISOString()
        : new Date(Date.now() + oturumAyar.bostaDakika * 60_000).toISOString()

      const p = await havuzGetir()
      await p.request()
        .input('id', sql.NVarChar(64), sidOzet(sid))
        .input('veri', sql.NVarChar(sql.MAX), JSON.stringify(oturum))
        .input('kul', sql.NVarChar(100), oturum?.kullanici?.kullaniciAdi || null)
        .input('erisim', sql.NVarChar(40), simdi())
        .input('bitis', sql.NVarChar(40), bitis)
        .query(`
          MERGE dbo.Oturumlar WITH (HOLDLOCK) AS h
          USING (SELECT @id AS id) AS k ON h.id = k.id
          WHEN MATCHED THEN UPDATE SET veri = @veri, kullaniciAdi = @kul, sonErisim = @erisim, bitis = @bitis
          WHEN NOT MATCHED THEN INSERT (id, veri, kullaniciAdi, olusturma, sonErisim, bitis)
            VALUES (@id, @veri, @kul, @erisim, @erisim, @bitis);`)
      return cb(null)
    } catch (e) {
      logla('[OTURUM] set hatası:', e?.message || e)
      return cb(e)
    }
  }

  async touch(sid, oturum, cb) {
    try {
      const bitis = oturum?.cookie?.expires
        ? new Date(oturum.cookie.expires).toISOString()
        : new Date(Date.now() + oturumAyar.bostaDakika * 60_000).toISOString()
      const p = await havuzGetir()
      await p.request()
        .input('id', sql.NVarChar(64), sidOzet(sid))
        .input('erisim', sql.NVarChar(40), simdi())
        .input('bitis', sql.NVarChar(40), bitis)
        .query('UPDATE dbo.Oturumlar SET sonErisim = @erisim, bitis = @bitis WHERE id = @id')
      return cb(null)
    } catch (e) {
      logla('[OTURUM] touch hatası:', e?.message || e)
      return cb(e)
    }
  }

  async destroy(sid, cb) {
    try {
      const p = await havuzGetir()
      await p.request()
        .input('id', sql.NVarChar(64), sidOzet(sid))
        .query('DELETE FROM dbo.Oturumlar WHERE id = @id')
      return cb(null)
    } catch (e) {
      logla('[OTURUM] destroy hatası:', e?.message || e)
      return cb(e)
    }
  }
}

/** Süresi dolmuş oturumları siler. */
async function suresiDolanlariTemizle() {
  try {
    const p = await havuzGetir()
    const r = await p.request()
      .input('simdi', sql.NVarChar(40), simdi())
      .query('DELETE FROM dbo.Oturumlar WHERE bitis <= @simdi')
    if (r.rowsAffected[0] > 0) logla(`[OTURUM] ${r.rowsAffected[0]} süresi dolmuş oturum silindi.`)
  } catch (e) {
    logla('[OTURUM] Temizlik başarısız:', e?.message || e)
  }
}

/** Bir kullanıcının TÜM oturumlarını sonlandırır (hesap pasifleştirilince/silinince). */
async function kullanicininOturumlariniKapat(kullaniciAdi) {
  try {
    const p = await havuzGetir()
    const r = await p.request()
      .input('k', sql.NVarChar(100), String(kullaniciAdi || '').toLowerCase())
      .query('DELETE FROM dbo.Oturumlar WHERE kullaniciAdi = @k')
    return r.rowsAffected[0]
  } catch (e) {
    logla('[OTURUM] Kullanıcı oturumları kapatılamadı:', e?.message || e)
    return 0
  }
}

// ---------------------------------------------------------------------------
// express-session ara katmanı
// ---------------------------------------------------------------------------

function oturumAraKatmani() {
  return session({
    name: oturumAyar.cerezAdi,
    secret: oturumAyar.gizliAnahtar,
    store: new SqlOturumDeposu(),
    resave: false,
    saveUninitialized: false, // giriş yapmamış ziyaretçi için depoda kayıt açılmaz
    rolling: true,            // her istekte boşta kalma süresi tazelenir (idle timeout)
    proxy: oturumAyar.vekileGuven,
    cookie: {
      httpOnly: true,
      secure: oturumAyar.guvenliCerez,
      sameSite: oturumAyar.sameSite,
      maxAge: oturumAyar.bostaDakika * 60_000,
      path: '/',
    },
  })
}

// ---------------------------------------------------------------------------
// Kullanıcı bağlamı
// ---------------------------------------------------------------------------

const yenidenOlustur = (req) => new Promise((coz, red) => {
  req.session.regenerate((e) => (e ? red(e) : coz()))
})

const kaydet = (req) => new Promise((coz, red) => {
  req.session.save((e) => (e ? red(e) : coz()))
})

const yokEt = (req) => new Promise((coz) => {
  req.session.destroy(() => coz())
})

/** Yeni CSRF token'ı üretir ve oturuma yazar. */
function csrfTokenUret(req) {
  const token = crypto.randomBytes(32).toString('base64url')
  req.session.csrfToken = token
  return token
}

/**
 * Başarılı giriş sonrası sunucu tarafı kullanıcı bağlamını oluşturur.
 * Oturum kimliği YENİLENİR (session fixation), rol ve sağlayıcı SUNUCUDA belirlenir.
 */
async function oturumBaslat(req, kimlik) {
  await yenidenOlustur(req)

  const baslangic = Date.now()
  req.session.kullanici = {
    kullaniciId: kimlik.kullaniciId || null,
    kullaniciAdi: kimlik.kullaniciAdi,
    gorunenAd: kimlik.gorunenAd,
    eposta: kimlik.eposta || '',
    rol: kimlik.rol,                 // SUNUCU belirler
    saglayici: kimlik.saglayici,     // SUNUCU belirler
    alanAdi: kimlik.alanAdi || null,
  }
  req.session.girisZamani = baslangic
  req.session.mutlakBitis = baslangic + oturumAyar.mutlakSaat * 3_600_000

  const csrf = csrfTokenUret(req)
  await kaydet(req)
  return csrf
}

async function oturumKapat(req) {
  await yokEt(req)
}

/** Mutlak ömür dolmuş mu? (boşta kalma süresi çerez maxAge ile ayrı yönetilir) */
function mutlakSureDoldu(req) {
  const bitis = req.session?.mutlakBitis
  return typeof bitis === 'number' && Date.now() > bitis
}

module.exports = {
  SqlOturumDeposu,
  oturumAraKatmani,
  oturumBaslat,
  oturumKapat,
  mutlakSureDoldu,
  csrfTokenUret,
  suresiDolanlariTemizle,
  kullanicininOturumlariniKapat,
}
