// Envanter uçları — /api/tumu, /api/urunler
// Yetki: merkezi yetkiKapisi (authorization.service politikası) uygular.
//   GET  → ENVANTER_OKU / PANO_OKU  (VIEWER + ADMIN)
//   POST/PUT/DELETE → ENVANTER_YAZ  (yalnızca ADMIN)
const crypto = require('node:crypto')
const express = require('express')
const { asyncSar } = require('../common/async-handler')
const { ApiHata } = require('../common/api-error')
const { izinGerekli } = require('../auth/auth.middleware')
const { Izin } = require('../auth/roles')
const { transactionIcinde } = require('../db')
const denetim = require('../audit/audit.service')
const depo = require('./inventory.repository')
const servis = require('./inventory.service')

const router = express.Router()

// ---- toplu okuma (Genel Bakış + Envanter) ----

router.get('/tumu', izinGerekli(Izin.PANO_OKU), asyncSar(async (req, res) => {
  res.json(await servis.tumunuOku(req.kullanici.rol))
}))

// ---- ürünler ----

router.get('/urunler', izinGerekli(Izin.ENVANTER_OKU), asyncSar(async (req, res) => {
  const arama = String(req.query?.arama || '').trim().toLocaleLowerCase('tr')
  const sayfa = Math.max(1, Number(req.query?.sayfa) || 1)
  const boyut = Math.min(500, Math.max(1, Number(req.query?.boyut) || 100))

  let urunler = await depo.urunleriOku()
  if (arama) {
    urunler = urunler.filter((u) => [u.ad, u.kategori, u.markaModel, u.seriNo, u.barkod, u.konum]
      .some((v) => String(v || '').toLocaleLowerCase('tr').includes(arama)))
  }
  const toplam = urunler.length
  res.json({ kayitlar: urunler.slice((sayfa - 1) * boyut, sayfa * boyut), toplam, sayfa, boyut })
}))

router.get('/urunler/:id', izinGerekli(Izin.ENVANTER_OKU), asyncSar(async (req, res) => {
  if (!servis.gecerliGuid(req.params.id)) throw ApiHata.kotuIstek('Geçersiz ürün kimliği.')
  const urun = await depo.urunOku(req.params.id)
  if (!urun) throw ApiHata.bulunamadi('Ürün bulunamadı.')
  res.json({ urun })
}))

