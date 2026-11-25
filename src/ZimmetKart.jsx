import React, { forwardRef, useEffect, useState } from 'react'
import QRCode from 'qrcode'

// "YYYY-AA-GG" -> "GG.AA.YYYY"
const trTarih = (iso) => {
  const p = String(iso || '').slice(0, 10).split('-')
  return p.length === 3 ? `${p[2]}.${p[1]}.${p[0]}` : String(iso || '')
}

// Tutanağın doğrulama metni (QR içeriği): belge no + kişi + tarih
const qrMetin = (data) =>
  [
    data.belgeNo || '',
    data.adSoyad ? `Ad: ${data.adSoyad}` : '',
    data.teslimTarihi ? `Tarih: ${trTarih(data.teslimTarihi)}` : '',
  ].filter(Boolean).join(' | ')

/**
 * A4 ölçekli zimmet kartı. Masaüstündeki "Zimmet Kartı.docx" şablonuna birebir uyar:
 *  - Sol üstte istikbal logosu
 *  - Başlık: MALZEME ZİMMET TESLİM TUTANAĞI
 *  - ADI SOYADI / GÖREVİ / BÖLÜMÜ alanları
 *  - Tablo: TESLİM TARİHİ | DEMİRBAŞ TÜRÜ | SERİ NO | BİRİM | AÇIKLAMA
 *  - Alt: TESLİM ALAN | TESLİM EDEN
 *
 * items artık serbest metin değil, urunler listesindeki gerçek ürünlere (urunId) bağlıdır.
 */
const ZimmetKart = forwardRef(function ZimmetKart({ data, urunler = [], minSatir = 8 }, ref) {
  const items = data.items || []
  const dolgu = Math.max(0, minSatir - items.length)
  const satirlar = [...items, ...Array.from({ length: dolgu }, () => null)]

  const urunEtiket = (urunId) => {
    const u = urunler.find((x) => x.id === urunId)
    if (!u) return ''
    return u.ad + (u.markaModel ? ` (${u.markaModel})` : '')
  }
  const urunBirim = (urunId) => urunler.find((x) => x.id === urunId)?.birim || ''

  // Hangi fiziksel cihazın zimmetlendiği tutanaktan anlaşılsın diye seri no yazılır.
  // Seri no girilmemiş ürünlerde barkod, o da yoksa "—" gösterilir.
  const urunSeri = (urunId) => {
    const u = urunler.find((x) => x.id === urunId)
    if (!u) return ''
    return u.seriNo || u.barkod || '—'
  }

  // Belge No'dan QR kodu (doğrulama) üret. Belge No yoksa QR gösterilmez.
  const [qr, setQr] = useState('')
  useEffect(() => {
    if (!data.belgeNo) {
      setQr('')
      return
    }
    let iptal = false
    QRCode.toDataURL(qrMetin(data), { margin: 0, width: 220, errorCorrectionLevel: 'M' })
      .then((url) => !iptal && setQr(url))
      .catch(() => !iptal && setQr(''))
    return () => {
      iptal = true
    }
  }, [data.belgeNo, data.adSoyad, data.teslimTarihi])

  return (
    <div className="kart" ref={ref}>
      <div className="kart-logo-satir">
        <img src="./logo.png" alt="istikbal" className="kart-logo" />
        <div className="kart-belge-no">
          <div>Belge No: {data.belgeNo || '—'}</div>
          {qr && <img src={qr} alt="Doğrulama QR" className="kart-qr" />}
        </div>
      </div>

      <h1 className="kart-baslik">MALZEME ZİMMET TESLİM TUTANAĞI</h1>

      <table className="kart-bilgi">
        <tbody>
          <tr>
            <th>ADI SOYADI</th>
            <td>{data.adSoyad}</td>
          </tr>
          <tr>
            <th>GÖREVİ</th>
            <td>{data.gorev}</td>
          </tr>
          <tr>
            <th>BÖLÜMÜ</th>
            <td>{data.bolum}</td>
          </tr>
        </tbody>
      </table>

      <table className="kart-tablo">
        <thead>
          <tr>
            <th style={{ width: '16%' }}>TESLİM TARİHİ</th>
            <th style={{ width: '30%' }}>DEMİRBAŞ TÜRÜ</th>
            <th style={{ width: '18%' }}>SERİ NO</th>
            <th style={{ width: '10%' }}>BİRİM</th>
            <th style={{ width: '26%' }}>AÇIKLAMA</th>
          </tr>
        </thead>
        <tbody>
          {satirlar.map((it, i) => (
            <tr key={i}>
              <td>{it ? trTarih(data.teslimTarihi) : ''}</td>
              <td className="sol">{it ? urunEtiket(it.urunId) : ''}</td>
              <td className="seri">{it ? urunSeri(it.urunId) : ''}</td>
              <td>{it ? `${it.adet ?? ''} ${urunBirim(it.urunId)}`.trim() : ''}</td>
              <td className="sol">{it ? it.aciklama : ''}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <table className="kart-imza">
        <thead>
          <tr>
            <th>TESLİM ALAN</th>
            <th>TESLİM EDEN</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><ImzaHucre ad={data.teslimAlan} imza={data.imzaAlan} /></td>
            <td><ImzaHucre ad={data.teslimEden} imza={data.imzaEden} /></td>
          </tr>
        </tbody>
      </table>

      <div className="kart-dipnot">
        Yukarıda dökümü yapılan malzemeler tarafıma sağlam ve çalışır durumda teslim edilmiş olup,
        görevden ayrılışımda aynı şekilde iade edeceğimi taahhüt ederim.
      </div>
    </div>
  )
})

// İmza hücresi: çizilmiş imza varsa görseli, altında adı gösterir; yoksa yalnız ad.
function ImzaHucre({ ad, imza }) {
  return (
    <div className="imza-hucre">
      {imza && <img src={imza} alt="imza" className="imza-gorsel" />}
      {ad && <span className="imza-ad">{ad}</span>}
    </div>
  )
}

export default ZimmetKart
