import React from 'react'
import { trTarih } from './yardimci.js'

const DURUM = {
  zimmetli: ['Zimmetli', 'rozet-mavi'],
  iade: ['İade edildi', 'rozet-gri'],
  bosta: ['Boşta', 'rozet-yesil'],
}

const ayni = (a, b) => String(a || '').trim().toLocaleLowerCase('tr') === String(b || '').trim().toLocaleLowerCase('tr')

// Cep telefonu kaydı detay penceresi: tüm bilgiler ve aynı cihazın (IMEI / seri no) diğer kayıtları
export default function CepDetay({ kayit, kayitlar, gecmis: tumGecmis = [], gecmisTutanakAc, tutanakAc, kapat }) {
  const [etiket, sinif] = DURUM[kayit.durum] || DURUM.zimmetli
  const gecmis = kayitlar
    .filter((k) => k.id !== kayit.id &&
      ((kayit.imei && ayni(k.imei, kayit.imei)) || (kayit.seriNo && ayni(k.seriNo, kayit.seriNo))))
    .sort((a, b) => String(b.olusturma).localeCompare(String(a.olusturma)))
  // Bu telefonun iade edilmiş zimmet dönemleri (aynı kayıt ya da aynı IMEI / seri no)
  const donemler = tumGecmis
    .filter((g) => g.cepId === kayit.id ||
      (kayit.imei && ayni(g.imei, kayit.imei)) || (kayit.seriNo && ayni(g.seriNo, kayit.seriNo)))
    .sort((a, b) => String(b.iadeTarihi || b.olusturma).localeCompare(String(a.iadeTarihi || a.olusturma)))

  return (
    <div className="perde" onClick={kapat}>
      <div className="pencere genis" onClick={(e) => e.stopPropagation()}>
        <div className="panel-baslik">
          {kayit.markaModel || 'Cep Telefonu'}{kayit.adSoyad ? ` — ${kayit.adSoyad}` : ''}
          {' '}<span className={`rozet ${sinif}`}>{etiket}</span>
        </div>

        <div className="detay-grid">
          <div><span>Adı Soyadı</span><b>{kayit.adSoyad || '—'}</b></div>
          <div><span>Hat No</span><b>{kayit.hatNo || '—'}</b></div>
          <div><span>Marka / Model</span><b>{kayit.markaModel || '—'}</b></div>
          <div><span>IMEI</span><b>{kayit.imei || '—'}</b></div>
          <div><span>Seri No</span><b>{kayit.seriNo || '—'}</b></div>
          <div><span>Zimmet Tarihi</span><b>{kayit.tarih ? trTarih(kayit.tarih) : '—'}</b></div>
          <div><span>Teslim Eden</span><b>{kayit.teslimEden || '—'}</b></div>
          <div><span>Teslim Alan</span><b>{kayit.teslimAlan || '—'}</b></div>
          <div><span>Durum</span><b>{etiket}</b></div>
          <div><span>İade Tarihi</span><b>{kayit.iadeTarihi ? trTarih(kayit.iadeTarihi) : '—'}</b></div>
          <div><span>Kayıt Tarihi</span><b>{kayit.olusturma ? trTarih(kayit.olusturma) : '—'}</b></div>
          <div><span>Son Güncelleme</span><b>{kayit.guncelleme ? trTarih(kayit.guncelleme) : '—'}</b></div>
        </div>

        <div className="panel-baslik" style={{ marginTop: 18 }}>Zimmet Geçmişi ve Tutanaklar ({donemler.length})</div>
        {donemler.length === 0 ? (
          <p className="bos-metin">Bu telefonun iade edilmiş eski zimmeti yok.</p>
        ) : (
          <table className="tablo">
            <thead>
              <tr><th>Kişi</th><th>Hat No</th><th>Zimmet Tarihi</th><th>İade Tarihi</th><th>Tutanaklar</th></tr>
            </thead>
            <tbody>
              {donemler.map((g) => (
                <tr key={g.id}>
                  <td><b>{g.adSoyad || '—'}</b></td>
                  <td>{g.hatNo || '—'}</td>
                  <td>{g.tarih ? trTarih(g.tarih) : '—'}</td>
                  <td>{g.iadeTarihi ? trTarih(g.iadeTarihi) : '—'}</td>
                  <td className="islem">
                    <button className="btn btn-ghost sm" onClick={() => gecmisTutanakAc(g, 'zimmet')}>Zimmet Tutanağı</button>
                    <button className="btn btn-ghost sm" onClick={() => gecmisTutanakAc(g, 'iade')}>İade Tutanağı</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {gecmis.length > 0 && (
          <>
            <div className="panel-baslik" style={{ marginTop: 18 }}>Aynı Cihazın Diğer Kayıtları ({gecmis.length})</div>
            <table className="tablo">
              <thead>
                <tr><th>Kişi</th><th>Hat No</th><th>Zimmet Tarihi</th><th>Durum</th></tr>
              </thead>
              <tbody>
                {gecmis.map((k) => {
                  const [e, s2] = DURUM[k.durum] || DURUM.zimmetli
                  return (
                    <tr key={k.id}>
                      <td><b>{k.adSoyad || '—'}</b></td>
                      <td>{k.hatNo || '—'}</td>
                      <td>{k.tarih ? trTarih(k.tarih) : '—'}</td>
                      <td><span className={`rozet ${s2}`}>{e}</span></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </>
        )}

        <div className="form-aksiyon">
          {kayit.durum !== 'bosta' && <button className="btn btn-ikincil" onClick={tutanakAc}>Tutanak</button>}
          <button className="btn btn-ghost" onClick={kapat}>Kapat</button>
        </div>
      </div>
    </div>
  )
}
