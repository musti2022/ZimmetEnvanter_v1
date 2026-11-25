// Yerel veritabanı kullanıcısı kimlik doğrulaması.
//
// Rol, kimlik doğrulandıktan SONRA dbo.Kullanicilar.rol sütunundan okunur. `roleCevir`
// tanımadığı her değeri VIEWER'a indirger: bozuk veya beklenmedik bir rol değeri
// yanlışlıkla yönetici yetkisi vermez.
const kullaniciDeposu = require('../users/users.repository')
const parolaServisi = require('./password.service')
const { Saglayici, roleCevir } = require('./roles')
const { logla } = require('../common/logger')

/**
 * Yerel hesabın varlığını kontrol eder (parola doğrulamaz).
 * Sağlayıcı seçiminde kullanılır: hesap varsa kimlik doğrulaması YEREL yolda yapılır.
 */
async function yerelHesapVarMi(kullaniciAdi) {
  const k = await kullaniciDeposu.kullaniciAdiIleBul(kullaniciAdi)
  return Boolean(k)
}

/**
 * Kullanıcı adı + parola doğrular.
 * @returns {{ok: true, kimlik: {...}} | {ok: false, sebep: string}}
 *          `sebep` yalnızca denetim günlüğüne yazılır; istemciye ASLA gönderilmez.
 */
async function dogrula(kullaniciAdi, parola) {
  const kayit = await kullaniciDeposu.kullaniciAdiIleBul(kullaniciAdi)

  if (!kayit) {
    // Hesap yoksa da gerçek bir Argon2 doğrulaması yapılır: yanıt süresi "hesap var"
    // durumuyla eşleşsin ve zamanlama üzerinden kullanıcı sayımı yapılamasın.
    await parolaServisi.sahteDogrula(parola)
    return { ok: false, sebep: 'yerel hesap bulunamadı' }
  }

  const parolaDogru = await parolaServisi.dogrula(kayit.parolaHash, parola)
  if (!parolaDogru) return { ok: false, sebep: 'yerel parola hatalı' }

  // Parola doğru olsa bile pasif hesap giriş yapamaz.
  if (!kayit.aktif) return { ok: false, sebep: 'yerel hesap pasif' }

  // Maliyet parametreleri yükseltildiyse özeti sessizce yenile (kullanıcı fark etmez).
  if (parolaServisi.yenilenmeliMi(kayit.parolaHash)) {
    try {
      await kullaniciDeposu.parolaGuncelle(kayit.id, await parolaServisi.ozetle(parola))
    } catch (e) {
      logla('[AUTH] Parola özeti yenilenemedi:', e?.message || e)
    }
  }

  try {
    await kullaniciDeposu.sonGirisIsaretle(kayit.id)
  } catch (e) {
    logla('[AUTH] sonGiris güncellenemedi:', e?.message || e)
  }

  return {
    ok: true,
    kimlik: {
      kullaniciId: String(kayit.id).toLowerCase(),
      kullaniciAdi: kayit.kullaniciAdi,
      gorunenAd: kayit.adSoyad || kayit.kullaniciAdi,
      eposta: kayit.eposta || '',
      // Rol veritabanından; tanınmayan değer VIEWER'a düşer.
      rol: roleCevir(kayit.rol),
      saglayici: Saglayici.LOCAL,
    },
  }
}

module.exports = { dogrula, yerelHesapVarMi }
