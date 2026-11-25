// EmailJS ile (backend'siz) kayıt bildirim e-postası gönderimi.
// Ayarlar artık sunucudaki veritabanında saklanır (tüm bilgisayarlarda ortak);
// okuma /api/tumu ile, yazma api.epostaAyarKaydet ile yapılır (App.jsx).
// Ayar gizli değildir (Public Key tarayıcıda kullanılır).
import emailjs from '@emailjs/browser'

export const bosEpostaAyar = () => ({
  amirEpostalari: '', // virgül/; ile ayrılmış alıcılar
  serviceId: '',
  templateId: '',
  publicKey: '',
  pdfEkle: true, // template'te dinamik ek olarak {{pdf_base64}} kullanılıyorsa
  aktif: false, // kayıt sonrası otomatik mail gönderilsin mi
})

// Ayar gönderime hazır mı (zorunlu alanlar dolu mu)
export function epostaHazir(ayar) {
  return Boolean(
    ayar?.aktif &&
    ayar.serviceId?.trim() &&
    ayar.templateId?.trim() &&
    ayar.publicKey?.trim() &&
    alicilar(ayar).length
  )
}

// "a@x.com, b@y.com; c@z.com" -> ["a@x.com","b@y.com","c@z.com"]
export function alicilar(ayar) {
  return String(ayar?.amirEpostalari || '')
    .split(/[,;\s]+/)
    .map((s) => s.trim())
    .filter((s) => s.includes('@'))
}

// "YYYY-AA-GG" -> "GG.AA.YYYY"
const trTarih = (iso) => {
  const p = String(iso || '').slice(0, 10).split('-')
  return p.length === 3 && p[0] ? `${p[2]}.${p[1]}.${p[0]}` : ''
}

/**
 * Kaydın bildirim e-postasını gönderir.
 * @param ayar epostaAyarOku() sonucu
 * @param kayit zimmet kaydı
 * @param ek    { pdfBase64, dosyaAdi, demirbaslarMetni } (opsiyonel; template dinamik ek için)
 *   demirbaslarMetni: çağıran taraf ürün adlarını çözüp hazırladığı okunabilir metin
 *   (items artık serbest metin değil urunId taşıdığı için burada üretilemez).
 * EmailJS template'inde şu değişkenler kullanılabilir:
 *   to_email, belge_no, ad_soyad, gorev, bolum, teslim_tarihi,
 *   demirbaslar, teslim_alan, teslim_eden, onay, dosya_adi, pdf_base64
 */
export async function epostaGonder(ayar, kayit, ek = {}) {
  const params = {
    to_email: alicilar(ayar).join(', '),
    belge_no: kayit.belgeNo || '',
    ad_soyad: kayit.adSoyad || '',
    gorev: kayit.gorev || '',
    bolum: kayit.bolum || '',
    teslim_tarihi: trTarih(kayit.teslimTarihi),
    demirbaslar: ek.demirbaslarMetni || '',
    teslim_alan: kayit.teslimAlan || '',
    teslim_eden: kayit.teslimEden || '',
    onay: kayit.onay || '',
    dosya_adi: ek.dosyaAdi || '',
  }
  if (ayar.pdfEkle && ek.pdfBase64) {
    params.pdf_base64 = ek.pdfBase64 // template'te dinamik ek olarak kullanın
  }
  return emailjs.send(ayar.serviceId.trim(), ayar.templateId.trim(), params, {
    publicKey: ayar.publicKey.trim(),
  })
}
