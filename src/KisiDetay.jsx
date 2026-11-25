import React from 'react'
import { trTarih } from './yardimci.js'

// Kişi kartı: kişinin üzerindeki aktif zimmetler ve geçmiş (iade edilen) kalemler
export default function KisiDetay({ kisi, belgeler, urunAdi, tutanakAc, kapat }) {
  const kayitlar = belgeler.filter((b) => b.adSoyad === kisi)
  const aktifler = kayitlar.flatMap((b) =>
    b.items.filter((it) => it.durum === 'zimmetli').map((it) => ({ ...it, belge: b }))
  )
  const gecmis = kayitlar.flatMap((b) =>
    b.items.filter((it) => it.durum === 'iade').map((it) => ({ ...it, belge: b }))
  )
  const gorev = kayitlar.find((b) => b.gorev)?.gorev

  return (
    <div className="perde" onClick={kapat}>
      <div className="pencere genis" onClick={(e) => e.stopPropagation()}>
        <div className="panel-baslik">{kisi}{gorev ? ` — ${gorev}` : ''}</div>

        <div className="mini-kartlar">
          <div><b>{aktifler.reduce((t, it) => t + Number(it.adet || 0), 0)}</b><span>Üzerindeki Adet</span></div>
          <div><b>{aktifler.length}</b><span>Aktif Zimmet</span></div>
          <div><b>{kayitlar.length}</b><span>Toplam Belge</span></div>
        </div>

        <div className="panel-baslik" style={{ marginTop: 18 }}>Aktif Zimmetler ({aktifler.length})</div>
        {aktifler.length === 0 ? (
          <p className="bos-metin">Bu kişinin üzerinde şu anda zimmetli ürün yok.</p>
        ) : (
          <table className="tablo">
            <thead>
              <tr><th>Ürün</th><th className="sag">Adet</th><th>Veriliş</th><th>İşlem</th></tr>
            </thead>
            <tbody>
              {aktifler.map((it) => (
                <tr key={it.id}>
                  <td>
                    <b>{urunAdi(it.urunId)}</b>
                    {it.belge.belgeNo && <div className="alt-metin">{it.belge.belgeNo}</div>}
                  </td>
                  <td className="sag">{it.adet}</td>
                  <td>{trTarih(it.belge.teslimTarihi)}</td>
                  <td className="islem">
                    <button className="btn btn-ghost sm" onClick={() => tutanakAc(it.belge.id)}>Tutanak</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <div className="panel-baslik" style={{ marginTop: 18 }}>Geçmiş (İade Edilenler) ({gecmis.length})</div>
        {gecmis.length === 0 ? (
          <p className="bos-metin">İade edilmiş kayıt yok.</p>
        ) : (
          <div className="tablo-kaydir kisa">
            <table className="tablo">
              <thead>
                <tr><th>Ürün</th><th className="sag">Adet</th><th>Veriliş</th><th>İade</th><th>İşlem</th></tr>
              </thead>
              <tbody>
                {gecmis.map((it) => (
                  <tr key={it.id}>
                    <td>
                      <b>{urunAdi(it.urunId)}</b>
                      {it.belge.belgeNo && <div className="alt-metin">{it.belge.belgeNo}</div>}
                    </td>
                    <td className="sag">{it.adet}</td>
                    <td>{trTarih(it.belge.teslimTarihi)}</td>
                    <td>{trTarih(it.iadeTarihi)}</td>
                    <td className="islem">
                      <button className="btn btn-ghost sm" onClick={() => tutanakAc(it.belge.id)}>Tutanak</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="form-aksiyon">
          <button className="btn btn-ghost" onClick={kapat}>Kapat</button>
        </div>
      </div>
    </div>
  )
}
