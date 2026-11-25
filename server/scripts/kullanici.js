#!/usr/bin/env node
// Yerel kullanıcı yönetimi komut satırı aracı.
//
// NEDEN VAR: Kullanıcı yönetimi uçlarına yalnızca ADMIN erişir. İlk yönetici hesabını
// açmak için (henüz hiç ADMIN yokken) bu araç sunucu üzerinde ÇALIŞTIRILIR — hesabı açan
// kişinin zaten sunucuya ve veritabanına erişimi vardır, bu yüzden ek bir yetki
// yükselmesi oluşturmaz.
//
// Kullanım:
//   node server/scripts/kullanici.js liste
//   node server/scripts/kullanici.js ekle <kullaniciAdi> [--rol ADMIN|VIEWER] [--ad "Ad Soyad"] [--eposta a@b.c]
//   node server/scripts/kullanici.js rol <kullaniciAdi> <ADMIN|VIEWER>
//   node server/scripts/kullanici.js parola <kullaniciAdi>
//   node server/scripts/kullanici.js aktif|pasif <kullaniciAdi>
//   node server/scripts/kullanici.js sil <kullaniciAdi>
//
// Rol belirtilmezse VIEWER atanır (en az yetkili varsayılan).
// Parola komut satırından ALINMAZ (kabuk geçmişine ve süreç listesine düşerdi); gizli
// istemle sorulur veya boru ile beslenir.
require('../config/env')

const readline = require('node:readline')
const { semaKur } = require('../db')
const depo = require('../users/users.repository')
const servis = require('../users/users.service')
const parolaServisi = require('../auth/password.service')
const oturumServisi = require('../auth/session.service')
const { roleCevir } = require('../auth/roles')

function bayrak(argv, ad) {
  const i = argv.indexOf(`--${ad}`)
  return i !== -1 && i + 1 < argv.length ? argv[i + 1] : null
}

/**
 * Parolayı okur.
 *
 * Terminalde: yazılan karakterler ekranda GÖSTERİLMEZ (omuz üstünden okumaya karşı).
 * Boru/dosya ile beslendiğinde: satır olduğu gibi okunur — böylece kurulum betiklerinden
 * `printf 'parola\nparola\n' | npm run kullanici -- ekle ad` biçiminde çağrılabilir.
 * Parola yine komut satırına YAZILMAZ; kabuk geçmişine ve süreç listesine düşmez.
 */
// Boru ile beslenen girdi TEK SEFERDE okunur. İki ayrı readline arayüzünü aynı akış
// üzerinde sırayla açmak ilk arayüzün akışı tüketmesine ve ikincisinin boş dönmesine yol açar.
let boruSatirlari = null
async function boruylaGelenSatirlar() {
  if (boruSatirlari) return boruSatirlari
  const parcalar = []
  for await (const p of process.stdin) parcalar.push(p)
  boruSatirlari = Buffer.concat(parcalar).toString('utf8').split(/\r?\n/)
  return boruSatirlari
}

function gizliSor(soru) {
  if (!process.stdin.isTTY) {
    return boruylaGelenSatirlar().then((satirlar) => (satirlar.length ? satirlar.shift() : ''))
  }

  return new Promise((coz) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true })
    const cikti = process.stdout
    let ilk = true
    const yaz = rl._writeToOutput?.bind(rl)
    rl._writeToOutput = (metin) => {
      if (ilk) { cikti.write(soru); ilk = false; return }
      if (metin.includes('\n')) cikti.write('\n')
    }
    rl.question(soru, (cevap) => {
      rl._writeToOutput = yaz
      rl.close()
      coz(cevap)
    })
  })
}

async function parolaAl() {
  const p1 = await gizliSor('Yeni parola: ')
  const p2 = await gizliSor('Parola (tekrar): ')
  if (p1 !== p2) {
    console.error('\n✖ Parolalar eşleşmiyor.')
    process.exit(1)
  }
  try {
    parolaServisi.parolaPolitikasiDogrula(p1)
  } catch (e) {
    console.error(`\n✖ ${e.message}`)
    process.exit(1)
  }
  return p1
}

