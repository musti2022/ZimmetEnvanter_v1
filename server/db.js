// SQL Server bağlantı havuzu ve şema kurulumu.
// Windows kimlik doğrulama + msnodesqlv8 (ODBC) — TCP/port ayarı gerektirmez.
const sql = require('mssql/msnodesqlv8')

const SUNUCU = process.env.ZE_SQL_SERVER || '(local)\\SQLEXPRESS'
const VERITABANI = process.env.ZE_SQL_DB || 'ZimmetEnvanter'
const SURUCU = process.env.ZE_ODBC_DRIVER || 'ODBC Driver 17 for SQL Server'

// Şifreleme ayarları. Tanımsız bırakılırsa ODBC sürücüsünün kendi varsayılanı geçerlidir
// (Driver 17: şifresiz; Driver 18: şifreli + sertifika doğrulamalı). Bazı sunucular
// şifrelemeyi ZORUNLU tutar — o kurulumlarda ZE_SQL_ENCRYPT=yes gerekir.
//
// ⚠ ZE_SQL_TRUST_CERT=yes sunucu sertifikasının DOĞRULANMASINI KAPATIR. SQL Server
// kendinden imzalı sertifika kullanıyorsa bağlanmanın pratik yolu budur, ancak araya
// giren bir saldırgana karşı koruma kalkar. Yalnızca güvenilen iç ağda kullanın.
const SIFRELEME = process.env.ZE_SQL_ENCRYPT || ''
const SERTIFIKAYA_GUVEN = process.env.ZE_SQL_TRUST_CERT || ''

const evetHayir = (v) =>
  (['1', 'true', 'yes', 'evet'].includes(String(v).trim().toLowerCase()) ? 'yes' : 'no')

const baglantiDizesi = (db) => {
  const parcalar = [
    `Driver={${SURUCU}}`,
    `Server=${SUNUCU}`,
    `Database=${db}`,
    'Trusted_Connection=yes',
  ]
  if (SIFRELEME) parcalar.push(`Encrypt=${evetHayir(SIFRELEME)}`)
  if (SERTIFIKAYA_GUVEN) parcalar.push(`TrustServerCertificate=${evetHayir(SERTIFIKAYA_GUVEN)}`)
  return `${parcalar.join(';')};`
}

let havuz = null

/** Uygulama veritabanına bağlı havuzu döndürür (ilk çağrıda kurar, kopunca yeniden kurar). */
async function havuzGetir() {
  if (havuz?.connected) return havuz
  havuz = new sql.ConnectionPool({ connectionString: baglantiDizesi(VERITABANI) })
  // 'error' olayı dinlenmezse Node süreci çöker (örn. SQL bağlantısı beklenmedik kopunca).
  // Logla ve havuzu sıfırla; bir sonraki istek yeniden bağlanır.
  havuz.on('error', (e) => {
    console.error(new Date().toISOString(), '[DB] Havuz hatası, yeniden bağlanılacak:', e?.message || e)
    havuz = null
  })
  await havuz.connect()
  return havuz
}

