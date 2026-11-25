// Dosya + konsol günlüğü. Zamanlanmış görevde konsol görünmez; teşhis için dosya şart.
//
// GÜVENLİ GÜNLÜKLEME: parola, oturum anahtarı, token ve AD bind parolası ASLA günlüğe yazılmaz.
// `temizle()` bilinen hassas alan adlarını maskeler; yine de nesneleri gelişigüzel loglamayın.
const path = require('node:path')
const fs = require('node:fs')

const LOG_YOLU = path.join(__dirname, '..', 'server.log')

const HASSAS_ALANLAR = new Set([
  'password', 'parola', 'sifre', 'pass', 'pwd',
  'passwordhash', 'parolahash', 'password_hash',
  'secret', 'sessionsecret', 'session_secret', 'gizlianahtar',
  'token', 'accesstoken', 'refreshtoken', 'csrftoken', 'authorization', 'cookie',
  'bindpassword', 'ad_bind_password', 'adbindpassword',
])

/** Hassas alanları maskeleyerek günlüğe yazılabilir bir kopya üretir. */
function temizle(deger, derinlik = 0) {
  if (derinlik > 4 || deger == null) return deger
  if (Array.isArray(deger)) return deger.map((d) => temizle(d, derinlik + 1))
  if (typeof deger !== 'object') return deger
  const cikti = {}
  for (const [k, v] of Object.entries(deger)) {
    cikti[k] = HASSAS_ALANLAR.has(k.toLowerCase()) ? '***' : temizle(v, derinlik + 1)
  }
  return cikti
}

function bicimle(parca) {
  if (parca instanceof Error) return parca.stack || parca.message
  if (parca && typeof parca === 'object') {
    try { return JSON.stringify(temizle(parca)) } catch { return '[nesne]' }
  }
  return String(parca)
}

function logla(...parcalar) {
  const satir = `${new Date().toISOString()} ${parcalar.map(bicimle).join(' ')}\n`
  try { fs.appendFileSync(LOG_YOLU, satir) } catch { /* disk hatasında sessiz geç */ }
  console.log(satir.trimEnd())
}

module.exports = { logla, temizle, LOG_YOLU }
