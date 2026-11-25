// Zimmet belgesi uçları — /api/belgeler
// Yetki: ZIMMET_OKU / ZIMMET_YAZ → yalnızca ADMIN (VIEWER'da bu izinler yoktur).
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

// Denetim günlüğü için kalemleri "Ürün (SN …) xAdet" biçiminde yazar; seri no ile Loglar'da aranabilsin.
async function kalemOzeti(tx, kalemler) {
  const parcalar = []
  for (const it of kalemler) {
    let ad = '(silinmiş ürün)', seri = ''
    if (servis.gecerliGuid(String(it.urunId || ''))) {
      const r = await depo.istek(tx).input('id', depo.sql.UniqueIdentifier, it.urunId)
        .query('SELECT ad, seriNo FROM dbo.Urunler WHERE id = @id')
      if (r.recordset.length) { ad = r.recordset[0].ad || ad; seri = r.recordset[0].seriNo || '' }
    }
    parcalar.push(`${ad}${seri ? ` (SN ${seri})` : ''}${Number(it.adet) > 1 ? ` x${it.adet}` : ''}`)
  }
  return parcalar.join(', ')
}

router.get('/', izinGerekli(Izin.ZIMMET_OKU), asyncSar(async (req, res) => {
  res.json({ belgeler: await depo.belgeleriOku() })
}))

router.post('/', izinGerekli(Izin.ZIMMET_YAZ), asyncSar(async (req, res) => {
  const b = { ...req.body }
  if (!servis.gecerliGuid(b.id)) b.id = crypto.randomUUID()
  const belge = await transactionIcinde(async (tx) => {
    const items = await servis.belgeDogrula(tx, b, null)
    b.belgeNo = await depo.belgeNoUret(tx, b.teslimTarihi)
    b.olusturma = depo.simdi()
    b.guncelleme = depo.simdi()
    await depo.belgeYaz(tx, b, true)
    for (let i = 0; i < items.length; i++) {
      const it = { ...items[i], id: servis.gecerliGuid(items[i].id) ? items[i].id : crypto.randomUUID(), durum: 'zimmetli' }
      items[i] = it
      await depo.kalemYaz(tx, b.id, it, i)
      await depo.hareketYaz(tx, {
        urunId: it.urunId, tip: 'zimmet', adet: it.adet, tarih: b.teslimTarihi,
        aciklama: `${b.adSoyad.trim()} adlı kişiye zimmetlendi (${b.belgeNo})`,
      })
    }
    return { ...b, items, ozet: await kalemOzeti(tx, items) }
  })
  await denetim.yaz({
    eylem: denetim.Eylem.ASSIGNMENT_CREATED, req, kaynak: 'ZimmetBelgesi', kaynakId: belge.id,
    detay: `belgeNo=${belge.belgeNo} kisi=${belge.adSoyad} kalem=${belge.items.length}: ${belge.ozet}`,
  })
  res.status(201).json({ belge })
}))

