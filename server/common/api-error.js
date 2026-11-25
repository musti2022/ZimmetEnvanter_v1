// Uygulama genelinde tek hata tipi.
// `mesaj` istemciye gider; `icDetay` YALNIZCA sunucu günlüğüne yazılır.
// Kimlik doğrulama hatalarında istemciye daima genel mesaj döner (kullanıcı sayımı/enumeration
// saldırısını engellemek için), gerçek sebep icDetay ile denetim günlüğüne düşer.
class ApiHata extends Error {
  constructor(durum, mesaj, { kod = null, icDetay = null, basliklar = null } = {}) {
    super(mesaj)
    this.name = 'ApiHata'
    this.durum = durum
    this.kod = kod
    this.icDetay = icDetay
    this.basliklar = basliklar
  }

  static kotuIstek(mesaj, secenek) { return new ApiHata(400, mesaj, secenek) }
  static yetkisiz(mesaj, secenek) { return new ApiHata(401, mesaj, secenek) }
  static yasak(mesaj, secenek) { return new ApiHata(403, mesaj, secenek) }
  static bulunamadi(mesaj, secenek) { return new ApiHata(404, mesaj, secenek) }
  static cakisma(mesaj, secenek) { return new ApiHata(409, mesaj, secenek) }
  static cokFazlaIstek(mesaj, secenek) { return new ApiHata(429, mesaj, secenek) }
  static kullanilamaz(mesaj, secenek) { return new ApiHata(503, mesaj, secenek) }
}

module.exports = { ApiHata }