/** Veritabanı yoksa oluşturur (master üzerinden), sonra tabloları kurar. */
async function semaKur() {
  // 1) Veritabanını garanti et
  const master = new sql.ConnectionPool({ connectionString: baglantiDizesi('master') })
  await master.connect()
  await master.request().query(`
    IF DB_ID(N'${VERITABANI}') IS NULL CREATE DATABASE [${VERITABANI}];
  `)
  // Zamanlanmış görev SYSTEM olarak çalışacağı için sunucu düzeyinde login garanti edilir
  await master.request().query(`
    IF NOT EXISTS (SELECT 1 FROM sys.server_principals WHERE name = N'NT AUTHORITY\\SYSTEM')
      CREATE LOGIN [NT AUTHORITY\\SYSTEM] FROM WINDOWS;
  `)
  await master.close()

  // 2) Tablolar ve SYSTEM kullanıcı yetkisi
  const p = await havuzGetir()
  await p.request().batch(`
    IF OBJECT_ID(N'dbo.Urunler') IS NULL
    CREATE TABLE dbo.Urunler (
      id UNIQUEIDENTIFIER NOT NULL PRIMARY KEY,
      ad NVARCHAR(200) NOT NULL,
      kategori NVARCHAR(100) NULL,
      markaModel NVARCHAR(150) NULL,
      seriNo NVARCHAR(100) NULL,
      barkod NVARCHAR(100) NULL,
      birim NVARCHAR(20) NULL,
      konum NVARCHAR(150) NULL,
      stok INT NOT NULL DEFAULT 0,
      minStok INT NOT NULL DEFAULT 0,
      aciklama NVARCHAR(500) NULL,
      olusturma NVARCHAR(40) NULL
    );

    IF OBJECT_ID(N'dbo.ZimmetBelgeleri') IS NULL
    CREATE TABLE dbo.ZimmetBelgeleri (
      id UNIQUEIDENTIFIER NOT NULL PRIMARY KEY,
      belgeNo NVARCHAR(30) NOT NULL UNIQUE,
      teslimTarihi NVARCHAR(10) NOT NULL,
      adSoyad NVARCHAR(150) NULL,
      gorev NVARCHAR(150) NULL,
      bolum NVARCHAR(150) NULL,
      teslimAlan NVARCHAR(150) NULL,
      teslimEden NVARCHAR(150) NULL,
      onay NVARCHAR(150) NULL,
      imzaAlan NVARCHAR(MAX) NULL,
      imzaEden NVARCHAR(MAX) NULL,
      imzaOnay NVARCHAR(MAX) NULL,
      olusturma NVARCHAR(40) NULL,
      guncelleme NVARCHAR(40) NULL
    );

    IF OBJECT_ID(N'dbo.BelgeKalemleri') IS NULL
    CREATE TABLE dbo.BelgeKalemleri (
      id UNIQUEIDENTIFIER NOT NULL PRIMARY KEY,
      belgeId UNIQUEIDENTIFIER NOT NULL
        REFERENCES dbo.ZimmetBelgeleri(id) ON DELETE CASCADE,
      urunId UNIQUEIDENTIFIER NULL,
      adet INT NOT NULL DEFAULT 1,
      iadeTarihi NVARCHAR(10) NULL,
      aciklama NVARCHAR(500) NULL,
      durum NVARCHAR(10) NOT NULL DEFAULT 'zimmetli',
      sira INT NOT NULL DEFAULT 0
    );

    IF OBJECT_ID(N'dbo.Hareketler') IS NULL
    CREATE TABLE dbo.Hareketler (
      id UNIQUEIDENTIFIER NOT NULL PRIMARY KEY,
      urunId UNIQUEIDENTIFIER NULL,
      tip NVARCHAR(10) NOT NULL,
      adet INT NOT NULL DEFAULT 0,
      tarih NVARCHAR(10) NULL,
      aciklama NVARCHAR(500) NULL,
      olusturma NVARCHAR(40) NULL
    );

    IF OBJECT_ID(N'dbo.Ayarlar') IS NULL
    CREATE TABLE dbo.Ayarlar (
      anahtar NVARCHAR(50) NOT NULL PRIMARY KEY,
      deger NVARCHAR(MAX) NULL
    );

    IF OBJECT_ID(N'dbo.UrunListesi') IS NULL
    CREATE TABLE dbo.UrunListesi (
      id UNIQUEIDENTIFIER NOT NULL PRIMARY KEY,
      ad NVARCHAR(200) NOT NULL UNIQUE,
      olusturma NVARCHAR(40) NULL
    );

    IF OBJECT_ID(N'dbo.KonumListesi') IS NULL
    CREATE TABLE dbo.KonumListesi (
      id UNIQUEIDENTIFIER NOT NULL PRIMARY KEY,
      ad NVARCHAR(200) NOT NULL UNIQUE,
      olusturma NVARCHAR(40) NULL
    );

    IF OBJECT_ID(N'dbo.KategoriListesi') IS NULL
    CREATE TABLE dbo.KategoriListesi (
      id UNIQUEIDENTIFIER NOT NULL PRIMARY KEY,
      ad NVARCHAR(200) NOT NULL UNIQUE,
      olusturma NVARCHAR(40) NULL
    );

    IF OBJECT_ID(N'dbo.MarkaListesi') IS NULL
    CREATE TABLE dbo.MarkaListesi (
      id UNIQUEIDENTIFIER NOT NULL PRIMARY KEY,
      ad NVARCHAR(200) NOT NULL UNIQUE,
      olusturma NVARCHAR(40) NULL
    );

    IF OBJECT_ID(N'dbo.PersonelListesi') IS NULL
    CREATE TABLE dbo.PersonelListesi (
      id UNIQUEIDENTIFIER NOT NULL PRIMARY KEY,
      adSoyad NVARCHAR(200) NOT NULL UNIQUE,
      bolum NVARCHAR(200) NULL,
      gorev NVARCHAR(200) NULL,
      olusturma NVARCHAR(40) NULL
    );

    IF OBJECT_ID(N'dbo.CepTelefonuKayitlari') IS NULL
    CREATE TABLE dbo.CepTelefonuKayitlari (
      id UNIQUEIDENTIFIER NOT NULL PRIMARY KEY,
      adSoyad NVARCHAR(200) NULL,
      imei NVARCHAR(50) NULL,
      seriNo NVARCHAR(100) NULL,
      markaModel NVARCHAR(150) NULL,
      hatNo NVARCHAR(50) NULL,
      tarih NVARCHAR(10) NULL,
      teslimEden NVARCHAR(150) NULL,
      teslimAlan NVARCHAR(150) NULL,
      olusturma NVARCHAR(40) NULL,
      guncelleme NVARCHAR(40) NULL
    );

    -- Cep telefonu Marka/Model listesi: envanterin MarkaListesi'nden ayrı. İlk kurulumda
    -- mevcut cep kayıtlarında kullanılmış marka/modellerle doldurulur.
    IF OBJECT_ID(N'dbo.CepMarkaListesi') IS NULL
    BEGIN
      CREATE TABLE dbo.CepMarkaListesi (
        id UNIQUEIDENTIFIER NOT NULL PRIMARY KEY,
        ad NVARCHAR(200) NOT NULL UNIQUE,
        olusturma NVARCHAR(40) NULL
      );
      EXEC(N'INSERT INTO dbo.CepMarkaListesi (id, ad, olusturma)
            SELECT NEWID(), m, CONVERT(NVARCHAR(40), SYSUTCDATETIME(), 127)
            FROM (SELECT DISTINCT LTRIM(RTRIM(markaModel)) AS m FROM dbo.CepTelefonuKayitlari
                  WHERE LTRIM(RTRIM(ISNULL(markaModel, N''''))) <> N'''') x');
    END

    IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name = N'NT AUTHORITY\\SYSTEM')
      CREATE USER [NT AUTHORITY\\SYSTEM] FOR LOGIN [NT AUTHORITY\\SYSTEM];
    ALTER ROLE db_owner ADD MEMBER [NT AUTHORITY\\SYSTEM];
  `)

  await kimlikSemasiKur(p)
}

