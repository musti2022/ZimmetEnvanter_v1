// Zimmet & Envanter API — Express + SQL Server
// Dev: Vite 5175 /api proxy'siyle. Üretim: dist/ statiklerini de bu sunucu servis eder.
//
// Bu dosya yalnızca BOOTSTRAP'tır: yapılandırma yükler, güvenlik ara katmanlarını sıraya
// dizer, modül router'larını bağlar. İş mantığı auth/ users/ inventory/ settings/ audit/
// klasörlerindedir.
require('./config/env') // .env'i en başta yükle

const path = require('node:path')
const fs = require('node:fs')
const https = require('node:https')
const express = require('express')
const helmet = require('helmet')

const { sertifikaGetir, yerelIpler } = require('./sertifika')

const { sql, havuzGetir, semaKur, istek } = require('./db')
const { logla } = require('./common/logger')
const { ApiHata } = require('./common/api-error')
const { URETIM } = require('./config/env')
const { oturumAyar } = require('./config/auth.config')

const oturumServisi = require('./auth/session.service')
const araKatman = require('./auth/auth.middleware')
const hizSinir = require('./auth/rate-limit.service')
const denetim = require('./audit/audit.service')
const canli = require('./common/canli')

const authRouter = require('./auth/auth.controller')
const inventoryRouter = require('./inventory/inventory.controller')
const assignmentsRouter = require('./inventory/assignments.controller')
const referenceRouter = require('./inventory/reference.controller')
const settingsRouter = require('./settings/settings.controller')
const phonesRouter = require('./phones/phones.controller')
const usersRouter = require('./users/users.controller')
const auditRouter = require('./audit/audit.controller')
const adminRouter = require('./admin/admin.controller')

// Port: komut satırı argümanı > ZE_PORT > 5176.
// Dev script API'yi 5177'de çalıştırır ki açılışta otomatik başlayan üretim sunucusuyla (5176) çakışmasın.
const PORT = Number(process.argv[2] || process.env.ZE_PORT || 5176)
const DENETIM_SAKLAMA_GUN = Number(process.env.AUDIT_RETENTION_DAYS || 365)

// HTTPS portu: HTTP portunun 100 fazlası (5176 → 5276; dev API'nin 5177'siyle çakışmaz).
// Tarayıcılar kamerayı yalnızca secure context'te açtırdığından canlı barkod taraması için
// HTTPS şart. Oturum çerezi de Secure işaretliyken yalnızca bu dinleyiciden taşınabilir.
const HTTPS_PORT = Number(process.env.ZE_HTTPS_PORT || PORT + 100)

const app = express()

// Beklenmeyen hatalar süreci ÖLDÜRMESİN (görev yeniden başlatmaz); logla ve devam et.
process.on('uncaughtException', (e) => logla('[KRITIK] uncaughtException:', e))
process.on('unhandledRejection', (e) => logla('[KRITIK] unhandledRejection:', e))

// ---------------------------------------------------------------------------
// GÜVENLİK ARA KATMANLARI — sıra önemlidir
// ---------------------------------------------------------------------------

// Ters vekil arkasında gerçek istemci IP'si ve "secure" çerez tespiti için.
// TRUST_PROXY yalnızca gerçekten vekil varsa açılmalı — aksi hâlde X-Forwarded-For
// sahtelenerek hız sınırı atlatılabilir.
if (oturumAyar.vekileGuven) app.set('trust proxy', 1)
app.disable('x-powered-by')

