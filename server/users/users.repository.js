// dbo.Kullanicilar veri erişimi.
// TÜM sorgular parametreli (mssql .input) — dize birleştirmeyle SQL kurulmaz (SQL Injection).
const crypto = require('node:crypto')
const { sql, havuzGetir, istek } = require('../db')
const { roleCevir, Rol } = require('../auth/roles')

const simdi = () => new Date().toISOString()
const kucukId = (v) => (v ? String(v).toLowerCase() : v)

/**
 * Kullanıcı adı normalizasyonu — arama ve benzersizlik için tek biçim.
 * NFKC + küçük harf: görsel olarak aynı ama farklı kodlanmış adların ayrı hesap açmasını önler.
 */
function kullaniciAdiNormalize(ham) {
  return String(ham == null ? '' : ham).normalize('NFKC').trim().toLowerCase()
}

/** Parola özeti HARİÇ, dışarı verilebilir kullanıcı görünümü. */
function kullaniciGorunumu(r) {
  if (!r) return null
  return {
    id: kucukId(r.id),
    kullaniciAdi: r.kullaniciAdi,
    adSoyad: r.adSoyad || '',
    eposta: r.eposta || '',
    rol: roleCevir(r.rol),
    aktif: Boolean(r.aktif),
    olusturma: r.olusturma || '',
    guncelleme: r.guncelleme || '',
    sonGiris: r.sonGiris || '',
  }
}

/** Kimlik doğrulama için özet DAHİL kayıt. Yalnızca local-auth.service kullanır. */
async function kullaniciAdiIleBul(kullaniciAdi) {
  const p = await havuzGetir()
  const r = await p.request()
    .input('k', sql.NVarChar(64), kullaniciAdiNormalize(kullaniciAdi))
    .query('SELECT TOP 1 * FROM dbo.Kullanicilar WHERE kullaniciAdi = @k')
  return r.recordset[0] || null
}

async function idIleBul(id) {
  const p = await havuzGetir()
  const r = await p.request()
    .input('id', sql.UniqueIdentifier, id)
    .query('SELECT TOP 1 * FROM dbo.Kullanicilar WHERE id = @id')
  return kullaniciGorunumu(r.recordset[0])
}

async function listele({ arama = '', sayfa = 1, boyut = 50 } = {}) {
  const p = await havuzGetir()
  const atla = Math.max(0, (Number(sayfa) || 1) - 1) * Math.min(200, Math.max(1, Number(boyut) || 50))
  const limit = Math.min(200, Math.max(1, Number(boyut) || 50))
  const q = String(arama || '').trim()

  const r = await p.request()
    .input('q', sql.NVarChar(200), q ? `%${q}%` : null)
    .input('atla', sql.Int, atla)
    .input('limit', sql.Int, limit)
    .query(`
      SELECT * FROM dbo.Kullanicilar
      WHERE (@q IS NULL OR kullaniciAdi LIKE @q OR adSoyad LIKE @q OR eposta LIKE @q)
      ORDER BY kullaniciAdi
      OFFSET @atla ROWS FETCH NEXT @limit ROWS ONLY`)

  const t = await p.request()
    .input('q', sql.NVarChar(200), q ? `%${q}%` : null)
    .query(`SELECT COUNT(*) AS toplam FROM dbo.Kullanicilar
            WHERE (@q IS NULL OR kullaniciAdi LIKE @q OR adSoyad LIKE @q OR eposta LIKE @q)`)

  return { kayitlar: r.recordset.map(kullaniciGorunumu), toplam: Number(t.recordset[0]?.toplam || 0) }
}

async function olustur({ kullaniciAdi, parolaHash, adSoyad, eposta, rol, aktif = true }) {
  const p = await havuzGetir()
  const id = crypto.randomUUID()
  await p.request()
    .input('id', sql.UniqueIdentifier, id)
    .input('k', sql.NVarChar(64), kullaniciAdiNormalize(kullaniciAdi))
    .input('h', sql.NVarChar(255), parolaHash)
    .input('ad', sql.NVarChar(150), adSoyad || '')
    .input('e', sql.NVarChar(200), eposta || '')
    .input('rol', sql.NVarChar(20), roleCevir(rol)) // tanınmayan değer → VIEWER
    .input('aktif', sql.Bit, aktif ? 1 : 0)
    .input('o', sql.NVarChar(40), simdi())
    .query(`INSERT INTO dbo.Kullanicilar (id, kullaniciAdi, parolaHash, adSoyad, eposta, rol, aktif, olusturma, guncelleme)
            VALUES (@id, @k, @h, @ad, @e, @rol, @aktif, @o, @o)`)
  return idIleBul(id)
}

async function guncelle(id, { adSoyad, eposta, rol, aktif }) {
  const p = await havuzGetir()
  await p.request()
    .input('id', sql.UniqueIdentifier, id)
    .input('ad', sql.NVarChar(150), adSoyad == null ? null : String(adSoyad))
    .input('e', sql.NVarChar(200), eposta == null ? null : String(eposta))
    .input('rol', sql.NVarChar(20), rol == null ? null : roleCevir(rol))
    .input('aktif', sql.Bit, aktif == null ? null : (aktif ? 1 : 0))
    .input('g', sql.NVarChar(40), simdi())
    .query(`UPDATE dbo.Kullanicilar
            SET adSoyad = ISNULL(@ad, adSoyad),
                eposta  = ISNULL(@e, eposta),
                rol     = ISNULL(@rol, rol),
                aktif   = ISNULL(@aktif, aktif),
                guncelleme = @g
            WHERE id = @id`)
  return idIleBul(id)
}

/** Aktif ADMIN rolündeki yerel hesap sayısı — son yöneticinin kilitlenmesini önlemek için. */
async function aktifAdminSayisi() {
  const p = await havuzGetir()
  const r = await p.request()
    .input('rol', sql.NVarChar(20), Rol.ADMIN)
    .query('SELECT COUNT(*) AS n FROM dbo.Kullanicilar WHERE rol = @rol AND aktif = 1')
  return Number(r.recordset[0]?.n || 0)
}

async function parolaGuncelle(id, parolaHash) {
  const p = await havuzGetir()
  await p.request()
    .input('id', sql.UniqueIdentifier, id)
    .input('h', sql.NVarChar(255), parolaHash)
    .input('g', sql.NVarChar(40), simdi())
    .query('UPDATE dbo.Kullanicilar SET parolaHash = @h, guncelleme = @g WHERE id = @id')
}

async function sonGirisIsaretle(id) {
  const p = await havuzGetir()
  await p.request()
    .input('id', sql.UniqueIdentifier, id)
    .input('t', sql.NVarChar(40), simdi())
    .query('UPDATE dbo.Kullanicilar SET sonGiris = @t WHERE id = @id')
}

async function sil(id) {
  const p = await havuzGetir()
  const r = await p.request()
    .input('id', sql.UniqueIdentifier, id)
    .query('DELETE FROM dbo.Kullanicilar WHERE id = @id')
  return r.rowsAffected[0] > 0
}

async function sayisi() {
  const p = await havuzGetir()
  const r = await p.request().query('SELECT COUNT(*) AS n FROM dbo.Kullanicilar')
  return Number(r.recordset[0]?.n || 0)
}

module.exports = {
  kullaniciAdiNormalize,
  kullaniciGorunumu,
  kullaniciAdiIleBul,
  idIleBul,
  listele,
  olustur,
  guncelle,
  parolaGuncelle,
  sonGirisIsaretle,
  sil,
  sayisi,
  aktifAdminSayisi,
  istek,
}
