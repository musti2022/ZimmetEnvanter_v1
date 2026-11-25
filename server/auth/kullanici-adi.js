// Kullanıcı adı normalize ve doğrulama.
//
// Girdi doğrudan SQL'e parametre olarak gider; yine de biçim burada sınırlanır:
// beklenmedik karakterler taşıyan bir ad, kullanıcı tablosunda da denetim günlüğünde de
// karışıklık yaratır. Dar bir kümeye zorlamak en ucuz korumadır.

// Kullanıcı adında bulunmaması gereken karakterler (boşluk ve ayırıcılar dahil).
const GECERSIZ_KULLANICI_ADI = /["/\\[\]:;|=,+*?<>@()&!'`\s]/

/**
 * Kullanıcı adını normalize eder.
 *
 * `DOMAIN\kullanici` ve `kullanici@alan.adi` biçimleri de kabul edilir — kullanıcılar
 * alışkanlıkla böyle yazabilir. Alan adı kısmı AYIKLANIR ve yok sayılır; giriş yalnızca
 * yerel veritabanına yapılır.
 *
 * @returns {{sam: string, girilenAlan: string|null}}
 */
function kullaniciAdiCozumle(ham) {
  let s = String(ham == null ? '' : ham).trim()
  if (!s) return { sam: '', girilenAlan: null }

  let girilenAlan = null

  // DOMAIN\kullanici
  const tersEgik = s.indexOf('\\')
  if (tersEgik !== -1) {
    girilenAlan = s.slice(0, tersEgik)
    s = s.slice(tersEgik + 1)
  }

  // kullanici@alan.adi
  const kuyruk = s.indexOf('@')
  if (kuyruk !== -1) {
    girilenAlan = s.slice(kuyruk + 1) || girilenAlan
    s = s.slice(0, kuyruk)
  }

  return { sam: s.trim(), girilenAlan }
}

/** Biçim denetimi — geçersizse kimlik doğrulama hiç denenmez. */
function gecerliKullaniciAdiMi(sam) {
  const s = String(sam || '')
  return s.length > 0 && s.length <= 64 && !GECERSIZ_KULLANICI_ADI.test(s)
}

module.exports = { kullaniciAdiCozumle, gecerliKullaniciAdiMi }