// Güvenlik başlıkları. CSP: XSS'in etkisini sınırlar (harici script yüklenemez, inline
// script çalışamaz). style-src'de 'unsafe-inline' React'in style={{…}} nitelikleri için gerekli.
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'blob:'],
      fontSrc: ["'self'", 'data:'],
      connectSrc: ["'self'", 'https://api.emailjs.com'], // e-posta bildirimi (EmailJS)
      workerSrc: ["'self'", 'blob:'],                    // jsPDF / html2canvas
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],                        // clickjacking
      baseUri: ["'self'"],
      formAction: ["'self'"],                            // open redirect / form hijacking
      ...(URETIM ? { upgradeInsecureRequests: [] } : {}),
    },
  },
  crossOriginEmbedderPolicy: false, // logo/PDF üretimi için gevşetildi
  hsts: URETIM ? { maxAge: 31_536_000, includeSubDomains: true } : false,
  referrerPolicy: { policy: 'same-origin' },
}))

// İmza görselleri ve yedek dosyaları için geniş limit; API dışı gövdeler kabul edilmez.
app.use(express.json({ limit: '50mb' }))
app.use(express.urlencoded({ extended: false, limit: '1mb' }))

// Oturum (HttpOnly + Secure + SameSite çerez, SQL tabanlı depo)
app.use(oturumServisi.oturumAraKatmani())

// Oturumdaki kullanıcıyı req.kullanici'ya çöz (rol YALNIZCA buradan gelir)
app.use(araKatman.baglamCoz)

// İstemcinin gönderdiği rol/yetki alanlarını sil (privilege escalation)
app.use(araKatman.istemciRolunuYokSay)

// ---------------------------------------------------------------------------
// API — tüm trafik CSRF ve merkezi yetki kapısından geçer
// ---------------------------------------------------------------------------

const api = express.Router()

api.get('/saglik', (req, res) => res.json({ ok: true, zaman: new Date().toISOString() }))

// Sıra önemlidir: önce kimlik/yetki, sonra CSRF.
// Tersi durumda oturumu olmayan bir istemci, CSRF token'ı da olmadığı için korumalı uçlarda
// 401 yerine 403 alırdı — "giriş yapmalısın" ile "token bayatladı" ayırt edilemezdi.
// CSRF koruması bundan zarar görmez: siteler arası sahte istek, kimlik doğrulamasını
// (kurbanın çerezi sayesinde) geçse bile durum değiştirmeden CSRF kapısında durur.
api.use(araKatman.yetkiKapisi)  // kimlik doğrulama + politika (VARSAYILAN REDDET)
api.use(araKatman.csrfKontrol)  // durum değiştiren isteklerde token doğrulaması

// Canlı güncelleme: açık ekranlar /olaylar'a bağlanır; başarılı her yazmadan sonra "degisti" yayınlanır.
api.get('/olaylar', canli.abone)
api.use(canli.yazmaSonrasiYayinla)

api.use('/auth', authRouter)
api.use('/', inventoryRouter)      // /tumu, /urunler…
api.use('/belgeler', assignmentsRouter)
api.use('/', referenceRouter)      // /urun-listesi, /personel…
api.use('/', settingsRouter)       // /ayarlar, /yedek
api.use('/cep', phonesRouter)
api.use('/kullanicilar', usersRouter)
api.use('/loglar', auditRouter)
api.use('/yonetim', adminRouter)

// Politikada tanımlı ama router'ı olmayan yol → 404 (JSON)
api.use((req, res) => res.status(404).json({ hata: 'İstenen kaynak bulunamadı.', kod: 'BULUNAMADI' }))

app.use('/api', api)

// ---------------------------------------------------------------------------
// Statik dosyalar (üretim)
// ---------------------------------------------------------------------------
// Giriş ekranının yüklenebilmesi için statikler herkese açıktır; korunan olan API'dir.
// Tek sayfa uygulaması olduğundan /login, /dashboard gibi istemci yolları index.html'e düşer.


