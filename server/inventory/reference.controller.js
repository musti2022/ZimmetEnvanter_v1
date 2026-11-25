// Yardımcı liste uçları (combobox kaynakları) — ürün / konum / kategori / marka / personel.
// Tamamı yazma işlemidir → yalnızca ADMIN.
const crypto = require('node:crypto')
const express = require('express')
const { asyncSar } = require('../common/async-handler')
const { ApiHata } = require('../common/api-error')
const { izinGerekli } = require('../auth/auth.middleware')
const { Izin } = require('../auth/roles')
const denetim = require('../audit/audit.service')
const depo = require('./inventory.repository')
const { gecerliGuid } = require('./inventory.service')

const router = express.Router()

/**
 * "Tek adlı liste" tabloları için ortak CRUD (UrunListesi, KonumListesi, KategoriListesi,
 * MarkaListesi). Tablo adı SABİT bir eşlemeden gelir — istemci girdisinden ASLA türetilmez
 * (aksi hâlde tablo adı üzerinden SQL enjeksiyonu mümkün olurdu).
 */
function adListesiRotalari({ yol, tablo, etiket, bosMesaj, izin = Izin.ENVANTER_YAZ }) {
  router.post(yol, izinGerekli(izin), asyncSar(async (req, res) => {
    const ad = String(req.body?.ad || '').trim()
    if (!ad) throw ApiHata.kotuIstek(bosMesaj)
    if (ad.length > 200) throw ApiHata.kotuIstek(`${etiket} en fazla 200 karakter olabilir.`)

    const p = await depo.havuzGetir()
    const v = await p.request().input('ad', depo.sql.NVarChar, ad)
      .query(`SELECT 1 FROM dbo.${tablo} WHERE ad = @ad`)
    if (v.recordset.length) throw ApiHata.cakisma(`"${ad}" zaten listede.`)

    const id = crypto.randomUUID()
    await p.request()
      .input('id', depo.sql.UniqueIdentifier, id)
      .input('ad', depo.sql.NVarChar, ad)
      .input('o', depo.sql.NVarChar, depo.simdi())
      .query(`INSERT INTO dbo.${tablo} (id, ad, olusturma) VALUES (@id, @ad, @o)`)

    await denetim.yaz({
      eylem: denetim.Eylem.REFERENCE_DATA_CHANGED, req, kaynak: tablo, kaynakId: id,
      detay: `eklendi: ${ad}`,
    })
    res.status(201).json({ id, ad })
  }))

  router.delete(`${yol}/:id`, izinGerekli(izin), asyncSar(async (req, res) => {
    if (!gecerliGuid(req.params.id)) throw ApiHata.kotuIstek('Geçersiz kimlik.')
    await (await depo.havuzGetir()).request()
      .input('id', depo.sql.UniqueIdentifier, req.params.id)
      .query(`DELETE FROM dbo.${tablo} WHERE id = @id`)
    await denetim.yaz({
      eylem: denetim.Eylem.REFERENCE_DATA_CHANGED, req, kaynak: tablo, kaynakId: req.params.id,
      detay: 'silindi',
    })
    res.json({ ok: true })
  }))
}

adListesiRotalari({ yol: '/urun-listesi', tablo: 'UrunListesi', etiket: 'Ürün adı', bosMesaj: 'Ürün adı zorunludur.' })
adListesiRotalari({ yol: '/konum-listesi', tablo: 'KonumListesi', etiket: 'Konum adı', bosMesaj: 'Konum adı zorunludur.' })
adListesiRotalari({ yol: '/kategori-listesi', tablo: 'KategoriListesi', etiket: 'Kategori adı', bosMesaj: 'Kategori adı zorunludur.' })
adListesiRotalari({ yol: '/marka-listesi', tablo: 'MarkaListesi', etiket: 'Marka / Model', bosMesaj: 'Marka / Model zorunludur.' })
// Cep telefonu marka/model listesi envanterinkinden ayrıdır; cep kayıtlarıyla aynı yetki sınıfında.
adListesiRotalari({ yol: '/cep-marka-listesi', tablo: 'CepMarkaListesi', etiket: 'Marka / Model', bosMesaj: 'Marka / Model zorunludur.', izin: Izin.ZIMMET_YAZ })

// ---- personel listesi (ada göre upsert) ----

router.post('/personel', izinGerekli(Izin.ZIMMET_YAZ), asyncSar(async (req, res) => {
  const adSoyad = String(req.body?.adSoyad || '').trim()
  if (!adSoyad) throw ApiHata.kotuIstek('Adı Soyadı zorunludur.')
  const bolum = String(req.body?.bolum || '').trim()
  const gorev = String(req.body?.gorev || '').trim()

  const p = await depo.havuzGetir()
  const mevcut = await p.request().input('adSoyad', depo.sql.NVarChar, adSoyad)
    .query('SELECT id FROM dbo.PersonelListesi WHERE adSoyad = @adSoyad')

  if (mevcut.recordset.length) {
    const id = depo.kucukId(mevcut.recordset[0].id)
    await p.request()
      .input('id', depo.sql.UniqueIdentifier, id)
      .input('bolum', depo.sql.NVarChar, bolum)
      .input('gorev', depo.sql.NVarChar, gorev)
      .query('UPDATE dbo.PersonelListesi SET bolum = @bolum, gorev = @gorev WHERE id = @id')
    await denetim.yaz({ eylem: denetim.Eylem.REFERENCE_DATA_CHANGED, req, kaynak: 'PersonelListesi', kaynakId: id, detay: `güncellendi: ${adSoyad}` })
    return res.json({ id, adSoyad, bolum, gorev })
  }

  const id = crypto.randomUUID()
  await p.request()
    .input('id', depo.sql.UniqueIdentifier, id)
    .input('adSoyad', depo.sql.NVarChar, adSoyad)
    .input('bolum', depo.sql.NVarChar, bolum)
    .input('gorev', depo.sql.NVarChar, gorev)
    .input('o', depo.sql.NVarChar, depo.simdi())
    .query('INSERT INTO dbo.PersonelListesi (id, adSoyad, bolum, gorev, olusturma) VALUES (@id, @adSoyad, @bolum, @gorev, @o)')
  await denetim.yaz({ eylem: denetim.Eylem.REFERENCE_DATA_CHANGED, req, kaynak: 'PersonelListesi', kaynakId: id, detay: `eklendi: ${adSoyad}` })
  res.status(201).json({ id, adSoyad, bolum, gorev })
}))

router.delete('/personel/:id', izinGerekli(Izin.ZIMMET_YAZ), asyncSar(async (req, res) => {
  if (!gecerliGuid(req.params.id)) throw ApiHata.kotuIstek('Geçersiz kimlik.')
  await (await depo.havuzGetir()).request()
    .input('id', depo.sql.UniqueIdentifier, req.params.id)
    .query('DELETE FROM dbo.PersonelListesi WHERE id = @id')
  await denetim.yaz({ eylem: denetim.Eylem.REFERENCE_DATA_CHANGED, req, kaynak: 'PersonelListesi', kaynakId: req.params.id, detay: 'silindi' })
  res.json({ ok: true })
}))

module.exports = router
