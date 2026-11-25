// Envanter / zimmet iş kuralları ve role duyarlı veri projeksiyonu.
const { ApiHata } = require('../common/api-error')
const { Rol } = require('../auth/roles')
const depo = require('./inventory.repository')

const gecerliTarih = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''))
const gecerliGuid = (s) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(s || ''))

/** Belge gövdesini doğrular; geçerli kalemleri döndürür. */
async function belgeDogrula(tx, b, haricBelgeId) {
  if (!gecerliTarih(b.teslimTarihi)) throw ApiHata.kotuIstek('Teslim tarihi seçmeden kayıt yapılamaz.')
  if (!String(b.adSoyad || '').trim()) throw ApiHata.kotuIstek('Lütfen "Adı Soyadı" alanını doldurun.')
  const items = (b.items || []).filter((it) => it.urunId && Number(it.adet) > 0)
  if (!items.length) throw ApiHata.kotuIstek('En az bir ürün seçip adet girin.')

  // ürün başına toplam istenen (yalnızca zimmetli kalemler stok ayırır)
  const istenen = new Map()
  for (const it of items) {
    if (!gecerliGuid(it.urunId)) throw ApiHata.kotuIstek('Geçersiz ürün kimliği.')
    if (it.durum === 'iade') continue
    istenen.set(it.urunId, (istenen.get(it.urunId) || 0) + Number(it.adet))
  }
  for (const [urunId, adet] of istenen) {
    const u = await depo.istek(tx).input('id', depo.sql.UniqueIdentifier, urunId)
      .query('SELECT ad FROM dbo.Urunler WHERE id = @id')
    if (!u.recordset.length) throw ApiHata.kotuIstek('Seçilen ürünlerden biri envanterde bulunamadı.')
    const bosta = await depo.bostaAdet(tx, urunId, haricBelgeId)
    if (adet > bosta) {
      throw ApiHata.kotuIstek(`"${u.recordset[0].ad}" için en fazla ${Math.max(0, bosta)} adet zimmetlenebilir.`)
    }
  }
  return items
}

/**
 * VIEWER için asgari açıklama (minimum disclosure) projeksiyonu.
 *
 * VIEWER yalnızca Genel Bakış ve Envanter'i görür. Bu iki ekranın ihtiyaç duymadığı her şey
 * yanıttan ÇIKARILIR — yetkisiz veri yalnızca arayüzde gizlenmez, sunucudan hiç gönderilmez:
 *   • imza görselleri (imzaAlan/imzaEden/imzaOnay) — kişisel biyometrik veri
 *   • teslim alan/eden/onay isimleri ve kalem açıklamaları
 *   • e-posta ayarları (EmailJS servis anahtarlarını içerir)
 *   • personel listesi ve yardımcı listeler (yalnızca yazma formlarında kullanılır)
 *   • cep telefonu kayıtları (IMEI, hat numarası — kişisel veri)
 */
function viewerProjeksiyonu(veri) {
  return {
    urunler: veri.urunler,
    // Genel Bakış'ın "Kişi Bazlı Zimmet" panosu için gereken en dar belge görünümü.
    belgeler: (veri.belgeler || []).map((b) => ({
      id: b.id,
      belgeNo: b.belgeNo,
      adSoyad: b.adSoyad,
      gorev: b.gorev || '',
      bolum: b.bolum || '',
      teslimTarihi: b.teslimTarihi,
      items: (b.items || []).map((it) => ({
        id: it.id, urunId: it.urunId, adet: it.adet, durum: it.durum, iadeTarihi: it.iadeTarihi || '',
      })),
    })),
    hareketler: veri.hareketler,
    epostaAyar: null,
    urunListesi: [],
    konumListesi: [],
    kategoriListesi: [],
    markaListesi: [],
    cepMarkaListesi: [],
    personelListesi: [],
    // Cep telefonu kayıtları IMEI ve hat numarası gibi kişisel veri içerir; VIEWER görmez.
    cepKayitlari: [],
    cepGecmisi: [],
  }
}

/** Tüm veriyi okur ve isteyenin rolüne göre daraltır. */
async function tumunuOku(rol) {
  const [urunler, belgeler, hareketler, epostaAyar, urunListesi, konumListesi, kategoriListesi, markaListesi, personelListesi, cepKayitlari, cepMarkaListesi, cepGecmisi] =
    await Promise.all([
      depo.urunleriOku(), depo.belgeleriOku(), depo.hareketleriOku(), depo.ayarOku('eposta'),
      depo.urunListesiOku(), depo.konumListesiOku(), depo.kategoriListesiOku(), depo.markaListesiOku(), depo.personelListesiOku(),
      depo.cepKayitlariOku(), depo.cepMarkaListesiOku(), depo.cepGecmisiOku(),
    ])

  const tam = { urunler, belgeler, hareketler, epostaAyar, urunListesi, konumListesi, kategoriListesi, markaListesi, personelListesi, cepKayitlari, cepMarkaListesi, cepGecmisi }
  return rol === Rol.ADMIN ? tam : viewerProjeksiyonu(tam)
}

module.exports = { belgeDogrula, tumunuOku, viewerProjeksiyonu, gecerliTarih, gecerliGuid }