router.put('/:id', izinGerekli(Izin.ZIMMET_YAZ), asyncSar(async (req, res) => {
  if (!servis.gecerliGuid(req.params.id)) throw ApiHata.kotuIstek('Geçersiz belge kimliği.')
  const b = { ...req.body, id: req.params.id }
  const belge = await transactionIcinde(async (tx) => {
    const eskiR = await depo.istek(tx).input('id', depo.sql.UniqueIdentifier, b.id)
      .query('SELECT * FROM dbo.ZimmetBelgeleri WHERE id = @id')
    if (!eskiR.recordset.length) throw ApiHata.bulunamadi('Güncellenecek belge bulunamadı.')
    const eskiKalemR = await depo.istek(tx).input('id', depo.sql.UniqueIdentifier, b.id)
      .query('SELECT * FROM dbo.BelgeKalemleri WHERE belgeId = @id ORDER BY sira')
    const eskiZimmetli = eskiKalemR.recordset.map(depo.kalemSatiri).filter((it) => it.durum === 'zimmetli')

    const items = await servis.belgeDogrula(tx, b, b.id)
    // İade alınmış kalem değiştirilemez / silinemez (ürün, adet, durum korunur).
    const eskiIade = eskiKalemR.recordset.map(depo.kalemSatiri).filter((it) => it.durum === 'iade')
    for (const e of eskiIade) {
      const y = items.find((x) => depo.kucukId(x.id) === e.id)
      if (!y || depo.kucukId(y.urunId) !== depo.kucukId(e.urunId) || Number(y.adet) !== Number(e.adet) || y.durum !== 'iade') {
        throw ApiHata.kotuIstek('İade alınmış ürün satırı değiştirilemez veya silinemez.')
      }
    }
    if (eskiIade.length) {
      const eskiIdler = new Set(eskiKalemR.recordset.map((r) => depo.kucukId(r.id)))
      if (items.some((x) => !eskiIdler.has(depo.kucukId(x.id)))) {
        throw ApiHata.kotuIstek('İade alınmış ürünü olan belgeye yeni ürün eklenemez; yeni zimmet belgesi oluşturun.')
      }
    }
    b.belgeNo = eskiR.recordset[0].belgeNo // belge no güncellemede DEĞİŞMEZ
    b.guncelleme = depo.simdi()
    b.olusturma = eskiR.recordset[0].olusturma

    // Hareket farkları (yeni satır → zimmet, adet değişimi, kaldırılan satır → iade)
    for (const it of items) {
      const eskiIt = eskiZimmetli.find((x) => x.id === depo.kucukId(it.id))
      if (!eskiIt) {
        if (it.durum !== 'iade') {
          await depo.hareketYaz(tx, {
            urunId: it.urunId, tip: 'zimmet', adet: it.adet, tarih: b.teslimTarihi,
            aciklama: `${b.adSoyad.trim()} adlı kişiye zimmetlendi (güncelleme, ${b.belgeNo})`,
          })
        }
      } else if (Number(eskiIt.adet) !== Number(it.adet)) {
        const fark = Number(it.adet) - Number(eskiIt.adet)
        await depo.hareketYaz(tx, {
          urunId: it.urunId, tip: fark > 0 ? 'zimmet' : 'iade', adet: Math.abs(fark), tarih: b.teslimTarihi,
          aciklama: `Zimmet adedi güncellendi: ${eskiIt.adet} → ${it.adet} (${b.belgeNo})`,
        })
      } else if (it.durum === 'iade' && eskiIt.durum !== 'iade') {
        await depo.hareketYaz(tx, {
          urunId: it.urunId, tip: 'iade', adet: it.adet, tarih: depo.bugun(),
          aciklama: `${b.adSoyad.trim()} adlı kişiden iade alındı (${b.belgeNo})`,
        })
      }
    }
    for (const eskiIt of eskiZimmetli) {
      if (!items.some((x) => depo.kucukId(x.id) === eskiIt.id)) {
        await depo.hareketYaz(tx, {
          urunId: eskiIt.urunId, tip: 'iade', adet: eskiIt.adet, tarih: depo.bugun(),
          aciklama: `Zimmet satırı kaldırıldı, iade edildi (${b.belgeNo})`,
        })
      }
    }

    await depo.belgeYaz(tx, b, false)
    await depo.istek(tx).input('id', depo.sql.UniqueIdentifier, b.id)
      .query('DELETE FROM dbo.BelgeKalemleri WHERE belgeId = @id')
    for (let i = 0; i < items.length; i++) {
      const it = { ...items[i], id: servis.gecerliGuid(items[i].id) ? items[i].id : crypto.randomUUID() }
      items[i] = it
      await depo.kalemYaz(tx, b.id, it, i)
    }
    const zimmetli = items.filter((x) => x.durum !== 'iade')
    const iade = items.filter((x) => x.durum === 'iade')
    const kaldirilan = eskiZimmetli.filter((e) => !items.some((x) => depo.kucukId(x.id) === e.id))
    const ozet = [
      zimmetli.length && `zimmetli: ${await kalemOzeti(tx, zimmetli)}`,
      iade.length && `iade: ${await kalemOzeti(tx, iade)}`,
      kaldirilan.length && `kaldırılan (iade): ${await kalemOzeti(tx, kaldirilan)}`,
    ].filter(Boolean).join(' | ')
    return { ...b, items, ozet }
  })
  await denetim.yaz({
    eylem: denetim.Eylem.ASSIGNMENT_UPDATED, req, kaynak: 'ZimmetBelgesi', kaynakId: belge.id,
    detay: `belgeNo=${belge.belgeNo} kisi=${belge.adSoyad}${belge.ozet ? ` · ${belge.ozet}` : ''}`,
  })
  res.json({ belge })
}))

