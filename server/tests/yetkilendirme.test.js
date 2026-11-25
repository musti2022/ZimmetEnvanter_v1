// Yetkilendirme matrisi testleri — HTTP seviyesinde, gerçek ara katmanlarla.
const test = require('node:test')
const assert = require('node:assert/strict')
const { sunucuBaslat, VIEWER, ADMIN, denetimKayitlari } = require('./yardimci')

// ---------------------------------------------------------------------------
test('Kimliği doğrulanmamış kullanıcı korumalı uca erişemez → 401', async (t) => {
  const { cagir, kapat } = await sunucuBaslat(null)
  t.after(kapat)

  for (const [yontem, yol] of [
    ['GET', '/api/tumu'],
    ['GET', '/api/urunler'],
    ['POST', '/api/urunler'],
    ['DELETE', '/api/urunler/11111111-1111-1111-1111-111111111111'],
    ['GET', '/api/kullanicilar'],
    ['GET', '/api/loglar'],
  ]) {
    const r = await cagir(yontem, yol, { govde: yontem === 'GET' ? undefined : {} })
    assert.equal(r.durum, 401, `${yontem} ${yol} 401 dönmeliydi (dönen: ${r.durum})`)
    assert.equal(r.govde.kod, 'GIRIS_GEREKLI')
  }
})

test('Oturumsuz istek CSRF token\'ı olmasa da 401 alır (403 değil)', async (t) => {
  const { cagir, kapat } = await sunucuBaslat(null)
  t.after(kapat)

  // Kimlik doğrulaması CSRF'ten ÖNCE değerlendirilir; aksi hâlde "giriş yapmalısın" ile
  // "token bayatladı" ayırt edilemez ve istemci yanlış ekrana yönlenir.
  for (const [yontem, yol] of [['POST', '/api/urunler'], ['DELETE', '/api/urunler/abc'], ['PUT', '/api/ayarlar/eposta']]) {
    const r = await cagir(yontem, yol, { govde: {}, csrf: null })
    assert.equal(r.durum, 401, `${yontem} ${yol} → 401 bekleniyordu (dönen: ${r.durum})`)
    assert.equal(r.govde.kod, 'GIRIS_GEREKLI')
  }
})

test('Açık uçlar oturum olmadan erişilebilir', async (t) => {
  const { cagir, kapat } = await sunucuBaslat(null)
  t.after(kapat)

  for (const [yontem, yol] of [['GET', '/api/auth/me'], ['GET', '/api/auth/csrf'], ['GET', '/api/saglik']]) {
    const r = await cagir(yontem, yol)
    assert.equal(r.durum, 200, `${yontem} ${yol} açık uç olmalıydı`)
  }
})

// ---------------------------------------------------------------------------
test('VIEWER: Genel Bakış ve Envanter okuma İZİNLİ', async (t) => {
  const { cagir, kapat } = await sunucuBaslat(VIEWER)
  t.after(kapat)

  for (const yol of ['/api/tumu', '/api/urunler', '/api/urunler/11111111-1111-1111-1111-111111111111']) {
    const r = await cagir('GET', yol)
    assert.equal(r.durum, 200, `VIEWER ${yol} okuyabilmeliydi (dönen: ${r.durum})`)
    assert.equal(r.govde.rol, 'VIEWER')
  }
})

test('VIEWER: envanter yazma işlemleri YASAK → 403', async (t) => {
  const { cagir, kapat } = await sunucuBaslat(VIEWER)
  t.after(kapat)

  const id = '11111111-1111-1111-1111-111111111111'
  for (const [yontem, yol] of [
    ['POST', '/api/urunler'],
    ['PUT', `/api/urunler/${id}`],
    ['PATCH', `/api/urunler/${id}`],
    ['DELETE', `/api/urunler/${id}`],
    ['POST', `/api/urunler/${id}/stok`],
    ['POST', '/api/urunler/toplu'],
  ]) {
    const r = await cagir(yontem, yol, { govde: {} })
    assert.equal(r.durum, 403, `VIEWER ${yontem} ${yol} yapamamalıydı (dönen: ${r.durum})`)
    assert.equal(r.govde.kod, 'YETKI_YOK')
  }
})

