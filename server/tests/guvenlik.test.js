// Güvenlik birim testleri: kullanıcı adı doğrulama, parola özetleme, açık yönlendirme, politika.
process.env.NODE_ENV = 'test'
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-oturum-anahtari-en-az-32-karakter-uzunlugunda'
// Politika testleri ortamdan bağımsız olmalı: geliştirme .env'i eşiği gevşetmiş olabilir.
// dotenv yalnızca TANIMSIZ değişkenleri doldurduğu için burada sabitlemek yeterlidir.
process.env.PASSWORD_MIN_LENGTH = '12'

const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const { pathToFileURL } = require('node:url')

const { kullaniciAdiCozumle, gecerliKullaniciAdiMi } = require('../auth/kullanici-adi')
const parolaServisi = require('../auth/password.service')
const { acikUcMu, politikaCoz } = require('../auth/authorization.service')

// ---------------------------------------------------------------------------
// KULLANICI ADI NORMALİZE / DOĞRULAMA
// ---------------------------------------------------------------------------

test('Kullanıcı adı çözümleme: UPN ve NetBIOS biçimleri', () => {
  assert.deepEqual(kullaniciAdiCozumle('admin01'), { sam: 'admin01', girilenAlan: null })
  assert.deepEqual(kullaniciAdiCozumle('admin01@istikbaltr.local'), { sam: 'admin01', girilenAlan: 'istikbaltr.local' })
  assert.deepEqual(kullaniciAdiCozumle('ISTIKBALTR\\admin01'), { sam: 'admin01', girilenAlan: 'ISTIKBALTR' })
  assert.deepEqual(kullaniciAdiCozumle('  admin01  '), { sam: 'admin01', girilenAlan: null })
})

test('Geçerli / geçersiz kullanıcı adları', () => {
  for (const iyi of ['admin01', 'ahmet.yilmaz', 'a_b-c', 'user123']) {
    assert.equal(gecerliKullaniciAdiMi(iyi), true, `"${iyi}" geçerli olmalı`)
  }
  for (const kotu of ['', 'a b', 'a*b', 'a(b', 'a)b', 'a\\b', 'a/b', 'a=b', 'a,b', 'a'.repeat(65)]) {
    assert.equal(gecerliKullaniciAdiMi(kotu), false, `"${kotu}" geçersiz olmalı`)
  }
})

// ---------------------------------------------------------------------------
// PAROLA
// ---------------------------------------------------------------------------

test('Argon2id: parola özetlenir ve doğrulanır, düz metin saklanmaz', async () => {
  const parola = 'CokGuvenliParola123!'
  const ozet = await parolaServisi.ozetle(parola)

  assert.ok(ozet.startsWith('$argon2id$'), 'Argon2id kullanılmalı')
  assert.ok(!ozet.includes(parola), 'Özet düz metin parolayı içermemeli')
  assert.equal(await parolaServisi.dogrula(ozet, parola), true)
  assert.equal(await parolaServisi.dogrula(ozet, 'YanlisParola'), false)
  assert.equal(await parolaServisi.dogrula(ozet, ''), false)
  assert.equal(await parolaServisi.dogrula('', parola), false)
})

test('Aynı parola her seferinde FARKLI özet üretir (salt)', async () => {
  const a = await parolaServisi.ozetle('AyniParola123!')
  const b = await parolaServisi.ozetle('AyniParola123!')
  assert.notEqual(a, b, 'Rastgele salt kullanılmalı')
})

test('Bozuk özet hata fırlatmaz, false döner', async () => {
  assert.equal(await parolaServisi.dogrula('bozuk-veri', 'parola'), false)
  assert.equal(await parolaServisi.dogrula('$argon2id$eksik', 'parola'), false)
})

test('Parola politikası: uzunluk ve karakter çeşitliliği', () => {
  assert.throws(() => parolaServisi.parolaPolitikasiDogrula('kisa'), /en az 12 karakter/)
  assert.throws(() => parolaServisi.parolaPolitikasiDogrula('sadecekucukharfler'), /en az üçünü/)
  assert.throws(() => parolaServisi.parolaPolitikasiDogrula('a'.repeat(201)), /en fazla 200/)
  assert.equal(parolaServisi.parolaPolitikasiDogrula('GuvenliParola123'), 'GuvenliParola123')
  assert.equal(parolaServisi.parolaPolitikasiDogrula('Uzun-Parola-2024!'), 'Uzun-Parola-2024!')
})

test('Eski maliyet parametreli özet yenilenmeli olarak işaretlenir', () => {
  assert.equal(parolaServisi.yenilenmeliMi('$argon2id$v=19$m=4096,t=1,p=1$abc$def'), true)
  assert.equal(parolaServisi.yenilenmeliMi('$2b$10$bcryptozeti'), true, 'bcrypt özeti Argon2id\'ye yükseltilmeli')
  assert.equal(parolaServisi.yenilenmeliMi(''), true)
})

