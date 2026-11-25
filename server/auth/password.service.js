// Parola özetleme (Argon2id) ve doğrulama.
//
// Parolalar ASLA düz metin saklanmaz, günlüğe yazılmaz, oturuma/çereze/yanıta konmaz.
// @node-rs/argon2 önceden derlenmiş ikili kullanır (node-gyp/derleyici gerektirmez).
const argon2 = require('@node-rs/argon2')
const crypto = require('node:crypto')
const { parolaAyar } = require('../config/auth.config')
const { ApiHata } = require('../common/api-error')

const SECENEKLER = {
  algorithm: argon2.Algorithm.Argon2id,
  memoryCost: parolaAyar.bellekKiB,
  timeCost: parolaAyar.turSayisi,
  parallelism: parolaAyar.paralellik,
}

// Kullanıcı adı sayımını (enumeration) engellemek için: hesap bulunamadığında da gerçek bir
// doğrulama yapılır ki yanıt süresi "hesap var" durumuyla aynı olsun. Süreç başında bir kez üretilir.
const SAHTE_OZET = argon2.hashSync(crypto.randomBytes(32).toString('base64'), SECENEKLER)

/** Parolayı Argon2id ile özetler. */
async function ozetle(duzMetinParola) {
  return argon2.hash(duzMetinParola, SECENEKLER)
}

/**
 * Parolayı özete karşı doğrular. Bozuk/eski biçimli özette hata fırlatmaz, false döner —
 * veritabanındaki tek bozuk kayıt giriş akışını çökertmemelidir.
 */
async function dogrula(ozet, duzMetinParola) {
  if (!ozet || !duzMetinParola) return false
  try {
    return await argon2.verify(ozet, duzMetinParola)
  } catch {
    return false
  }
}

/**
 * Hesap bulunamadığında çağrılır: gerçek doğrulamayla aynı CPU maliyetini harcayarak
 * "kullanıcı var mı yok mu" bilgisinin zamanlama üzerinden sızmasını engeller.
 */
async function sahteDogrula(duzMetinParola) {
  try { await argon2.verify(SAHTE_OZET, duzMetinParola || 'x') } catch { /* beklenen */ }
  return false
}

/** Özet, güncel maliyet parametrelerinin gerisinde mi? (başarılı girişte sessizce yenilenir) */
function yenilenmeliMi(ozet) {
  if (!ozet) return true
  const m = /^\$argon2id\$v=19\$m=(\d+),t=(\d+),p=(\d+)\$/.exec(ozet)
  if (!m) return true // argon2id değil (ör. eski bcrypt) → ilk başarılı girişte yenile
  return Number(m[1]) < SECENEKLER.memoryCost
    || Number(m[2]) < SECENEKLER.timeCost
    || Number(m[3]) !== SECENEKLER.parallelism
}

/** Yerel hesap parolası için asgari kalite kuralı. */
function parolaPolitikasiDogrula(parola) {
  const p = String(parola || '')
  if (p.length < parolaAyar.enAzUzunluk) {
    throw ApiHata.kotuIstek(`Parola en az ${parolaAyar.enAzUzunluk} karakter olmalıdır.`)
  }
  if (p.length > 200) {
    throw ApiHata.kotuIstek('Parola en fazla 200 karakter olabilir.')
  }
  const sinif = [/[a-zçğıöşü]/.test(p), /[A-ZÇĞIİÖŞÜ]/.test(p), /\d/.test(p), /[^\p{L}\d]/u.test(p)]
    .filter(Boolean).length
  if (sinif < 3) {
    throw ApiHata.kotuIstek('Parola küçük harf, büyük harf, rakam ve sembol gruplarından en az üçünü içermelidir.')
  }
  return p
}

module.exports = { ozetle, dogrula, sahteDogrula, yenilenmeliMi, parolaPolitikasiDogrula }
