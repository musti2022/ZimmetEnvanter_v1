// Oturum, çerez, parola ve hız sınırlama ayarları — hepsi ortam değişkeninden.
const { metin, sayi, mantik, oturumAnahtari, URETIM } = require('./env')

const oturumAyar = {
  gizliAnahtar: oturumAnahtari(),
  cerezAdi: metin('SESSION_COOKIE_NAME', 'ze.sid'),

  // Boşta kalma süresi: her istekte tazelenir (rolling). Bu süre boyunca istek gelmezse oturum düşer.
  bostaDakika: sayi('SESSION_IDLE_TIMEOUT_MINUTES', 30),

  // Mutlak ömür: girişten itibaren, aktiflikten bağımsız üst sınır. Oturum kaçırma penceresini kapatır.
  mutlakSaat: sayi('SESSION_ABSOLUTE_TIMEOUT_HOURS', 8),

  // HTTPS zorunluluğu. Üretimde varsayılan açık; ters vekil arkasındaysanız `trust proxy` gerekir.
  guvenliCerez: mantik('SESSION_COOKIE_SECURE', URETIM),

  // Lax: aynı siteden gelen normal gezinmede çerez taşınır, siteler arası POST'ta taşınmaz.
  // CSRF için ilk savunma katmanı; ikinci katman senkronizasyon token'ı (bkz. csrf.middleware).
  sameSite: metin('SESSION_COOKIE_SAMESITE', 'lax'),

  // Ters vekil (nginx/IIS ARR) arkasında X-Forwarded-* başlıklarına güven. Doğru istemci IP'si
  // ve `secure` çerez tespiti için gereklidir. Vekil YOKSA açmayın: IP sahteciliğine yol açar.
  vekileGuven: mantik('TRUST_PROXY', false),
}

const parolaAyar = {
  // Argon2id — OWASP Parola Saklama önerisi. 19 MiB bellek, 2 tur, 1 paralellik.
  bellekKiB: sayi('ARGON2_MEMORY_KIB', 19456),
  turSayisi: sayi('ARGON2_ITERATIONS', 2),
  paralellik: sayi('ARGON2_PARALLELISM', 1),
  enAzUzunluk: sayi('PASSWORD_MIN_LENGTH', 12),
}

const hizSinirAyar = {
  // Politika: LOGIN_RATE_LIMIT_MINUTES içinde LOGIN_MAX_ATTEMPTS başarısız deneme → kilit.
  // Kullanıcı adı ve IP için AYRI sayaçlar tutulur (kaba kuvvet + kimlik bilgisi doldurma).
  enFazlaDeneme: sayi('LOGIN_MAX_ATTEMPTS', 5),
  pencereDakika: sayi('LOGIN_RATE_LIMIT_MINUTES', 10),

  // IP sayacı kullanıcı adı sayacından daha geniştir: tek IP'den çok sayıda FARKLI hesaba
  // yapılan denemeleri (credential stuffing) yakalar.
  ipCarpani: sayi('LOGIN_IP_MULTIPLIER', 4),
}

const girisAyar = {
  // Yerel hesap oluştururken aynı kullanıcı adı AD'de var mı diye bakılır. Amaç: bir yerel

  // İstemciye dönen TEK hata mesajı. Hangi aşamada başarısız olunduğu (kullanıcı yok / parola
  // yanlış / AD grubunda değil / AD erişilemiyor) istemciye ASLA sızdırılmaz; denetim günlüğüne yazılır.
  genelHataMesaji: 'Kullanıcı adı, parola veya erişim yetkisi geçersiz.',
}

module.exports = { oturumAyar, parolaAyar, hizSinirAyar, girisAyar }