// ---------------------------------------------------------------------------
// YETKİLENDİRME POLİTİKASI (tablo düzeyinde)
// ---------------------------------------------------------------------------

test('Açık uçlar tam olarak beklenen kümedir', () => {
  assert.equal(acikUcMu('POST', '/auth/login'), true)
  assert.equal(acikUcMu('POST', '/auth/logout'), true)
  assert.equal(acikUcMu('GET', '/auth/me'), true)
  assert.equal(acikUcMu('GET', '/auth/csrf'), true)
  assert.equal(acikUcMu('GET', '/saglik'), true)

  // Bunlar açık OLMAMALI
  assert.equal(acikUcMu('GET', '/tumu'), false)
  assert.equal(acikUcMu('GET', '/kullanicilar'), false)
  assert.equal(acikUcMu('POST', '/urunler'), false)
  assert.equal(acikUcMu('GET', '/auth/oturum'), false)
})

test('Politika: tanımsız yol bulunamaz (varsayılan reddet)', () => {
  assert.equal(politikaCoz('GET', '/bilinmeyen').bulundu, false)
  assert.equal(politikaCoz('POST', '/yeni-modul/veri').bulundu, false)
  assert.equal(politikaCoz('GET', '/kullanicilar-benzeri').bulundu, false)
  assert.equal(politikaCoz('TRACE', '/tumu').bulundu, false)

  // Yol geçişi içeren istekler politikaya hiç ulaşmaz (yetkiKapisi 400 ile keser),
  // ancak eşleşseler bile en kısıtlayıcı izne düşerler.
  assert.equal(politikaCoz('POST', '/urunler/../kullanicilar').izin, 'ENVANTER_YAZ')
})

test('Politika: okuma ve yazma farklı izin ister', () => {
  assert.equal(politikaCoz('GET', '/urunler').izin, 'ENVANTER_OKU')
  assert.equal(politikaCoz('GET', '/urunler/abc').izin, 'ENVANTER_OKU')
  assert.equal(politikaCoz('POST', '/urunler').izin, 'ENVANTER_YAZ')
  assert.equal(politikaCoz('DELETE', '/urunler/abc').izin, 'ENVANTER_YAZ')
  assert.equal(politikaCoz('POST', '/urunler/abc/stok').izin, 'ENVANTER_YAZ')
  assert.equal(politikaCoz('GET', '/kullanicilar').izin, 'KULLANICI_YONET')
  assert.equal(politikaCoz('GET', '/loglar').izin, 'LOG_OKU')
  assert.equal(politikaCoz('PUT', '/ayarlar/eposta').izin, 'AYAR_YONET')
})

// ---------------------------------------------------------------------------
// AÇIK YÖNLENDİRME (open redirect) — istemci yardımcısı
// ---------------------------------------------------------------------------

test('Giriş sonrası yönlendirme yalnızca uygulama içi yollara izin verir', async () => {
  const modulYolu = pathToFileURL(path.join(__dirname, '..', '..', 'src', 'auth', 'izinler.js')).href
  const { guvenliHedef, VARSAYILAN_YOL } = await import(modulYolu)

  // Kabul edilenler
  assert.equal(guvenliHedef('/inventory'), '/inventory')
  assert.equal(guvenliHedef('/admin/users?x=1'), '/admin/users?x=1')

  // Reddedilenler → varsayılana düşer
  for (const kotu of [
    'https://kotusite.com',
    '//kotusite.com',
    'http://kotusite.com/x',
    '/\\kotusite.com',
    'javascript:alert(1)',
    '',
    null,
    '/login',
  ]) {
    assert.equal(guvenliHedef(kotu), VARSAYILAN_YOL, `"${kotu}" reddedilmeliydi`)
  }
})

// ---------------------------------------------------------------------------
// GÜNLÜKLEME
// ---------------------------------------------------------------------------

test('Günlük temizleyici hassas alanları maskeler', () => {
  const { temizle } = require('../common/logger')
  const c = temizle({
    kullaniciAdi: 'admin01',
    parola: 'GizliParola123!',
    password: 'GizliParola123!',
    token: 'abc.def.ghi',
    bindPassword: 'ServisParolasi',
    ic: { sessionSecret: 'anahtar', normal: 'deger' },
  })
  assert.equal(c.kullaniciAdi, 'admin01')
  assert.equal(c.parola, '***')
  assert.equal(c.password, '***')
  assert.equal(c.token, '***')
  assert.equal(c.bindPassword, '***')
  assert.equal(c.ic.sessionSecret, '***')
  assert.equal(c.ic.normal, 'deger')
})
