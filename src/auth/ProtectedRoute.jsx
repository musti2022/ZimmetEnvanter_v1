// Rota koruması.
//
// Arayüz katmanıdır: yetkisiz kullanıcıyı doğru ekrana yönlendirir. Verinin kendisini
// koruyan sunucudur — bu bileşen atlansa bile API 401/403 döndürür.
import React from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from './AuthContext.jsx'
import { Rol } from './izinler.js'
import Forbidden from '../pages/Forbidden.jsx'

function Bekleme() {
  return (
    <div className="giris-sayfa">
      <div className="giris-kart"><p className="giris-yukleniyor">Oturum doğrulanıyor…</p></div>
    </div>
  )
}

/** Kimlik doğrulaması şart. Oturum yoksa /login'e, geldiği yolu hatırlayarak yönlendirir. */
export function ProtectedRoute({ children }) {
  const { girisliMi, yukleniyor } = useAuth()
  const konum = useLocation()

  if (yukleniyor) return <Bekleme />
  if (!girisliMi) {
    return <Navigate to="/login" replace state={{ from: konum.pathname + konum.search }} />
  }
  return children || <Outlet />
}

/** ADMIN şart. Girişli ama yetkisiz kullanıcıya 403 sayfası gösterilir (login'e atılmaz). */
export function AdminRoute({ children }) {
  const { girisliMi, yukleniyor, kullanici } = useAuth()
  const konum = useLocation()

  if (yukleniyor) return <Bekleme />
  if (!girisliMi) {
    return <Navigate to="/login" replace state={{ from: konum.pathname + konum.search }} />
  }
  if (kullanici?.rol !== Rol.ADMIN) return <Forbidden />
  return children || <Outlet />
}

/** Belirli izin şart. */
export function IzinliRoute({ izin, children }) {
  const { girisliMi, yukleniyor, izinVar } = useAuth()
  const konum = useLocation()

  if (yukleniyor) return <Bekleme />
  if (!girisliMi) {
    return <Navigate to="/login" replace state={{ from: konum.pathname + konum.search }} />
  }
  if (izin && !izinVar(izin)) return <Forbidden />
  return children || <Outlet />
}

export default ProtectedRoute
