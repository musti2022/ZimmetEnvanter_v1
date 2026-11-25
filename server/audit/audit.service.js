// Denetim günlüğü (audit log) — kim, ne zaman, neyi, hangi sonuçla yaptı.
//
// ASLA YAZILMAZ: parola, oturum anahtarı, access/refresh token, AD bind parolası.
// Kayıt yazımı isteği ÇÖKERTMEZ: veritabanı hatasında dosya günlüğüne düşülür, istek devam eder.
const crypto = require('node:crypto')
const { sql, havuzGetir } = require('../db')
const { logla } = require('../common/logger')

const Eylem = Object.freeze({
  LOGIN_SUCCESS: 'LOGIN_SUCCESS',
  LOGIN_FAILED: 'LOGIN_FAILED',
  LOGIN_RATE_LIMITED: 'LOGIN_RATE_LIMITED',
  LOGOUT: 'LOGOUT',
  ACCESS_DENIED: 'ACCESS_DENIED',
  SESSION_EXPIRED: 'SESSION_EXPIRED',
  CSRF_REJECTED: 'CSRF_REJECTED',

  INVENTORY_CREATED: 'INVENTORY_CREATED',
  INVENTORY_UPDATED: 'INVENTORY_UPDATED',
  INVENTORY_DELETED: 'INVENTORY_DELETED',
  INVENTORY_IMPORTED: 'INVENTORY_IMPORTED',
  STOCK_MOVED: 'STOCK_MOVED',

  ASSIGNMENT_CREATED: 'ASSIGNMENT_CREATED',
  ASSIGNMENT_UPDATED: 'ASSIGNMENT_UPDATED',
  ASSIGNMENT_DELETED: 'ASSIGNMENT_DELETED',
  ASSIGNMENT_RETURNED: 'ASSIGNMENT_RETURNED',

  PHONE_RECORD_CREATED: 'PHONE_RECORD_CREATED',
  PHONE_RECORD_UPDATED: 'PHONE_RECORD_UPDATED',
  PHONE_RECORD_DELETED: 'PHONE_RECORD_DELETED',

  USER_CREATED: 'USER_CREATED',
  USER_UPDATED: 'USER_UPDATED',
  USER_DELETED: 'USER_DELETED',
  USER_PASSWORD_RESET: 'USER_PASSWORD_RESET',
  USER_ROLE_CHANGED: 'USER_ROLE_CHANGED',

  SETTINGS_CHANGED: 'SETTINGS_CHANGED',
  BACKUP_RESTORED: 'BACKUP_RESTORED',
  REFERENCE_DATA_CHANGED: 'REFERENCE_DATA_CHANGED',
})

const Sonuc = Object.freeze({ BASARILI: 'BASARILI', BASARISIZ: 'BASARISIZ' })

/** İstekten güvenli şekilde istemci IP'si çıkarır (TRUST_PROXY açıksa X-Forwarded-For). */
function istemciIp(req) {
  return String(req?.ip || req?.socket?.remoteAddress || '').slice(0, 64)
}

function kullaniciAjani(req) {
  return String(req?.get?.('user-agent') || '').slice(0, 300)
}

/**
 * Denetim kaydı yazar.
 * @param {object} p
 * @param {string} p.eylem   Eylem sabitlerinden biri
 * @param {object} [p.req]   İstek (ip / user-agent / oturum bağlamı için)
 * @param {string} [p.kullaniciAdi] Oturum yoksa (başarısız giriş) elle verilir
 * @param {string} [p.detay] Teknik sebep — İSTEMCİYE GİTMEZ, yalnızca buraya yazılır
 */
