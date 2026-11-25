// Kurumsal giriş ekranı — tek form, sağlayıcı seçimi YOK.
//
// Kullanıcı "yerel hesap mı, Active Directory mi" seçmez; sağlayıcıyı sunucu belirler.
// Alan adı (istikbaltr.local) da sunucu yapılandırmasından gelir, kullanıcıdan sorulmaz.
//
// Hata mesajı: sunucu tek tip genel mesaj döner. Arayüz bu mesajı olduğu gibi gösterir;
// "kullanıcı yok" / "parola yanlış" / "AD grubunda değil" gibi ayrım YAPILMAZ.
import React, { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from './AuthContext.jsx'
import { api } from '../api.js'
import { guvenliHedef, VARSAYILAN_YOL } from './izinler.js'

const GENEL_HATA = 'Kullanıcı adı, parola veya erişim yetkisi geçersiz.'

export default function Login() {
  const { girisYap, girisliMi, yukleniyor } = useAuth()
  const navigate = useNavigate()
  const konum = useLocation()

  const [kullaniciAdi, setKullaniciAdi] = useState('')
  const [parola, setParola] = useState('')
  const [parolaGorunur, setParolaGorunur] = useState(false)
  const [gonderiliyor, setGonderiliyor] = useState(false)
  const [hata, setHata] = useState('')
  const kullaniciRef = useRef(null)

  // Açık yönlendirme (open redirect) koruması: hedef yalnızca uygulama içi bir yol olabilir.
  const hedef = guvenliHedef(konum.state?.from || VARSAYILAN_YOL)

  useEffect(() => { kullaniciRef.current?.focus() }, [])

  // Giriş formu açılırken CSRF token'ı hazırlanır (POST /auth/login bu token'ı ister).
  useEffect(() => { api.csrfTazele() }, [])

  useEffect(() => {
    if (!yukleniyor && girisliMi) navigate(hedef, { replace: true })
  }, [yukleniyor, girisliMi, hedef, navigate])

  const gonder = async (e) => {
    e?.preventDefault()
    if (gonderiliyor) return

    const k = kullaniciAdi.trim()
    if (!k || !parola) {
      setHata(GENEL_HATA)
      return
    }

    setGonderiliyor(true)
    setHata('')
    try {
      await girisYap(k, parola)
      setParola('') // parola bellekte tutulmaz
      navigate(hedef, { replace: true })
    } catch (err) {
      // Hız sınırı mesajı bilgilendiricidir (kullanıcının kendi denemeleriyle ilgili);
      // diğer tüm başarısızlıklar tek tip genel mesajla gösterilir.
      setHata(err?.kod === 'COK_FAZLA_DENEME' ? err.message : (err?.message || GENEL_HATA))
      setParola('')
    } finally {
      setGonderiliyor(false)
    }
  }

  if (yukleniyor) {
    return (
      <div className="giris-sayfa">
        <div className="giris-kart"><p className="giris-yukleniyor">Yükleniyor…</p></div>
      </div>
    )
  }

  return (
    <div className="giris-sayfa">
      <main className="giris-kart" role="main">
        <header className="giris-marka">
          <img
            src="/logo.png" alt=""
            className="giris-logo"
            onError={(e) => { e.currentTarget.style.display = 'none' }}
          />
          <h1>Zimmet &amp; Envanter</h1>
        </header>

        <div className="giris-baslik">
          <h2>Hoş Geldiniz</h2>
          <p>Devam etmek için giriş yapın</p>
        </div>

        <form onSubmit={gonder} noValidate>
          <label className="giris-alan">
            <span>Kullanıcı Adı</span>
            <input
              ref={kullaniciRef}
              type="text"
              name="username"
              value={kullaniciAdi}
              onChange={(e) => setKullaniciAdi(e.target.value)}
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck="false"
              disabled={gonderiliyor}
              placeholder="kullanici.adi"
              aria-invalid={hata ? 'true' : undefined}
            />
          </label>

          <label className="giris-alan">
            <span>Parola</span>
            <div className="giris-parola-satir">
              <input
                type={parolaGorunur ? 'text' : 'password'}
                name="password"
                value={parola}
                onChange={(e) => setParola(e.target.value)}
                autoComplete="current-password"
                disabled={gonderiliyor}
                placeholder="••••••••"
                aria-invalid={hata ? 'true' : undefined}
              />
              <button
                type="button"
                className="giris-goz"
                onClick={() => setParolaGorunur((g) => !g)}
                disabled={gonderiliyor}
                aria-label={parolaGorunur ? 'Parolayı gizle' : 'Parolayı göster'}
                title={parolaGorunur ? 'Parolayı gizle' : 'Parolayı göster'}
              >
                {parolaGorunur ? '🙈' : '👁'}
              </button>
            </div>
          </label>

          {hata && <div className="giris-hata" role="alert">{hata}</div>}

          <button type="submit" className="giris-buton" disabled={gonderiliyor}>
            {gonderiliyor ? (<><span className="giris-spinner" aria-hidden="true" />Giriş yapılıyor…</>) : 'Giriş Yap'}
          </button>
        </form>

        <footer className="giris-dipnot">
          Kurumsal hesabınız veya size tanımlanan kullanıcı adıyla giriş yapabilirsiniz.
        </footer>
      </main>
    </div>
  )
}
