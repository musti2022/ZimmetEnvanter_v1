// Yönetim — sistem durumu ve güvenlik yapılandırması.
// Yalnızca ADMIN. Hiçbir parola/anahtar DEĞERİ gösterilmez; yalnızca "tanımlı mı" bilgisi.
import React, { useEffect, useState } from 'react'
import { api } from '../api.js'

function Satir({ etiket, deger, ipucu }) {
  return (
    <div className="yapilandirma-satir">
      <span className="yapilandirma-etiket">{etiket}</span>
      <span className="yapilandirma-deger" title={ipucu}>{deger}</span>
    </div>
  )
}

const Evet = () => <span className="rozet rozet-yesil">Evet</span>
const Hayir = () => <span className="rozet rozet-kirmizi">Hayır</span>
const mantik = (v) => (v ? <Evet /> : <Hayir />)

export default function YonetimAyarlari({ bildir }) {
  const [saglik, setSaglik] = useState(null)
  const [yapi, setYapi] = useState(null)
  const [yukleniyor, setYukleniyor] = useState(true)

  const yukle = async () => {
    setYukleniyor(true)
    try {
      const [s, y] = await Promise.all([api.sistemSagligi(), api.sistemYapilandirmasi()])
      setSaglik(s)
      setYapi(y)
    } catch (e) {
      bildir('hata', e.message)
    } finally {
      setYukleniyor(false)
    }
  }

  useEffect(() => { yukle() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [])

  if (yukleniyor) {
    return <main className="govde tek-sutun"><section className="panel"><p className="bos-metin">Yükleniyor…</p></section></main>
  }

  return (
    <main className="govde tek-sutun">
      <div className="pano-grid">
        <section className="panel">
          <div className="panel-baslik-satir">
            <div className="panel-baslik">Oturum Güvenliği</div>
            <button className="btn btn-ghost sm" onClick={yukle}>↻ Yenile</button>
          </div>
          <Satir etiket="Boşta kalma süresi" deger={`${yapi?.oturum?.bostaDakika} dakika`} />
          <Satir etiket="Mutlak oturum ömrü" deger={`${yapi?.oturum?.mutlakSaat} saat`} />
          <Satir etiket="Secure çerez (HTTPS)" deger={mantik(yapi?.oturum?.guvenliCerez)} />
          <Satir etiket="SameSite" deger={String(yapi?.oturum?.sameSite || '—')} />
          <Satir etiket="Ters vekile güven" deger={mantik(yapi?.oturum?.vekileGuven)} />

          <div className="panel-baslik">Giriş Koruması</div>
          <Satir etiket="Kullanıcı başına deneme" deger={`${yapi?.girisSiniri?.enFazlaDeneme} / ${yapi?.girisSiniri?.pencereDakika} dk`} />
          <Satir etiket="IP başına deneme" deger={`${(yapi?.girisSiniri?.enFazlaDeneme || 0) * (yapi?.girisSiniri?.ipCarpani || 0)} / ${yapi?.girisSiniri?.pencereDakika} dk`} />

          <div className="panel-baslik">Sunucu</div>
          <Satir etiket="Ortam" deger={saglik?.uygulama?.uretim
            ? <span className="rozet rozet-yesil">production</span>
            : <span className="rozet rozet-sari">development</span>} />
          <Satir etiket="Node sürümü" deger={saglik?.uygulama?.nodeSurumu || '—'} />
          <Satir etiket="Çalışma süresi" deger={`${Math.floor((saglik?.uygulama?.calismaSuresiSn || 0) / 60)} dakika`} />
        </section>
      </div>

      <section className="panel">
        <div className="panel-baslik">Rol ve Yetki Modeli</div>
        <div className="tablo-kaydir">
          <table className="tablo">
            <thead>
              <tr><th>Kaynak</th><th>VIEWER</th><th>ADMIN</th></tr>
            </thead>
            <tbody>
              {[
                ['Genel Bakış (okuma)', true, true],
                ['Envanter (okuma)', true, true],
                ['Envanter (ekleme / düzenleme / silme)', false, true],
                ['Zimmet belgeleri', false, true],
                ['Kişiler', false, true],
                ['Stok hareketleri', false, true],
                ['Excel içe aktarma / yedek geri yükleme', false, true],
                ['Ayarlar', false, true],
                ['Kullanıcı yönetimi', false, true],
                ['Denetim günlüğü', false, true],
              ].map(([ad2, v, a]) => (
                <tr key={ad2}>
                  <td>{ad2}</td>
                  <td>{v ? <span className="rozet rozet-yesil">İzinli</span> : <span className="rozet rozet-kirmizi">Yasak</span>}</td>
                  <td>{a ? <span className="rozet rozet-yesil">İzinli</span> : <span className="rozet rozet-kirmizi">Yasak</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="bos-metin">
          Rol <code className="kod">dbo.Kullanicilar.rol</code> sütununda tutulur ve
          <b> Kullanıcılar</b> ekranından atanır. İstemciden gelen rol bilgisi hiçbir koşulda
          dikkate alınmaz; tanınmayan bir değer VIEWER'a indirgenir.
        </p>
      </section>
    </main>
  )
}