async function main() {
  const [, , komut, hedef, ...kalan] = process.argv
  const argv = [hedef, ...kalan]

  await semaKur()

  switch (komut) {
    case 'liste': {
      const { kayitlar, toplam } = await depo.listele({ boyut: 200 })
      if (!toplam) { console.log('Kayıtlı yerel kullanıcı yok.'); break }
      console.log(`\n${toplam} yerel kullanıcı:\n`)
      for (const k of kayitlar) {
        console.log(` ${k.aktif ? '●' : '○'} ${k.kullaniciAdi.padEnd(22)} ${k.rol.padEnd(8)} ${(k.adSoyad || '—').padEnd(26)} ${k.aktif ? 'aktif' : 'PASİF'}  son giriş: ${k.sonGiris || '—'}`)
      }
      console.log('')
      break
    }

    case 'ekle': {
      if (!hedef) { console.error('Kullanım: kullanici.js ekle <kullaniciAdi> [--rol ADMIN|VIEWER]'); process.exit(1) }
      const istenenRol = roleCevir(bayrak(argv, 'rol'))
      const parola = await parolaAl()
      const olusan = await servis.olustur({
        kullaniciAdi: hedef,
        parola,
        adSoyad: bayrak(argv, 'ad') || '',
        eposta: bayrak(argv, 'eposta') || '',
        rol: istenenRol,
      })
      console.log(`\n✔ "${olusan.kullaniciAdi}" eklendi (rol: ${olusan.rol}).`)
      break
    }

    case 'rol': {
      const yeniRol = kalan[0]
      if (!hedef || !yeniRol) { console.error('Kullanım: kullanici.js rol <kullaniciAdi> <ADMIN|VIEWER>'); process.exit(1) }
      if (!['ADMIN', 'VIEWER'].includes(String(yeniRol).toUpperCase())) {
        console.error('✖ Rol yalnızca ADMIN veya VIEWER olabilir.'); process.exit(1)
      }
      const kayit = await depo.kullaniciAdiIleBul(hedef)
      if (!kayit) { console.error(`✖ "${hedef}" bulunamadı.`); process.exit(1) }
      const guncel = await servis.guncelle(String(kayit.id).toLowerCase(), { rol: yeniRol })
      console.log(`✔ "${guncel.kullaniciAdi}" rolü: ${guncel.rol}. Açık oturumları kapatıldı.`)
      break
    }

    case 'parola': {
      if (!hedef) { console.error('Kullanım: kullanici.js parola <kullaniciAdi>'); process.exit(1) }
      const kayit = await depo.kullaniciAdiIleBul(hedef)
      if (!kayit) { console.error(`✖ "${hedef}" bulunamadı.`); process.exit(1) }
      const parola = await parolaAl()
      await depo.parolaGuncelle(kayit.id, await parolaServisi.ozetle(parola))
      const n = await oturumServisi.kullanicininOturumlariniKapat(kayit.kullaniciAdi)
      console.log(`\n✔ Parola güncellendi. ${n} açık oturum sonlandırıldı.`)
      break
    }

    case 'aktif':
    case 'pasif': {
      if (!hedef) { console.error(`Kullanım: kullanici.js ${komut} <kullaniciAdi>`); process.exit(1) }
      const kayit = await depo.kullaniciAdiIleBul(hedef)
      if (!kayit) { console.error(`✖ "${hedef}" bulunamadı.`); process.exit(1) }
      await servis.guncelle(String(kayit.id).toLowerCase(), { aktif: komut === 'aktif' })
      console.log(`✔ "${kayit.kullaniciAdi}" ${komut === 'aktif' ? 'aktifleştirildi' : 'pasifleştirildi'}.`)
      break
    }

    case 'sil': {
      if (!hedef) { console.error('Kullanım: kullanici.js sil <kullaniciAdi>'); process.exit(1) }
      const kayit = await depo.kullaniciAdiIleBul(hedef)
      if (!kayit) { console.error(`✖ "${hedef}" bulunamadı.`); process.exit(1) }
      await servis.sil(String(kayit.id).toLowerCase())
      console.log(`✔ "${kayit.kullaniciAdi}" silindi ve oturumları kapatıldı.`)
      break
    }

    default:
      console.log(`
Yerel kullanıcı yönetimi

  node server/scripts/kullanici.js liste
  node server/scripts/kullanici.js ekle <kullaniciAdi> [--rol ADMIN|VIEWER] [--ad "Ad Soyad"] [--eposta a@b.c]
  node server/scripts/kullanici.js rol <kullaniciAdi> <ADMIN|VIEWER>
  node server/scripts/kullanici.js parola <kullaniciAdi>
  node server/scripts/kullanici.js aktif|pasif <kullaniciAdi>
  node server/scripts/kullanici.js sil <kullaniciAdi>

Rol belirtilmezse VIEWER atanır.
`)
  }

  process.exit(0)
}

main().catch((e) => {
  console.error('\n✖ Hata:', e?.message || e)
  process.exit(1)
})
