// Denetim Günlüğü (audit log) — yalnızca ADMIN.
import React, { useEffect, useState } from 'react'
import { api } from '../api.js'

const EYLEM_ROZET = {
  LOGIN_SUCCESS: 'rozet-yesil',
  LOGIN_FAILED: 'rozet-kirmizi',
  LOGIN_RATE_LIMITED: 'rozet-kirmizi',
  ACCESS_DENIED: 'rozet-kirmizi',
  CSRF_REJECTED: 'rozet-kirmizi',
  SESSION_EXPIRED: 'rozet-sari',
  LOGOUT: 'rozet-gri',
}

const bosFiltre = () => ({ eylem: '', kullaniciAdi: '', ara: '', baslangic: '', bitis: '', sayfa: 1, boyut: 100 })

export default function DenetimGunlugu({ bildir }) {
  const [kayitlar, setKayitlar] = useState([])
  const [toplam, setToplam] = useState(0)
  const [eylemler, setEylemler] = useState([])
  const [filtre, setFiltre] = useState(bosFiltre)
  const [yukleniyor, setYukleniyor] = useState(true)

  const yukle = async (f = filtre) => {
    setYukleniyor(true)
    try {
      const v = await api.loglar(f)
      setKayitlar(v.kayitlar || [])
      setToplam(v.toplam || 0)
    } catch (e) {
      bildir('hata', e.message)
    } finally {
      setYukleniyor(false)
    }
  }

  useEffect(() => {
    api.logEylemleri().then((v) => setEylemler(v.eylemler || [])).catch(() => {})
    yukle(bosFiltre())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const filtreUygula = (yeni) => {
    const f = { ...filtre, ...yeni, sayfa: 1 }
    setFiltre(f)
    yukle(f)
  }

  const sayfaGit = (yon) => {
    const f = { ...filtre, sayfa: Math.max(1, filtre.sayfa + yon) }
    setFiltre(f)
    yukle(f)
  }

  const sonSayfa = Math.max(1, Math.ceil(toplam / filtre.boyut))

  return (
    <main className="govde tek-sutun">
      <section className="panel">
        <div className="panel-baslik-satir">
          <div className="panel-baslik">Denetim Günlüğü ({toplam})</div>
          <div className="filtre-grup">
            <select value={filtre.eylem} onChange={(e) => filtreUygula({ eylem: e.target.value })}>
              <option value="">Tüm olaylar</option>
              {eylemler.map((e) => <option key={e} value={e}>{e}</option>)}
            </select>
            <input type="date" value={filtre.baslangic} title="Başlangıç"
              onChange={(e) => filtreUygula({ baslangic: e.target.value })} />
            <input type="date" value={filtre.bitis} title="Bitiş"
              onChange={(e) => filtreUygula({ bitis: e.target.value })} />
            <input className="arama" type="search" value={filtre.ara} placeholder="🔎 Ara: seri no, IMEI, kişi, belge no… (Enter)"
              title="Detay alanında arar; tüm kayıtlarda geçerlidir"
              onChange={(e) => setFiltre({ ...filtre, ara: e.target.value })}
              onKeyDown={(e) => { if (e.key === 'Enter') filtreUygula({}) }} />
            <input className="arama" value={filtre.kullaniciAdi} placeholder="Kullanıcı ara…"
              onChange={(e) => setFiltre({ ...filtre, kullaniciAdi: e.target.value })}
              onKeyDown={(e) => { if (e.key === 'Enter') filtreUygula({}) }} />
            <button className="btn btn-ghost sm" onClick={() => { setFiltre(bosFiltre()); yukle(bosFiltre()) }}>Temizle</button>
          </div>
        </div>

        {yukleniyor ? (
          <p className="bos-metin">Yükleniyor…</p>
        ) : kayitlar.length === 0 ? (
          <p className="bos-metin">Bu filtreye uyan kayıt yok.</p>
        ) : (
          <>
            <div className="tablo-kaydir">
              <table className="tablo">
                <thead>
                  <tr>
                    <th>Zaman</th><th>Kullanıcı</th><th>Rol</th><th>Sağlayıcı</th>
                    <th>Olay</th><th>Kaynak</th><th>Sonuç</th><th>IP</th><th>Detay</th>
                  </tr>
                </thead>
                <tbody>
                  {kayitlar.map((k) => (
                    <tr key={k.id}>
                      <td className="log-zaman">{new Date(k.zaman).toLocaleString('tr-TR')}</td>
                      <td><b>{k.kullaniciAdi}</b></td>
                      <td>{k.rol || '—'}</td>
                      <td>{k.saglayici || '—'}</td>
                      <td><span className={`rozet ${EYLEM_ROZET[k.eylem] || 'rozet-mavi'}`}>{k.eylem}</span></td>
                      <td>{k.kaynak || '—'}</td>
                      <td>{k.sonuc === 'BASARILI'
                        ? <span className="rozet rozet-yesil">✓</span>
                        : <span className="rozet rozet-kirmizi">✕</span>}</td>
                      <td className="log-ip">{k.ip || '—'}</td>
                      <td className="log-detay" title={k.detay || ''}>{k.detay || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="sayfalama">
              <button className="btn btn-ghost sm" disabled={filtre.sayfa <= 1} onClick={() => sayfaGit(-1)}>← Önceki</button>
              <span>Sayfa {filtre.sayfa} / {sonSayfa}</span>
              <button className="btn btn-ghost sm" disabled={filtre.sayfa >= sonSayfa} onClick={() => sayfaGit(1)}>Sonraki →</button>
            </div>
          </>
        )}
      </section>
    </main>
  )
}
