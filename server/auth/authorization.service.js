// Merkezi yetkilendirme (RBAC) politikası.
//
// TASARIM: VARSAYILAN REDDET (default deny).
// Politika tablosunda EŞLEŞMEYEN her uç reddedilir. Böylece ileride eklenen bir uç,
// politikaya yazılmadığı sürece otomatik olarak ADMIN'e kapalı değil HERKESE kapalıdır —
// "yeni uç yazdım, yetki kontrolünü unuttum" sınıfı açıklar mümkün olmaz.
//
// Yetki kontrolü uçlara dağıtılmaz; tek bir ara katman (auth.middleware/yetkiKapisi) tüm
// /api trafiğini bu tablodan geçirir.
const { Izin } = require('./roles')

// Kimlik doğrulaması GEREKTİRMEYEN uçlar. Liste bilinçli olarak kısa tutulur.
const ACIK_UCLAR = [
  { yontemler: ['POST'], desen: /^\/auth\/login\/?$/ },
  { yontemler: ['POST'], desen: /^\/auth\/logout\/?$/ },   // oturum yoksa da 200 döner (idempotent)
  { yontemler: ['GET'], desen: /^\/auth\/me\/?$/ },        // oturum yoksa 401 döner; istemci açılışta çağırır
  { yontemler: ['GET'], desen: /^\/auth\/csrf\/?$/ },
  { yontemler: ['GET'], desen: /^\/saglik\/?$/ },
]

