// Sunucu API'sine fetch sarmalayıcı.
//
// KİMLİK: HttpOnly oturum çerezi ile taşınır. Token localStorage/sessionStorage'da
// TUTULMAZ — XSS ile çalınabilecek bir kimlik bilgisi tarayıcı deposunda bulunmaz.
// CSRF token'ı yalnızca BELLEKTE tutulur ve durum değiştiren isteklerde başlıkla gönderilir.

export class SunucuYokHatasi extends Error {
  constructor() {
    super('Sunucuya ulaşılamıyor. Sunucunun çalıştığından ve ağ bağlantınızdan emin olun.')
    this.name = 'SunucuYokHatasi'
  }
}

export class YetkisizHatasi extends Error {
  constructor(mesaj = 'Oturumunuz sona erdi. Lütfen tekrar giriş yapın.') {
    super(mesaj)
    this.name = 'YetkisizHatasi'
  }
}

export class YasakHatasi extends Error {
  constructor(mesaj = 'Bu işlem için gerekli yetkiye sahip değilsiniz.') {
    super(mesaj)
    this.name = 'YasakHatasi'
  }
}

// Bellek içi CSRF token'ı (sayfa yenilenince /auth/me veya /auth/csrf ile tazelenir).
let csrfToken = null
export const csrfAyarla = (t) => { csrfToken = t || null }
export const csrfOku = () => csrfToken

// Oturum düştüğünde uygulamanın haberdar olması için tek noktadan bildirim.
let oturumDustuKanca = null
export const oturumDustuDinle = (fn) => { oturumDustuKanca = fn }

const YAZMA = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

async function istek(yol, secenek = {}) {
  const yontem = (secenek.method || 'GET').toUpperCase()
  const basliklar = { 'Content-Type': 'application/json', ...(secenek.headers || {}) }

  if (YAZMA.has(yontem)) {
    if (!csrfToken) await csrfTazele()
    if (csrfToken) basliklar['X-CSRF-Token'] = csrfToken
  }

  let r
  try {
    r = await fetch('/api' + yol, {
      credentials: 'same-origin', // oturum çerezi gönderilsin
      ...secenek,
      headers: basliklar,
    })
  } catch {
    throw new SunucuYokHatasi()
  }

  if (r.status === 401) {
    const j = await r.json().catch(() => null)
    if (j?.csrfToken) csrfAyarla(j.csrfToken)
    // /auth/me açılışta 401 döner; bu normal akıştır, oturum düşmesi olarak bildirilmez.
    if (!yol.startsWith('/auth/')) oturumDustuKanca?.()
    throw new YetkisizHatasi(j?.hata)
  }

  if (r.status === 403) {
    const j = await r.json().catch(() => null)
    // CSRF token'ı bayatladıysa (sunucu yeniden başladı) bir kez tazeleyip tekrar dene.
    if (j?.kod === 'CSRF_GECERSIZ' && !secenek.__tekrar) {
      await csrfTazele()
      return istek(yol, { ...secenek, __tekrar: true })
    }
    throw new YasakHatasi(j?.hata)
  }

  if (!r.ok) {
    const j = await r.json().catch(() => null)
    const hata = new Error(j?.hata || `Sunucu hatası (${r.status})`)
    hata.durum = r.status
    hata.kod = j?.kod
    throw hata
  }

  return r.json().catch(() => null)
}

async function csrfTazele() {
  try {
    const r = await fetch('/api/auth/csrf', { credentials: 'same-origin' })
    if (r.ok) {
      const j = await r.json()
      csrfAyarla(j.csrfToken)
    }
  } catch { /* sunucu yok — asıl istek zaten hata verecek */ }
}

