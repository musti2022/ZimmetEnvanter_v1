// Test yardımcıları — veritabanı veya Active Directory GEREKTİRMEZ.
// Ara katmanlar gerçek üretim kodudur; yalnızca oturum ve denetim yazımı sahtelenir.
process.env.NODE_ENV = 'test'
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-oturum-anahtari-en-az-32-karakter-uzunlugunda'

const express = require('express')
const denetim = require('../audit/audit.service')

// Denetim kayıtları belleğe alınır (SQL'e gidilmez) ve testlerde doğrulanabilir.
const denetimKayitlari = []
denetim.yaz = async (k) => { denetimKayitlari.push(k) }

const araKatman = require('../auth/auth.middleware')

const TEST_CSRF = 'test-csrf-token-degeri'

/**
 * Yetki kapısını gerçek hâliyle çalıştıran küçük bir test sunucusu kurar.
 * @param {object|null} kullanici Oturumdaki kullanıcı (null → anonim)
 */
function uygulamaKur(kullanici = null) {
  const app = express()
  app.use(express.json())

  // express-session yerine sabit oturum (SQL bağımlılığı olmasın)
  app.use((req, res, next) => {
    req.session = {
      csrfToken: TEST_CSRF,
      kullanici: kullanici || undefined,
      mutlakBitis: Date.now() + 3_600_000,
      regenerate: (cb) => cb(null),
      save: (cb) => cb(null),
      destroy: (cb) => cb(null),
    }
    next()
  })

  app.use(araKatman.baglamCoz)
  app.use(araKatman.istemciRolunuYokSay)

  const api = express.Router()
  // index.js ile AYNI sıra: önce yetki, sonra CSRF.
  api.use(araKatman.yetkiKapisi)
  api.use(araKatman.csrfKontrol)
  // Kapıyı geçen her istek 200 döner → test edilen tek şey YETKİ KARARIDIR.
  api.use((req, res) => res.json({
    ok: true,
    rol: req.kullanici?.rol || null,
    govde: req.body,
    rolTalebi: req.rolTalebi ?? null, // yalnızca kullanıcı yönetimi uçlarında dolar
  }))
  app.use('/api', api)

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    res.status(err.durum || 500).json({ hata: err.message, kod: err.kod })
  })

  return app
}

/** Test sunucusunu dinlemeye alır ve bir `cagir` yardımcısı döndürür. */
async function sunucuBaslat(kullanici = null) {
  const app = uygulamaKur(kullanici)
  const server = await new Promise((coz) => {
    const s = app.listen(0, '127.0.0.1', () => coz(s))
  })
  const port = server.address().port

  const cagir = async (yontem, yol, { govde, csrf = TEST_CSRF, basliklar = {} } = {}) => {
    const secenek = { method: yontem, headers: { 'Content-Type': 'application/json', ...basliklar } }
    if (csrf !== null) secenek.headers['X-CSRF-Token'] = csrf
    // GET/HEAD gövde taşıyamaz; test tablolarında tek bir gövde geçildiği için burada süzülür.
    if (govde !== undefined && !['GET', 'HEAD'].includes(yontem)) secenek.body = JSON.stringify(govde)
    const r = await fetch(`http://127.0.0.1:${port}${yol}`, secenek)
    const j = await r.json().catch(() => null)
    return { durum: r.status, govde: j }
  }

  return { cagir, kapat: () => new Promise((coz) => server.close(coz)) }
}

const VIEWER = Object.freeze({
  kullaniciId: '11111111-1111-1111-1111-111111111111',
  kullaniciAdi: 'user01',
  gorunenAd: 'User 01',
  eposta: '',
  rol: 'VIEWER',
  saglayici: 'LOCAL',
  alanAdi: null,
})

const ADMIN = Object.freeze({
  kullaniciId: null,
  kullaniciAdi: 'admin01',
  gorunenAd: 'Admin User',
  eposta: '',
  rol: 'ADMIN',
  saglayici: 'LOCAL',
  alanAdi: 'istikbaltr.local',
})

module.exports = { sunucuBaslat, uygulamaKur, VIEWER, ADMIN, TEST_CSRF, denetimKayitlari }
