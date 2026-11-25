// Envanter / zimmet veri erişim katmanı.
// Tüm sorgular parametrelidir (mssql .input) — kullanıcı girdisi SQL metnine birleştirilmez.
const crypto = require('node:crypto')
const { sql, havuzGetir, istek } = require('../db')

const bugun = () => new Date().toISOString().slice(0, 10)
const simdi = () => new Date().toISOString()

// SQL GUID'leri BÜYÜK harf döndürür; istemci crypto.randomUUID() küçük harf üretir.
// Karşılaştırmalar bozulmasın diye tüm kimlikler küçük harfe çevrilir.
const kucukId = (v) => (v ? String(v).toLowerCase() : v)

const urunSatiri = (r) => ({ ...r, id: kucukId(r.id) })
const hareketSatiri = (r) => ({ ...r, id: kucukId(r.id), urunId: kucukId(r.urunId) })
const kalemSatiri = (r) => ({
  id: kucukId(r.id),
  urunId: kucukId(r.urunId),
  adet: r.adet,
  iadeTarihi: r.iadeTarihi || '',
  aciklama: r.aciklama || '',
  durum: r.durum,
})

function belgeBirlestir(belgeRows, kalemRows) {
  const kalemMap = new Map()
  for (const k of kalemRows) {
    const bid = kucukId(k.belgeId)
    if (!kalemMap.has(bid)) kalemMap.set(bid, [])
    kalemMap.get(bid).push(kalemSatiri(k))
  }
  return belgeRows.map((b) => ({
    ...b,
    id: kucukId(b.id),
    items: kalemMap.get(kucukId(b.id)) || [],
  }))
}

// ---- okuma ----

async function urunleriOku(tx) {
  const { recordset } = await istek(tx).query('SELECT * FROM dbo.Urunler ORDER BY olusturma DESC')
  return recordset.map(urunSatiri)
}

async function urunOku(id, tx) {
  const { recordset } = await istek(tx)
    .input('id', sql.UniqueIdentifier, id)
    .query('SELECT * FROM dbo.Urunler WHERE id = @id')
  return recordset[0] ? urunSatiri(recordset[0]) : null
}

async function belgeleriOku(tx) {
  const b = await istek(tx).query('SELECT * FROM dbo.ZimmetBelgeleri ORDER BY olusturma DESC')
  const k = await istek(tx).query('SELECT * FROM dbo.BelgeKalemleri ORDER BY sira')
  return belgeBirlestir(b.recordset, k.recordset)
}

async function hareketleriOku(tx) {
  const { recordset } = await istek(tx).query('SELECT * FROM dbo.Hareketler ORDER BY olusturma DESC')
  return recordset.map(hareketSatiri)
}

async function ayarOku(anahtar) {
  const r = await istek().input('a', sql.NVarChar, anahtar)
    .query('SELECT deger FROM dbo.Ayarlar WHERE anahtar = @a')
  const raw = r.recordset[0]?.deger
  try { return raw ? JSON.parse(raw) : null } catch { return null }
}

async function ayarYaz(anahtar, deger) {
  await (await havuzGetir()).request()
    .input('a', sql.NVarChar, anahtar)
    .input('d', sql.NVarChar, JSON.stringify(deger || {}))
    .query(`MERGE dbo.Ayarlar AS hedef
            USING (SELECT @a AS anahtar) AS kaynak ON hedef.anahtar = kaynak.anahtar
            WHEN MATCHED THEN UPDATE SET deger = @d
            WHEN NOT MATCHED THEN INSERT (anahtar, deger) VALUES (@a, @d);`)
}

const basitListeOku = (tablo) => async (tx) => {
  const { recordset } = await istek(tx).query(`SELECT id, ad FROM dbo.${tablo} ORDER BY ad`)
  return recordset.map((r) => ({ id: kucukId(r.id), ad: r.ad }))
}

const urunListesiOku = basitListeOku('UrunListesi')
const konumListesiOku = basitListeOku('KonumListesi')
const kategoriListesiOku = basitListeOku('KategoriListesi')
const markaListesiOku = basitListeOku('MarkaListesi')
const cepMarkaListesiOku = basitListeOku('CepMarkaListesi')

async function personelListesiOku(tx) {
  const { recordset } = await istek(tx).query('SELECT id, adSoyad, bolum, gorev FROM dbo.PersonelListesi ORDER BY adSoyad')
  return recordset.map((r) => ({ id: kucukId(r.id), adSoyad: r.adSoyad, bolum: r.bolum || '', gorev: r.gorev || '' }))
}

