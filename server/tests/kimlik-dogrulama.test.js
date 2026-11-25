// Kimlik doğrulama akışı testleri — rol türetimi ve giriş kararları.
// Veritabanı sahtelenir; test edilen KARAR MANTIĞIDIR.
process.env.NODE_ENV = 'test'
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-oturum-anahtari-en-az-32-karakter-uzunlugunda'

const test = require('node:test')
const assert = require('node:assert/strict')

const yerelServis = require('../auth/local-auth.service')
const kimlik = require('../auth/authentication.service')
const { Rol, Saglayici, izinVar, gecerliRolMu, roleCevir, Izin } = require('../auth/roles')

function yereliSahtele({ hesaplar = {} } = {}) {
  yerelServis.dogrula = async (k, p) => {
    const h = hesaplar[k]
    if (!h) return { ok: false, sebep: 'yerel hesap bulunamadı' }
    if (h.parola !== p) return { ok: false, sebep: 'yerel parola hatalı' }
    if (h.aktif === false) return { ok: false, sebep: 'yerel hesap pasif' }
    return {
      ok: true,
      kimlik: {
        kullaniciId: 'test-id', kullaniciAdi: k, gorunenAd: h.ad || k, eposta: '',
        rol: h.hamRol !== undefined ? h.hamRol : roleCevir(h.rol), saglayici: Saglayici.LOCAL,
      },
    }
  }
}

// ---------------------------------------------------------------------------
// ROL TÜRETİMİ
// ---------------------------------------------------------------------------

test('Rolü olmayan kullanıcı → VIEWER', async () => {
  yereliSahtele({ hesaplar: { user01: { parola: 'DogruParola123!' } } })

  const s = await kimlik.girisYap('user01', 'DogruParola123!')
  assert.equal(s.ok, true)
  assert.equal(s.kimlik.rol, Rol.VIEWER)
  assert.equal(s.kimlik.saglayici, Saglayici.LOCAL)
  assert.equal(s.kimlik.kullaniciAdi, 'user01')
})

test('Veritabanında rolü ADMIN olan kullanıcı → ADMIN', async () => {
  yereliSahtele({ hesaplar: { 'yerel.yonetici': { parola: 'YoneticiParola1!', rol: 'ADMIN' } } })

  const s = await kimlik.girisYap('yerel.yonetici', 'YoneticiParola1!')
  assert.equal(s.ok, true)
  assert.equal(s.kimlik.rol, Rol.ADMIN)
})

test('Tanınmayan rol değeri VIEWER\'a düşer (yetki yükseltmez)', async () => {
  for (const bozukRol of ['SUPERADMIN', 'root', '', null, 'ADMİN', 'ADMINISTRATOR', 0, {}]) {
    yereliSahtele({ hesaplar: { user01: { parola: 'DogruParola123!', rol: bozukRol } } })
    const s = await kimlik.girisYap('user01', 'DogruParola123!')
    assert.equal(s.ok, true)
    assert.equal(s.kimlik.rol, Rol.VIEWER, `"${String(bozukRol)}" VIEWER'a düşmeliydi`)
  }
})

test('Tanımsız rol auth katmanına ulaşırsa giriş REDDEDİLİR (ikinci savunma)', async () => {
  // Depo katmanı normalde roleCevir() ile indirger. Burada o katman atlanarak, bozuk bir
  // rolün kimlik doğrulama servisine ulaşması durumu sınanır: rol TAHMİN EDİLMEZ.
  yereliSahtele({ hesaplar: { user01: { parola: 'DogruParola123!', hamRol: 'SUPERADMIN' } } })

  const s = await kimlik.girisYap('user01', 'DogruParola123!')
  assert.equal(s.ok, false)
  assert.equal(s.kimlik, undefined)
  assert.match(s.sebep, /tanımsız rol/)
})

test('Rol değeri büyük/küçük harf ve boşluktan bağımsız çözümlenir', () => {
  assert.equal(roleCevir('admin'), Rol.ADMIN)
  assert.equal(roleCevir('  ADMIN  '), Rol.ADMIN)
  assert.equal(roleCevir('Admin'), Rol.ADMIN)
  assert.equal(roleCevir('viewer'), Rol.VIEWER)
  assert.equal(roleCevir('bilinmeyen'), Rol.VIEWER)
})

// ---------------------------------------------------------------------------
// GİRİŞ REDDİ
// ---------------------------------------------------------------------------

