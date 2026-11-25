import React, { useEffect, useRef, useState } from 'react'
import { BrowserMultiFormatReader } from '@zxing/library'

/**
 * Canlı kamera ile barkod/QR tarayıcı (tam ekran pencere).
 * Kamerayı açar, görüntüyü sürekli tarar; barkod görünür görünmez okur ve kapanır.
 *
 * Kamera akışı (getUserMedia) YALNIZCA secure context'te (https / localhost) çalışır.
 * Bu yüzden düğme, çağıran bileşende kameraDestekli() ile koşullu gösterilir.
 */
export default function CanliTarayici({ onOkundu, onKapat }) {
  const videoRef = useRef(null)
  const okuyucuRef = useRef(null)
  const [durum, setDurum] = useState('Kamera açılıyor…')
  const [hata, setHata] = useState('')

  useEffect(() => {
    let iptal = false
    const okuyucu = new BrowserMultiFormatReader()
    okuyucuRef.current = okuyucu

    ;(async () => {
      try {
        // Arka kamerayı tercih et (belge/etiket okumak için); yoksa varsayılan cihaz.
        let cihazId
        try {
          const cihazlar = await okuyucu.listVideoInputDevices()
          const arka = cihazlar.find((c) => /back|rear|arka|environment/i.test(c.label))
          cihazId = (arka || cihazlar[cihazlar.length - 1])?.deviceId
        } catch { /* cihaz listelenemedi; varsayılanla devam */ }

        if (iptal) return
        setDurum('Barkodu kameraya gösterin')
        await okuyucu.decodeFromVideoDevice(cihazId ?? null, videoRef.current, (sonuc, err) => {
          if (iptal) return
          if (sonuc) {
            const kod = sonuc.getText?.()?.trim()
            if (kod) { iptal = true; okuyucu.reset(); onOkundu(kod) }
          }
          // err: her karede "bulunamadı" gelir — normal, sessiz geçilir.
        })
      } catch (e) {
        if (iptal) return
        console.error(e)
        const ad = e?.name || ''
        setHata(
          ad === 'NotAllowedError' ? 'Kamera izni verilmedi. Tarayıcı ayarlarından izin verin.'
          : ad === 'NotFoundError' ? 'Kamera bulunamadı.'
          : ad === 'NotReadableError' ? 'Kamera başka bir uygulama tarafından kullanılıyor.'
          : 'Kamera açılamadı: ' + (e?.message || e),
        )
      }
    })()

    return () => { iptal = true; try { okuyucu.reset() } catch { /* zaten kapalı */ } }
  }, [onOkundu])

  return (
    <div className="perde" onClick={onKapat}>
      <div className="pencere tarayici-pencere" onClick={(e) => e.stopPropagation()}>
        <div className="panel-baslik">Barkod Tara</div>
        {hata ? (
          <p className="bos-metin">{hata}</p>
        ) : (
          <>
            <div className="tarayici-kutu">
              <video ref={videoRef} className="tarayici-video" muted playsInline />
              <div className="tarayici-hedef" aria-hidden="true" />
            </div>
            <p className="bos-metin" style={{ textAlign: 'center' }}>{durum}</p>
          </>
        )}
        <div className="form-aksiyon">
          <button type="button" className="btn btn-ghost" onClick={onKapat}>Kapat</button>
        </div>
      </div>
    </div>
  )
}

/** Canlı tarama yalnızca secure context'te (https / localhost) ve kamera API'si varsa mümkündür. */
export const kameraDestekli = () =>
  typeof navigator !== 'undefined' &&
  !!navigator.mediaDevices?.getUserMedia &&
  (window.isSecureContext ?? false)
