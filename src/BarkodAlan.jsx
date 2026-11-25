import React, { useRef, useState } from 'react'
import { fotodanKodOku } from './barkodOku.js'
import CanliTarayici, { kameraDestekli } from './CanliTarayici.jsx'

/**
 * Barkod okuyuculu metin alanı. Üç yolla doldurulabilir:
 *  1) Elle yazma
 *  2) Fiziksel barkod okuyucu (USB/Bluetooth — klavye gibi yazar; Enter formu göndermez)
 *  3) 📷 Okut: telefonda kamerayı açar, masaüstünde dosya seçtirir.
 *     Önce barkod/QR aranır; bulunamazsa (ocr açıksa) yazı OCR ile okunur.
 * Kamera akışı (getUserMedia) kullanılmaz — bu sayede HTTPS gerekmez.
 */
export default function BarkodAlan({ value, onChange, placeholder, ocr = false, bildir, ...kalan }) {
  const dosyaRef = useRef(null)
  const [durum, setDurum] = useState('') // '' | 'barkod' | 'ocr'
  const [tarayiciAcik, setTarayiciAcik] = useState(false)
  const canliMumkun = kameraDestekli()

  const haber = (tip, mesaj) => (bildir ? bildir(tip, mesaj) : console.log(tip, mesaj))

  const fotoSecildi = async (e) => {
    const dosya = e.target.files?.[0]
    e.target.value = '' // aynı dosya tekrar seçilebilsin
    if (!dosya) return
    try {
      const sonuc = await fotodanKodOku(dosya, { ocr, durumBildir: setDurum })
      if (!sonuc) {
        haber('hata', ocr
          ? 'Fotoğraftan barkod ya da okunabilir bir kod çıkmadı.'
          : 'Fotoğrafta barkod bulunamadı. Daha yakın ve net çekmeyi deneyin.')
        return
      }
      onChange(sonuc.kod)
      haber('ok', sonuc.kaynak === 'barkod'
        ? `Barkod okundu: ${sonuc.kod}`
        : `Yazıdan okundu: ${sonuc.kod} — lütfen kontrol edin.`)
    } catch (hata) {
      console.error(hata)
      haber('hata', 'Fotoğraf okunamadı: ' + (hata?.message || hata))
    } finally {
      setDurum('')
    }
  }

  return (
    <div className="barkod-alan">
      <input
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        // Fiziksel okuyucular kodun sonuna Enter ekler; formu göndermesini engelle.
        onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault() }}
        placeholder={placeholder}
        {...kalan}
      />
      {/* Canlı tarama yalnızca https/localhost'ta mümkün; değilse yalnızca foto seçeneği görünür. */}
      {canliMumkun && (
        <button
          type="button"
          className="btn btn-ana sm"
          onClick={() => setTarayiciAcik(true)}
          disabled={!!durum}
          title="Kamerayı aç — barkodu gösterince otomatik okur"
        >📸 Tara</button>
      )}
      <button
        type="button"
        className="btn btn-ikincil sm"
        onClick={() => dosyaRef.current?.click()}
        disabled={!!durum}
        title={ocr
          ? 'Fotoğraf çek/seç — barkod okunur, bulunamazsa yazı (OCR) denenir'
          : 'Fotoğraf çek/seç — barkodu okur'}
      >
        {durum === 'barkod' ? 'Okunuyor…' : durum === 'ocr' ? 'Yazı okunuyor…' : '📷 Foto'}
      </button>
      <input
        ref={dosyaRef}
        type="file"
        accept="image/*"
        capture="environment"  /* mobilde arka kamerayı açar */
        hidden
        onChange={fotoSecildi}
      />
      {tarayiciAcik && (
        <CanliTarayici
          onOkundu={(kod) => {
            setTarayiciAcik(false)
            onChange(kod)
            haber('ok', `Barkod okundu: ${kod}`)
          }}
          onKapat={() => setTarayiciAcik(false)}
        />
      )}
    </div>
  )
}
