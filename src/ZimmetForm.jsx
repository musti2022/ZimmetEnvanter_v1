import React, { useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import { fotodanKodOku } from './barkodOku.js'
import CanliTarayici, { kameraDestekli } from './CanliTarayici.jsx'
import { bosKalem, isoTarih, norm } from './yardimci.js'

// Excel/CSV başlıklarını alanlara eşleştirir
function sutunEslestir(basliklar) {
  const eslesme = {}
  const harita = {
    teslimTarihi: ['teslimtarihi', 'tarih', 'teslim'],
    demirbasTuru: ['demirbasturu', 'demirbas', 'malzeme', 'urun', 'cihaz', 'demirbasturucinsi', 'cinsi'],
    adet: ['adet', 'miktar'],
    aciklama: ['aciklama', 'not', 'aciklamalar'],
  }
  basliklar.forEach((b, idx) => {
    const nb = norm(b)
    for (const [alan, anahtarlar] of Object.entries(harita)) {
      if (anahtarlar.some((a) => nb === a || nb.includes(a))) {
        if (eslesme[alan] === undefined) eslesme[alan] = idx
      }
    }
  })
  return eslesme
}

// Serbest metni envanterdeki bir ürüne eşlemeye çalışır (ad / barkod / seri no, normalize edilmiş)
function urunEslestir(metin, urunler) {
  const n = norm(metin)
  if (!n) return ''
  let u = urunler.find((x) => norm(x.ad) === n || norm(x.barkod) === n || norm(x.seriNo) === n)
  if (u) return u.id
  const adaylar = urunler.filter((x) => norm(x.ad).includes(n) || n.includes(norm(x.ad)))
  return adaylar.length === 1 ? adaylar[0].id : ''
}

export default function ZimmetForm({ form, setForm, urunler, maksAdet, teslimTarihiGuncelle, bildir, personelListesi = [], personelListeAc }) {
  const dosyaRef = useRef(null)

  const alanGuncelle = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  // Adı Soyadı combobox'tan personel seçilince Bölüm ve Görev alanları otomatik dolar.
  const personelSec = (adSoyad) => {
    const p = personelListesi.find((x) => x.adSoyad === adSoyad)
    if (!p) return setForm((f) => ({ ...f, adSoyad }))
    setForm((f) => ({ ...f, adSoyad: p.adSoyad, bolum: p.bolum || '', gorev: p.gorev || '' }))
  }

  const satirGuncelle = (i, k, v) =>
    setForm((f) => {
      const items = f.items.map((it, idx) => (idx === i ? { ...it, [k]: v } : it))
      return { ...f, items }
    })

  // ---- Barkod ile ürün seçme (fotoğraftan) ----
  const barkodRef = useRef(null)
  const [barkodSatir, setBarkodSatir] = useState(null) // hangi satır için okuyoruz
  const [barkodDurum, setBarkodDurum] = useState('')

  const canliMumkun = kameraDestekli()
  const [canliSatir, setCanliSatir] = useState(null) // canlı tarayıcının açık olduğu satır

  // Kamera akışı destekleniyorsa (https/localhost) canlı tarama, değilse fotoğraf.
  const barkodOkut = (i) => {
    if (canliMumkun) return setCanliSatir(i)
    setBarkodSatir(i)
    barkodRef.current?.click()
  }

  /** Okunan kodu envanterle eşleyip satıra yerleştirir (canlı ve foto için ortak). */
  const koduSatiraUygula = (i, kod) => {
    const urunId = urunEslestir(kod, urunler)
    if (!urunId) return bildir('hata', `"${kod}" envanterde bulunamadı.`)
    urunSecildi(i, urunId)
    const u = urunler.find((x) => x.id === urunId)
    bildir('ok', `Okundu: ${kod} → "${u?.ad || 'ürün'}" seçildi.`)
  }

  const barkodFotoSecildi = async (e) => {
    const dosya = e.target.files?.[0]
    e.target.value = ''
    const i = barkodSatir
    setBarkodSatir(null)
    if (!dosya || i == null) return
    try {
      const sonuc = await fotodanKodOku(dosya, { ocr: true, durumBildir: setBarkodDurum })
      if (!sonuc) return bildir('hata', 'Fotoğraftan kod okunamadı.')
      koduSatiraUygula(i, sonuc.kod)
    } catch (hata) {
      console.error(hata)
      bildir('hata', 'Fotoğraf okunamadı: ' + (hata?.message || hata))
    } finally {
      setBarkodDurum('')
    }
  }

  const urunSecildi = (i, urunId) =>
    setForm((f) => {
      const items = f.items.map((it, idx) => {
        if (idx !== i) return it
        const maks = maksAdet(urunId, it.id)
        return { ...it, urunId, adet: Math.min(Number(it.adet) || 1, Math.max(1, maks)) || 0 }
      })
      return { ...f, items }
    })

  // İade alınmış ürünü olan belgeye yeni ürün eklenemez; yeni zimmet için yeni belge (ya da Zimmetle) kullanılır.
  // "Zimmetle" ile açılan formda (sabit kalemler) yalnız seçilen ürün zimmetlenir; başka ürün eklenemez.
  const zimmetleModu = (form.items || []).some((it) => it.sabit)
  const eklemeKilitli = zimmetleModu || (form.items || []).some((it) => it.durum === 'iade')
  const eklemeNotu = zimmetleModu
    ? 'Zimmetle ile açıldı: yalnızca seçilen ürün zimmetlenir, başka ürün eklenemez.'
    : 'Bu belgede iade alınmış ürün var; yeni ürün eklenemez. Yeni zimmet için "Yeni Zimmet Belgesi" ya da "Zimmetle" kullanın.'
  const satirEkle = () => setForm((f) => ({ ...f, items: [...f.items, bosKalem()] }))

  const satirSil = (i) =>
    setForm((f) => {
      const items = f.items.filter((_, idx) => idx !== i)
      return { ...f, items: items.length ? items : [bosKalem()] }
    })

  // ---- Excel / CSV içe aktarma ----
  const dosyaSec = () => dosyaRef.current?.click()

  const dosyaIceAktar = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const data = await file.arrayBuffer()
      const wb = XLSX.read(data, { type: 'array' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false, raw: false })
      if (!rows.length) return bildir('hata', 'Dosya boş görünüyor.')
      const basliklar = rows[0].map((x) => String(x ?? ''))
      const esle = sutunEslestir(basliklar)
      if (esle.demirbasTuru === undefined) return bildir('hata', 'Demirbaş Türü sütunu bulunamadı. Şablonu kullanın.')

      const veriSatir = rows.slice(1).filter((r) => r.some((c) => String(c ?? '').trim() !== ''))
      let eslesmeyen = 0
      const yeniItems = veriSatir.map((r) => {
        const metin = String(r[esle.demirbasTuru] ?? '')
        const urunId = urunEslestir(metin, urunler)
        if (!urunId) eslesmeyen++
        return {
          ...bosKalem(),
          urunId,
          adet: esle.adet !== undefined ? Number(r[esle.adet]) || 1 : 1,
          aciklama: esle.aciklama !== undefined ? String(r[esle.aciklama] ?? '') : (urunId ? '' : `İçe aktarılan metin: "${metin}"`),
        }
      })
      if (!yeniItems.length) return bildir('hata', 'İçe aktarılacak satır bulunamadı.')

      let ilkTarih = ''
      if (esle.teslimTarihi !== undefined) {
        ilkTarih = veriSatir.map((r) => isoTarih(r[esle.teslimTarihi])).find(Boolean) || ''
      }
      setForm((f) => {
        const teslimTarihi = ilkTarih || f.teslimTarihi
        return { ...f, items: yeniItems, teslimTarihi }
      })
      if (ilkTarih) teslimTarihiGuncelle(ilkTarih)
      bildir(
        eslesmeyen ? 'hata' : 'ok',
        eslesmeyen
          ? `${yeniItems.length} satır içe aktarıldı, ${eslesmeyen} tanesi envanterle eşleşmedi — lütfen elle ürün seçin.`
          : `${yeniItems.length} demirbaş satırı içe aktarıldı.`,
      )
    } catch (err) {
      console.error(err)
      bildir('hata', 'Dosya okunamadı. Geçerli bir Excel/CSV seçin.')
    } finally {
      e.target.value = ''
    }
  }

  const sablonIndir = () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ['Teslim Tarihi', 'Demirbaş Türü', 'Adet', 'Açıklama'],
      ['01.07.2026', 'Dizüstü Bilgisayar (Lenovo T14)', '1', 'Envanterdeki ürün adıyla birebir aynı yazın'],
    ])
    ws['!cols'] = [{ wch: 14 }, { wch: 30 }, { wch: 8 }, { wch: 34 }]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Zimmet')
    XLSX.writeFile(wb, 'Zimmet_Sablon.xlsx')
  }

  return (
    <section className="panel form-panel">
      <h2 className="panel-baslik">Personel Bilgileri</h2>
      <div className="grid-3">
        <Field label="Teslim Tarihi *">
          <input type="date" value={form.teslimTarihi ?? ''} onChange={(e) => teslimTarihiGuncelle(e.target.value)} title="Takvimden elle seçin" />
        </Field>
        <Field label="Belge No (otomatik)">
          <input
            value={form.belgeNo ?? ''}
            readOnly
            className="salt-okunur"
            placeholder="Teslim tarihi seçin"
            title="Belge No, teslim tarihinden otomatik üretilir; elle değiştirilemez."
          />
        </Field>
        <Field label="Adı Soyadı *">
          <div className="urun-ad-satir">
            <select value={form.adSoyad} onChange={(e) => personelSec(e.target.value)}>
              <option value="">— Personel seçin —</option>
              {form.adSoyad && !personelListesi.some((p) => p.adSoyad === form.adSoyad) && (
                <option value={form.adSoyad}>{form.adSoyad}</option>
              )}
              {personelListesi.map((p) => <option key={p.id} value={p.adSoyad}>{p.adSoyad}</option>)}
            </select>
            <button type="button" className="btn btn-ikincil sm" onClick={personelListeAc} title="Personel listesini düzenle (ekle/çıkar)">⚙ Liste</button>
          </div>
        </Field>
        <Field label="Görevi">
          <input value={form.gorev} disabled className="salt-okunur" placeholder="Personel seçilince dolar" title="Personel kaydından gelir; Adı Soyadı seçilince otomatik dolar, elle değiştirilemez." />
        </Field>
        <Field label="Bölümü">
          <input value={form.bolum} disabled className="salt-okunur" placeholder="Personel seçilince dolar" title="Personel kaydından gelir; Adı Soyadı seçilince otomatik dolar, elle değiştirilemez." />
        </Field>
      </div>

      <div className="panel-baslik-satir">
        <h2 className="panel-baslik">Zimmetlenen Demirbaşlar</h2>
        <div className="kucuk-aksiyon">
          <button className="btn btn-ghost sm" onClick={sablonIndir}>Şablon indir</button>
          <button className="btn btn-ikincil sm" onClick={dosyaSec} disabled={eklemeKilitli} title={eklemeKilitli ? eklemeNotu : undefined}>Excel/CSV içe aktar</button>
          <input ref={dosyaRef} type="file" accept=".xlsx,.xls,.csv" hidden onChange={dosyaIceAktar} />
        </div>
      </div>

      <div className="satir-liste">
        <div className="satir-baslik">
          <span>Ürün (envanter)</span>
          <span>Adet</span>
          <span>Açıklama</span>
          <span></span>
        </div>
        {form.items.map((it, i) => {
          const maks = maksAdet(it.urunId, it.id)
          const secilenUrun = urunler.find((u) => u.id === it.urunId)
          const secenekler = urunler.filter((u) => u.id === it.urunId || (maksAdet(u.id, it.id) > 0 && u.calismaDurumu !== 'arizali'))
          // İade alınmış kalem değiştirilemez: ürün, adet ve satır silme kapalıdır.
          const kilitli = it.durum === 'iade' || !!it.sabit
          const kilitNotu = it.sabit ? 'Zimmetle ile seçilen ürün değiştirilemez.' : 'Bu ürün iade alındı; ürün ve adet değiştirilemez.'
          return (
            <div className={`satir${!it.urunId ? ' satir-uyari' : ''}`} key={it.id}>
              <div className="satir-urun">
                <select value={it.urunId} onChange={(e) => urunSecildi(i, e.target.value)} disabled={kilitli} title={kilitli ? kilitNotu : undefined}>
                  <option value="">— Ürün seçin —</option>
                  {secenekler.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.ad}{u.markaModel ? ` (${u.markaModel})` : ''}{u.seriNo ? ` · Seri No: ${u.seriNo}` : ''} — boşta {maksAdet(u.id, it.id)} {u.birim}
                    </option>
                  ))}
                </select>
                <button
                  type="button" className="btn btn-ikincil sm satir-barkod"
                  onClick={() => barkodOkut(i)} disabled={!!barkodDurum || kilitli}
                  title={canliMumkun
                    ? 'Kamerayı aç — barkodu gösterince eşleşen ürünü seçer'
                    : 'Barkodu fotoğraftan okut — eşleşen ürünü seçer'}
                >{barkodDurum ? '…' : (canliMumkun ? '📸' : '📷')}</button>
              </div>
              <input
                type="number"
                min="1"
                max={maks || undefined}
                value={it.adet}
                onChange={(e) => satirGuncelle(i, 'adet', e.target.value)}
                disabled={kilitli}
                title={kilitli ? kilitNotu : (secilenUrun ? `En fazla ${maks} ${secilenUrun.birim}` : '')}
              />
              <input value={it.aciklama ?? ''} onChange={(e) => satirGuncelle(i, 'aciklama', e.target.value)} placeholder={it.durum === 'iade' ? 'İade edildi' : 'Açıklama'} />
              <button className="satir-sil" title={kilitli ? kilitNotu : 'Satırı sil'} onClick={() => satirSil(i)} disabled={kilitli}>✕</button>
            </div>
          )
        })}
      </div>
      <button className="btn btn-ghost ekle" onClick={satirEkle} disabled={eklemeKilitli} title={eklemeKilitli ? eklemeNotu : undefined}>＋ Satır ekle</button>
      {eklemeKilitli && <p className="alt-metin">{eklemeNotu}</p>}
      {/* Satırlardaki 📷 butonlarının ortak dosya girişi (mobilde kamerayı açar) */}
      <input ref={barkodRef} type="file" accept="image/*" capture="environment" hidden onChange={barkodFotoSecildi} />
      {canliSatir != null && (
        <CanliTarayici
          onOkundu={(kod) => { const i = canliSatir; setCanliSatir(null); koduSatiraUygula(i, kod) }}
          onKapat={() => setCanliSatir(null)}
        />
      )}

      <h2 className="panel-baslik">Teslim Bilgileri</h2>
      <div className="grid-3">
        <Field label="Teslim Alan">
          <input value={form.teslimAlan} onChange={(e) => alanGuncelle('teslimAlan', e.target.value)} placeholder="Ad Soyad" />
        </Field>
        <Field label="Teslim Eden">
          <input value={form.teslimEden} onChange={(e) => alanGuncelle('teslimEden', e.target.value)} placeholder="Ad Soyad" />
        </Field>
      </div>
    </section>
  )
}

export function Field({ label, children }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  )
}