router.delete('/:id', izinGerekli(Izin.ZIMMET_YAZ), asyncSar(async (req, res) => {
  if (!servis.gecerliGuid(req.params.id)) throw ApiHata.kotuIstek('Geçersiz belge kimliği.')
  let belgeNo = ''
  let ozet = ''
  await transactionIcinde(async (tx) => {
    const belgeR = await depo.istek(tx).input('id', depo.sql.UniqueIdentifier, req.params.id)
      .query('SELECT belgeNo FROM dbo.ZimmetBelgeleri WHERE id = @id')
    if (!belgeR.recordset.length) throw ApiHata.bulunamadi('Belge bulunamadı.')
    belgeNo = belgeR.recordset[0].belgeNo
    const kalemR = await depo.istek(tx).input('id', depo.sql.UniqueIdentifier, req.params.id)
      .query(`SELECT * FROM dbo.BelgeKalemleri WHERE belgeId = @id AND durum = 'zimmetli'`)
    const silinenKalemler = kalemR.recordset.map(depo.kalemSatiri)
    ozet = await kalemOzeti(tx, silinenKalemler)
    for (const it of silinenKalemler) {
      await depo.hareketYaz(tx, {
        urunId: it.urunId, tip: 'iade', adet: it.adet, tarih: depo.bugun(),
        aciklama: `Belge silindi, ürün otomatik iade edildi (${belgeNo})`,
      })
    }
    await depo.istek(tx).input('id', depo.sql.UniqueIdentifier, req.params.id)
      .query('DELETE FROM dbo.ZimmetBelgeleri WHERE id = @id') // kalemler CASCADE ile silinir
  })
  await denetim.yaz({
    eylem: denetim.Eylem.ASSIGNMENT_DELETED, req, kaynak: 'ZimmetBelgesi', kaynakId: req.params.id,
    detay: `belgeNo=${belgeNo}${ozet ? ` · otomatik iade: ${ozet}` : ''}`,
  })
  res.json({ ok: true })
}))

router.post('/:belgeId/kalemler/:kalemId/iade', izinGerekli(Izin.ZIMMET_YAZ), asyncSar(async (req, res) => {
  if (!servis.gecerliGuid(req.params.belgeId) || !servis.gecerliGuid(req.params.kalemId)) {
    throw ApiHata.kotuIstek('Geçersiz kimlik.')
  }
  let bilgi = ''
  await transactionIcinde(async (tx) => {
    const r = await depo.istek(tx)
      .input('belgeId', depo.sql.UniqueIdentifier, req.params.belgeId)
      .input('kalemId', depo.sql.UniqueIdentifier, req.params.kalemId)
      .query(`SELECT k.*, b.adSoyad, b.belgeNo FROM dbo.BelgeKalemleri k
              JOIN dbo.ZimmetBelgeleri b ON b.id = k.belgeId
              WHERE k.id = @kalemId AND k.belgeId = @belgeId`)
    if (!r.recordset.length) throw ApiHata.bulunamadi('Zimmet kalemi bulunamadı.')
    const it = r.recordset[0]
    if (it.durum === 'iade') throw ApiHata.kotuIstek('Bu kalem zaten iade edilmiş.')
    const tarih = depo.bugun()
    await depo.istek(tx)
      .input('kalemId', depo.sql.UniqueIdentifier, req.params.kalemId)
      .input('tarih', depo.sql.NVarChar, tarih)
      .query(`UPDATE dbo.BelgeKalemleri SET durum = 'iade', iadeTarihi = @tarih WHERE id = @kalemId`)
    await depo.hareketYaz(tx, {
      urunId: depo.kucukId(it.urunId), tip: 'iade', adet: it.adet, tarih,
      aciklama: `${it.adSoyad} adlı kişiden iade alındı (${it.belgeNo})`,
    })
    bilgi = `belgeNo=${it.belgeNo} kisi=${it.adSoyad} adet=${it.adet}: ${await kalemOzeti(tx, [{ urunId: depo.kucukId(it.urunId), adet: it.adet }])}`
  })
  await denetim.yaz({
    eylem: denetim.Eylem.ASSIGNMENT_RETURNED, req, kaynak: 'BelgeKalemi', kaynakId: req.params.kalemId,
    detay: bilgi,
  })
  res.json({ ok: true })
}))

module.exports = router
