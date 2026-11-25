import React, { forwardRef } from 'react'

// "YYYY-AA-GG" -> "GG.AA.YYYY"
const trTarih = (iso) => {
  const p = String(iso || '').slice(0, 10).split('-')
  return p.length === 3 ? `${p[2]}.${p[1]}.${p[0]}` : String(iso || '')
}

const D = ({ v }) => <b className="cep-deger">{v ? v : '……………'}</b>

/**
 * A4 "KURUMSAL CEP TELEFONU İADE TUTANAĞI" kartı. Taahhüt tutanağıyla (CepTelefonuKart) aynı görünümde;
 * telefonu iade eden kişi ve teslim alan yetkili imzalar.
 */
const CepIadeKart = forwardRef(function CepIadeKart({ data = {} }, ref) {
  const iadeTarihi = data.iadeTarihi ? trTarih(data.iadeTarihi) : ''
  return (
    <div className="kart cep-kart" ref={ref}>
      <div className="cep-logo-satir">
        <img src="./logo.png" alt="istikbal" className="cep-logo" />
      </div>
      <h1 className="cep-baslik">İSTİKBAL MOBİLYA A.Ş.</h1>
      <h2 className="cep-alt-baslik">KURUMSAL CEP TELEFONU İADE TUTANAĞI</h2>

      <ol className="cep-maddeler">
        <li>
          <D v={data.adSoyad} /> adına <D v={data.tarih ? trTarih(data.tarih) : ''} /> tarihinde zimmetlenen{' '}
          <D v={data.imei} /> imei kodlu ve <D v={data.seriNo} /> seri nolu <D v={data.markaModel} /> marka/model{' '}
          <D v={data.hatNo} /> no lu hat/cep telefonu <D v={iadeTarihi} /> tarihinde iade alınmıştır.
        </li>
        <li>Telefon, şarj cihazı ve teslim edilen aksesuarlarıyla birlikte kontrol edilerek teslim alınmıştır.</li>
        <li>Bu tutanak ile ilgili cihaz üzerindeki zimmet sona ermiştir.</li>
      </ol>

      <div className="cep-imza">
        <div className="cep-imza-sutun">
          <div className="cep-imza-baslik">Telefonu İade Eden</div>
          <div className="cep-imza-satir">Tarih : {iadeTarihi}</div>
          <div className="cep-imza-satir">İmza :</div>
          {data.adSoyad && <div className="cep-imza-ad">{data.adSoyad}</div>}
        </div>
        <div className="cep-imza-sutun">
          <div className="cep-imza-baslik">Telefonu Teslim Alan</div>
          <div className="cep-imza-satir">Tarih : {iadeTarihi}</div>
          <div className="cep-imza-satir">İmza :</div>
          {data.iadeTeslimAlan && <div className="cep-imza-ad">{data.iadeTeslimAlan}</div>}
        </div>
      </div>
    </div>
  )
})

export default CepIadeKart
