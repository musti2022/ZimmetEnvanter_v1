// Canlı güncelleme (Server-Sent Events): bir kullanıcı veri değiştirdiğinde açık olan tüm
// ekranlara "degisti" olayı gönderilir; istemci sessizce veriyi yeniden yükler.
// Olay içerik taşımaz (veri sızmaz); yalnızca "yenile" sinyalidir. Yetki her istemcinin
// kendi /api/tumu çağrısında yeniden uygulanır.
const istemciler = new Set()
let zamanlayici = null

function abone(req, res) {
  res.set({
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  })
  res.flushHeaders?.()
  res.write('retry: 3000\n\n')
  istemciler.add(res)
  const kalp = setInterval(() => res.write(': kalp\n\n'), 25_000) // vekiller bağlantıyı kesmesin
  req.on('close', () => { clearInterval(kalp); istemciler.delete(res) })
}

/** Değişikliği tüm açık ekranlara bildirir (art arda yazmalar tek olayda birleştirilir). */
function yayinla() {
  if (zamanlayici) return
  zamanlayici = setTimeout(() => {
    zamanlayici = null
    const veri = `event: degisti\ndata: ${Date.now()}\n\n`
    for (const res of istemciler) { try { res.write(veri) } catch { istemciler.delete(res) } }
  }, 300)
}

/** Başarılı her yazma isteğinden (GET/HEAD dışı, durum < 400) sonra yayın yapan ara katman. */
function yazmaSonrasiYayinla(req, res, next) {
  if (req.method !== 'GET' && req.method !== 'HEAD' && !req.path.startsWith('/auth')) {
    res.on('finish', () => { if (res.statusCode < 400) yayinla() })
  }
  next()
}

module.exports = { abone, yayinla, yazmaSonrasiYayinla, istemciSayisi: () => istemciler.size }
