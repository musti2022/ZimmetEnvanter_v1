// Kullanıcı Yönetimi — yalnızca ADMIN.
//
// Tek kimlik kaynağı: dbo.Kullanicilar. Parolalar Argon2id özeti olarak saklanır.
import React, { useEffect, useState } from 'react'
import { api } from '../api.js'
import { useAuth } from '../auth/AuthContext.jsx'

const bosForm = () => ({ kullaniciAdi: '', adSoyad: '', eposta: '', parola: '', parolaTekrar: '', rol: 'VIEWER' })

export default function KullaniciYonetimi({ bildir, onayIste }) {
  const { kullanici: oturumKullanicisi } = useAuth()
  const [kayitlar, setKayitlar] = useState([])
  const [toplam, setToplam] = useState(0)
  const [arama, setArama] = useState('')
  const [yukleniyor, setYukleniyor] = useState(true)
  const [formAcik, setFormAcik] = useState(false)
  const [form, setForm] = useState(bosForm)
  const [kaydediliyor, setKaydediliyor] = useState(false)
  const [parolaPencere, setParolaPencere] = useState(null)

  const yukle = async (q = arama) => {
    setYukleniyor(true)
    try {
      const v = await api.kullanicilar(q)
      setKayitlar(v.kayitlar || [])
      setToplam(v.toplam || 0)
    } catch (e) {
      bildir('hata', e.message)
    } finally {
      setYukleniyor(false)
    }
  }

  useEffect(() => { yukle('') /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [])

  const kaydet = async (e) => {
    e.preventDefault()
    if (form.parola !== form.parolaTekrar) return bildir('hata', 'Parolalar eşleşmiyor.')
    setKaydediliyor(true)
    try {
      await api.kullaniciEkle({
        kullaniciAdi: form.kullaniciAdi.trim(),
        adSoyad: form.adSoyad.trim(),
        eposta: form.eposta.trim(),
        parola: form.parola,
        rol: form.rol,
      })
      bildir('ok', `"${form.kullaniciAdi.trim()}" eklendi (rol: ${form.rol}).`)
      setForm(bosForm())
      setFormAcik(false)
      await yukle()
    } catch (err) {
      bildir('hata', err.message)
    } finally {
      setKaydediliyor(false)
    }
  }

  const durumDegistir = async (k) => {
    try {
      await api.kullaniciGuncelle(k.id, { aktif: !k.aktif })
      bildir('ok', `"${k.kullaniciAdi}" ${k.aktif ? 'pasifleştirildi' : 'aktifleştirildi'}.`)
      await yukle()
    } catch (e) {
      bildir('hata', e.message)
    }
  }

  const rolDegistir = (k) => {
    const yeni = k.rol === 'ADMIN' ? 'VIEWER' : 'ADMIN'
    const metin = yeni === 'ADMIN'
      ? `"${k.kullaniciAdi}" YÖNETİCİ yapılsın mı? Tüm bölümlere erişebilir; ekleme, düzenleme, silme ve kullanıcı yönetimi yapabilir.`
      : `"${k.kullaniciAdi}" yönetici yetkisi kaldırılsın mı? Yalnızca Genel Bakış ve Envanter'i salt okunur görebilir.`
    onayIste(`${metin} Açık oturumları kapatılacak.`, async () => {
      try {
        await api.kullaniciGuncelle(k.id, { rol: yeni })
        bildir('ok', `"${k.kullaniciAdi}" rolü ${yeni} olarak güncellendi.`)
        await yukle()
      } catch (e) {
        bildir('hata', e.message)
      }
    })
  }

  const sil = (k) => onayIste(
    `"${k.kullaniciAdi}" kullanıcısı kalıcı olarak silinsin mi? Açık oturumları da sonlandırılacak.`,
    async () => {
      try {
        await api.kullaniciSil(k.id)
        bildir('ok', `"${k.kullaniciAdi}" silindi.`)
        await yukle()
      } catch (e) {
        bildir('hata', e.message)
      }
    },
  )

  const parolaKaydet = async (e) => {
    e.preventDefault()
    const p = parolaPencere
    if (p.parola !== p.parolaTekrar) return bildir('hata', 'Parolalar eşleşmiyor.')
    try {
      await api.kullaniciParola(p.kullanici.id, p.parola)
      bildir('ok', `"${p.kullanici.kullaniciAdi}" parolası değiştirildi; açık oturumları kapatıldı.`)
      setParolaPencere(null)
    } catch (err) {
      bildir('hata', err.message)
    }
  }

  return (
    <main className="govde tek-sutun">
      <div className="envanter-ust-cubuk">
        <button className="btn btn-ana" onClick={() => { setForm(bosForm()); setFormAcik((a) => !a) }}>
          {formAcik ? '✕ Vazgeç' : '＋ Yeni Kullanıcı'}
        </button>
      </div>

      <div className="bilgi-serit">
        ℹ <b>VIEWER</b> yalnızca Genel Bakış ve Envanter'i salt okunur görür;
        <b>ADMIN</b> tüm bölümlere erişir ve değişiklik yapabilir.
      </div>

      {formAcik && (
        <section className="panel">
          <div className="panel-baslik">Yeni Yerel Kullanıcı</div>
          <form onSubmit={kaydet}>
            <div className="grid-2">
              <label className="field"><span>Kullanıcı Adı *</span>
                <input value={form.kullaniciAdi} onChange={(e) => setForm({ ...form, kullaniciAdi: e.target.value })}
                  autoComplete="off" placeholder="ör. ahmet.yilmaz" required />
              </label>
              <label className="field"><span>Ad Soyad</span>
                <input value={form.adSoyad} onChange={(e) => setForm({ ...form, adSoyad: e.target.value })} placeholder="Ahmet Yılmaz" />
              </label>
              <label className="field"><span>E-posta</span>
                <input type="email" value={form.eposta} onChange={(e) => setForm({ ...form, eposta: e.target.value })} placeholder="ahmet@firma.com" />
              </label>
              <label className="field"><span>Rol *</span>
                <select value={form.rol} onChange={(e) => setForm({ ...form, rol: e.target.value })}>
                  <option value="VIEWER">VIEWER — Genel Bakış + Envanter (salt okunur)</option>
                  <option value="ADMIN">ADMIN — tüm bölümler, tam yetki</option>
                </select>
              </label>
              <label className="field"><span>Parola *</span>
                <input type="password" value={form.parola} onChange={(e) => setForm({ ...form, parola: e.target.value })}
                  autoComplete="new-password" required />
              </label>
              <label className="field"><span>Parola (tekrar) *</span>
                <input type="password" value={form.parolaTekrar} onChange={(e) => setForm({ ...form, parolaTekrar: e.target.value })}
                  autoComplete="new-password" required />
              </label>
            </div>
            <p className="bos-metin">
              En az 12 karakter; küçük harf, büyük harf, rakam ve sembol gruplarından en az üçünü içermelidir.
            </p>
            <div className="form-aksiyon">
              <button type="submit" className="btn btn-ana" disabled={kaydediliyor}>
                {kaydediliyor ? 'Kaydediliyor…' : 'Kullanıcı Ekle'}
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => { setFormAcik(false); setForm(bosForm()) }}>Vazgeç</button>
            </div>
          </form>
        </section>
      )}

      <section className="panel">
        <div className="panel-baslik-satir">
          <div className="panel-baslik">Yerel Kullanıcılar ({toplam})</div>
          <input
            className="arama" value={arama}
            onChange={(e) => setArama(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') yukle() }}
            placeholder="Ara: kullanıcı adı, ad, e-posta…"
          />
        </div>
        {yukleniyor ? (
          <p className="bos-metin">Yükleniyor…</p>
        ) : kayitlar.length === 0 ? (
          <p className="bos-metin">Kayıtlı yerel kullanıcı yok.</p>
        ) : (
          <div className="tablo-kaydir">
            <table className="tablo">
              <thead>
                <tr>
                  <th>Kullanıcı Adı</th><th>Ad Soyad</th><th>E-posta</th>
                  <th>Rol</th><th>Durum</th><th>Son Giriş</th><th>İşlem</th>
                </tr>
              </thead>
              <tbody>
                {kayitlar.map((k) => {
                  // Kendi hesabı: rol/durum/silme işlemleri sunucuda da engellidir
                  // (yanlışlıkla kendini kilitlemeye karşı).
                  const kendisi = oturumKullanicisi?.kullaniciId === k.id
                  return (
                    <tr key={k.id}>
                      <td><b>{k.kullaniciAdi}</b>{kendisi && <div className="alt-metin">(oturumdaki hesap)</div>}</td>
                      <td>{k.adSoyad || '—'}</td>
                      <td>{k.eposta || '—'}</td>
                      <td><span className={`rozet ${k.rol === 'ADMIN' ? 'rozet-mavi' : 'rozet-gri'}`}>{k.rol}</span></td>
                      <td>{k.aktif
                        ? <span className="rozet rozet-yesil">Aktif</span>
                        : <span className="rozet rozet-kirmizi">Pasif</span>}</td>
                      <td>{k.sonGiris ? new Date(k.sonGiris).toLocaleString('tr-TR') : '—'}</td>
                      <td className="islem">
                        <button className="btn btn-ghost sm" onClick={() => setParolaPencere({ kullanici: k, parola: '', parolaTekrar: '' })}>Parola</button>
                        <button className="btn btn-ikincil sm" disabled={kendisi} title={kendisi ? 'Kendi rolünüzü değiştiremezsiniz.' : ''}
                          onClick={() => rolDegistir(k)}>
                          {k.rol === 'ADMIN' ? 'Yetkiyi Al' : 'Yönetici Yap'}
                        </button>
                        <button className="btn btn-ikincil sm" disabled={kendisi} title={kendisi ? 'Kendi hesabınızı pasifleştiremezsiniz.' : ''}
                          onClick={() => durumDegistir(k)}>{k.aktif ? 'Pasifleştir' : 'Aktifleştir'}</button>
                        <button className="btn sm btn-sil" disabled={kendisi} title={kendisi ? 'Kendi hesabınızı silemezsiniz.' : ''}
                          onClick={() => sil(k)}>Sil</button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {parolaPencere && (
        <div className="perde" onClick={() => setParolaPencere(null)}>
          <div className="pencere" onClick={(e) => e.stopPropagation()}>
            <div className="panel-baslik">Parola Değiştir — {parolaPencere.kullanici.kullaniciAdi}</div>
            <form onSubmit={parolaKaydet}>
              <label className="field"><span>Yeni Parola</span>
                <input type="password" autoFocus autoComplete="new-password" required
                  value={parolaPencere.parola}
                  onChange={(e) => setParolaPencere({ ...parolaPencere, parola: e.target.value })} />
              </label>
              <label className="field" style={{ marginTop: 12 }}><span>Yeni Parola (tekrar)</span>
                <input type="password" autoComplete="new-password" required
                  value={parolaPencere.parolaTekrar}
                  onChange={(e) => setParolaPencere({ ...parolaPencere, parolaTekrar: e.target.value })} />
              </label>
              <p className="bos-metin">Parola değişince kullanıcının tüm açık oturumları sonlandırılır.</p>
              <div className="form-aksiyon">
                <button type="submit" className="btn btn-ana">Kaydet</button>
                <button type="button" className="btn btn-ghost" onClick={() => setParolaPencere(null)}>Vazgeç</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  )
}