export const api = {
  // ---- kimlik doğrulama ----
  girisYap: (kullaniciAdi, parola) =>
    istek('/auth/login', { method: 'POST', body: JSON.stringify({ kullaniciAdi, parola }) }),
  cikisYap: () => istek('/auth/logout', { method: 'POST' }),
  benKimim: () => istek('/auth/me'),
  csrfTazele,

  // ---- envanter / zimmet ----
  tumu: () => istek('/tumu'),

  urunEkle: (u) => istek('/urunler', { method: 'POST', body: JSON.stringify(u) }),
  urunTopluEkle: (urunler) => istek('/urunler/toplu', { method: 'POST', body: JSON.stringify({ urunler }) }),
  urunGuncelle: (u) => istek(`/urunler/${u.id}`, { method: 'PUT', body: JSON.stringify(u) }),
  urunSil: (id) => istek(`/urunler/${id}`, { method: 'DELETE' }),
  stokIslem: (urunId, veri) => istek(`/urunler/${urunId}/stok`, { method: 'POST', body: JSON.stringify(veri) }),

  belgeEkle: (b) => istek('/belgeler', { method: 'POST', body: JSON.stringify(b) }),
  belgeGuncelle: (b) => istek(`/belgeler/${b.id}`, { method: 'PUT', body: JSON.stringify(b) }),
  belgeSil: (id) => istek(`/belgeler/${id}`, { method: 'DELETE' }),
  iadeAl: (belgeId, kalemId) => istek(`/belgeler/${belgeId}/kalemler/${kalemId}/iade`, { method: 'POST' }),

  yedekYukle: (veri) => istek('/yedek', { method: 'POST', body: JSON.stringify(veri) }),

  epostaAyarKaydet: (ayar) => istek('/ayarlar/eposta', { method: 'PUT', body: JSON.stringify(ayar) }),
  urunListesiEkle: (ad) => istek('/urun-listesi', { method: 'POST', body: JSON.stringify({ ad }) }),
  urunListesiSil: (id) => istek(`/urun-listesi/${id}`, { method: 'DELETE' }),
  konumListesiEkle: (ad) => istek('/konum-listesi', { method: 'POST', body: JSON.stringify({ ad }) }),
  konumListesiSil: (id) => istek(`/konum-listesi/${id}`, { method: 'DELETE' }),
  kategoriListesiEkle: (ad) => istek('/kategori-listesi', { method: 'POST', body: JSON.stringify({ ad }) }),
  kategoriListesiSil: (id) => istek(`/kategori-listesi/${id}`, { method: 'DELETE' }),
  markaListesiEkle: (ad) => istek('/marka-listesi', { method: 'POST', body: JSON.stringify({ ad }) }),
  markaListesiSil: (id) => istek(`/marka-listesi/${id}`, { method: 'DELETE' }),
  cepMarkaListesiEkle: (ad) => istek('/cep-marka-listesi', { method: 'POST', body: JSON.stringify({ ad }) }),
  cepMarkaListesiSil: (id) => istek(`/cep-marka-listesi/${id}`, { method: 'DELETE' }),
  personelKaydet: (p) => istek('/personel', { method: 'POST', body: JSON.stringify(p) }),
  personelSil: (id) => istek(`/personel/${id}`, { method: 'DELETE' }),
  cepEkle: (k) => istek('/cep', { method: 'POST', body: JSON.stringify(k) }),
  cepGuncelle: (id, k) => istek(`/cep/${id}`, { method: 'PUT', body: JSON.stringify(k) }),
  cepSil: (id) => istek(`/cep/${id}`, { method: 'DELETE' }),
  cepDurum: (id, durum) => istek(`/cep/${id}/durum`, { method: 'POST', body: JSON.stringify({ durum }) }),

  // ---- yönetim (ADMIN) ----
  kullanicilar: (q = '') => istek(`/kullanicilar?arama=${encodeURIComponent(q)}`),
  kullaniciEkle: (k) => istek('/kullanicilar', { method: 'POST', body: JSON.stringify(k) }),
  kullaniciGuncelle: (id, k) => istek(`/kullanicilar/${id}`, { method: 'PUT', body: JSON.stringify(k) }),
  kullaniciParola: (id, parola) => istek(`/kullanicilar/${id}/parola`, { method: 'PUT', body: JSON.stringify({ parola }) }),
  kullaniciSil: (id) => istek(`/kullanicilar/${id}`, { method: 'DELETE' }),

  loglar: (f = {}) => istek('/loglar?' + new URLSearchParams(
    Object.entries(f).filter(([, v]) => v !== '' && v != null),
  ).toString()),
  logEylemleri: () => istek('/loglar/eylemler'),

  sistemSagligi: () => istek('/yonetim/saglik'),
  sistemYapilandirmasi: () => istek('/yonetim/yapilandirma'),
}
