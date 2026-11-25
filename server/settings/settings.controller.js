// Ayarlar ve yedek geri yükleme uçları — yalnızca ADMIN.
const crypto = require('node:crypto')
const express = require('express')
const { asyncSar } = require('../common/async-handler')
const { ApiHata } = require('../common/api-error')
const { izinGerekli } = require('../auth/auth.middleware')
const { Izin } = require('../auth/roles')
const { transactionIcinde } = require('../db')
const denetim = require('../audit/audit.service')
const depo = require('../inventory/inventory.repository')
const { gecerliGuid } = require('../inventory/inventory.service')

const router = express.Router()

// ---- e-posta ayarları (EmailJS anahtarlarını içerir → VIEWER'a asla gönderilmez) ----

router.get('/ayarlar/eposta', izinGerekli(Izin.AYAR_YONET), asyncSar(async (req, res) => {
  res.json({ ayar: await depo.ayarOku('eposta') })
}))

router.put('/ayarlar/eposta', izinGerekli(Izin.AYAR_YONET), asyncSar(async (req, res) => {
  await depo.ayarYaz('eposta', req.body || {})
  await denetim.yaz({
    eylem: denetim.Eylem.SETTINGS_CHANGED, req, kaynak: 'Ayarlar', kaynakId: 'eposta',
    detay: 'E-posta bildirim ayarları güncellendi', // anahtar değerleri LOGLANMAZ
  })
  res.json({ ok: true })
}))

// ---- yedek geri yükleme (TÜM veriyi değiştirir — en yıkıcı işlem) ----

router.post('/yedek', izinGerekli(Izin.VERI_ICE_AKTAR), asyncSar(async (req, res) => {
  const v = req.body || {}
  if (!Array.isArray(v.urunler) || !Array.isArray(v.belgeler) || !Array.isArray(v.hareketler)) {
    throw ApiHata.kotuIstek('Geçersiz yedek verisi.')
  }
  await transactionIcinde(async (tx) => {
    await depo.istek(tx).query('DELETE FROM dbo.BelgeKalemleri; DELETE FROM dbo.ZimmetBelgeleri; DELETE FROM dbo.Hareketler; DELETE FROM dbo.Urunler;')
    for (const u of v.urunler) {
      if (!gecerliGuid(u.id)) u.id = crypto.randomUUID()
      await depo.urunYaz(tx, u, true)
    }
    const gorulenNo = new Set()
    for (const b of v.belgeler) {
      if (!gecerliGuid(b.id)) b.id = crypto.randomUUID()
      if (!b.belgeNo || gorulenNo.has(b.belgeNo)) b.belgeNo = `ESKI-${crypto.randomUUID().slice(0, 8)}`
      gorulenNo.add(b.belgeNo)
      await depo.belgeYaz(tx, b, true)
      const items = (b.items || []).filter((it) => it.urunId)
      for (let i = 0; i < items.length; i++) {
        const it = { ...items[i], id: gecerliGuid(items[i].id) ? items[i].id : crypto.randomUUID() }
        await depo.kalemYaz(tx, b.id, it, i)
      }
    }
    for (const h of v.hareketler) {
      await depo.istek(tx)
        .input('id', depo.sql.UniqueIdentifier, gecerliGuid(h.id) ? h.id : crypto.randomUUID())
        .input('urunId', depo.sql.UniqueIdentifier, gecerliGuid(h.urunId) ? h.urunId : null)
        .input('tip', depo.sql.NVarChar, h.tip || 'duzeltme')
        .input('adet', depo.sql.Int, Number(h.adet) || 0)
        .input('tarih', depo.sql.NVarChar, h.tarih || '')
        .input('aciklama', depo.sql.NVarChar, h.aciklama || '')
        .input('olusturma', depo.sql.NVarChar, h.olusturma || depo.simdi())
        .query(`INSERT INTO dbo.Hareketler (id, urunId, tip, adet, tarih, aciklama, olusturma)
                VALUES (@id, @urunId, @tip, @adet, @tarih, @aciklama, @olusturma)`)
    }
  })
  await denetim.yaz({
    eylem: denetim.Eylem.BACKUP_RESTORED, req, kaynak: 'Yedek',
    detay: `${v.urunler.length} ürün, ${v.belgeler.length} belge, ${v.hareketler.length} hareket geri yüklendi (mevcut veriler silindi)`,
  })
  res.json({ ok: true })
}))

module.exports = router
