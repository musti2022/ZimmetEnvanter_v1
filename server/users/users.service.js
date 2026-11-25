// Kullanıcı yönetimi iş kuralları.
//
// Hesabın rolü (ADMIN | VIEWER) dbo.Kullanicilar.rol sütununda tutulur ve yalnızca
// ADMIN yetkisine sahip bir oturum tarafından değiştirilebilir. Rol yükseltme/düşürme
// işlemleri denetim günlüğüne ayrı ayrı yazılır.
//
// KİLİTLENME KORUMASI: bir yönetici kendi rolünü düşüremez, kendini pasifleştiremez veya
// silemez; ayrıca son aktif ADMIN hesabı yetkisiz bırakılamaz — aksi hâlde sisteme hiç
// kimse yönetici olarak giremezdi.
const { ApiHata } = require('../common/api-error')
const { logla } = require('../common/logger')
const depo = require('./users.repository')
const parolaServisi = require('../auth/password.service')
const oturumServisi = require('../auth/session.service')
const { gecerliKullaniciAdiMi, kullaniciAdiCozumle } = require('../auth/kullanici-adi')
const { Rol, roleCevir } = require('../auth/roles')

/** Kullanıcı adını doğrular ve normalize eder. */
function kullaniciAdiDogrula(ham) {
  const { sam } = kullaniciAdiCozumle(ham)
  const k = depo.kullaniciAdiNormalize(sam)
  if (!k) throw ApiHata.kotuIstek('Kullanıcı adı zorunludur.')
  if (k.length < 3) throw ApiHata.kotuIstek('Kullanıcı adı en az 3 karakter olmalıdır.')
  if (!gecerliKullaniciAdiMi(k)) {
    throw ApiHata.kotuIstek('Kullanıcı adı boşluk ve @ \\ / : ; , = + * ? < > " [ ] | karakterlerini içeremez.')
  }
  return k
}

async function listele(secenekler) {
  return depo.listele(secenekler)
}

async function detay(id) {
  const k = await depo.idIleBul(id)
  if (!k) throw ApiHata.bulunamadi('Kullanıcı bulunamadı.')
  return k
}

async function olustur({ kullaniciAdi, parola, adSoyad, eposta, rol, aktif = true }) {
  const k = kullaniciAdiDogrula(kullaniciAdi)
  const p = parolaServisi.parolaPolitikasiDogrula(parola)

  if (await depo.kullaniciAdiIleBul(k)) {
    throw ApiHata.cakisma(`"${k}" kullanıcı adı zaten kayıtlı.`, { kod: 'KULLANICI_VAR' })
  }

  const hash = await parolaServisi.ozetle(p)
  return depo.olustur({ kullaniciAdi: k, parolaHash: hash, adSoyad, eposta, rol: roleCevir(rol), aktif })
}

/**
 * Bir değişikliğin sistemi yöneticisiz bırakıp bırakmadığını denetler.
 * @param {object} mevcut Değiştirilecek kullanıcının mevcut hâli
 * @param {object} istenen {rol, aktif} — yalnızca verilen alanlar dikkate alınır
 */
async function sonYoneticiKorumasi(mevcut, { rol, aktif } = {}) {
  const yoneticiKalmayacak =
    mevcut.rol === Rol.ADMIN && mevcut.aktif &&
    ((rol != null && roleCevir(rol) !== Rol.ADMIN) || aktif === false)

  if (!yoneticiKalmayacak) return
  if (await depo.aktifAdminSayisi() > 1) return

  throw ApiHata.cakisma(
    'Bu, sistemdeki son aktif yönetici hesabı. Yetkisini kaldırmadan önce başka bir ' +
    'hesabı yönetici yapın — aksi hâlde kullanıcı yönetimine erişilemez hâle gelir.',
    { kod: 'SON_YONETICI' },
  )
}

async function guncelle(id, { adSoyad, eposta, rol, aktif }, isteyen = null) {
  const mevcut = await depo.idIleBul(id)
  if (!mevcut) throw ApiHata.bulunamadi('Kullanıcı bulunamadı.')

  // Kendi yetkisini düşürme / kendini kapatma engellenir (yanlışlıkla kilitlenmeye karşı).
  const kendisi = isteyen?.kullaniciId && isteyen.kullaniciId === mevcut.id
  if (kendisi && rol != null && roleCevir(rol) !== mevcut.rol) {
    throw ApiHata.kotuIstek('Kendi rolünüzü değiştiremezsiniz.', { kod: 'KENDI_ROLU' })
  }
  if (kendisi && aktif === false) {
    throw ApiHata.kotuIstek('Kendi hesabınızı pasifleştiremezsiniz.', { kod: 'KENDI_HESABI' })
  }

  await sonYoneticiKorumasi(mevcut, { rol, aktif })

  const guncel = await depo.guncelle(id, { adSoyad, eposta, rol, aktif })

  // Hesap pasifleştirildiyse açık oturumları HEMEN sonlandır — aksi hâlde kullanıcı
  // oturum süresi dolana kadar erişmeye devam ederdi.
  if (aktif === false && mevcut.aktif) {
    const n = await oturumServisi.kullanicininOturumlariniKapat(mevcut.kullaniciAdi)
    logla(`[KULLANICI] "${mevcut.kullaniciAdi}" pasifleştirildi, ${n} oturum kapatıldı.`)
  }

  // Rol değiştiyse oturumları da kapat: rol oturuma yazıldığı için, kullanıcı yeniden
  // giriş yapana kadar ESKİ yetkisiyle çalışmaya devam ederdi.
  if (rol != null && roleCevir(rol) !== mevcut.rol) {
    const n = await oturumServisi.kullanicininOturumlariniKapat(mevcut.kullaniciAdi)
    logla(`[KULLANICI] "${mevcut.kullaniciAdi}" rolü ${mevcut.rol} → ${roleCevir(rol)}, ${n} oturum kapatıldı.`)
  }
  return guncel
}

async function parolaSifirla(id, yeniParola) {
  const mevcut = await depo.idIleBul(id)
  if (!mevcut) throw ApiHata.bulunamadi('Kullanıcı bulunamadı.')

  const p = parolaServisi.parolaPolitikasiDogrula(yeniParola)
  await depo.parolaGuncelle(id, await parolaServisi.ozetle(p))

  // Parola değişince tüm oturumlar düşer (çalınmış oturum varsa kapanır).
  await oturumServisi.kullanicininOturumlariniKapat(mevcut.kullaniciAdi)
  return mevcut
}

async function sil(id, isteyen = null) {
  const mevcut = await depo.idIleBul(id)
  if (!mevcut) throw ApiHata.bulunamadi('Kullanıcı bulunamadı.')

  if (isteyen?.kullaniciId && isteyen.kullaniciId === mevcut.id) {
    throw ApiHata.kotuIstek('Kendi hesabınızı silemezsiniz.', { kod: 'KENDI_HESABI' })
  }
  await sonYoneticiKorumasi(mevcut, { aktif: false })

  await depo.sil(id)
  await oturumServisi.kullanicininOturumlariniKapat(mevcut.kullaniciAdi)
  return mevcut
}

module.exports = { listele, detay, olustur, guncelle, parolaSifirla, sil, kullaniciAdiDogrula }
