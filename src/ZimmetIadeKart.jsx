import React, { forwardRef } from 'react'

const trTarih = (iso) => {
  const p = String(iso || '').slice(0, 10).split('-')
  return p.length === 3 ? `${p[2]}.${p[1]}.${p[0]}` : String(iso || '')
}

/**
 * A4 "MALZEME İADE TUTANAĞI" kartı — zimmet tutanağıyla (ZimmetKart) aynı görünüm.
 * data: { belge, kalemler, iadeTarihi, teslimAlan }
 *  - belge: iade edilen kalemlerin bağlı olduğu zimmet belgesi
 *  - kalemler: bu tutanakla iade alınan kalemler
 *  - teslimAlan: malzemeyi geri teslim alan yetkili
 */
const ZimmetIadeKart = forwardRef(function ZimmetIadeKart({ data, urunler = [], minSatir = 6 }, ref) {
  const { belge = {}, kalemler = [], iadeTarihi = '', teslimAlan = '' } = data || {}
  const dolgu = Math.max(0, minSatir - kalemler.length)
  const satirlar = [...kalemler, ...Array.from({ length: dolgu }, () => null)]
  const urun = (id) => urunler.find((x) => x.id === id)
  const etiket = (id) => { const u = urun(id); return u ? u.ad + (u.markaModel ? ` (${u.markaModel})` : '') : '' }

  return (
    <div className="kart" ref={ref}>
      <div className="kart-logo-satir">
        <img src="./logo.png" alt="istikbal" className="kart-logo" />
        <div className="kart-belge-no">
          <div>Zimmet Belge No: {belge.belgeNo || '—'}</div>
        </div>
      </div>

      <h1 className="kart-baslik">MALZEME İADE TUTANAĞI</h1>

      <table className="kart-bilgi">
        <tbody>
          <tr><th>ADI SOYADI</th><td>{belge.adSoyad}</td></tr>
          <tr><th>GÖREVİ</th><td>{belge.gorev}</td></tr>
          <tr><th>BÖLÜMÜ</th><td>{belge.bolum}</td></tr>
        </tbody>
      </table>

      <table className="kart-tablo">
        <thead>
          <tr>
            <th style={{ width: '15%' }}>ZİMMET TARİHİ</th>
            <th style={{ width: '15%' }}>İADE TARİHİ</th>
            <th style={{ width: '32%' }}>DEMİRBAŞ TÜRÜ</th>
            <th style={{ width: '22%' }}>SERİ NO</th>
            <th style={{ width: '16%' }}>BİRİM</th>
          </tr>
        </thead>
        <tbody>
          {satirlar.map((it, i) => (
            <tr key={i}>
              <td>{it ? trTarih(belge.teslimTarihi) : ''}</td>
              <td>{it ? trTarih(it.iadeTarihi || iadeTarihi) : ''}</td>
              <td className="sol">{it ? etiket(it.urunId) : ''}</td>
              <td className="seri">{it ? (urun(it.urunId)?.seriNo || urun(it.urunId)?.barkod || '—') : ''}</td>
              <td>{it ? `${it.adet ?? ''} ${urun(it.urunId)?.birim || ''}`.trim() : ''}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <table className="kart-imza">
        <thead>
          <tr><th>İADE EDEN</th><th>TESLİM ALAN</th></tr>
        </thead>
        <tbody>
          <tr>
            <td><div className="imza-hucre">{belge.adSoyad && <span className="imza-ad">{belge.adSoyad}</span>}</div></td>
            <td><div className="imza-hucre">{teslimAlan && <span className="imza-ad">{teslimAlan}</span>}</div></td>
          </tr>
        </tbody>
      </table>

      <div className="kart-dipnot">
        Yukarıda dökümü yapılan malzemeler kontrol edilerek eksiksiz teslim alınmış olup
        ilgili kişi üzerindeki zimmet sona ermiştir.
      </div>
    </div>
  )
})

export default ZimmetIadeKart
