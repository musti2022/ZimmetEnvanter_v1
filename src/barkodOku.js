import { BrowserMultiFormatReader } from '@zxing/library'

// Tek okuyucu örneği yeter (her çağrıda yeniden kurmak pahalı).
let okuyucu = null
const okuyucuGetir = () => (okuyucu ||= new BrowserMultiFormatReader())

// OCR metninden kod adayını çıkarır: harf+rakam karışık, en uzun belirteç.
// Etiketlerde seri no genelde uzun ve alfanümeriktir; düz kelimeler elenir.
export function kodAdayi(metin) {
  const belirtecler = String(metin || '')
    .replace(/[|_]/g, ' ')
    .split(/\s+/)
    .map((s) => s.replace(/[^A-Za-z0-9\-/]/g, ''))
    .filter((s) => s.length >= 5)
  if (!belirtecler.length) return ''
  const karisik = belirtecler.filter((s) => /[0-9]/.test(s) && /[A-Za-z]/.test(s))
  const havuz = karisik.length ? karisik : belirtecler.filter((s) => /[0-9]/.test(s))
  return havuz.length ? havuz.sort((a, b) => b.length - a.length)[0] : ''
}

/**
 * Bir görüntü dosyasından kod okur.
 * Önce barkod/QR denenir; bulunamazsa ve ocr açıksa yazı (OCR) denenir.
 * Kamera akışı (getUserMedia) kullanılmaz → HTTPS gerekmez.
 * @returns {Promise<{kod: string, kaynak: 'barkod'|'ocr'} | null>}
 */
export async function fotodanKodOku(dosya, { ocr = false, durumBildir } = {}) {
  const url = URL.createObjectURL(dosya)
  try {
    durumBildir?.('barkod')
    try {
      const sonuc = await okuyucuGetir().decodeFromImageUrl(url)
      const kod = sonuc?.getText?.()?.trim()
      if (kod) return { kod, kaynak: 'barkod' }
    } catch { /* barkod bulunamadı; OCR'a düşülür */ }

    if (!ocr) return null

    // tesseract yalnızca gerektiğinde yüklenir (paket boyutu için)
    durumBildir?.('ocr')
    const { default: Tesseract } = await import('tesseract.js')
    const { data } = await Tesseract.recognize(url, 'eng')
    const aday = kodAdayi(data?.text)
    return aday ? { kod: aday, kaynak: 'ocr' } : null
  } finally {
    URL.revokeObjectURL(url)
  }
}
