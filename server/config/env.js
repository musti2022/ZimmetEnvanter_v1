// Ortam değişkeni yükleme ve doğrulama.
//
// Gerçek kimlik bilgileri (AD service account parolası, oturum anahtarı) KAYNAK KODA YAZILMAZ.
// Üretimde secret manager kullanımı için: .env yerine süreç ortamına enjekte etmek yeterlidir —
// dotenv yalnızca ortamda TANIMSIZ olan anahtarları doldurur, mevcut değerlerin üzerine yazmaz.
const path = require('node:path')
const fs = require('node:fs')
const crypto = require('node:crypto')

const KOK = path.join(__dirname, '..', '..')
require('dotenv').config({ path: path.join(KOK, '.env') })

const URETIM = (process.env.NODE_ENV || '').toLowerCase() === 'production'

function metin(anahtar, varsayilan = '') {
  const v = process.env[anahtar]
  return v == null || v === '' ? varsayilan : String(v).trim()
}

function sayi(anahtar, varsayilan) {
  const v = Number(process.env[anahtar])
  return Number.isFinite(v) && v > 0 ? v : varsayilan
}

function mantik(anahtar, varsayilan) {
  const v = metin(anahtar)
  if (!v) return varsayilan
  return ['1', 'true', 'evet', 'yes', 'on'].includes(v.toLowerCase())
}

/**
 * Oturum imza anahtarı. Üretimde SESSION_SECRET zorunludur — yoksa süreç başlamaz,
 * çünkü rastgele üretilen anahtar her yeniden başlatmada tüm oturumları geçersiz kılar
 * ve çok örnekli kurulumda oturumlar örnekler arasında taşınmaz.
 */
function oturumAnahtari() {
  const s = metin('SESSION_SECRET')
  if (s) {
    if (s.length < 32) {
      throw new Error('SESSION_SECRET en az 32 karakter olmalı. Üretmek için: node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'base64url\'))"')
    }
    return s
  }
  if (URETIM) {
    throw new Error('SESSION_SECRET tanımlı değil. Üretim ortamında zorunludur.')
  }
  return crypto.randomBytes(48).toString('base64url')
}

const env = {
  URETIM,
  KOK,
  envDosyasiVar: fs.existsSync(path.join(KOK, '.env')),
  metin,
  sayi,
  mantik,
  oturumAnahtari,
}

module.exports = env