test('Yanlış parola → giriş başarısız', async () => {
  yereliSahtele({ hesaplar: { user01: { parola: 'DogruParola123!' } } })

  const s = await kimlik.girisYap('user01', 'YanlisParola')
  assert.equal(s.ok, false)
  assert.equal(s.saglayici, Saglayici.LOCAL)
  assert.equal(s.kimlik, undefined)
})

test('Olmayan kullanıcı → giriş başarısız', async () => {
  yereliSahtele({ hesaplar: {} })

  const s = await kimlik.girisYap('yokboyle', 'HerhangiParola1!')
  assert.equal(s.ok, false)
  assert.equal(s.kimlik, undefined)
})

test('Pasif hesap → parola doğru olsa bile giriş reddedilir', async () => {
  yereliSahtele({ hesaplar: { user01: { parola: 'DogruParola123!', aktif: false } } })

  const s = await kimlik.girisYap('user01', 'DogruParola123!')
  assert.equal(s.ok, false)
  assert.match(s.sebep, /pasif/)
})

test('Boş parola hiçbir doğrulamaya gitmeden reddedilir', async () => {
  let cagrildi = false
  yerelServis.dogrula = async () => { cagrildi = true; return { ok: true } }

  for (const p of ['', null, undefined, 123]) {
    const s = await kimlik.girisYap('user01', p)
    assert.equal(s.ok, false)
  }
  assert.equal(cagrildi, false, 'Boş parola parola servisine ulaşmamalı')
})

test('Aşırı uzun parola reddedilir (kaynak tüketimine karşı)', async () => {
  yereliSahtele({ hesaplar: { user01: { parola: 'x' } } })

  const s = await kimlik.girisYap('user01', 'a'.repeat(201))
  assert.equal(s.ok, false)
  assert.match(s.sebep, /uzun/)
})

// ---------------------------------------------------------------------------
// KULLANICI ADI NORMALİZE
// ---------------------------------------------------------------------------

test('DOMAIN\\kullanici ve UPN biçimleri normalize edilir, alan adı yok sayılır', async () => {
  yereliSahtele({ hesaplar: { user01: { parola: 'DogruParola123!' } } })

  for (const girdi of ['user01', 'ISTIKBALTR\\user01', 'user01@istikbaltr.local', '  user01  ']) {
    const s = await kimlik.girisYap(girdi, 'DogruParola123!')
    assert.equal(s.ok, true, `"${girdi}" çözümlenmeliydi`)
    assert.equal(s.kimlik.kullaniciAdi, 'user01')
  }
})

test('Geçersiz kullanıcı adı biçimleri doğrulamaya hiç ulaşmadan reddedilir', async () => {
  let cagrildi = false
  yerelServis.dogrula = async () => { cagrildi = true; return { ok: true } }

  for (const kotu of ['', '   ', 'a b', 'a*b', 'a(b', 'a'.repeat(65)]) {
    const s = await kimlik.girisYap(kotu, 'HerhangiParola1!')
    assert.equal(s.ok, false, `"${kotu}" reddedilmeliydi`)
  }
  assert.equal(cagrildi, false)
})

// ---------------------------------------------------------------------------
// İZİN MATRİSİ
// ---------------------------------------------------------------------------

test('Yalnızca ADMIN ve VIEWER tanımlı roldür', () => {
  assert.equal(gecerliRolMu(Rol.ADMIN), true)
  assert.equal(gecerliRolMu(Rol.VIEWER), true)
  for (const kotu of ['SUPERADMIN', 'root', '', null, undefined, 'admin']) {
    assert.equal(gecerliRolMu(kotu), false, `"${String(kotu)}" tanımlı rol sayılmamalı`)
  }
})

test('İzin matrisi: VIEWER salt okunur, ADMIN tam yetkili', () => {
  assert.equal(izinVar(Rol.VIEWER, Izin.PANO_OKU), true)
  assert.equal(izinVar(Rol.VIEWER, Izin.ENVANTER_OKU), true)

  for (const izin of [Izin.ENVANTER_YAZ, Izin.ZIMMET_OKU, Izin.ZIMMET_YAZ,
    Izin.KULLANICI_YONET, Izin.AYAR_YONET, Izin.LOG_OKU, Izin.VERI_ICE_AKTAR, Izin.RAPOR_OKU]) {
    assert.equal(izinVar(Rol.VIEWER, izin), false, `VIEWER ${izin} iznine sahip OLMAMALI`)
    assert.equal(izinVar(Rol.ADMIN, izin), true, `ADMIN ${izin} iznine sahip olmalı`)
  }

  assert.equal(izinVar('BILINMEYEN_ROL', Izin.PANO_OKU), false, 'Bilinmeyen rol hiçbir izin almamalı')
})
