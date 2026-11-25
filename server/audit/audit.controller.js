// Denetim günlüğü uçları — /api/loglar (yalnızca ADMIN)
const express = require('express')
const { asyncSar } = require('../common/async-handler')
const { adminGerekli } = require('../auth/auth.middleware')
const servis = require('./audit.service')

const router = express.Router()
router.use(adminGerekli)

router.get('/', asyncSar(async (req, res) => {
  const { eylem = '', kullaniciAdi = '', ara = '', baslangic = '', bitis = '', sayfa = 1, boyut = 100 } = req.query
  res.json(await servis.listele({ eylem, kullaniciAdi, ara, baslangic, bitis, sayfa, boyut }))
}))

/** Filtre açılır listesi için eylem tipleri. */
router.get('/eylemler', (req, res) => {
  res.json({ eylemler: Object.values(servis.Eylem) })
})

module.exports = router