async function cepKayitlariOku(tx) {
  const { recordset } = await istek(tx).query("SELECT * FROM dbo.CepTelefonuKayitlari WHERE durum <> 'iade' ORDER BY olusturma DESC")
  return recordset.map((r) => ({
    id: kucukId(r.id),
    adSoyad: r.adSoyad || '', imei: r.imei || '', seriNo: r.seriNo || '',
    markaModel: r.markaModel || '', hatNo: r.hatNo || '', tarih: r.tarih || '',
    teslimEden: r.teslimEden || '', teslimAlan: r.teslimAlan || '',
    olusturma: r.olusturma || '', guncelleme: r.guncelleme || '',
    durum: ['iade', 'bosta'].includes(r.durum) ? r.durum : 'zimmetli', iadeTarihi: r.iadeTarihi || '',
  }))
}

async function cepGecmisiOku(tx) {
  const { recordset } = await istek(tx).query('SELECT * FROM dbo.CepZimmetGecmisi ORDER BY olusturma DESC')
  return recordset.map((r) => ({
    id: kucukId(r.id), cepId: kucukId(r.cepId),
    adSoyad: r.adSoyad || '', imei: r.imei || '', seriNo: r.seriNo || '',
    markaModel: r.markaModel || '', hatNo: r.hatNo || '', tarih: r.tarih || '',
    teslimEden: r.teslimEden || '', teslimAlan: r.teslimAlan || '',
    iadeTarihi: r.iadeTarihi || '', iadeTeslimAlan: r.iadeTeslimAlan || '', olusturma: r.olusturma || '',
  }))
}

// ---- yazma (transaction içinde kullanılır) ----

async function hareketYaz(tx, { urunId, tip, adet, tarih, aciklama }) {
  await istek(tx)
    .input('id', sql.UniqueIdentifier, crypto.randomUUID())
    .input('urunId', sql.UniqueIdentifier, urunId || null)
    .input('tip', sql.NVarChar, tip)
    .input('adet', sql.Int, Number(adet) || 0)
    .input('tarih', sql.NVarChar, tarih || bugun())
    .input('aciklama', sql.NVarChar, aciklama || '')
    .input('olusturma', sql.NVarChar, simdi())
    .query(`INSERT INTO dbo.Hareketler (id, urunId, tip, adet, tarih, aciklama, olusturma)
            VALUES (@id, @urunId, @tip, @adet, @tarih, @aciklama, @olusturma)`)
}

async function urunYaz(tx, u, yeni) {
  const r = istek(tx)
    .input('id', sql.UniqueIdentifier, u.id)
    .input('ad', sql.NVarChar, String(u.ad || '').trim())
    .input('kategori', sql.NVarChar, u.kategori || '')
    .input('markaModel', sql.NVarChar, u.markaModel || '')
    .input('seriNo', sql.NVarChar, u.seriNo || '')
    .input('barkod', sql.NVarChar, u.barkod || '')
    .input('birim', sql.NVarChar, u.birim || 'Adet')
    .input('konum', sql.NVarChar, u.konum || '')
    .input('stok', sql.Int, Math.max(0, Number(u.stok || 0)))
    .input('minStok', sql.Int, Math.max(0, Number(u.minStok || 0)))
    .input('aciklama', sql.NVarChar, u.aciklama || '')
    .input('calismaDurumu', sql.NVarChar, u.calismaDurumu === 'arizali' ? 'arizali' : 'calisir')
    .input('olusturma', sql.NVarChar, u.olusturma || simdi())
  if (yeni) {
    await r.query(`INSERT INTO dbo.Urunler (id, ad, kategori, markaModel, seriNo, barkod, birim, konum, stok, minStok, aciklama, calismaDurumu, olusturma)
                   VALUES (@id, @ad, @kategori, @markaModel, @seriNo, @barkod, @birim, @konum, @stok, @minStok, @aciklama, @calismaDurumu, @olusturma)`)
  } else {
    await r.query(`UPDATE dbo.Urunler SET ad=@ad, kategori=@kategori, markaModel=@markaModel, seriNo=@seriNo,
                   barkod=@barkod, birim=@birim, konum=@konum, stok=@stok, minStok=@minStok, aciklama=@aciklama, calismaDurumu=@calismaDurumu
                   WHERE id=@id`)
  }
}

async function urunSil(tx, id) {
  await istek(tx).input('id', sql.UniqueIdentifier, id).query('DELETE FROM dbo.Urunler WHERE id = @id')
}

async function stokGuncelle(tx, id, yeniStok) {
  await istek(tx)
    .input('id', sql.UniqueIdentifier, id)
    .input('stok', sql.Int, yeniStok)
    .query('UPDATE dbo.Urunler SET stok = @stok WHERE id = @id')
}

async function kalemYaz(tx, belgeId, it, sira) {
  await istek(tx)
    .input('id', sql.UniqueIdentifier, it.id)
    .input('belgeId', sql.UniqueIdentifier, belgeId)
    .input('urunId', sql.UniqueIdentifier, it.urunId || null)
    .input('adet', sql.Int, Number(it.adet) || 1)
    .input('iadeTarihi', sql.NVarChar, it.iadeTarihi || null)
    .input('aciklama', sql.NVarChar, it.aciklama || '')
    .input('durum', sql.NVarChar, it.durum === 'iade' ? 'iade' : 'zimmetli')
    .input('sira', sql.Int, sira)
    .query(`INSERT INTO dbo.BelgeKalemleri (id, belgeId, urunId, adet, iadeTarihi, aciklama, durum, sira)
            VALUES (@id, @belgeId, @urunId, @adet, @iadeTarihi, @aciklama, @durum, @sira)`)
}