router.post('/urunler', izinGerekli(Izin.ENVANTER_YAZ), asyncSar(async (req, res) => {
  const u = req.body
  if (!String(u?.ad || '').trim()) throw ApiHata.kotuIstek('Ürün adı zorunludur.')
  if (!servis.gecerliGuid(u.id)) u.id = crypto.randomUUID()

  // Seri numaralı çoklu giriş: her seri no ayrı bir ürün kaydı olur (stok 1), böylece her cihaz
  // ayrı ayrı zimmetlenebilir ve seri no ile bulunabilir. Tümü tek transaction'da yazılır.
  if (Array.isArray(u.seriNolar)) {
    const seriNolar = u.seriNolar.map((s) => String(s ?? '').trim())
    if (seriNolar.length < 2) throw ApiHata.kotuIstek('Çoklu seri no girişi için en az 2 seri no gerekir.')
    if (seriNolar.length > 500) throw ApiHata.kotuIstek('Tek seferde en fazla 500 seri no girilebilir.')
    if (seriNolar.some((s) => !s)) throw ApiHata.kotuIstek('Tüm seri no alanları doldurulmalıdır.')
    if (seriNolar.some((s) => s.length > 100)) throw ApiHata.kotuIstek('Seri no en fazla 100 karakter olabilir.')
    const kucuk = seriNolar.map((s) => s.toLocaleLowerCase('tr'))
    const tekrar = seriNolar.find((s, i) => kucuk.indexOf(kucuk[i]) !== i)
    if (tekrar) throw ApiHata.kotuIstek(`"${tekrar}" seri numarası birden fazla girilmiş.`)
    const mevcut = new Set((await depo.urunleriOku())
      .map((x) => String(x.seriNo || '').trim().toLocaleLowerCase('tr')).filter(Boolean))
    const kayitli = seriNolar.find((s, i) => mevcut.has(kucuk[i]))
    if (kayitli) throw ApiHata.kotuIstek(`"${kayitli}" seri numarası envanterde zaten kayıtlı.`)

    const { seriNolar: _, ...ortak } = u
    const kayitlar = seriNolar.map((seriNo) => ({ ...ortak, id: crypto.randomUUID(), seriNo, stok: 1 }))
    await transactionIcinde(async (tx) => {
      for (const k of kayitlar) {
        await depo.urunYaz(tx, k, true)
        await depo.hareketYaz(tx, { urunId: k.id, tip: 'giris', adet: 1, tarih: depo.bugun(), aciklama: 'İlk stok girişi' })
      }
    })
    for (const k of kayitlar) {
      await denetim.yaz({
        eylem: denetim.Eylem.INVENTORY_CREATED, req, kaynak: 'Urun', kaynakId: k.id,
        detay: `ad=${String(k.ad).trim()} stok=1 seriNo=${k.seriNo}`,
      })
    }
    return res.status(201).json({ ok: true, eklenen: kayitlar.length })
  }

  const stok = Math.max(0, Number(u.stok || 0))
  await transactionIcinde(async (tx) => {
    await depo.urunYaz(tx, u, true)
    if (stok > 0) await depo.hareketYaz(tx, { urunId: u.id, tip: 'giris', adet: stok, tarih: depo.bugun(), aciklama: 'İlk stok girişi' })
  })
  await denetim.yaz({
    eylem: denetim.Eylem.INVENTORY_CREATED, req, kaynak: 'Urun', kaynakId: u.id,
    detay: `ad=${String(u.ad).trim()} stok=${stok}`,
  })
  res.status(201).json({ ok: true })
}))

// Excel'den toplu ürün ekleme. Gelen her satır YENİ ürün olarak eklenir (id sunucuda üretilir).
// Adı boş satırlar atlanır. Tümü tek transaction içinde; biri hata verirse hiçbiri yazılmaz.
router.post('/urunler/toplu', izinGerekli(Izin.VERI_ICE_AKTAR), asyncSar(async (req, res) => {
  const gelen = Array.isArray(req.body?.urunler) ? req.body.urunler : []
  if (gelen.length > 10_000) throw ApiHata.kotuIstek('Tek seferde en fazla 10.000 satır aktarılabilir.')
  let eklenen = 0
  await transactionIcinde(async (tx) => {
    for (const ham of gelen) {
      const ad = String(ham?.ad || '').trim()
      if (!ad) continue
      const stok = Math.max(0, Number(ham.stok || 0))
      const u = { ...ham, ad, id: crypto.randomUUID(), stok }
      await depo.urunYaz(tx, u, true)
      if (stok > 0) await depo.hareketYaz(tx, { urunId: u.id, tip: 'giris', adet: stok, tarih: depo.bugun(), aciklama: 'Excel toplu içe aktarma' })
      eklenen++
    }
  })
  await denetim.yaz({
    eylem: denetim.Eylem.INVENTORY_IMPORTED, req, kaynak: 'Urun',
    detay: `Excel toplu içe aktarma: ${eklenen} ürün eklendi`,
  })
  res.status(201).json({ ok: true, eklenen })
}))