test('VIEWER: cep telefonu kayıtları YASAK → 403', async (t) => {
  const { cagir, kapat } = await sunucuBaslat(VIEWER)
  t.after(kapat)

  // Cep telefonu kayıtları IMEI ve hat numarası gibi kişisel veri içerir; zimmet
  // belgeleriyle aynı sınıfta değerlendirilir (ZIMMET_YAZ).
  const id = '11111111-1111-1111-1111-111111111111'
  for (const [yontem, yol] of [
    ['POST', '/api/cep'],
    ['PUT', `/api/cep/${id}`],
    ['DELETE', `/api/cep/${id}`],
  ]) {
    const r = await cagir(yontem, yol, { govde: { adSoyad: 'Deneme' } })
    assert.equal(r.durum, 403, `VIEWER ${yontem} ${yol} yapamamalıydı (dönen: ${r.durum})`)
    assert.equal(r.govde.kod, 'YETKI_YOK')
  }
})

test('ADMIN: cep telefonu uçlarına erişebilir (yetki kapısını geçer)', async (t) => {
  const { cagir, kapat } = await sunucuBaslat(ADMIN)
  t.after(kapat)

  for (const [yontem, yol] of [
    ['POST', '/api/cep'],
    ['PUT', '/api/cep/11111111-1111-1111-1111-111111111111'],
    ['DELETE', '/api/cep/11111111-1111-1111-1111-111111111111'],
  ]) {
    const r = await cagir(yontem, yol, { govde: { adSoyad: 'Deneme' } })
    assert.notEqual(r.durum, 401, `ADMIN ${yontem} ${yol} için 401 almamalı`)
    assert.notEqual(r.durum, 403, `ADMIN ${yontem} ${yol} için 403 almamalı`)
  }
})

test('VIEWER: zimmet, kişiler ve yardımcı listeler YASAK → 403', async (t) => {
  const { cagir, kapat } = await sunucuBaslat(VIEWER)
  t.after(kapat)

  for (const [yontem, yol] of [
    ['GET', '/api/belgeler'],
    ['POST', '/api/belgeler'],
    ['DELETE', '/api/belgeler/11111111-1111-1111-1111-111111111111'],
    ['POST', '/api/personel'],
    ['POST', '/api/urun-listesi'],
    ['POST', '/api/yedek'],
  ]) {
    const r = await cagir(yontem, yol, { govde: {} })
    assert.equal(r.durum, 403, `VIEWER ${yontem} ${yol} yapamamalıydı`)
  }
})

test('VIEWER: yönetim uçları YASAK → 403', async (t) => {
  const { cagir, kapat } = await sunucuBaslat(VIEWER)
  t.after(kapat)

  for (const [yontem, yol] of [
    ['GET', '/api/kullanicilar'],
    ['POST', '/api/kullanicilar'],
    ['PUT', '/api/kullanicilar/1'],
    ['DELETE', '/api/kullanicilar/1'],
    ['GET', '/api/ayarlar/eposta'],
    ['PUT', '/api/ayarlar/eposta'],
    ['GET', '/api/loglar'],
    ['GET', '/api/yonetim/saglik'],
  ]) {
    const r = await cagir(yontem, yol, { govde: {} })
    assert.equal(r.durum, 403, `VIEWER ${yontem} ${yol} yapamamalıydı (dönen: ${r.durum})`)
  }
})

