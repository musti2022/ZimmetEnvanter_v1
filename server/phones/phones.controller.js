// Cep telefonu kullanım taahhütü / teslim tutanağı kayıtları.
//
// Zimmet belgeleriyle aynı nitelikte personel kaydıdır (kime hangi cihaz verildi),
// bu yüzden ZIMMET_OKU / ZIMMET_YAZ izinlerine bağlanır. VIEWER bu kayıtları
// göremez ve değiştiremez.
const crypto = require('node:crypto')
const express = require('express')
const { asyncSar } = require('../common/async-handler')
const { ApiHata } = require('../common/api-error')
const { izinGerekli } = require('../auth/auth.middleware')
const { Izin } = require('../auth/roles')
const denetim = require('../audit/audit.service')
const depo = require('../inventory/inventory.repository')
const { gecerliGuid } = require('../inventory/inventory.service')
const { transactionIcinde } = require('../db')

const router = express.Router()

// Denetim günlüğü için cihaz kimliği: Loglar'da IMEI / seri no ile aranabilsin.
const cihazOzeti = (k) => [
  k.markaModel,
  k.imei && `IMEI ${k.imei}`,
  k.seriNo && `SN ${k.seriNo}`,
  k.hatNo && `Hat ${k.hatNo}`,
].filter(Boolean).join(' · ')

// Alan sınırları veritabanı şemasıyla birebir — aşan girdi sessizce kırpılmak yerine reddedilir.
const ALANLAR = [
  ['adSoyad', 200], ['imei', 50], ['seriNo', 100], ['markaModel', 150],
  ['hatNo', 50], ['tarih', 10], ['teslimEden', 150], ['teslimAlan', 150],
]

// zimmetli: kişide · iade: kişiden geri alındı · bosta: yeni alınmış, henüz kimseye verilmedi
const DURUMLAR = ['zimmetli', 'iade', 'bosta']

/** Gövdeyi doğrular ve yalnızca bilinen alanları döndürür (kütle atama engellenir). */
function govdeDogrula(govde) {
  const k = {}
  for (const [alan, enFazla] of ALANLAR) {
    const deger = String(govde?.[alan] ?? '').trim()
    if (deger.length > enFazla) {
      throw ApiHata.kotuIstek(`"${alan}" en fazla ${enFazla} karakter olabilir.`)
    }
    k[alan] = deger
  }
  // Durum isteğe bağlıdır; verilmezse (eski istemciler) mevcut durum korunur / yeni kayıt zimmetli olur.
  k.durum = DURUMLAR.includes(govde?.durum) ? govde.durum : null
  if (!k.adSoyad && k.durum !== 'bosta') throw ApiHata.kotuIstek('Adı Soyadı zorunludur.')
  return k
}

/** Parametreli sorgu — kullanıcı girdisi hiçbir zaman SQL metnine gömülmez. */
function alanlariBagla(request, k) {
  for (const [alan] of ALANLAR) request.input(alan, depo.sql.NVarChar, k[alan])
  return request
}

router.post('/', izinGerekli(Izin.ZIMMET_YAZ), asyncSar(async (req, res) => {
  const k = govdeDogrula(req.body)
  const id = crypto.randomUUID()
  const simdi = depo.simdi()

  await alanlariBagla((await depo.havuzGetir()).request()
    .input('id', depo.sql.UniqueIdentifier, id)
    .input('olusturma', depo.sql.NVarChar, simdi)
    .input('guncelleme', depo.sql.NVarChar, simdi)
    .input('durum', depo.sql.NVarChar, k.durum || 'zimmetli'), k)
    .query(`INSERT INTO dbo.CepTelefonuKayitlari
      (id, adSoyad, imei, seriNo, markaModel, hatNo, tarih, teslimEden, teslimAlan, olusturma, guncelleme, durum)
      VALUES (@id, @adSoyad, @imei, @seriNo, @markaModel, @hatNo, @tarih, @teslimEden, @teslimAlan, @olusturma, @guncelleme, @durum)`)

  await denetim.yaz({
    eylem: denetim.Eylem.PHONE_RECORD_CREATED, req, kaynak: 'CepTelefonuKaydi', kaynakId: id,
    detay: [k.durum === 'bosta' ? 'yeni telefon girişi (boşta)' : `zimmetlendi: ${k.adSoyad}`, cihazOzeti(k)].filter(Boolean).join(' · '),
  })
  res.status(201).json({ id })
}))

router.put('/:id', izinGerekli(Izin.ZIMMET_YAZ), asyncSar(async (req, res) => {
  if (!gecerliGuid(req.params.id)) throw ApiHata.kotuIstek('Geçersiz kimlik.')
  const k = govdeDogrula(req.body)

  const r = await alanlariBagla((await depo.havuzGetir()).request()
    .input('id', depo.sql.UniqueIdentifier, req.params.id)
    .input('guncelleme', depo.sql.NVarChar, depo.simdi())
    .input('durum', depo.sql.NVarChar, k.durum), k)
    .query(`UPDATE dbo.CepTelefonuKayitlari SET
      adSoyad=@adSoyad, imei=@imei, seriNo=@seriNo, markaModel=@markaModel, hatNo=@hatNo,
      tarih=@tarih, teslimEden=@teslimEden, teslimAlan=@teslimAlan, guncelleme=@guncelleme,
      durum=COALESCE(@durum, durum),
      iadeTarihi=CASE WHEN COALESCE(@durum, durum) = 'iade' THEN iadeTarihi ELSE NULL END
      WHERE id=@id`)
  if (!r.rowsAffected[0]) throw ApiHata.bulunamadi('Kayıt bulunamadı.')

  await denetim.yaz({
    eylem: denetim.Eylem.PHONE_RECORD_UPDATED, req, kaynak: 'CepTelefonuKaydi', kaynakId: req.params.id,
    detay: [k.durum === 'zimmetli' ? `zimmetlendi/güncellendi: ${k.adSoyad}` : (k.adSoyad || 'güncellendi'), cihazOzeti(k)].filter(Boolean).join(' · '),
  })
  res.json({ ok: true })
}))