router.put('/urunler/:id', izinGerekli(Izin.ENVANTER_YAZ), asyncSar(async (req, res) => {
  if (!servis.gecerliGuid(req.params.id)) throw ApiHata.kotuIstek('Geçersiz ürün kimliği.')
  const u = { ...req.body, id: req.params.id }
  if (!String(u?.ad || '').trim()) throw ApiHata.kotuIstek('Ürün adı zorunludur.')
  await transactionIcinde(async (tx) => {
    const eski = await depo.istek(tx).input('id', depo.sql.UniqueIdentifier, u.id)
      .query('SELECT stok FROM dbo.Urunler WHERE id = @id')
    if (!eski.recordset.length) throw ApiHata.bulunamadi('Ürün bulunamadı.')
    const eskiStok = Number(eski.recordset[0].stok || 0)
    const yeniStok = Math.max(0, Number(u.stok || 0))
    await depo.urunYaz(tx, u, false)
    if (eskiStok !== yeniStok) {
      await depo.hareketYaz(tx, {
        urunId: u.id, tip: 'duzeltme', adet: Math.abs(yeniStok - eskiStok),
        tarih: depo.bugun(), aciklama: `Stok düzeltme: ${eskiStok} → ${yeniStok}`,
      })
    }
  })
  await denetim.yaz({
    eylem: denetim.Eylem.INVENTORY_UPDATED, req, kaynak: 'Urun', kaynakId: u.id,
    detay: `ad=${String(u.ad).trim()}`,
  })
  res.json({ ok: true })
}))

router.delete('/urunler/:id', izinGerekli(Izin.ENVANTER_YAZ), asyncSar(async (req, res) => {
  if (!servis.gecerliGuid(req.params.id)) throw ApiHata.kotuIstek('Geçersiz ürün kimliği.')
  let silinenAd = ''
  await transactionIcinde(async (tx) => {
    const r = await depo.istek(tx).input('id', depo.sql.UniqueIdentifier, req.params.id)
      .query(`SELECT u.ad,
                (SELECT ISNULL(SUM(adet), 0) FROM dbo.BelgeKalemleri WHERE urunId = u.id AND durum = 'zimmetli') AS zimmetli
              FROM dbo.Urunler u WHERE u.id = @id`)
    if (!r.recordset.length) throw ApiHata.bulunamadi('Ürün bulunamadı.')
    if (Number(r.recordset[0].zimmetli) > 0) {
      throw ApiHata.kotuIstek(`"${r.recordset[0].ad}" üzerinde aktif zimmet var, önce iade alınmalı.`)
    }
    silinenAd = r.recordset[0].ad
    await depo.urunSil(tx, req.params.id)
  })
  await denetim.yaz({
    eylem: denetim.Eylem.INVENTORY_DELETED, req, kaynak: 'Urun', kaynakId: req.params.id,
    detay: `ad=${silinenAd}`,
  })
  res.json({ ok: true })
}))

router.post('/urunler/:id/stok', izinGerekli(Izin.ENVANTER_YAZ), asyncSar(async (req, res) => {
  if (!servis.gecerliGuid(req.params.id)) throw ApiHata.kotuIstek('Geçersiz ürün kimliği.')
  const { tip, adet, tarih, aciklama } = req.body || {}
  const n = Number(adet)
  if (!['giris', 'cikis'].includes(tip)) throw ApiHata.kotuIstek('Geçersiz işlem tipi.')
  if (!n || n <= 0) throw ApiHata.kotuIstek('Geçerli bir adet girin.')
  await transactionIcinde(async (tx) => {
    const r = await depo.istek(tx).input('id', depo.sql.UniqueIdentifier, req.params.id)
      .query('SELECT ad, birim, stok FROM dbo.Urunler WITH (UPDLOCK) WHERE id = @id')
    if (!r.recordset.length) throw ApiHata.bulunamadi('Ürün bulunamadı.')
    const u = r.recordset[0]
    if (tip === 'cikis') {
      const bosta = await depo.bostaAdet(tx, req.params.id)
      if (n > bosta) {
        throw ApiHata.kotuIstek(`Boşta yalnızca ${Math.max(0, bosta)} ${u.birim} var (zimmetli ürünler çıkışa dahil edilemez).`)
      }
    }
    await depo.stokGuncelle(tx, req.params.id, Number(u.stok || 0) + (tip === 'giris' ? n : -n))
    await depo.hareketYaz(tx, { urunId: req.params.id, tip, adet: n, tarih: tarih || depo.bugun(), aciklama: aciklama || '' })
  })
  await denetim.yaz({
    eylem: denetim.Eylem.STOCK_MOVED, req, kaynak: 'Urun', kaynakId: req.params.id,
    detay: `tip=${tip} adet=${n}`,
  })
  res.json({ ok: true })
}))

module.exports = router