// ---------------------------------------------------------------------------
test('ADMIN: tüm uçlar İZİNLİ', async (t) => {
  const { cagir, kapat } = await sunucuBaslat(ADMIN)
  t.after(kapat)

  const id = '11111111-1111-1111-1111-111111111111'
  for (const [yontem, yol] of [
    ['GET', '/api/tumu'],
    ['GET', '/api/urunler'],
    ['POST', '/api/urunler'],
    ['PUT', `/api/urunler/${id}`],
    ['DELETE', `/api/urunler/${id}`],
    ['GET', '/api/belgeler'],
    ['POST', '/api/belgeler'],
    ['DELETE', `/api/belgeler/${id}`],
    ['POST', '/api/yedek'],
    ['GET', '/api/ayarlar/eposta'],
    ['PUT', '/api/ayarlar/eposta'],
    ['GET', '/api/kullanicilar'],
    ['POST', '/api/kullanicilar'],
    ['GET', '/api/loglar'],
    ['GET', '/api/yonetim/saglik'],
  ]) {
    const r = await cagir(yontem, yol, { govde: {} })
    assert.equal(r.durum, 200, `ADMIN ${yontem} ${yol} yapabilmeliydi (dönen: ${r.durum})`)
    assert.equal(r.govde.rol, 'ADMIN')
  }
})

// ---------------------------------------------------------------------------
test('Politikada tanımsız uç VARSAYILAN OLARAK reddedilir (ADMIN dahil)', async (t) => {
  const yonetici = await sunucuBaslat(ADMIN)
  t.after(yonetici.kapat)

  // Politikaya yazılmamış yeni bir uç: yetki kontrolü unutulsa bile açıkta kalmaz.
  const r = await yonetici.cagir('GET', '/api/henuz-tanimlanmamis-uc')
  assert.equal(r.durum, 403)
  assert.equal(r.govde.kod, 'YETKI_YOK')

  const r2 = await yonetici.cagir('POST', '/api/gizli/veri-cek', { govde: {} })
  assert.equal(r2.durum, 403)
})

test('Yol geçişi (path traversal) denemesi reddedilir', async (t) => {
  const { cagir, kapat } = await sunucuBaslat(VIEWER)
  t.after(kapat)

  for (const yol of ['/api/urunler/../kullanicilar', '/api/tumu/..%2f..%2fkullanicilar']) {
    const r = await cagir('GET', yol)
    assert.ok([400, 403].includes(r.durum), `${yol} reddedilmeliydi (dönen: ${r.durum})`)
  }
})

// ---------------------------------------------------------------------------
test('İstemciden gelen rol bilgisi yok sayılır (privilege escalation)', async (t) => {
  const { cagir, kapat } = await sunucuBaslat(VIEWER)
  t.after(kapat)

  const oncekiKayitSayisi = denetimKayitlari.length

  // Gövdede rol yükseltme denemesi — hem yetki kararını hem gövdeyi etkilememeli.
  const r = await cagir('GET', '/api/tumu', { govde: undefined })
  assert.equal(r.govde.rol, 'VIEWER')

  const r2 = await cagir('POST', '/api/urunler', {
    govde: { ad: 'Test', rol: 'ADMIN', role: 'ADMIN', isAdmin: true, authProvider: 'SAHTE' },
  })
  assert.equal(r2.durum, 403, 'Gövdede rol göndermek yetki vermemeli')

  // Rol alanı taşıyan istek denetim günlüğüne düşmeli
  const yeniKayitlar = denetimKayitlari.slice(oncekiKayitSayisi)
  assert.ok(
    yeniKayitlar.some((k) => String(k.detay || '').includes('rol/yetki alanı')),
    'Rol enjeksiyon denemesi denetim günlüğüne yazılmalıydı',
  )
})