function distGuncelle() {
  // Dev API (5177): dist'i "npm run dev" içindeki "vite build --watch" güncel tutar;
  // telefondan açılan HTTPS (5277) dinleyicisi bu dist'i servis eder.
  if (PORT === 5177) return
  const kokDizin = path.join(__dirname, '..')
  const distIndex = path.join(kokDizin, 'dist', 'index.html')

  const enYeniZaman = (dizin) => {
    let t = 0
    for (const ad of fs.readdirSync(dizin)) {
      const tam = path.join(dizin, ad)
      const st = fs.statSync(tam)
      t = Math.max(t, st.isDirectory() ? enYeniZaman(tam) : st.mtimeMs)
    }
    return t
  }

  try {
    const distVar = fs.existsSync(distIndex)
    const kokIndex = path.join(kokDizin, 'index.html')
    const enSonKaynak = Math.max(
      enYeniZaman(path.join(kokDizin, 'src')),
      fs.existsSync(kokIndex) ? fs.statSync(kokIndex).mtimeMs : 0,
    )
    const distZamani = distVar ? fs.statSync(distIndex).mtimeMs : 0
    if (distVar && distZamani >= enSonKaynak) return // dist güncel

    logla(distVar ? 'dist bayat — yeniden derleniyor…' : 'dist yok — derleniyor…')
    const { execFileSync } = require('node:child_process')
    const viteBin = path.join(kokDizin, 'node_modules', 'vite', 'bin', 'vite.js')
    execFileSync(process.execPath, [viteBin, 'build'], { cwd: kokDizin, stdio: 'inherit' })
    logla('dist derlendi.')
  } catch (e) {
    logla('[UYARI] dist derlenemedi, mevcut sürümle devam ediliyor:', e?.message || e)
  }
}

distGuncelle()

const distYolu = path.join(__dirname, '..', 'dist')
// dist sonradan oluşabilir (dev'de "vite build --watch"), bu yüzden her istekte bakılır.
app.use(express.static(distYolu))
app.get(/^(?!\/api\/).*/, (req, res, next) => {
  const index = path.join(distYolu, 'index.html')
  if (!fs.existsSync(index)) return next()
  res.sendFile(index)
})

// ---------------------------------------------------------------------------
// Merkezi hata yakalama
// ---------------------------------------------------------------------------
// İstemciye yalnızca ApiHata mesajları gider. Beklenmeyen hatalarda yığın izi ve SQL
// ayrıntısı SIZDIRILMAZ — bunlar veritabanı şeması hakkında bilgi verir.

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err instanceof ApiHata) {
    if (err.basliklar) res.set(err.basliklar)
    if (err.icDetay) logla(`[API ${err.durum}] ${req.method} ${req.originalUrl} — ${err.icDetay}`)
    return res.status(err.durum).json({ hata: err.message, kod: err.kod || undefined })
  }
  if (err?.type === 'entity.too.large') {
    return res.status(413).json({ hata: 'Gönderilen veri çok büyük.', kod: 'COK_BUYUK' })
  }
  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json({ hata: 'Geçersiz istek biçimi.', kod: 'GECERSIZ_JSON' })
  }
  logla('[HATA]', req.method, req.originalUrl, err)
  res.status(500).json({ hata: 'Sunucu hatası. Lütfen daha sonra tekrar deneyin.', kod: 'SUNUCU_HATASI' })
})

// ---------------------------------------------------------------------------
// Başlangıç
// ---------------------------------------------------------------------------

