import React, { useEffect, useRef, useState } from 'react'

/**
 * Dokunmatik/fare ile ıslak imza çizdiren küçük tuval bileşeni.
 * Çizim bittiğinde PNG dataURL'i onChange ile yukarı verir; "Temizle" ile sıfırlar.
 * value (dataURL) dışarıdan değişirse tuvale geri çizilir (kayıt yüklemede).
 */
export default function ImzaPad({ label, value, onChange }) {
  const canvasRef = useRef(null)
  const ctxRef = useRef(null)
  const ciziyor = useRef(false)
  const dolu = useRef(false) // bu oturumda en az bir çizgi çizildi mi
  const [bos, setBos] = useState(!value)

  // Tuvali yüksek DPI'a göre ölçekle ve kalemi ayarla
  useEffect(() => {
    const canvas = canvasRef.current
    const oran = window.devicePixelRatio || 1
    const g = canvas.clientWidth
    const y = canvas.clientHeight
    canvas.width = g * oran
    canvas.height = y * oran
    const ctx = canvas.getContext('2d')
    ctx.scale(oran, oran)
    ctx.lineWidth = 2
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = '#15306f'
    ctxRef.current = ctx
    // Dışarıdan gelen değeri (varsa) tuvale çiz
    if (value) {
      const img = new Image()
      img.onload = () => ctx.drawImage(img, 0, 0, g, y)
      img.src = value
      dolu.current = true
      setBos(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // value dışarıdan temizlenirse (örn. yeni form) tuvali boşalt
  useEffect(() => {
    if (!value && dolu.current) {
      temizle(true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  const konum = (e) => {
    const r = canvasRef.current.getBoundingClientRect()
    const t = e.touches ? e.touches[0] : e
    return { x: t.clientX - r.left, y: t.clientY - r.top }
  }

  const basla = (e) => {
    e.preventDefault()
    ciziyor.current = true
    const { x, y } = konum(e)
    const ctx = ctxRef.current
    ctx.beginPath()
    ctx.moveTo(x, y)
  }

  const ciz = (e) => {
    if (!ciziyor.current) return
    e.preventDefault()
    const { x, y } = konum(e)
    const ctx = ctxRef.current
    ctx.lineTo(x, y)
    ctx.stroke()
    dolu.current = true
    if (bos) setBos(false)
  }

  const bitir = () => {
    if (!ciziyor.current) return
    ciziyor.current = false
    if (dolu.current) onChange(canvasRef.current.toDataURL('image/png'))
  }

  const temizle = (sessiz = false) => {
    const canvas = canvasRef.current
    ctxRef.current.clearRect(0, 0, canvas.width, canvas.height)
    dolu.current = false
    setBos(true)
    if (!sessiz) onChange('')
  }

  return (
    <div className="imza-pad">
      <div className="imza-pad-ust">
        <span>{label}</span>
        <button type="button" className="imza-temizle" onClick={() => temizle()}>Temizle</button>
      </div>
      <div className="imza-tuval-sar">
        <canvas
          ref={canvasRef}
          className="imza-tuval"
          onMouseDown={basla}
          onMouseMove={ciz}
          onMouseUp={bitir}
          onMouseLeave={bitir}
          onTouchStart={basla}
          onTouchMove={ciz}
          onTouchEnd={bitir}
        />
        {bos && <span className="imza-ipucu">Buraya imzalayın</span>}
      </div>
    </div>
  )
}
