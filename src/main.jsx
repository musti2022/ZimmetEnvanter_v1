import React from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import App from './App.jsx'
import Login from './auth/Login.jsx'
import Forbidden from './pages/Forbidden.jsx'
import { AuthProvider } from './auth/AuthContext.jsx'
import { ProtectedRoute } from './auth/ProtectedRoute.jsx'
import { VARSAYILAN_YOL } from './auth/izinler.js'
import './styles.css'

// Rota yapısı:
//   /login          → herkese açık
//   /403            → yetkisiz erişim sayfası
//   diğer tüm yollar → ProtectedRoute (oturum şart) → App kabuğu
//
// App tek bir rotada kalır (yol değişince yeniden bağlanmaz) ve aktif sekmeyi URL'den
// türetir; sayfa bazlı yetki kontrolünü de kendi içinde yapar.
createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/403" element={<Forbidden />} />
          <Route path="/" element={<Navigate to={VARSAYILAN_YOL} replace />} />
          <Route element={<ProtectedRoute />}>
            <Route path="/*" element={<App />} />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
)
