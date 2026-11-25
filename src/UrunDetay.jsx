import React from 'react'
import { trTarih, HAREKET_ETIKET } from './yardimci.js'

// Ürün detay penceresi: bilgiler, stok özeti, aktif zimmetler ve hareket geçmişi
export default function UrunDetay({ urun, zimmetli, bosta, belgeler, hareketler, kapat }) {
  const aktifler = belgeler.flatMap((b) =>
    b.items
      .filter((it) => it.urunId === urun.id && it.durum === 'zimmetli')
      .map((it) => ({ ...it, belge: b }))
  )
  const gecmis = hareketler.filter((h) => h.urunId === urun.id)

  return (
    <div className="perde" onClick={kapat}>
      <div className="pencere genis" onClick={(e) => e.stopPropagation()}>
        <div className="panel-baslik">{urun.ad}{urun.markaModel ? ` — ${urun.markaModel}` : ''}</div>

        <div className="mini-kartlar">
          <div><b>{urun.stok}</b><span>Toplam Stok</span></div>
          <div><b>{zimmetli}</b><span>Zimmetli</span></div>
          <div><b>{bosta}</b><span>Boşta</span></div>
        </div>

        <div className="detay-grid">
          <div><span>Kategori</span><b>{urun.kategori || '—'}</b></div>
          <div><span>Seri No</span><b>{urun.seriNo || '—'}</b></div>
          <div><span>Barkod</span><b>{urun.barkod || '—'}</b></div>
          <div><span>Birim</span><b>{urun.birim}</b></div>
          <div><span>Konum / Depo</span><b>{urun.konum || '—'}</b></div>
          <div><span>Durum</span><b>{urun.calismaDurumu === 'arizali' ? 'Arızalı' : 'Çalışır'}</b></div>
          <div><span>Kritik Seviye</span><b>{Number(urun.minStok || 0) > 0 ? urun.minStok : 'Kapalı'}</b></div>
          <div><span>Kayıt Tarihi</span><b>{trTarih(urun.olusturma)}</b></div>
        </div>
        {urun.aciklama && <p className="detay-aciklama">{urun.aciklama}</p>}

        <div className="panel-baslik" style={{ marginTop: 18 }}>Aktif Zimmetler ({aktifler.length})</div>
        {aktifler.length === 0 ? (
          <p className="bos-metin">Bu ürün şu anda kimseye zimmetli değil.</p>
        ) : (
          <table className="tablo">
            <thead>
              <tr><th>Kişi</th><th>Görev</th><th className="sag">Adet</th><th>Veriliş</th><th>Belge No</th></tr>
            </thead>
            <tbody>
              {aktifler.map((it) => (
                <tr key={it.id}>
                  <td><b>{it.belge.adSoyad}</b></td>
                  <td>{it.belge.gorev || '—'}</td>
                  <td className="sag">{it.adet}</td>
                  <td>{trTarih(it.belge.teslimTarihi)}</td>
                  <td>{it.belge.belgeNo || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <div className="panel-baslik" style={{ marginTop: 18 }}>Hareket Geçmişi ({gecmis.length})</div>
        {gecmis.length === 0 ? (
          <p className="bos-metin">Hareket kaydı yok.</p>
        ) : (
          <div className="tablo-kaydir kisa">
            <table className="tablo">
              <thead>
                <tr><th>Tarih</th><th>Tip</th><th className="sag">Adet</th><th>Açıklama</th></tr>
              </thead>
              <tbody>
                {gecmis.map((h) => {
                  const [etiket, sinif] = HAREKET_ETIKET[h.tip] || [h.tip, 'rozet-gri']
                  return (
                    <tr key={h.id}>
                      <td>{trTarih(h.tarih)}</td>
                      <td><span className={`rozet ${sinif}`}>{etiket}</span></td>
                      <td className="sag">{h.adet}</td>
                      <td>{h.aciklama || '—'}</td>
                    </tr>
                  )
                })}
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