async function belgeYaz(tx, b, yeni) {
  const r = istek(tx)
    .input('id', sql.UniqueIdentifier, b.id)
    .input('belgeNo', sql.NVarChar, b.belgeNo)
    .input('teslimTarihi', sql.NVarChar, b.teslimTarihi)
    .input('adSoyad', sql.NVarChar, b.adSoyad || '')
    .input('gorev', sql.NVarChar, b.gorev || '')
    .input('bolum', sql.NVarChar, b.bolum || '')
    .input('teslimAlan', sql.NVarChar, b.teslimAlan || '')
    .input('teslimEden', sql.NVarChar, b.teslimEden || '')
    .input('onay', sql.NVarChar, b.onay || '')
    .input('imzaAlan', sql.NVarChar, b.imzaAlan || '')
    .input('imzaEden', sql.NVarChar, b.imzaEden || '')
    .input('imzaOnay', sql.NVarChar, b.imzaOnay || '')
    .input('olusturma', sql.NVarChar, b.olusturma || simdi())
    .input('guncelleme', sql.NVarChar, b.guncelleme || simdi())
  if (yeni) {
    await r.query(`INSERT INTO dbo.ZimmetBelgeleri (id, belgeNo, teslimTarihi, adSoyad, gorev, bolum, teslimAlan, teslimEden, onay, imzaAlan, imzaEden, imzaOnay, olusturma, guncelleme)
                   VALUES (@id, @belgeNo, @teslimTarihi, @adSoyad, @gorev, @bolum, @teslimAlan, @teslimEden, @onay, @imzaAlan, @imzaEden, @imzaOnay, @olusturma, @guncelleme)`)
  } else {
    await r.query(`UPDATE dbo.ZimmetBelgeleri SET teslimTarihi=@teslimTarihi, adSoyad=@adSoyad, gorev=@gorev,
                   bolum=@bolum, teslimAlan=@teslimAlan, teslimEden=@teslimEden, onay=@onay,
                   imzaAlan=@imzaAlan, imzaEden=@imzaEden, imzaOnay=@imzaOnay, guncelleme=@guncelleme
                   WHERE id=@id`)
  }
}

// Belge No: ZMT-YYYYAAGG-NNN — o güne ait EN BÜYÜK sıra + 1, transaction + kilitle üretilir
// (iki bilgisayar aynı anda kaydetse bile numara çakışmaz).
async function belgeNoUret(tx, teslimTarihi) {
  const ymd = String(teslimTarihi).replaceAll('-', '')
  const onEk = `ZMT-${ymd}-`
  const r = await istek(tx)
    .input('onEk', sql.NVarChar, onEk + '%')
    .input('kes', sql.Int, onEk.length + 1)
    .query(`SELECT ISNULL(MAX(TRY_CAST(SUBSTRING(belgeNo, @kes, 10) AS INT)), 0) AS enBuyuk
            FROM dbo.ZimmetBelgeleri WITH (UPDLOCK, HOLDLOCK)
            WHERE belgeNo LIKE @onEk`)
  return `${onEk}${String((r.recordset[0]?.enBuyuk || 0) + 1).padStart(3, '0')}`
}

// Ürünün boşta adedi (belirtilen belge hariç tutulabilir — güncellemede kendi rezervasyonu sayılmaz)
async function bostaAdet(tx, urunId, haricBelgeId) {
  const r = await istek(tx)
    .input('urunId', sql.UniqueIdentifier, urunId)
    .input('haric', sql.UniqueIdentifier, haricBelgeId || null)
    .query(`SELECT
              (SELECT ISNULL(stok, 0) FROM dbo.Urunler WHERE id = @urunId) -
              (SELECT ISNULL(SUM(adet), 0) FROM dbo.BelgeKalemleri
                WHERE urunId = @urunId AND durum = 'zimmetli'
                  AND (@haric IS NULL OR belgeId <> @haric)) AS bosta`)
  return Number(r.recordset[0]?.bosta || 0)
}

module.exports = {
  sql, havuzGetir, istek,
  bugun, simdi, kucukId,
  urunSatiri, hareketSatiri, kalemSatiri, belgeBirlestir,
  urunleriOku, urunOku, belgeleriOku, hareketleriOku,
  ayarOku, ayarYaz,
  urunListesiOku, konumListesiOku, kategoriListesiOku, markaListesiOku, cepMarkaListesiOku, personelListesiOku,
  cepKayitlariOku, cepGecmisiOku,
  hareketYaz, urunYaz, urunSil, stokGuncelle, kalemYaz, belgeYaz,
  belgeNoUret, bostaAdet,
}
