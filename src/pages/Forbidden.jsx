// 403 — Erişim yetkisi yok.
// Kullanıcıya NEDEN yetkisiz olduğuna dair sistem ayrıntısı (AD grubu, rol kuralları)
// verilmez; yalnızca durumu ve çıkış yolunu gösterir.
import React from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext.jsx'
import { VARSAYILAN_YOL } from '../auth/izinler.js'

export default function Forbidden() {
  const navigate = useNavigate()
  const { kullanici } = useAuth()

  return (
    <div className="yasak-sayfa">
      <section className="yasak-kart" role="alert">
        <div className="yasak-ikon" aria-hidden="true">🔒</div>
        <h1>Erişim Yetkiniz Bulunmuyor</h1>
        <p>
          Bu sayfayı görüntülemek veya bu işlemi gerçekleştirmek için gerekli yetkiye
          sahip değilsiniz.
        </p>
        {kullanici && (
          <p className="yasak-rol">
            Oturum: <b>{kullanici.gorunenAd || kullanici.kullaniciAdi}</b> · Rol: <b>{kullanici.rol}</b>
          </p>
        )}
        <button className="btn btn-ana" onClick={() => navigate(VARSAYILAN_YOL, { replace: true })}>
          Genel Bakışa Dön
        </button>
      </section>
    </div>
  )
}