async function yaz({ eylem, req = null, kullaniciAdi = null, rol = null, saglayici = null, kaynak = null, kaynakId = null, sonuc = Sonuc.BASARILI, detay = null }) {
  const baglam = req?.kullanici || null
  const kayit = {
    id: crypto.randomUUID(),
    zaman: new Date().toISOString(),
    kullaniciAdi: String(kullaniciAdi ?? baglam?.kullaniciAdi ?? '(anonim)').slice(0, 100),
    rol: String(rol ?? baglam?.rol ?? '').slice(0, 20),
    saglayici: String(saglayici ?? baglam?.saglayici ?? '').slice(0, 30),
    eylem: String(eylem).slice(0, 50),
    kaynak: kaynak ? String(kaynak).slice(0, 50) : null,
    kaynakId: kaynakId ? String(kaynakId).slice(0, 100) : null,
    sonuc,
    ip: istemciIp(req),
    userAgent: kullaniciAjani(req),
    detay: detay ? String(detay).slice(0, 1000) : null,
  }

  try {
    const p = await havuzGetir()
    await p.request()
      .input('id', sql.UniqueIdentifier, kayit.id)
      .input('zaman', sql.NVarChar(40), kayit.zaman)
      .input('kullaniciAdi', sql.NVarChar(100), kayit.kullaniciAdi)
      .input('rol', sql.NVarChar(20), kayit.rol)
      .input('saglayici', sql.NVarChar(30), kayit.saglayici)
      .input('eylem', sql.NVarChar(50), kayit.eylem)
      .input('kaynak', sql.NVarChar(50), kayit.kaynak)
      .input('kaynakId', sql.NVarChar(100), kayit.kaynakId)
      .input('sonuc', sql.NVarChar(20), kayit.sonuc)
      .input('ip', sql.NVarChar(64), kayit.ip)
      .input('userAgent', sql.NVarChar(300), kayit.userAgent)
      .input('detay', sql.NVarChar(1000), kayit.detay)
      .query(`INSERT INTO dbo.DenetimKaydi (id, zaman, kullaniciAdi, rol, saglayici, eylem, kaynak, kaynakId, sonuc, ip, userAgent, detay)
              VALUES (@id, @zaman, @kullaniciAdi, @rol, @saglayici, @eylem, @kaynak, @kaynakId, @sonuc, @ip, @userAgent, @detay)`)
  } catch (e) {
    // Denetim yazımı başarısızsa istek akışı bozulmaz; dosya günlüğüne düşülür.
    logla('[DENETIM-YAZILAMADI]', kayit.eylem, kayit.kullaniciAdi, kayit.sonuc, '|', e?.message || e)
  }

  // Güvenlik olayları ayrıca dosya günlüğüne — veritabanı erişilemese bile iz kalsın.
  if ([Eylem.LOGIN_FAILED, Eylem.ACCESS_DENIED, Eylem.LOGIN_RATE_LIMITED, Eylem.CSRF_REJECTED].includes(eylem)) {
    logla(`[GUVENLIK] ${kayit.eylem} kullanici=${kayit.kullaniciAdi} ip=${kayit.ip} sebep=${kayit.detay || '-'}`)
  }
}

/** Denetim kayıtlarını filtreli/sayfalı listeler (yalnızca ADMIN). */
async function listele({ eylem = '', kullaniciAdi = '', ara = '', baslangic = '', bitis = '', sayfa = 1, boyut = 100 } = {}) {
  const limit = Math.min(500, Math.max(1, Number(boyut) || 100))
  const atla = Math.max(0, (Number(sayfa) || 1) - 1) * limit
  const p = await havuzGetir()

  const filtre = `
    WHERE (@eylem IS NULL OR eylem = @eylem)
      AND (@kul IS NULL OR kullaniciAdi LIKE @kul)
      AND (@ara IS NULL OR detay LIKE @ara OR kullaniciAdi LIKE @ara OR kaynak LIKE @ara)
      AND (@bas IS NULL OR zaman >= @bas)
      AND (@bit IS NULL OR zaman <= @bit)`

  const parametreler = (r) => r
    .input('eylem', sql.NVarChar(50), eylem ? String(eylem) : null)
    .input('kul', sql.NVarChar(100), kullaniciAdi ? `%${kullaniciAdi}%` : null)
    .input('ara', sql.NVarChar(210), String(ara || '').trim()
      ? `%${String(ara).trim().slice(0, 200).replace(/[[%_]/g, '[$&]')}%` : null)
    .input('bas', sql.NVarChar(40), baslangic || null)
    .input('bit', sql.NVarChar(40), bitis ? `${bitis}T23:59:59.999Z` : null)

  const r = await parametreler(p.request())
    .input('atla', sql.Int, atla)
    .input('limit', sql.Int, limit)
    .query(`SELECT * FROM dbo.DenetimKaydi ${filtre}
            ORDER BY zaman DESC
            OFFSET @atla ROWS FETCH NEXT @limit ROWS ONLY`)

  const t = await parametreler(p.request())
    .query(`SELECT COUNT(*) AS toplam FROM dbo.DenetimKaydi ${filtre}`)

  return {
    kayitlar: r.recordset.map((k) => ({ ...k, id: String(k.id).toLowerCase() })),
    toplam: Number(t.recordset[0]?.toplam || 0),
  }
}

/** Saklama süresi dolan kayıtları siler (başlangıçta ve günlük çalıştırılır). */
async function eskileriTemizle(gunSayisi) {
  const sinir = new Date(Date.now() - gunSayisi * 86_400_000).toISOString()
  try {
    const p = await havuzGetir()
    const r = await p.request()
      .input('s', sql.NVarChar(40), sinir)
      .query('DELETE FROM dbo.DenetimKaydi WHERE zaman < @s')
    if (r.rowsAffected[0] > 0) logla(`[DENETIM] ${r.rowsAffected[0]} eski kayıt temizlendi (>${gunSayisi} gün).`)
  } catch (e) {
    logla('[DENETIM] Temizlik başarısız:', e?.message || e)
  }
}

module.exports = { yaz, listele, eskileriTemizle, Eylem, Sonuc, istemciIp }
