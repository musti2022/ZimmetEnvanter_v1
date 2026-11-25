import React, { forwardRef } from 'react'
import { CEP_MADDELER } from './yardimci.js'

// "YYYY-AA-GG" -> "GG.AA.YYYY"
const trTarih = (iso) => {
  const p = String(iso || '').slice(0, 10).split('-')
  return p.length === 3 ? `${p[2]}.${p[1]}.${p[0]}` : String(iso || '')
}

// Değişken alanlar için dolgu (boşken noktalı çizgi gösterir)
const D = ({ v }) => <b className="cep-deger">{v ? v : '……………'}</b>

/**
 * A4 "KURUMSAL CEP TELEFONU KULLANIM TAAHHÜTÜ VE TESLİM TUTANAĞI" kartı.
 * Cep_Telefonu_kullanm_taahhudu.docx şablonuna birebir uyar (metinler değiştirilmez):
 *  - Üstte ortalı istikbal logosu
 *  - İSTİKBAL MOBİLYA A.Ş. + başlık (ortalı, kalın)
 *  - Madde imli 10 madde: 1'i kişi/telefon bilgileriyle dolan cümle, 9'u sabit taahhüt
 *  - İmza bloğu: Telefonu Teslim Eden | Telefonu Teslim Alan (Tarih / İmza)
 */
const CepTelefonuKart = forwardRef(function CepTelefonuKart({ data = {} }, ref) {
  const tarih = data.tarih ? trTarih(data.tarih) : ''
  return (
    <div className="kart cep-kart" ref={ref}>
      <div className="cep-logo-satir">
        <img src="./logo.png" alt="istikbal" className="cep-logo" />
      </div>
      <h1 className="cep-baslik">İSTİKBAL MOBİLYA A.Ş.</h1>
      <h2 className="cep-alt-baslik">KURUMSAL CEP TELEFONU KULLANIM TAAHHÜTÜ VE TESLİM TUTANAĞI</h2>

      <ol className="cep-maddeler">
        <li>
          <D v={data.adSoyad} /> tarafından kurumsal amaçlar için sağlanan <D v={data.imei} /> imei
          kodlu ve <D v={data.seriNo} /> seri nolu <D v={data.markaModel} /> marka/model{' '}
          <D v={data.hatNo} /> no lu hat/cep telefonu kurumsal kullanım amacıyla verilmiştir.
        </li>
        {CEP_MADDELER.map((m, i) => <li key={i}>{m}</li>)}
      </ol>

      <div className="cep-imza">
        <div className="cep-imza-sutun">
          <div className="cep-imza-baslik">Telefonu Teslim Eden</div>
          <div className="cep-imza-satir">Tarih : {tarih}</div>
          <div className="cep-imza-satir">İmza :</div>
          {data.teslimEden && <div className="cep-imza-ad">{data.teslimEden}</div>}
        </div>
        <div className="cep-imza-sutun">
          <div className="cep-imza-baslik">Telefonu Teslim Alan</div>
          <div className="cep-imza-satir">Tarih : {tarih}</div>
          <div className="cep-imza-satir">İmza :</div>
          {data.teslimAlan && <div className="cep-imza-ad">{data.teslimAlan}</div>}
        </div>
      </div>
    </div>
  )
})

export default CepTelefonuKart