// Eski JSON tabanlı ürün listesini (Ayarlar.urunListesi) yeni dbo.UrunListesi tablosuna
// bir kez taşır; sonra eski ayarı siler.
async function urunListesiGoc() {
  const r = await istek().input('a', sql.NVarChar, 'urunListesi')
    .query('SELECT deger FROM dbo.Ayarlar WHERE anahtar = @a')
  let eski = null
  try { eski = r.recordset[0]?.deger ? JSON.parse(r.recordset[0].deger) : null } catch { eski = null }
  if (!Array.isArray(eski) || !eski.length) return

  const p = await havuzGetir()
  let sayac = 0
  for (const ham of eski) {
    const ad = String((typeof ham === 'string' ? ham : ham?.ad) || '').trim()
    if (!ad) continue
    const v = await p.request().input('ad', sql.NVarChar, ad).query('SELECT 1 FROM dbo.UrunListesi WHERE ad = @ad')
    if (v.recordset.length) continue
    await p.request()
      .input('id', sql.UniqueIdentifier, require('node:crypto').randomUUID())
      .input('ad', sql.NVarChar, ad)
      .input('o', sql.NVarChar, new Date().toISOString())
      .query('INSERT INTO dbo.UrunListesi (id, ad, olusturma) VALUES (@id, @ad, @o)')
    sayac++
  }
  await p.request().input('a', sql.NVarChar, 'urunListesi').query('DELETE FROM dbo.Ayarlar WHERE anahtar = @a')
  logla(`[GOC] Ürün listesi eski ayardan yeni tabloya taşındı (${sayac} yeni kayıt).`)
}

/** Süresi dolan oturum / sayaç / denetim kayıtlarını temizler. */
async function bakim() {
  await oturumServisi.suresiDolanlariTemizle()
  await hizSinir.eskileriTemizle()
  await denetim.eskileriTemizle(DENETIM_SAKLAMA_GUN)
}

function yapilandirmaUyarilariniYaz() {
  if (!URETIM) logla('[YAPILANDIRMA] NODE_ENV=production değil — Secure çerez ve HSTS kapalı (geliştirme modu).')
  if (URETIM && !oturumAyar.guvenliCerez) logla('[YAPILANDIRMA] [KRITIK] Üretimde SESSION_COOKIE_SECURE kapalı — oturum çerezi HTTP üzerinden taşınabilir.')
}

semaKur()
  .then(() => urunListesiGoc())
  .then(() => bakim())
  .then(() => {
    yapilandirmaUyarilariniYaz()

    // Saatlik bakım
    const zamanlayici = setInterval(() => { bakim().catch((e) => logla('[BAKIM] hata:', e)) }, 3_600_000)
    zamanlayici.unref()

    const s = app.listen(PORT, '0.0.0.0', () => {
      logla(`Zimmet & Envanter API hazır → http://localhost:${PORT} (ağ erişimine açık)`)
      logla(`[GUVENLIK] Oturum: boşta ${oturumAyar.bostaDakika} dk / mutlak ${oturumAyar.mutlakSaat} sa · ` +
        `Secure=${oturumAyar.guvenliCerez} SameSite=${oturumAyar.sameSite}`)
    })
    s.on('error', (e) => {
      if (e.code === 'EADDRINUSE') {
        logla(`[KRITIK] ${PORT} portu zaten kullanımda. Üretim sunucusu çalışıyor olabilir; ` +
          'dev için farklı port kullanın (npm run dev bunu otomatik yapar: 5177).')
      } else {
        logla('[KRITIK] Sunucu başlatılamadı:', e)
      }
      process.exit(1)
    })

    // --- HTTPS (canlı kamera taraması için) ---
    // Sertifika üretimi asenkron; HTTP dinleyicisini bekletmemek için ayrı zincirde.
    sertifikaGetir(logla).then((sertifika) => {
      if (!sertifika) return
      const hs = https.createServer(sertifika, app)
      hs.listen(HTTPS_PORT, '0.0.0.0', () => {
        const ipler = yerelIpler()
        logla(`HTTPS hazır → https://localhost:${HTTPS_PORT}` +
          (ipler.length ? ` | telefondan: https://${ipler[0]}:${HTTPS_PORT}` : ''))
      })
      // HTTPS başlamazsa uygulama HTTP ile çalışmaya devam etmeli — süreci düşürme.
      hs.on('error', (e) => logla('[UYARI] HTTPS başlatılamadı (HTTP ile devam):', e?.message || e))
    })
  })
  .catch((e) => {
    logla('[KRITIK] Başlangıç başarısız:', e)
    process.exit(1)
  })
