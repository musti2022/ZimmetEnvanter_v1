// Kullanıcı yönetimi uçları — /api/kullanicilar
// Erişim: yalnızca ADMIN. Merkezi yetkiKapisi zaten KULLANICI_YONET izni arar;
// buradaki adminGerekli ikinci savunma katmanıdır (defense in depth).
const express = require('express')
const { asyncSar } = require('../common/async-handler')
const { adminGerekli } = require('../auth/auth.middleware')
const servis = require('./users.service')
const denetim = require('../audit/audit.service')

const router = express.Router()
router.use(adminGerekli)

router.get('/', asyncSar(async (req, res) => {
  const { arama = '', sayfa = 1, boyut = 50 } = req.query
  res.json(await servis.listele({ arama, sayfa, boyut }))
}))

router.get('/:id', asyncSar(async (req, res) => {
  res.json({ kullanici: await servis.detay(req.params.id) })
}))

// NOT: `rol` alanı BU uçta bilinçli olarak okunur. auth.middleware/istemciRolunuYokSay
// istekten `rol` alanını siler; buradaki `yeniRol`, silinmeden önce middleware tarafından
// req.rolTalebi'ne taşınan değerdir. Böylece "istemci kendi rolünü yükseltemez" kuralı
// korunurken, ADMIN başka bir kullanıcının rolünü atayabilir.
router.post('/', asyncSar(async (req, res) => {
  const kullanici = await servis.olustur({
    kullaniciAdi: req.body?.kullaniciAdi,
    parola: req.body?.parola,
    adSoyad: req.body?.adSoyad,
    eposta: req.body?.eposta,
    rol: req.rolTalebi,
    aktif: req.body?.aktif !== false,
  })
  await denetim.yaz({
    eylem: denetim.Eylem.USER_CREATED, req, kaynak: 'Kullanici', kaynakId: kullanici.id,
    detay: `kullaniciAdi=${kullanici.kullaniciAdi} rol=${kullanici.rol} sağlayıcı=LOCAL`,
  })
  res.status(201).json({ kullanici })
}))

router.put('/:id', asyncSar(async (req, res) => {
  const oncekiRol = (await servis.detay(req.params.id)).rol

  const kullanici = await servis.guncelle(req.params.id, {
    adSoyad: req.body?.adSoyad,
    eposta: req.body?.eposta,
    rol: req.rolTalebi,
    aktif: typeof req.body?.aktif === 'boolean' ? req.body.aktif : undefined,
  }, req.kullanici)

  await denetim.yaz({
    eylem: denetim.Eylem.USER_UPDATED, req, kaynak: 'Kullanici', kaynakId: kullanici.id,
    detay: `kullaniciAdi=${kullanici.kullaniciAdi} aktif=${kullanici.aktif}`,
  })
  if (kullanici.rol !== oncekiRol) {
    await denetim.yaz({
      eylem: denetim.Eylem.USER_ROLE_CHANGED, req, kaynak: 'Kullanici', kaynakId: kullanici.id,
      detay: `kullaniciAdi=${kullanici.kullaniciAdi} rol=${oncekiRol} → ${kullanici.rol}`,
    })
  }
  res.json({ kullanici })
}))

router.put('/:id/parola', asyncSar(async (req, res) => {
  const kullanici = await servis.parolaSifirla(req.params.id, req.body?.parola)
  await denetim.yaz({
    eylem: denetim.Eylem.USER_PASSWORD_RESET, req, kaynak: 'Kullanici', kaynakId: kullanici.id,
    detay: `kullaniciAdi=${kullanici.kullaniciAdi} — oturumları sonlandırıldı`,
  })
  res.json({ ok: true })
}))

router.delete('/:id', asyncSar(async (req, res) => {
  const kullanici = await servis.sil(req.params.id, req.kullanici)
  await denetim.yaz({
    eylem: denetim.Eylem.USER_DELETED, req, kaynak: 'Kullanici', kaynakId: kullanici.id,
    detay: `kullaniciAdi=${kullanici.kullaniciAdi}`,
  })
  res.json({ ok: true })
}))

module.exports = router
