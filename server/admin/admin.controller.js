// Yönetim / sistem durumu uçları — /api/yonetim (yalnızca ADMIN)
const express = require('express')
const { adminGerekli } = require('../auth/auth.middleware')
const { oturumAyar, hizSinirAyar } = require('../config/auth.config')
const { URETIM } = require('../config/env')

const router = express.Router()
router.use(adminGerekli)

router.get('/saglik', (req, res) => {
  res.json({
    uygulama: { uretim: URETIM, calismaSuresiSn: Math.round(process.uptime()), nodeSurumu: process.version },
  })
})

/** Etkin yapılandırma özeti. Parola/anahtar İÇERMEZ — yalnızca "tanımlı mı" bilgisi. */
router.get('/yapilandirma', (req, res) => {
  res.json({
    oturum: {
      bostaDakika: oturumAyar.bostaDakika,
      mutlakSaat: oturumAyar.mutlakSaat,
      guvenliCerez: oturumAyar.guvenliCerez,
      sameSite: oturumAyar.sameSite,
      vekileGuven: oturumAyar.vekileGuven,
    },
    girisSiniri: {
      enFazlaDeneme: hizSinirAyar.enFazlaDeneme,
      pencereDakika: hizSinirAyar.pencereDakika,
      ipCarpani: hizSinirAyar.ipCarpani,
    },
  })
})

module.exports = router
