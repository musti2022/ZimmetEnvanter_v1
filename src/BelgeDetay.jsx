import React from 'react'
import { trTarih } from './yardimci.js'

// Zimmet belgesi detay penceresi: belge bilgileri, kalemler (seri no, durum) ve kalem bazında iade
export default function BelgeDetay({ belge, urunAdi, urunSeriNo, iadeAl, tumunuIadeAl, tutanakAc, iadeTutanakAc, kapat }) {
  const zimmetliSayisi = belge.items.filter((it) => it.durum !== 'iade').length
  return (
    <div className="perde" onClick={kapat}>
      <div className="pencere genis" onClick={(e) => e.stopPropagation()}>
        <div className="panel-baslik">
          {belge.belgeNo || 'Zimmet Belgesi'} — {belge.adSoyad || '(isimsiz)'}
          {' '}<span className={`rozet ${zimmetliSayisi ? 'rozet-mavi' : 'rozet-gri'}`}>
            {zimmetliSayisi ? `${zimmetliSayisi} ürün zimmetli` : 'Tümü iade edildi'}
          </span>
        </div>

        <div className="detay-grid">
          <div><span>Belge No</span><b>{belge.belgeNo || '—'}</b></div>
          <div><span>Adı Soyadı</span><b>{belge.adSoyad || '—'}</b></div>
          <div><span>Görev</span><b>{belge.gorev || '—'}</b></div>
          <div><span>Bölüm</span><b>{belge.bolum || '—'}</b></div>
          <div><span>Teslim Tarihi</span><b>{belge.teslimTarihi ? trTarih(belge.teslimTarihi) : '—'}</b></div>
          <div><span>Teslim Eden</span><b>{belge.teslimEden || '—'}</b></div>
          <div><span>Teslim Alan</span><b>{belge.teslimAlan || '—'}</b></div>
          <div><span>Kayıt Tarihi</span><b>{belge.olusturma ? trTarih(belge.olusturma) : '—'}</b></div>
        </div>

        <div className="panel-baslik" style={{ marginTop: 18 }}>Zimmetli Ürünler ({belge.items.length})</div>
        <table className="tablo">
          <thead>
            <tr><th>Ürün</th><th>Seri No</th><th className="sag">Adet</th><th>Durum</th><th>İade Tarihi</th><th></th></tr>
          </thead>
          <tbody>
            {belge.items.map((it) => (
              <tr key={it.id}>
                <td><b>{urunAdi(it.urunId)}</b></td>
                <td>{urunSeriNo(it.urunId) || '—'}</td>
                <td className="sag">{it.adet}</td>
                <td>{it.durum === 'iade'
                  ? <span className="rozet rozet-gri">İade edildi</span>
                  : <span className="rozet rozet-mavi">Zimmetli</span>}</td>
                <td>{it.iadeTarihi ? trTarih(it.iadeTarihi) : '—'}</td>
                <td className="islem">
                  {it.durum !== 'iade' ? (
                    <button className="btn btn-ghost sm" onClick={() => iadeAl(it)} title="Bu ürünü iade al; iade tutanağı oluşturulur">İade Al</button>
                  ) : (
                    <button className="btn btn-ghost sm" onClick={() => iadeTutanakAc([it])} title="Bu ürünün iade tutanağını göster">İade Tutanağı</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="form-aksiyon">
          {zimmetliSayisi > 1 && <button className="btn btn-ikincil" onClick={tumunuIadeAl}>Tümünü İade Al</button>}
          <button className="btn btn-ikincil" onClick={tutanakAc}>Zimmet Tutanağı</button>
          <button className="btn btn-ghost" onClick={kapat}>Kapat</button>
        </div>
      </div>
    </div>
  )
}
