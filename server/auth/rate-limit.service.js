// Giriş denemesi hız sınırlama — kaba kuvvet (brute force) ve kimlik bilgisi doldurma
// (credential stuffing) saldırılarına karşı.
//
// İKİ AYRI SAYAÇ:
//   kul:<kullaniciAdi>  → tek hesaba yönelik parola denemeleri
//   ip:<istemciIp>      → tek kaynaktan çok sayıda FARKLI hesaba yapılan denemeler
//
// Başarılı girişte YALNIZCA kullanıcı sayacı sıfırlanır. IP sayacı korunur: aksi hâlde
// elinde bir geçerli hesap bulunan saldırgan, her başarılı girişle IP sayacını sıfırlayıp
// diğer hesaplara sınırsız deneme yapabilirdi.
//
// Sayaçlar SQL'de tutulur → süreç yeniden başlasa da sınır korunur.
const { sql, havuzGetir } = require('../db')
const { hizSinirAyar } = require('../config/auth.config')
const { logla } = require('../common/logger')

const simdi = () => new Date().toISOString()

function pencereBasi(dakika) {
  return new Date(Date.now() - dakika * 60_000).toISOString()
}

/**
 * Anahtarın mevcut pencere içindeki başarısız deneme sayısını döndürür.
 * Pencere dışındaki kayıtlar geçersiz sayılır (kayıt silinmez; sonraki yazımda sıfırlanır).
 */
async function sayacOku(anahtar) {
  const p = await havuzGetir()
  const r = await p.request()
    .input('a', sql.NVarChar(200), anahtar)
    .input('pb', sql.NVarChar(40), pencereBasi(hizSinirAyar.pencereDakika))
    .query(`SELECT sayac, pencereBaslangic FROM dbo.GirisDenemeleri
            WHERE anahtar = @a AND pencereBaslangic >= @pb`)
  const k = r.recordset[0]
  return k ? { sayac: Number(k.sayac || 0), pencereBaslangic: k.pencereBaslangic } : { sayac: 0, pencereBaslangic: null }
}

/** Başarısız denemeyi işler; pencere dolmuşsa sayacı sıfırdan başlatır. */
async function basarisizArtir(anahtar) {
  const p = await havuzGetir()
  const r = await p.request()
    .input('a', sql.NVarChar(200), anahtar)
    .input('pb', sql.NVarChar(40), pencereBasi(hizSinirAyar.pencereDakika))
    .input('simdi', sql.NVarChar(40), simdi())
    // SQL Server bir MERGE içinde yalnızca TEK bir "WHEN MATCHED ... UPDATE" kabul eder;
    // pencere devam ediyor mu / sıfırlanmalı mı ayrımı bu yüzden CASE ile yapılır.
    .query(`
      MERGE dbo.GirisDenemeleri WITH (HOLDLOCK) AS h
      USING (SELECT @a AS anahtar) AS k ON h.anahtar = k.anahtar
      WHEN MATCHED THEN UPDATE SET
        sayac = CASE WHEN h.pencereBaslangic >= @pb THEN h.sayac + 1 ELSE 1 END,
        pencereBaslangic = CASE WHEN h.pencereBaslangic >= @pb THEN h.pencereBaslangic ELSE @simdi END,
        sonDeneme = @simdi
      WHEN NOT MATCHED THEN
        INSERT (anahtar, sayac, pencereBaslangic, sonDeneme) VALUES (@a, 1, @simdi, @simdi)
      OUTPUT inserted.sayac AS sayac, inserted.pencereBaslangic AS pencereBaslangic;`)
  const k = r.recordset[0]
  return { sayac: Number(k?.sayac || 1), pencereBaslangic: k?.pencereBaslangic || simdi() }
}

async function sifirla(anahtar) {
  const p = await havuzGetir()
  await p.request()
    .input('a', sql.NVarChar(200), anahtar)
    .query('DELETE FROM dbo.GirisDenemeleri WHERE anahtar = @a')
}

function kalanSaniye(pencereBaslangic) {
  if (!pencereBaslangic) return hizSinirAyar.pencereDakika * 60
  const bitis = new Date(pencereBaslangic).getTime() + hizSinirAyar.pencereDakika * 60_000
  return Math.max(1, Math.ceil((bitis - Date.now()) / 1000))
}

/**
 * Giriş denemesinden ÖNCE çağrılır.
 * @returns {{engelli: boolean, kalanSaniye?: number, sebep?: string}}
 */
async function girisKontrol(kullaniciAdi, ip) {
  const kulAnahtar = `kul:${kullaniciAdi}`
  const ipAnahtar = `ip:${ip}`
  const ipSiniri = hizSinirAyar.enFazlaDeneme * hizSinirAyar.ipCarpani

  try {
    const [kul, ipl] = await Promise.all([sayacOku(kulAnahtar), sayacOku(ipAnahtar)])
    if (kul.sayac >= hizSinirAyar.enFazlaDeneme) {
      return { engelli: true, kalanSaniye: kalanSaniye(kul.pencereBaslangic), sebep: `kullanıcı sayacı ${kul.sayac}/${hizSinirAyar.enFazlaDeneme}` }
    }
    if (ipl.sayac >= ipSiniri) {
      return { engelli: true, kalanSaniye: kalanSaniye(ipl.pencereBaslangic), sebep: `IP sayacı ${ipl.sayac}/${ipSiniri}` }
    }
    return { engelli: false }
  } catch (e) {
    // Sayaç okunamıyorsa (veritabanı sorunu) girişi engelleme — ama uyar.
    // Kimlik doğrulaması yine de yapılacağı için bu, açık bir kapı değil yalnızca sınır kaybıdır.
    logla('[HIZSINIR] Sayaç okunamadı:', e?.message || e)
    return { engelli: false }
  }
}

async function basarisizKaydet(kullaniciAdi, ip) {
  try {
    await Promise.all([basarisizArtir(`kul:${kullaniciAdi}`), basarisizArtir(`ip:${ip}`)])
  } catch (e) {
    logla('[HIZSINIR] Başarısız deneme kaydedilemedi:', e?.message || e)
  }
}

async function basariliKaydet(kullaniciAdi) {
  try {
    await sifirla(`kul:${kullaniciAdi}`)
  } catch (e) {
    logla('[HIZSINIR] Sayaç sıfırlanamadı:', e?.message || e)
  }
}

/** Penceresi dolmuş kayıtları siler (periyodik bakım). */
async function eskileriTemizle() {
  try {
    const p = await havuzGetir()
    await p.request()
      .input('pb', sql.NVarChar(40), pencereBasi(hizSinirAyar.pencereDakika * 4))
      .query('DELETE FROM dbo.GirisDenemeleri WHERE pencereBaslangic < @pb')
  } catch (e) {
    logla('[HIZSINIR] Temizlik başarısız:', e?.message || e)
  }
}

module.exports = { girisKontrol, basarisizKaydet, basariliKaydet, eskileriTemizle }