test('Rol ataması YALNIZCA kullanıcı yönetimi uçlarında okunur', async (t) => {
  const yonetici = await sunucuBaslat(ADMIN)
  t.after(yonetici.kapat)

  // Kullanıcı yönetimi: rol gövdeden temizlenir ama req.rolTalebi'ne taşınır.
  const r = await yonetici.cagir('POST', '/api/kullanicilar', { govde: { kullaniciAdi: 'yeni', rol: 'ADMIN' } })
  assert.equal(r.durum, 200)
  assert.equal(r.govde.rolTalebi, 'ADMIN', 'Yönetici başka hesaba rol atayabilmeli')
  assert.equal(r.govde.govde.rol, undefined, 'Rol yine de gövdeden temizlenmiş olmalı')

  // Diğer uçlar: rol hiçbir biçimde taşınmaz.
  const r2 = await yonetici.cagir('POST', '/api/urunler', { govde: { ad: 'Ürün', rol: 'ADMIN' } })
  assert.equal(r2.durum, 200)
  assert.equal(r2.govde.rolTalebi, null, 'Envanter ucunda rol alanı taşınmamalı')
  assert.equal(r2.govde.govde.rol, undefined)
})

test('VIEWER kullanıcı yönetimine rol göndererek yetki yükseltemez', async (t) => {
  const { cagir, kapat } = await sunucuBaslat(VIEWER)
  t.after(kapat)

  // Yetki kapısı, gövde okunmadan önce reddeder.
  const r = await cagir('POST', '/api/kullanicilar', { govde: { kullaniciAdi: 'x', rol: 'ADMIN' } })
  assert.equal(r.durum, 403)
  const r2 = await cagir('PUT', '/api/kullanicilar/kendi-id', { govde: { rol: 'ADMIN' } })
  assert.equal(r2.durum, 403)
})

test('Query string üzerinden rol gönderme de yok sayılır', async (t) => {
  const { cagir, kapat } = await sunucuBaslat(VIEWER)
  t.after(kapat)

  const r = await cagir('GET', '/api/tumu?rol=ADMIN&role=ADMIN')
  assert.equal(r.durum, 200)
  assert.equal(r.govde.rol, 'VIEWER', 'Query string rolü değiştirememeli')

  const r2 = await cagir('DELETE', '/api/urunler/11111111-1111-1111-1111-111111111111?role=ADMIN')
  assert.equal(r2.durum, 403)
})

// ---------------------------------------------------------------------------
test('CSRF: token olmadan durum değiştiren istek reddedilir', async (t) => {
  const { cagir, kapat } = await sunucuBaslat(ADMIN)
  t.after(kapat)

  const r = await cagir('POST', '/api/urunler', { govde: { ad: 'X' }, csrf: null })
  assert.equal(r.durum, 403)
  assert.equal(r.govde.kod, 'CSRF_GECERSIZ')

  const r2 = await cagir('DELETE', '/api/urunler/11111111-1111-1111-1111-111111111111', { csrf: 'yanlis-token' })
  assert.equal(r2.durum, 403)
  assert.equal(r2.govde.kod, 'CSRF_GECERSIZ')

  // Okuma istekleri CSRF token'ı gerektirmez
  const r3 = await cagir('GET', '/api/tumu', { csrf: null })
  assert.equal(r3.durum, 200)
})

// ---------------------------------------------------------------------------
test('Mutlak oturum ömrü dolduysa erişim reddedilir', async (t) => {
  const araKatman = require('../auth/auth.middleware')
  const express = require('express')

  const app = express()
  app.use(express.json())
  app.use((req, res, next) => {
    req.session = {
      csrfToken: 'x',
      kullanici: { ...VIEWER },
      mutlakBitis: Date.now() - 1000, // süresi dolmuş
      destroy: (cb) => cb(null),
      regenerate: (cb) => cb(null),
      save: (cb) => cb(null),
    }
    next()
  })
  app.use(araKatman.baglamCoz)
  const api = express.Router()
  api.use(araKatman.yetkiKapisi)
  api.use((req, res) => res.json({ ok: true }))
  app.use('/api', api)
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => res.status(err.durum || 500).json({ kod: err.kod }))

  const server = await new Promise((coz) => { const s = app.listen(0, '127.0.0.1', () => coz(s)) })
  t.after(() => new Promise((coz) => server.close(coz)))

  const r = await fetch(`http://127.0.0.1:${server.address().port}/api/tumu`)
  assert.equal(r.status, 401, 'Mutlak ömrü dolan oturum 401 almalı')
})
