// HTTPS için kendinden imzalı sertifika üretir/saklar.
// Neden gerekli: tarayıcılar kamera akışını (getUserMedia) YALNIZCA secure context'te
// (https ya da localhost) verir. Telefondan http://<LAN-IP> ile girildiğinde canlı
// barkod taraması açılamaz; https ile açılabilir.
const fs = require('fs')
const os = require('os')
const path = require('path')
// selfsigned yalnızca sertifika ÜRETİRKEN gerekir; modül düzeyinde require edilirse
// paket kurulmamış bir makinede (npm install atlanmışsa) sunucunun tamamı başlamaz.
// Bu yüzden tembel yüklenir: yoksa HTTPS atlanır, uygulama HTTP ile çalışmaya devam eder.

const KLASOR = path.join(__dirname, 'sertifika')
const ANAHTAR_YOLU = path.join(KLASOR, 'anahtar.pem')
const SERTIFIKA_YOLU = path.join(KLASOR, 'sertifika.pem')

// WSL/VMware/Hyper-V gibi sanal adaptörler, telefonun ulaşamayacağı adresler üretir;
// kullanıcıya gösterilecek adres bunlardan biri olmamalı.
const SANAL_ARAYUZ = /vEthernet|VMware|VirtualBox|Hyper-V|Loopback|Bluetooth|WSL/i

/** Makinenin IPv4 adresleri (sertifikaya SAN olarak eklenir; IP ile girişte uyarıyı azaltır).
 *  Gerçek ağ adaptörleri (Wi-Fi/Ethernet) önce gelir. */
function yerelIpler() {
  const gercek = []
  const digerleri = []
  for (const [ad, arayuzler] of Object.entries(os.networkInterfaces())) {
    for (const a of arayuzler || []) {
      if (a.family !== 'IPv4' || a.internal) continue
      if (a.address.startsWith('169.254.')) continue // APIPA (bağlantı yok)
      ;(SANAL_ARAYUZ.test(ad) ? digerleri : gercek).push(a.address)
    }
  }
  return [...gercek, ...digerleri]
}

/** Kayıtlı sertifikayı okur; yoksa üretip diske yazar. Hata olursa null döner.
 *  selfsigned v5'te generate() Promise döndürdüğü için bu işlev de async'tir. */
async function sertifikaGetir(logla = console.log) {
  try {
    if (fs.existsSync(ANAHTAR_YOLU) && fs.existsSync(SERTIFIKA_YOLU)) {
      return { key: fs.readFileSync(ANAHTAR_YOLU), cert: fs.readFileSync(SERTIFIKA_YOLU) }
    }
    const ipler = yerelIpler()
    const altNames = [
      { type: 2, value: 'localhost' },
      { type: 2, value: os.hostname() },
      { type: 7, ip: '127.0.0.1' },
      ...ipler.map((ip) => ({ type: 7, ip })),
    ]
    let selfsigned
    try {
      selfsigned = require('selfsigned')
    } catch {
      logla('[HTTPS] selfsigned paketi kurulu değil (npm install), yalnızca HTTP kullanılacak.')
      return null
    }
    const uretilen = await selfsigned.generate(
      [{ name: 'commonName', value: os.hostname() }],
      { days: 3650, keySize: 2048, algorithm: 'sha256', extensions: [{ name: 'subjectAltName', altNames }] },
    )
    if (!uretilen?.private || !uretilen?.cert) throw new Error('sertifika üretimi boş sonuç döndürdü')
    fs.mkdirSync(KLASOR, { recursive: true })
    fs.writeFileSync(ANAHTAR_YOLU, uretilen.private)
    fs.writeFileSync(SERTIFIKA_YOLU, uretilen.cert)
    logla(`[HTTPS] Sertifika üretildi (${ipler.join(', ') || 'yerel'}) → ${KLASOR}`)
    return { key: uretilen.private, cert: uretilen.cert }
  } catch (e) {
    logla('[HTTPS] Sertifika hazırlanamadı, yalnızca HTTP kullanılacak:', e?.message || e)
    return null
  }
}

module.exports = { sertifikaGetir, yerelIpler }