// İade al: zimmetli kayıt yerinde "boşta"ya çevrilir (kişi bilgileri temizlenir), telefon böylece
// başka birine zimmetlenebilir. Biten zimmet dönemi CepZimmetGecmisi'ne yazılır (zimmet ve iade
// tutanakları oradan üretilir) ve denetim günlüğüne işlenir; ana listede ayrı bir kayıt kalmaz.
router.post('/:id/durum', izinGerekli(Izin.ZIMMET_YAZ), asyncSar(async (req, res) => {
  if (!gecerliGuid(req.params.id)) throw ApiHata.kotuIstek('Geçersiz kimlik.')
  if (req.body?.durum !== 'iade') throw ApiHata.kotuIstek('Geçersiz durum.')
  const iadeTarihi = depo.bugun()
  const simdi = depo.simdi()
  let eski
  let gecmis

  await transactionIcinde(async (tx) => {
    const { recordset } = await new depo.sql.Request(tx)
      .input('id', depo.sql.UniqueIdentifier, req.params.id)
      .query(`SELECT durum, adSoyad, imei, seriNo, markaModel, hatNo, tarih, teslimEden, teslimAlan
        FROM dbo.CepTelefonuKayitlari WITH (UPDLOCK) WHERE id = @id`)
    if (!recordset.length) throw ApiHata.bulunamadi('Kayıt bulunamadı.')
    eski = recordset[0]
    if (eski.durum !== 'zimmetli') throw ApiHata.kotuIstek('Yalnızca zimmetli telefon iade alınabilir.')

    gecmis = {
      id: crypto.randomUUID(), cepId: String(req.params.id).toLowerCase(),
      adSoyad: eski.adSoyad || '', imei: eski.imei || '', seriNo: eski.seriNo || '',
      markaModel: eski.markaModel || '', hatNo: eski.hatNo || '', tarih: eski.tarih || '',
      teslimEden: eski.teslimEden || '', teslimAlan: eski.teslimAlan || '',
      iadeTarihi, iadeTeslimAlan: String(req.kullanici?.gorunenAd || req.kullanici?.kullaniciAdi || '').slice(0, 150),
      olusturma: simdi,
    }
    const g = new depo.sql.Request(tx)
    for (const [ad, deger] of Object.entries(gecmis)) {
      g.input(ad, ad === 'id' || ad === 'cepId' ? depo.sql.UniqueIdentifier : depo.sql.NVarChar, deger)
    }
    await g.query(`INSERT INTO dbo.CepZimmetGecmisi
        (id, cepId, adSoyad, imei, seriNo, markaModel, hatNo, tarih, teslimEden, teslimAlan, iadeTarihi, iadeTeslimAlan, olusturma)
      VALUES (@id, @cepId, @adSoyad, @imei, @seriNo, @markaModel, @hatNo, @tarih, @teslimEden, @teslimAlan, @iadeTarihi, @iadeTeslimAlan, @olusturma)`)

    await new depo.sql.Request(tx)
      .input('id', depo.sql.UniqueIdentifier, req.params.id)
      .input('simdi', depo.sql.NVarChar, simdi)
      .query(`UPDATE dbo.CepTelefonuKayitlari
        SET durum='bosta', adSoyad=N'', tarih=N'', teslimEden=N'', teslimAlan=N'', iadeTarihi=NULL,
            olusturma=@simdi, guncelleme=@simdi
        WHERE id=@id`)
  })

  const parca = [
    eski.adSoyad || '(isimsiz)',
    eski.markaModel,
    eski.imei && `IMEI ${eski.imei}`,
    eski.seriNo && `SN ${eski.seriNo}`,
    eski.hatNo && `Hat ${eski.hatNo}`,
    eski.tarih && `zimmet tarihi ${eski.tarih}`,
    eski.teslimEden && `teslim eden ${eski.teslimEden}`,
  ].filter(Boolean).join(' · ')
  await denetim.yaz({
    eylem: denetim.Eylem.PHONE_RECORD_UPDATED, req, kaynak: 'CepTelefonuKaydi', kaynakId: req.params.id,
    detay: `iade alındı (${iadeTarihi}): ${parca}; telefon boşta`.slice(0, 1000),
  })
  res.json({ ok: true, durum: 'bosta', iadeTarihi, bostaId: req.params.id, gecmis })
}))

router.delete('/:id', izinGerekli(Izin.ZIMMET_YAZ), asyncSar(async (req, res) => {
  if (!gecerliGuid(req.params.id)) throw ApiHata.kotuIstek('Geçersiz kimlik.')
  await (await depo.havuzGetir()).request()
    .input('id', depo.sql.UniqueIdentifier, req.params.id)
    .query('DELETE FROM dbo.CepTelefonuKayitlari WHERE id = @id')
  await denetim.yaz({
    eylem: denetim.Eylem.PHONE_RECORD_DELETED, req, kaynak: 'CepTelefonuKaydi', kaynakId: req.params.id,
  })
  res.json({ ok: true })
}))

module.exports = router