/**
 * Kimlik doğrulama / yetkilendirme tabloları.
 *
 * ROL SÜTUNU: yerel hesabın rolü (ADMIN | VIEWER) burada tutulur. Sütun CHECK kısıtı ile
 * yalnızca bu iki değeri kabul eder; varsayılan VIEWER'dır — yani yeni bir satır yanlışlıkla
 * eklenirse yetkisiz değil, EN AZ yetkili olur.
 */
async function kimlikSemasiKur(p) {
  await p.request().batch(`
    -- Yerel kullanıcılar. Parola YALNIZCA Argon2id özeti olarak tutulur.
    IF OBJECT_ID(N'dbo.Kullanicilar') IS NULL
    CREATE TABLE dbo.Kullanicilar (
      id UNIQUEIDENTIFIER NOT NULL PRIMARY KEY,
      kullaniciAdi NVARCHAR(64) NOT NULL UNIQUE,
      parolaHash NVARCHAR(255) NOT NULL,
      adSoyad NVARCHAR(150) NULL,
      eposta NVARCHAR(200) NULL,
      rol NVARCHAR(20) NOT NULL DEFAULT 'VIEWER',
      aktif BIT NOT NULL DEFAULT 1,
      olusturma NVARCHAR(40) NULL,
      guncelleme NVARCHAR(40) NULL,
      sonGiris NVARCHAR(40) NULL
    );

    -- Sunucu tarafı oturumlar. id = oturum çerezinin SHA-256 ÖZETİ (çerezin kendisi değil):
    -- veritabanını okuyan biri kullanılabilir oturum kimliği elde edemez.
    IF OBJECT_ID(N'dbo.Oturumlar') IS NULL
    CREATE TABLE dbo.Oturumlar (
      id NVARCHAR(64) NOT NULL PRIMARY KEY,
      veri NVARCHAR(MAX) NOT NULL,
      kullaniciAdi NVARCHAR(100) NULL,
      olusturma NVARCHAR(40) NULL,
      sonErisim NVARCHAR(40) NULL,
      bitis NVARCHAR(40) NOT NULL
    );
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Oturumlar_bitis')
      CREATE INDEX IX_Oturumlar_bitis ON dbo.Oturumlar (bitis);
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Oturumlar_kullanici')
      CREATE INDEX IX_Oturumlar_kullanici ON dbo.Oturumlar (kullaniciAdi);

    -- Denetim günlüğü. Parola / token / anahtar ASLA yazılmaz (bkz. audit.service).
    IF OBJECT_ID(N'dbo.DenetimKaydi') IS NULL
    CREATE TABLE dbo.DenetimKaydi (
      id UNIQUEIDENTIFIER NOT NULL PRIMARY KEY,
      zaman NVARCHAR(40) NOT NULL,
      kullaniciAdi NVARCHAR(100) NULL,
      rol NVARCHAR(20) NULL,
      saglayici NVARCHAR(30) NULL,
      eylem NVARCHAR(50) NOT NULL,
      kaynak NVARCHAR(50) NULL,
      kaynakId NVARCHAR(100) NULL,
      sonuc NVARCHAR(20) NULL,
      ip NVARCHAR(64) NULL,
      userAgent NVARCHAR(300) NULL,
      detay NVARCHAR(1000) NULL
    );
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_DenetimKaydi_zaman')
      CREATE INDEX IX_DenetimKaydi_zaman ON dbo.DenetimKaydi (zaman DESC);
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_DenetimKaydi_eylem')
      CREATE INDEX IX_DenetimKaydi_eylem ON dbo.DenetimKaydi (eylem, zaman DESC);

    -- Giriş hız sınırı sayaçları (kullanıcı adı ve IP için ayrı satırlar).
    IF OBJECT_ID(N'dbo.GirisDenemeleri') IS NULL
    CREATE TABLE dbo.GirisDenemeleri (
      anahtar NVARCHAR(200) NOT NULL PRIMARY KEY,
      sayac INT NOT NULL DEFAULT 0,
      pencereBaslangic NVARCHAR(40) NOT NULL,
      sonDeneme NVARCHAR(40) NULL
    );
  `)

  // Rol sütunu sonradan eklendi — daha önce kurulmuş veritabanlarına taşı.
  // ALTER ile eklenen sütun aynı toplu iş (batch) içinde görünmediğinden CHECK kısıtı
  // ayrı bir çağrıda eklenir.
  await p.request().batch(`
    IF COL_LENGTH(N'dbo.Kullanicilar', 'rol') IS NULL
      ALTER TABLE dbo.Kullanicilar
        ADD rol NVARCHAR(20) NOT NULL CONSTRAINT DF_Kullanicilar_rol DEFAULT 'VIEWER';
  `)
  // Cep telefonu kaydına zimmet durumu (zimmetli / iade) ve iade tarihi sonradan eklendi.
  await p.request().batch(`
    IF COL_LENGTH(N'dbo.CepTelefonuKayitlari', 'durum') IS NULL
      ALTER TABLE dbo.CepTelefonuKayitlari
        ADD durum NVARCHAR(10) NOT NULL CONSTRAINT DF_CepTelefonuKayitlari_durum DEFAULT 'zimmetli';
    IF COL_LENGTH(N'dbo.CepTelefonuKayitlari', 'iadeTarihi') IS NULL
      ALTER TABLE dbo.CepTelefonuKayitlari ADD iadeTarihi NVARCHAR(10) NULL;
  `)
  // Cihazın çalışma durumu (Çalışır / Arızalı) sonradan eklendi.
  await p.request().batch(`
    IF COL_LENGTH(N'dbo.Urunler', 'calismaDurumu') IS NULL
      ALTER TABLE dbo.Urunler
        ADD calismaDurumu NVARCHAR(10) NOT NULL CONSTRAINT DF_Urunler_calismaDurumu DEFAULT 'calisir';
  `)
  // Cep telefonu zimmet geçmişi: her iade edilen zimmet dönemi (kimde, ne zamandan ne zamana)
  // burada saklanır; zimmet ve iade tutanakları bu satırlardan yeniden üretilebilir.
  // Ana listede yalnızca güncel kayıt görünür. Eski "iade" durumlu kayıtlar bir kez buraya aktarılır.
  await p.request().batch(`
    IF OBJECT_ID(N'dbo.CepZimmetGecmisi') IS NULL
    BEGIN
      CREATE TABLE dbo.CepZimmetGecmisi (
        id UNIQUEIDENTIFIER NOT NULL PRIMARY KEY,
        cepId UNIQUEIDENTIFIER NOT NULL,
        adSoyad NVARCHAR(200) NULL,
        imei NVARCHAR(50) NULL,
        seriNo NVARCHAR(100) NULL,
        markaModel NVARCHAR(150) NULL,
        hatNo NVARCHAR(50) NULL,
        tarih NVARCHAR(10) NULL,
        teslimEden NVARCHAR(150) NULL,
        teslimAlan NVARCHAR(150) NULL,
        iadeTarihi NVARCHAR(10) NULL,
        iadeTeslimAlan NVARCHAR(150) NULL,
        olusturma NVARCHAR(40) NULL
      );
      CREATE INDEX IX_CepZimmetGecmisi_cepId ON dbo.CepZimmetGecmisi (cepId);
      INSERT INTO dbo.CepZimmetGecmisi
        (id, cepId, adSoyad, imei, seriNo, markaModel, hatNo, tarih, teslimEden, teslimAlan, iadeTarihi, iadeTeslimAlan, olusturma)
      SELECT NEWID(), id, adSoyad, imei, seriNo, markaModel, hatNo, tarih, teslimEden, teslimAlan, iadeTarihi, NULL, guncelleme
      FROM dbo.CepTelefonuKayitlari WHERE durum = 'iade';
    END
  `)
  await p.request().batch(`
    IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_Kullanicilar_rol')
      ALTER TABLE dbo.Kullanicilar
        ADD CONSTRAINT CK_Kullanicilar_rol CHECK (rol IN ('ADMIN', 'VIEWER'));
  `)
}

/** Yeni istek nesnesi (isteğe bağlı transaction ile). */
function istek(tx) {
  return tx ? new sql.Request(tx) : havuz.request()
}

/** Transaction açar, işlevi çalıştırır; hata olursa geri alır. */
async function transactionIcinde(fn) {
  const p = await havuzGetir()
  const tx = new sql.Transaction(p)
  await tx.begin()
  try {
    const sonuc = await fn(tx)
    await tx.commit()
    return sonuc
  } catch (e) {
    try { await tx.rollback() } catch { /* zaten kapanmış olabilir */ }
    throw e
  }
}

module.exports = { sql, havuzGetir, semaKur, kimlikSemasiKur, istek, transactionIcinde, VERITABANI }
