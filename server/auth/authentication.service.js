// Kimlik doğrulama orkestrasyonu.
//
// Tek kimlik kaynağı vardır: uygulamanın kendi veritabanı (dbo.Kullanicilar).
// Parolalar Argon2id ile özetlenir; düz metin hiçbir yerde tutulmaz.
//
// ─────────────────────────────────────────────────────────────────────────────
// ROL BELİRLEME
// ─────────────────────────────────────────────────────────────────────────────
//     dbo.Kullanicilar.rol  →  ADMIN | VIEWER   (varsayılan VIEWER)
//
// Rol istemciden ASLA alınmaz; sunucu belirler ve oturuma yazar. Tanınmayan bir rol
// değeri VIEWER'a indirgenir (depo katmanı), tanımsız bir rol auth katmanına ulaşırsa
// giriş reddedilir — yetki hiçbir aşamada tahmin edilmez.
const yerelServis = require('./local-auth.service')
const { Saglayici, gecerliRolMu } = require('./roles')
const { kullaniciAdiCozumle, gecerliKullaniciAdiMi } = require('./kullanici-adi')
const { logla } = require('../common/logger')

/**
 * Kullanıcı adı + parola doğrular ve sunucu tarafında rolü belirler.
 *
 * @returns {{ok: true, kimlik: object}}
 *        | {ok: false, sebep: string, saglayici: string|null}
 *
 * `sebep` YALNIZCA denetim günlüğü içindir; istemciye tek tip genel mesaj döner.
 */
async function girisYap(hamKullaniciAdi, parola) {
  const { sam, girilenAlan } = kullaniciAdiCozumle(hamKullaniciAdi)

  if (!gecerliKullaniciAdiMi(sam)) {
    return { ok: false, sebep: 'geçersiz kullanıcı adı biçimi', saglayici: null }
  }
  if (typeof parola !== 'string' || parola.length === 0) {
    return { ok: false, sebep: 'boş parola', saglayici: null }
  }
  if (parola.length > 200) {
    return { ok: false, sebep: 'aşırı uzun parola', saglayici: null }
  }

  // Kullanıcı "DOMAIN\ad" veya "ad@alan" yazdıysa alan adı kısmı yok sayılır;
  // yalnızca denetim günlüğüne not düşülür.
  if (girilenAlan) {
    logla(`[AUTH] Alan adı ön eki yok sayıldı: "${girilenAlan}" (yalnızca yerel hesaplar destekleniyor)`)
  }

  const sonuc = await yerelServis.dogrula(sam, parola)
  if (!sonuc.ok) {
    return { ok: false, sebep: sonuc.sebep, saglayici: Saglayici.LOCAL }
  }

  // Savunma amaçlı ikinci kapı: rol tanımlı kümenin dışındaysa giriş reddedilir.
  if (!gecerliRolMu(sonuc.kimlik.rol)) {
    logla('[KRITIK] Tanımsız rol üretildi — giriş reddedildi:', sonuc.kimlik.rol)
    return { ok: false, sebep: 'tanımsız rol', saglayici: Saglayici.LOCAL }
  }

  return { ok: true, kimlik: sonuc.kimlik }
}

module.exports = { girisYap }
