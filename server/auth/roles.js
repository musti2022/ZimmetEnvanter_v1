// Rol ve kimlik doğrulama sağlayıcısı modeli.
//
// Rol, kimlik doğrulandıktan SONRA dbo.Kullanicilar.rol sütunundan okunur.
// Rol istemciden ASLA alınmaz; sunucu belirler ve oturuma yazar. Sütun CHECK kısıtıyla
// iki değere sınırlıdır ve varsayılanı VIEWER'dır — beklenmedik bir kayıt en az yetkiliye
// düşer, en çok yetkiliye değil.

const Rol = Object.freeze({
  ADMIN: 'ADMIN',
  VIEWER: 'VIEWER',
})

// Kimlik kaynağı. Şu an tek değer var; oturum ve denetim kayıtlarında saklanır ki
// ileride başka bir kaynak eklenirse mevcut kayıtlar anlamını korusun.
const Saglayici = Object.freeze({ LOCAL: 'LOCAL' })

// İnce taneli izinler. Uçlar rol değil İZİN ister; böylece ileride rol eklenince
// uç tanımlarına dokunulmaz.
const Izin = Object.freeze({
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

// Rol → izin kümesi. VIEWER salt okunurdur ve yalnızca Genel Bakış + Envanter görür.
const ROL_IZINLERI = Object.freeze({
  [Rol.VIEWER]: Object.freeze([
    Izin.PANO_OKU,
    Izin.ENVANTER_OKU,
  ]),
  [Rol.ADMIN]: Object.freeze(Object.values(Izin)), // tam erişim
})

/** Rolün ilgili izne sahip olup olmadığı. Bilinmeyen rol → false (varsayılan reddet). */
function izinVar(rol, izin) {
  const izinler = ROL_IZINLERI[rol]
  return Array.isArray(izinler) && izinler.includes(izin)
}

/** Tanımlı bir rol mü? */
function gecerliRolMu(rol) {
  return rol === Rol.ADMIN || rol === Rol.VIEWER
}

/**
 * Serbest metni güvenli bir role indirger.
 * TANINMAYAN HER DEĞER VIEWER'a düşer — veritabanında bozuk/beklenmedik bir rol değeri
 * (ya da yeni eklenmiş bir rol adı) yanlışlıkla yönetici yetkisi vermesin.
 */
function roleCevir(ham) {
  return String(ham || '').trim().toUpperCase() === Rol.ADMIN ? Rol.ADMIN : Rol.VIEWER
}

module.exports = { Rol, Saglayici, Izin, ROL_IZINLERI, izinVar, gecerliRolMu, roleCevir }
