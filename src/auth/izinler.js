// İstemci tarafı yetki modeli.
//
// ⚠ BU DOSYA GÜVENLİK SINIRI DEĞİLDİR.
// Buradaki kontroller yalnızca ARAYÜZ içindir: kullanıcının kullanamayacağı butonları ve
// menüleri göstermemek için. Gerçek yetkilendirme sunucudadır (server/auth/authorization.service.js)
// ve her istekte yeniden uygulanır. Bu dosya değiştirilse bile sunucu 403 döndürür.

export const Rol = Object.freeze({ ADMIN: 'ADMIN', VIEWER: 'VIEWER' })

export const Saglayici = Object.freeze({ LOCAL: 'LOCAL' })

export const Izin = Object.freeze({
  PANO_OKU: 'PANO_OKU',
  ENVANTER_OKU: 'ENVANTER_OKU',
  ENVANTER_YAZ: 'ENVANTER_YAZ',
  ZIMMET_OKU: 'ZIMMET_OKU',
  ZIMMET_YAZ: 'ZIMMET_YAZ',
  RAPOR_OKU: 'RAPOR_OKU',
  KULLANICI_YONET: 'KULLANICI_YONET',
  AYAR_YONET: 'AYAR_YONET',
  LOG_OKU: 'LOG_OKU',
  VERI_ICE_AKTAR: 'VERI_ICE_AKTAR',
})

/**
 * Yol → görünüm eşlemesi. `izin` alanı, o yolu görebilmek için gereken izni belirtir.
 * Sunucudaki politikayla aynı mantığı yansıtır; kaynak doğruluk sunucudadır.
 */
export const YOLLAR = Object.freeze([
  { yol: '/dashboard', sekme: 'ozet', etiket: 'Genel Bakış', izin: Izin.PANO_OKU },
  { yol: '/inventory', sekme: 'envanter', etiket: 'Envanter', izin: Izin.ENVANTER_OKU },
  { yol: '/assignments', sekme: 'zimmet', etiket: 'Zimmet', izin: Izin.ZIMMET_OKU },
  { yol: '/phones', sekme: 'cep', etiket: 'Cep Telefonu', izin: Izin.ZIMMET_OKU },
  { yol: '/people', sekme: 'kisiler', etiket: 'Kişiler', izin: Izin.ZIMMET_OKU },
  { yol: '/movements', sekme: 'hareket', etiket: 'Hareketler', izin: Izin.ENVANTER_YAZ },
  { yol: '/admin/users', sekme: 'kullanicilar', etiket: 'Kullanıcılar', izin: Izin.KULLANICI_YONET },
  { yol: '/admin/logs', sekme: 'loglar', etiket: 'Loglar', izin: Izin.LOG_OKU },
  { yol: '/admin/settings', sekme: 'yonetim', etiket: 'Yönetim', izin: Izin.AYAR_YONET },
])

export const yoluBul = (pathname) => {
  const temiz = String(pathname || '').replace(/\/+$/, '') || '/'
  return YOLLAR.find((y) => y.yol === temiz) || null
}

/** Giriş sonrası varsayılan sayfa. */
export const VARSAYILAN_YOL = '/dashboard'

/**
 * Open redirect koruması: yalnızca kendi uygulamamız içindeki mutlak yollara izin verilir.
 * "//kotusite.com" ve "https://kotusite.com" gibi değerler reddedilir.
 */
export function guvenliHedef(hedef) {
  const h = String(hedef || '')
  if (!h.startsWith('/') || h.startsWith('//') || h.includes('\\')) return VARSAYILAN_YOL
  if (h === '/login') return VARSAYILAN_YOL
  return h
}