// Yetkilendirme matrisi. Sıra önemlidir: ilk eşleşen kural uygulanır.
//
//  UÇ                                  VIEWER   ADMIN
//  GET  /api/tumu                      ✓(kısıtlı projeksiyon)  ✓
//  GET  /api/urunler, /api/urunler/:id ✓        ✓
//  POST/PUT/DELETE /api/urunler*       ✗        ✓
//  POST/PUT/DELETE /api/belgeler*      ✗        ✓
//  POST/PUT/DELETE /api/cep*           ✗        ✓
//  POST /api/yedek                     ✗        ✓
//  GET/PUT /api/ayarlar*               ✗        ✓
//  * /api/kullanicilar*                ✗        ✓
//  GET  /api/loglar                    ✗        ✓
//  GET  /api/raporlar                  ✗        ✓
//  (listelenmeyen her şey)             ✗        ✗   ← varsayılan reddet
const POLITIKA = [
  // ---- kimlik doğrulanmış herkesin kendi bağlamı ----
  { yontemler: ['GET'], desen: /^\/auth\/(me|csrf|oturum)\/?$/, izin: null }, // izin: null → yalnızca oturum yeterli

  // ---- Genel Bakış (pano) ----
  // /api/tumu panoyu ve envanteri besleyen tek toplu okuma ucudur. VIEWER için yanıt
  // inventory.service içinde daraltılır (imzalar, e-posta ayarları, personel listesi çıkarılır).
  { yontemler: ['GET'], desen: /^\/tumu\/?$/, izin: Izin.PANO_OKU },
  { yontemler: ['GET'], desen: /^\/pano\/?$/, izin: Izin.PANO_OKU },
  // Canlı güncelleme akışı (SSE): içerik taşımaz, yalnızca "veri değişti" sinyali.
  { yontemler: ['GET'], desen: /^\/olaylar\/?$/, izin: Izin.PANO_OKU },

  // ---- Envanter: okuma VIEWER'a açık, yazma yalnızca ADMIN ----
  { yontemler: ['GET'], desen: /^\/urunler(\/[^/]+)?\/?$/, izin: Izin.ENVANTER_OKU },
  { yontemler: ['POST', 'PUT', 'PATCH', 'DELETE'], desen: /^\/urunler(\/.*)?$/, izin: Izin.ENVANTER_YAZ },

  // ---- Zimmet belgeleri: VIEWER'a tamamen kapalı ----
  { yontemler: ['GET'], desen: /^\/belgeler(\/.*)?$/, izin: Izin.ZIMMET_OKU },
  { yontemler: ['POST', 'PUT', 'PATCH', 'DELETE'], desen: /^\/belgeler(\/.*)?$/, izin: Izin.ZIMMET_YAZ },

  // ---- Cep telefonu taahhüt kayıtları: zimmet belgesiyle aynı sınıf (kişisel veri) ----
  { yontemler: ['GET'], desen: /^\/cep(\/.*)?$/, izin: Izin.ZIMMET_OKU },
  { yontemler: ['POST', 'PUT', 'PATCH', 'DELETE'], desen: /^\/cep(\/.*)?$/, izin: Izin.ZIMMET_YAZ },
  { yontemler: ['GET'], desen: /^\/cep-marka-listesi(\/.*)?$/, izin: Izin.ZIMMET_OKU },
  { yontemler: ['POST', 'PUT', 'PATCH', 'DELETE'], desen: /^\/cep-marka-listesi(\/.*)?$/, izin: Izin.ZIMMET_YAZ },

  // ---- Yardımcı listeler (ürün/konum/kategori/marka/personel): yalnızca yazma uçları var ----
  { yontemler: ['GET'], desen: /^\/(urun|konum|kategori|marka)-listesi(\/.*)?$/, izin: Izin.ENVANTER_OKU },
  { yontemler: ['POST', 'PUT', 'PATCH', 'DELETE'], desen: /^\/(urun|konum|kategori|marka)-listesi(\/.*)?$/, izin: Izin.ENVANTER_YAZ },
  { yontemler: ['GET'], desen: /^\/personel(\/.*)?$/, izin: Izin.ZIMMET_OKU },
  { yontemler: ['POST', 'PUT', 'PATCH', 'DELETE'], desen: /^\/personel(\/.*)?$/, izin: Izin.ZIMMET_YAZ },

  // ---- Toplu içe aktarma / yedek geri yükleme ----
  { yontemler: ['POST'], desen: /^\/yedek\/?$/, izin: Izin.VERI_ICE_AKTAR },

  // ---- Ayarlar ----
  { yontemler: ['GET'], desen: /^\/ayarlar(\/.*)?$/, izin: Izin.AYAR_YONET },
  { yontemler: ['PUT', 'POST', 'PATCH', 'DELETE'], desen: /^\/ayarlar(\/.*)?$/, izin: Izin.AYAR_YONET },

  // ---- Kullanıcı yönetimi ----
  { yontemler: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'], desen: /^\/kullanicilar(\/.*)?$/, izin: Izin.KULLANICI_YONET },

  // ---- Denetim günlüğü ----
  { yontemler: ['GET'], desen: /^\/loglar(\/.*)?$/, izin: Izin.LOG_OKU },

  // ---- Raporlar ----
  { yontemler: ['GET'], desen: /^\/raporlar(\/.*)?$/, izin: Izin.RAPOR_OKU },

  // ---- Yönetim / sistem durumu ----
  { yontemler: ['GET', 'POST'], desen: /^\/yonetim(\/.*)?$/, izin: Izin.AYAR_YONET },
]

/** Yol açık (kimlik doğrulaması gerektirmeyen) uçlardan biri mi? */
function acikUcMu(yontem, yol) {
  return ACIK_UCLAR.some((k) => k.yontemler.includes(yontem) && k.desen.test(yol))
}

/**
 * Yol için gereken izni döndürür.
 * @returns {{bulundu: true, izin: string|null} | {bulundu: false}}
 *   bulundu=false → politikada tanımsız → REDDET.
 *   izin=null     → kimlik doğrulaması yeterli, ek izin aranmaz.
 */
function politikaCoz(yontem, yol) {
  for (const kural of POLITIKA) {
    if (kural.yontemler.includes(yontem) && kural.desen.test(yol)) {
      return { bulundu: true, izin: kural.izin }
    }
  }
  return { bulundu: false }
}

module.exports = { ACIK_UCLAR, POLITIKA, acikUcMu, politikaCoz }
