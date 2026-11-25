// Kimlik bağlamı: oturum durumu, izin sorgulama ve giriş/çıkış işlemleri.
//
// Rol ve izinler HER ZAMAN sunucudan (/api/auth/me) gelir. İstemci tarafında rol
// üretilmez, saklanmaz, düzenlenemez; sayfa yenilendiğinde yeniden sunucudan okunur.
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { api, csrfAyarla, oturumDustuDinle, YetkisizHatasi } from '../api.js'
import { Rol } from './izinler.js'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [kullanici, setKullanici] = useState(null)
  const [izinler, setIzinler] = useState([])
  const [oturum, setOturum] = useState(null)
  const [yukleniyor, setYukleniyor] = useState(true)
  const [sunucuYok, setSunucuYok] = useState(false)

  const baglamiYaz = useCallback((v) => {
    setKullanici(v?.kullanici || null)
    setIzinler(Array.isArray(v?.izinler) ? v.izinler : [])
    setOturum(v?.oturum || null)
    if (v?.csrfToken) csrfAyarla(v.csrfToken)
  }, [])

  const temizle = useCallback(() => {
    setKullanici(null)
    setIzinler([])
    setOturum(null)
  }, [])

  // Açılışta ve sekmeye geri dönüldüğünde oturumu sunucudan doğrula.
  const tazele = useCallback(async () => {
    try {
      const v = await api.benKimim()
      baglamiYaz(v)
      setSunucuYok(false)
      return v
    } catch (e) {
      if (e instanceof YetkisizHatasi) {
        temizle()
        setSunucuYok(false)
      } else {
        setSunucuYok(true)
      }
      return null
    } finally {
      setYukleniyor(false)
    }
  }, [baglamiYaz, temizle])

  useEffect(() => { tazele() }, [tazele])

  // Sunucu 401 dönerse (oturum zaman aşımına uğradı) yerel durumu da hemen düşür.
  useEffect(() => {
    oturumDustuDinle(() => temizle())
    return () => oturumDustuDinle(null)
  }, [temizle])

  const girisYap = useCallback(async (kullaniciAdi, parola) => {
    const v = await api.girisYap(kullaniciAdi, parola)
    baglamiYaz(v)
    return v
  }, [baglamiYaz])

  const cikisYap = useCallback(async () => {
    try { await api.cikisYap() } catch { /* çıkışta hata olsa da yerel durumu temizle */ }
    temizle()
    await api.csrfTazele()
  }, [temizle])

  const deger = useMemo(() => ({
    kullanici,
    izinler,
    oturum,
    yukleniyor,
    sunucuYok,
    girisliMi: Boolean(kullanici),
    adminMi: kullanici?.rol === Rol.ADMIN,
    izinVar: (izin) => izinler.includes(izin),
    girisYap,
    cikisYap,
    tazele,
  }), [kullanici, izinler, oturum, yukleniyor, sunucuYok, girisYap, cikisYap, tazele])

  return <AuthContext.Provider value={deger}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const c = useContext(AuthContext)
  if (!c) throw new Error('useAuth yalnızca <AuthProvider> içinde kullanılabilir.')
  return c
}

/** İzne göre koşullu render. Arayüz kolaylığıdır; sunucu yetkisinin yerini TUTMAZ. */
export function CanAccess({ izin, rol, children, yedek = null }) {
  const { izinVar, kullanici } = useAuth()
  if (rol && kullanici?.rol !== rol) return yedek
  if (izin && !izinVar(izin)) return yedek
  return children
}
