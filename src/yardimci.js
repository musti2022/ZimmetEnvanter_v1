// Ortak sabitler ve yardımcı fonksiyonlar

export const URUN_KEY = 'ze_urunler_v1'
export const BELGE_KEY = 'ze_zimmet_belgeleri_v1'
export const HAREKET_KEY = 'ze_hareketler_v1'

export const BIRIMLER = ['Adet', 'Kutu', 'Paket', 'Takım', 'Metre', 'Kg', 'Litre']

export const HAREKET_ETIKET = {
  giris: ['Giriş', 'rozet-yesil'],
  cikis: ['Çıkış', 'rozet-kirmizi'],
  zimmet: ['Zimmet', 'rozet-mavi'],
  iade: ['İade', 'rozet-sari'],
  duzeltme: ['Düzeltme', 'rozet-gri'],
}

export const bugun = () => new Date().toISOString().slice(0, 10)

// Yeni kayıt kimliği (küçük harf v4 GUID — sunucudaki gecerliGuid doğrulamasıyla uyumlu).
// crypto.randomUUID YALNIZCA secure context'te (HTTPS ya da localhost) tanımlıdır; uygulamaya
// telefondan http://<LAN-IP>:5176 ile girildiğinde undefined olur. Form state'leri açılışta
// useState(bosUrun) ile kurulduğundan bu doğrudan beyaz sayfaya yol açıyordu — yedek şart.
// getRandomValues secure context gerektirmez, bu yüzden yedek de kriptografik olarak sağlam.
export const yeniId = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  const b = new Uint8Array(16)
  crypto.getRandomValues(b)
  b[6] = (b[6] & 0x0f) | 0x40 // sürüm 4
  b[8] = (b[8] & 0x3f) | 0x80 // variant 10xx
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

// "YYYY-AA-GG" -> "GG.AA.YYYY"
export const trTarih = (iso) => {
  const t = String(iso || '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return t
  const [y, a, g] = t.split('-')
  return `${g}.${a}.${y}`
}

// "YYYY-AA-GG" -> "YYYYAAGG"
export const tarihYMD = (iso) => String(iso || '').slice(0, 10).replaceAll('-', '')

// "01.07.2026" / "01/07/2026" / "2026-07-01" -> "2026-07-01" (date input için ISO); tanınmazsa ''
export function isoTarih(s) {
  const t = String(s || '').trim()
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`
  m = t.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})/)
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  return ''
}

// Türkçe karakter/boşluk/case farklarına toleranslı normalize (eşleştirme için)
export const norm = (s) =>
  String(s || '')
    .toLocaleLowerCase('tr')
    .replace(/[ışğüöç]/g, (c) => ({ ı: 'i', ş: 's', ğ: 'g', ü: 'u', ö: 'o', ç: 'c' }[c]))
    .replace(/[^a-z0-9]/g, '')

// Personel kaydı (Zimmet formundaki Adı Soyadı combobox kaynağı; seçilince bölüm/görev dolar).
export const bosPersonel = () => ({ adSoyad: '', bolum: '', gorev: '' })

// Cep telefonu kullanım taahhütü / teslim tutanağı kaydı.
export const bosCepKayit = () => ({
  id: yeniId(),
  adSoyad: '', imei: '', seriNo: '', markaModel: '', hatNo: '',
  tarih: '', teslimEden: '', teslimAlan: '',
  durum: 'zimmetli', // 'bosta' = yeni alınmış, kimseye verilmemiş telefon
  olusturma: new Date().toISOString(),
})

// Cep telefonu taahhütnamesinin SABİT maddeleri (belgeden birebir — değiştirmeyin).
// İlk madde (kişi/telefon bilgileriyle dolan cümle) karttan ayrı üretilir.
export const CEP_MADDELER = [
  'Cep telefonu kullanımı süresinde garanti dışı meydana gelebilecek her türlü arıza, kayıp, çalıntı vs. her türlü problemden kullanıcı sorumludur.',
  'Kullanıcı telefonunun emniyetli kullanımını sağlamak için koruyucu kılıf vs aksesuarları ile arızalanan batarya ve şarj cihazını kendisi karşılayacaktır.',
  'Telefon Bordrolara işlenmeyecek olup, teslim alındıktan sonra herhangi bir sebeple işten ayrılma durumunda telefon firmaya iade edilir veya ilgili prosedür de belirtildiği üzere personel ister ise Mali işler departmanının belirleyeceği fiyat üzerinden satın alabilir.',
  'Kurumsal cep telefonu kurum politikalarına ters ve kurum imajına aykırı olarak kullanılamaz.',
  'Kurumsal cep telefonuna ISO 27001 standartları göz önünde bulundurarak kurumsal politikaların işletilmesi için MDM / Güvenlik yazılımı kurma hakkına sahiptir. Kullanıcı MDM (Mobile Device Management) yazılımını kurdurmama veya kurulduktan sonra silme inisiyatifine sahip değildir.',
  'Kullanıcı kurumsal cep telefonu ile kurumsal kaynaklara bağlanabilmek için BT Güvenlik Politikalarının uygulanmasını kabul eder.',
  'Kullanıcı kendisine iş için tahsis edilen telefonu bir sonraki telefon tahsis dönemine kadar, başkasına devredemez, kullandıramaz ve takas edemez.',
  'Tahsis edilen GSM hattının ses ve data kullanımı ile ilgili her türlü sorumluluk kullanıcıya aittir.',
  'Mevcut kullandığı telefon ilgili prosedür de belirtildiği üzere 3. Yılın sonunda prosedürde detaylı belirtilen yönergeler uygulanarak kendisine verilerek yeni telefon alınır.',
]

export const bosUrun = () => ({
  id: yeniId(),
  ad: '',
  kategori: '',
  markaModel: '',
  seriNo: '',
  barkod: '',
  birim: 'Adet',
  konum: '',
  stok: '',
  minStok: '',
  aciklama: '',
  calismaDurumu: 'calisir', // 'calisir' | 'arizali'
  olusturma: new Date().toISOString(),
})

export const bosKalem = () => ({
  id: yeniId(),
  urunId: '',
  adet: 1,
  // Belgede artık sorulmaz; yalnızca kalem iade alındığında o günün tarihiyle dolar.
  iadeTarihi: '',
  aciklama: '',
  durum: 'zimmetli',
})

export const bosZimmetBelge = () => ({
  id: yeniId(),
  teslimTarihi: '', // belge geneli teslim tarihi (YYYY-AA-GG); Belge No bundan üretilir
  belgeNo: '', // Teslim Tarihi seçilince otomatik üretilir, elle değiştirilemez
  adSoyad: '',
  gorev: '',
  bolum: '',
  teslimAlan: '',
  teslimEden: '',
  imzaAlan: '', // çizilen ıslak imza (PNG dataURL)
  imzaEden: '',
  items: [bosKalem()],
  olusturma: new Date().toISOString(),
})

export function depodanOku(key) {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}
