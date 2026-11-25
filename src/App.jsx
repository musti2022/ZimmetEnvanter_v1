import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import jsPDF from 'jspdf'
import html2canvas from 'html2canvas'
import * as XLSX from 'xlsx'
import UrunDetay from './UrunDetay.jsx'
import KisiDetay from './KisiDetay.jsx'
import ZimmetForm, { Field } from './ZimmetForm.jsx'
import ZimmetKart from './ZimmetKart.jsx'
import Forbidden from './pages/Forbidden.jsx'
import KullaniciYonetimi from './pages/KullaniciYonetimi.jsx'
import DenetimGunlugu from './pages/DenetimGunlugu.jsx'
import YonetimAyarlari from './pages/YonetimAyarlari.jsx'
import { useAuth } from './auth/AuthContext.jsx'
import { Izin, VARSAYILAN_YOL, YOLLAR, yoluBul } from './auth/izinler.js'
import CepTelefonuKart from './CepTelefonuKart.jsx'
import CepDetay from './CepDetay.jsx'
import CepIadeKart from './CepIadeKart.jsx'
import BelgeDetay from './BelgeDetay.jsx'
import ZimmetIadeKart from './ZimmetIadeKart.jsx'
import BarkodAlan from './BarkodAlan.jsx'
import { excelRaporIndir } from './rapor.js'
import { epostaGonder, epostaHazir, bosEpostaAyar, alicilar } from './eposta.js'
import { api } from './api.js'
import {
  dosyaSistemiDestekli,
  kayitKlasoruGetir,
  kayitKlasoruVarsa,
  mevcutKlasorAdi,
  blobYaz,
  dosyaSil,
  dosyaAdiTemizle,
  CEP_KLASORU,
} from './dosyaKaydet.js'
import {
  URUN_KEY, BELGE_KEY, HAREKET_KEY,
  BIRIMLER, HAREKET_ETIKET,
  bugun, trTarih, tarihYMD, norm, isoTarih,
  bosUrun, bosPersonel, bosCepKayit, bosZimmetBelge, bosKalem, depodanOku, yeniId,
} from './yardimci.js'

const MIN_SATIR = 8 // tabloda görünmesi gereken en az satır (şablona uygun)
const SERI_ALAN_SINIRI = 100 // yeni üründe bu adede kadar her adet için ayrı seri no alanı gösterilir

export default function App() {
  // Aktif sekme URL'den türetilir; sekme değiştirmek gezinmedir (geri/ileri ve yer imi çalışır).
  const konum = useLocation()
  const navigate = useNavigate()
  const { kullanici, izinVar, adminMi, cikisYap } = useAuth()

  const aktifYol = yoluBul(konum.pathname)
  const sekme = aktifYol?.sekme || 'ozet'
  const setSekme = (k) => {
    const y = YOLLAR.find((x) => x.sekme === k)
    if (y) navigate(y.yol)
  }
  // Yetkisi olmayan bir yola doğrudan gidildiyse (URL'ye elle yazma) 403 gösterilir.
  const yolYasak = Boolean(aktifYol && aktifYol.izin && !izinVar(aktifYol.izin))

  const [urunler, setUrunler] = useState([])
  const [belgeler, setBelgeler] = useState([])
  const [hareketler, setHareketler] = useState([])
  const [yukleniyor, setYukleniyor] = useState(true)
  const [sunucuYok, setSunucuYok] = useState(false)
  const [mesaj, setMesaj] = useState(null)

  const [urunForm, setUrunForm] = useState(bosUrun)
  // Yeni üründe adet 2+ olunca her adet için ayrı seri no alanı (her biri ayrı kayıt olur).
  const [seriNolar, setSeriNolar] = useState([])
  const [duzenlenenId, setDuzenlenenId] = useState(null)
  const seriAdet = Math.max(0, Math.floor(Number(urunForm.stok || 0)))
  const cokluSeriAlani = !duzenlenenId && seriAdet >= 2 && seriAdet <= SERI_ALAN_SINIRI
  // Tek seri no alanına önceden yazılan değer, adet artırılınca ilk alana taşınır.
  const seriNoDegeri = (i) => seriNolar[i] ?? (i === 0 ? urunForm.seriNo || '' : '')
  const [formAcik, setFormAcik] = useState(false) // envanter ekleme/düzenleme formu görünürlüğü
  const [urunListesi, setUrunListesi] = useState([]) // Ürün Adı combobox'ının seçenekleri
  const [listeYonetimAcik, setListeYonetimAcik] = useState(false) // ürün listesi yönetim penceresi
  const [yeniListeAdi, setYeniListeAdi] = useState('') // listeye eklenecek ad
  const [konumListesi, setKonumListesi] = useState([]) // Konum/Depo combobox'ının seçenekleri
  const [konumYonetimAcik, setKonumYonetimAcik] = useState(false) // konum listesi yönetim penceresi
  const [yeniKonumAdi, setYeniKonumAdi] = useState('') // konum listesine eklenecek ad
  const [kategoriListesi, setKategoriListesi] = useState([]) // Kategori combobox'ının seçenekleri
  const [kategoriYonetimAcik, setKategoriYonetimAcik] = useState(false) // kategori listesi yönetim penceresi
  const [yeniKategoriAdi, setYeniKategoriAdi] = useState('') // kategori listesine eklenecek ad
  const [markaListesi, setMarkaListesi] = useState([]) // Marka/Model combobox'ının seçenekleri
  const [markaYonetimAcik, setMarkaYonetimAcik] = useState(false) // marka listesi yönetim penceresi
  const [yeniMarkaAdi, setYeniMarkaAdi] = useState('') // marka listesine eklenecek ad
  const [cepMarkaListesi, setCepMarkaListesi] = useState([]) // Cep telefonu Marka/Model seçenekleri (envanterden ayrı)
  const [cepMarkaYonetimAcik, setCepMarkaYonetimAcik] = useState(false)
  const [yeniCepMarkaAdi, setYeniCepMarkaAdi] = useState('')
  const [personelListesi, setPersonelListesi] = useState([]) // Zimmet: Adı Soyadı combobox kaynağı
  const [personelYonetimAcik, setPersonelYonetimAcik] = useState(false) // personel yönetim penceresi
  const [personelForm, setPersonelForm] = useState(bosPersonel) // yönetim penceresindeki personel formu
  const [cepKayitlari, setCepKayitlari] = useState([]) // cep telefonu taahhüt kayıtları
  const [cepGecmisi, setCepGecmisi] = useState([]) // iade edilmiş cep zimmet dönemleri (tutanak geçmişi)
  const [iadePdf, setIadePdf] = useState(null) // ekran dışında PDF'e çevrilen malzeme iade tutanağı
  const [iadeOnizleme, setIadeOnizleme] = useState(null) // { belge, kalemler } iade tutanağı önizleme
  const [cepIadePdf, setCepIadePdf] = useState(null) // ekran dışında PDF'e çevrilen iade tutanağı verisi
  const [cepGecmisTutanak, setCepGecmisTutanak] = useState(null) // { kayit, tur: 'zimmet'|'iade' } önizleme
  const [cepForm, setCepForm] = useState(bosCepKayit) // cep telefonu formu
  const [cepFormAcik, setCepFormAcik] = useState(false) // cep formu görünürlüğü (varsayılan gizli)
  const [cepArama, setCepArama] = useState('') // cep kayıt listesi araması
  const [urunArama, setUrunArama] = useState('')
  const [siralama, setSiralama] = useState({ alan: 'ad', yon: 1 })

  const [zimmetForm, setZimmetForm] = useState(bosZimmetBelge)
  const [pdfYapiliyor, setPdfYapiliyor] = useState(false)
  const [klasorAdi, setKlasorAdi] = useState(null)
  const [cepKlasorAdi, setCepKlasorAdi] = useState(null) // cep tutanakları için ayrı PDF klasörü
  const [arama, setArama] = useState('') // belge listesi araması
  const [topluYapiliyor, setTopluYapiliyor] = useState(false)
  const [topluData, setTopluData] = useState(null)
  const [epostaAyar, setEpostaAyar] = useState(bosEpostaAyar)
  const [ayarAcik, setAyarAcik] = useState(false)
  const [onizlemeAcik, setOnizlemeAcik] = useState(false) // zimmet önizlemesi varsayılan kapalı; form tam genişlik
  const [zimmetFormAcik, setZimmetFormAcik] = useState(false) // zimmet formu varsayılan gizli; butonla açılır

  const [kisiArama, setKisiArama] = useState('')

  const [hTip, setHTip] = useState('tumu')
  const [hArama, setHArama] = useState('')
  const [hBaslangic, setHBaslangic] = useState('')
  const [hBitis, setHBitis] = useState('')

  const [stokPencere, setStokPencere] = useState(null)
  const [detayId, setDetayId] = useState(null)
  const [detayKisi, setDetayKisi] = useState(null)
  const [tutanakId, setTutanakId] = useState(null)
  const [cepTutanakId, setCepTutanakId] = useState(null) // listeden tutanağı görüntülenen cep kaydı
  const [belgeDetayId, setBelgeDetayId] = useState(null) // detay penceresi açık zimmet belgesi
  const [cepDetayId, setCepDetayId] = useState(null) // detay penceresi açık cep kaydı
  const cepTutanakRef = useRef(null)
  const [onay, setOnay] = useState(null)
  const yedekRef = useRef(null)
  const kartRef = useRef(null)
  const cepKartRef = useRef(null)
  const cepIadeRef = useRef(null)
  const iadeRef = useRef(null)
  const iadeOnizRef = useRef(null)
  const topluRef = useRef(null)
  const tutanakRef = useRef(null)

  // ---- sunucudan veri yükleme ----
  // Tüm veriler artık SQL Server'da; mutasyonlardan ve pencere odaklanınca yeniden yüklenir.

  const tumuYukle = async ({ sessiz = false } = {}) => {
    try {
      const v = await api.tumu()
      setUrunler(v.urunler)
      setBelgeler(v.belgeler)
      setHareketler(v.hareketler)
      if (v.epostaAyar) setEpostaAyar({ ...bosEpostaAyar(), ...v.epostaAyar })
      setUrunListesi(Array.isArray(v.urunListesi) ? v.urunListesi : [])
      setKonumListesi(Array.isArray(v.konumListesi) ? v.konumListesi : [])
      setKategoriListesi(Array.isArray(v.kategoriListesi) ? v.kategoriListesi : [])
      setMarkaListesi(Array.isArray(v.markaListesi) ? v.markaListesi : [])
      setCepMarkaListesi(Array.isArray(v.cepMarkaListesi) ? v.cepMarkaListesi : [])
      setPersonelListesi(Array.isArray(v.personelListesi) ? v.personelListesi : [])
      setCepKayitlari(Array.isArray(v.cepKayitlari) ? v.cepKayitlari : [])
      setCepGecmisi(Array.isArray(v.cepGecmisi) ? v.cepGecmisi : [])
      setSunucuYok(false)
      return v
    } catch (e) {
      setSunucuYok(true)
      if (!sessiz) bildir('hata', e.message)
      return null
    } finally {
      setYukleniyor(false)
    }
  }

  // Bilinmeyen yol → varsayılan sayfaya dön (SPA içinde 404 yerine yönlendirme)
  useEffect(() => {
    if (!aktifYol) navigate(VARSAYILAN_YOL, { replace: true })
  }, [aktifYol, navigate])

  // İlk yükleme + tarayıcıdaki eski localStorage verisini SQL'e taşıma teklifi
  // (taşıma yazma işlemidir; yalnızca ADMIN'e teklif edilir)
  useEffect(() => {
    (async () => {
      const v = await tumuYukle({ sessiz: true })
      if (!v || !adminMi) return
      const eskiU = depodanOku(URUN_KEY)
      const eskiB = depodanOku(BELGE_KEY)
      const eskiH = depodanOku(HAREKET_KEY)
      const dbBos = !v.urunler.length && !v.belgeler.length && !v.hareketler.length
      if (dbBos && (eskiU.length || eskiB.length || eskiH.length)) {
        onayIste(
          `Bu tarayıcıda eski kayıtlar bulundu (${eskiU.length} ürün, ${eskiB.length} zimmet belgesi, ${eskiH.length} hareket). ` +
          'Veritabanına taşınsın mı? (Önerilir — veriler tüm bilgisayarlardan erişilebilir olur)',
          async () => {
            try {
              await api.yedekYukle({ urunler: eskiU, belgeler: eskiB, hareketler: eskiH })
              localStorage.removeItem(URUN_KEY)
              localStorage.removeItem(BELGE_KEY)
              localStorage.removeItem(HAREKET_KEY)
              await tumuYukle()
              bildir('ok', 'Tarayıcıdaki veriler veritabanına taşındı.')
            } catch (e) {
              bildir('hata', 'Taşıma başarısız: ' + e.message)
            }
          }
        )
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Pencere odaklanınca sessiz yenile — diğer bilgisayarların değişiklikleri görünsün
  useEffect(() => {
    const yenile = () => tumuYukle({ sessiz: true })
    window.addEventListener('focus', yenile)
    return () => window.removeEventListener('focus', yenile)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Canlı güncelleme: başka bir kullanıcı/cihaz veri değiştirdiğinde sunucu "degisti" yollar,
  // ekran sessizce yenilenir. Bağlantı koparsa tarayıcı kendisi yeniden bağlanır; ayrıca
  // sayfa görünürken 60 sn'de bir yedek yenileme yapılır.
  useEffect(() => {
    if (!kullanici || typeof EventSource === 'undefined') return
    let bekle = null
    const yenile = () => {
      clearTimeout(bekle)
      bekle = setTimeout(() => tumuYukle({ sessiz: true }), 200)
    }
    const es = new EventSource('/api/olaylar', { withCredentials: true })
    es.addEventListener('degisti', yenile)
    const yedek = setInterval(() => { if (document.visibilityState === 'visible') yenile() }, 60_000)
    return () => { es.close(); clearInterval(yedek); clearTimeout(bekle) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kullanici?.kullaniciAdi])

  useEffect(() => {
    if (!mesaj) return
    const z = setTimeout(() => setMesaj(null), 4000)
    return () => clearTimeout(z)
  }, [mesaj])

  useEffect(() => {
    if (dosyaSistemiDestekli()) mevcutKlasorAdi().then((ad) => ad && setKlasorAdi(ad))
    if (dosyaSistemiDestekli()) mevcutKlasorAdi(CEP_KLASORU).then((ad) => ad && setCepKlasorAdi(ad))
  }, [])

  const bildir = (tip, metin) => setMesaj({ tip, metin })
  const onayIste = (metin, eylem) => setOnay({ metin, eylem })

  // ---- türetilen değerler ----

  const zimmetliAdet = (urunId) =>
    belgeler
      .flatMap((b) => b.items)
      .filter((it) => it.urunId === urunId && it.durum === 'zimmetli')
      .reduce((t, it) => t + Number(it.adet || 0), 0)

  const bostaAdet = (urunId) => {
    const u = urunler.find((x) => x.id === urunId)
    return u ? Number(u.stok || 0) - zimmetliAdet(urunId) : 0
  }

  const kritikMi = (u) => Number(u.minStok || 0) > 0 && bostaAdet(u.id) <= Number(u.minStok)

  const kritikUrunler = useMemo(() => urunler.filter(kritikMi), [urunler, belgeler])

  const urunAdi = (id) => {
    const u = urunler.find((x) => x.id === id)
    return u ? u.ad + (u.markaModel ? ` (${u.markaModel})` : '') : '(silinmiş ürün)'
  }
  const urunSeriNo = (id) => urunler.find((x) => x.id === id)?.seriNo || ''

  // Serbest metinden envanterdeki ürünü bulur (Excel içe aktarmada kullanılır).
  // Rapor çıktısı "Ad (Marka/Model)" biçiminde olduğundan önce o denenir; ardından
  // yalın ad, barkod/seri no ve son çare tek adaylı kısmi eşleşme.
  const urunBul = (metin, liste = urunler) => {
    const n = norm(metin)
    if (!n) return null
    const tam = liste.find((u) => norm(u.ad + (u.markaModel ? ` (${u.markaModel})` : '')) === n)
    if (tam) return tam
    const adEsit = liste.find((u) => norm(u.ad) === n)
    if (adEsit) return adEsit
    const kod = liste.find((u) => (u.barkod && norm(u.barkod) === n) || (u.seriNo && norm(u.seriNo) === n))
    if (kod) return kod
    const adaylar = liste.filter((u) => norm(u.ad) && (n.includes(norm(u.ad)) || norm(u.ad).includes(n)))
    return adaylar.length === 1 ? adaylar[0] : null
  }

  const ozet = useMemo(() => ({
    cesit: urunler.length,
    stok: urunler.reduce((t, u) => t + Number(u.stok || 0), 0),
    zimmetli: belgeler
      .flatMap((b) => b.items)
      .filter((it) => it.durum === 'zimmetli')
      .reduce((t, it) => t + Number(it.adet || 0), 0),
    kritik: kritikUrunler.length,
  }), [urunler, belgeler, kritikUrunler])

  const kategoriOzeti = useMemo(() => {
    const m = new Map()
    for (const u of urunler) {
      const k = (u.kategori || '').trim() || 'Kategorisiz'
      const o = m.get(k) || { kategori: k, cesit: 0, stok: 0 }
      o.cesit += 1
      o.stok += Number(u.stok || 0)
      m.set(k, o)
    }
    return [...m.values()].sort((a, b) => b.stok - a.stok)
  }, [urunler])

  const kisiOzeti = useMemo(() => {
    const m = new Map()
    for (const b of belgeler) {
      const adet = b.items.filter((it) => it.durum === 'zimmetli').reduce((t, it) => t + Number(it.adet || 0), 0)
      if (!adet) continue
      const o = m.get(b.adSoyad) || { kisi: b.adSoyad, kayit: 0, adet: 0 }
      o.kayit += 1
      o.adet += adet
      m.set(b.adSoyad, o)
    }
    return [...m.values()].sort((a, b) => b.adet - a.adet)
  }, [belgeler])

  const kisiler = useMemo(() => {
    const m = new Map()
    for (const b of belgeler) {
      const o = m.get(b.adSoyad) || {
        kisi: b.adSoyad, gorev: '', aktifKayit: 0, aktifAdet: 0, toplamBelge: 0, sonTeslim: '',
      }
      o.toplamBelge += 1
      const zimmetli = b.items.filter((it) => it.durum === 'zimmetli')
      o.aktifKayit += zimmetli.length
      o.aktifAdet += zimmetli.reduce((t, it) => t + Number(it.adet || 0), 0)
      if (!o.gorev && b.gorev) o.gorev = b.gorev
      if (String(b.teslimTarihi) > o.sonTeslim) o.sonTeslim = b.teslimTarihi
      m.set(b.adSoyad, o)
    }
    let l = [...m.values()].sort((a, b) =>
      b.aktifAdet - a.aktifAdet || a.kisi.localeCompare(b.kisi, 'tr'))
    const a = kisiArama.trim().toLocaleLowerCase('tr')
    if (a) {
      l = l.filter((k) =>
        [k.kisi, k.gorev].some((v) => String(v || '').toLocaleLowerCase('tr').includes(a)))
    }
    return l
  }, [belgeler, kisiArama])

  const suzulmusUrunler = useMemo(() => {
    const a = urunArama.trim().toLocaleLowerCase('tr')
    let l = urunler
    if (a) {
      l = l.filter((u) =>
        [u.ad, u.kategori, u.markaModel, u.seriNo, u.barkod, u.konum]
          .some((v) => String(v || '').toLocaleLowerCase('tr').includes(a))
      )
    }
    const deger = (u) => {
      switch (siralama.alan) {
        case 'stok': return Number(u.stok || 0)
        case 'zimmetli': return zimmetliAdet(u.id)
        case 'bosta': return bostaAdet(u.id)
        default: return String(u[siralama.alan] || '')
      }
    }
    return [...l].sort((x, y) => {
      const dx = deger(x), dy = deger(y)
      const s = typeof dx === 'number' ? dx - dy : dx.localeCompare(dy, 'tr')
      return s * siralama.yon
    })
  }, [urunler, urunArama, siralama, belgeler])

  const siralaKlik = (alan) =>
    setSiralama((s) => (s.alan === alan ? { alan, yon: -s.yon } : { alan, yon: 1 }))

  const siraTh = (alan, etiket, sag) => (
    <th className={`siralanir${sag ? ' sag' : ''}`} onClick={() => siralaKlik(alan)}>
      {etiket}{siralama.alan === alan ? (siralama.yon === 1 ? ' ▲' : ' ▼') : ''}
    </th>
  )

  // ---- ürün işlemleri ----
  // Hareket kayıtları artık sunucuda, ilgili işlemle aynı transaction içinde yazılır.

  const urunKaydet = async (e) => {
    e.preventDefault()
    const f = urunForm
    if (!f.ad.trim()) return bildir('hata', 'Ürün adı zorunludur.')
    const stok = Math.max(0, Number(f.stok || 0))
    const kayit = { ...f, ad: f.ad.trim(), stok, minStok: Math.max(0, Number(f.minStok || 0)) }

    // Çoklu seri no: hepsi boşsa eski davranış (tek kayıt, stok = adet); doluysa her seri no ayrı kayıt.
    const cokluSeri = !duzenlenenId && stok >= 2 && stok <= SERI_ALAN_SINIRI
    const seriler = cokluSeri ? Array.from({ length: stok }, (_, i) => String(seriNoDegeri(i)).trim()) : []
    const doluSeri = seriler.filter(Boolean).length
    if (cokluSeri && doluSeri > 0 && doluSeri < stok)
      return bildir('hata', `${stok} adet için ${stok} seri no girilmeli (${stok - doluSeri} alan boş). Seri no girmeyecekseniz tüm alanları boş bırakın.`)
    if (doluSeri) {
      const kucuk = seriler.map((x) => x.toLocaleLowerCase('tr'))
      const tekrar = seriler.find((x, i) => kucuk.indexOf(kucuk[i]) !== i)
      if (tekrar) return bildir('hata', `"${tekrar}" seri numarası birden fazla girilmiş.`)
    }

    try {
      if (doluSeri) {
        const { eklenen } = await api.urunEkle({ ...kayit, seriNo: '', seriNolar: seriler })
        bildir('ok', `"${kayit.ad}" için ${eklenen} ayrı kayıt (her seri no için bir tane) envantere eklendi.`)
      } else if (duzenlenenId) {
        await api.urunGuncelle({ ...kayit, id: duzenlenenId })
        bildir('ok', `"${kayit.ad}" güncellendi.`)
      } else {
        await api.urunEkle({ ...kayit, ...(cokluSeri ? { seriNo: '' } : {}) })
        bildir('ok', `"${kayit.ad}" envantere eklendi.`)
      }
      setUrunForm(bosUrun())
      setSeriNolar([])
      setDuzenlenenId(null)
      setFormAcik(false)
      await tumuYukle({ sessiz: true })
    } catch (hata) {
      bildir('hata', hata.message)
    }
  }

  const urunDuzenle = (u) => {
    setUrunForm({ ...u })
    setSeriNolar([])
    setDuzenlenenId(u.id)
    setFormAcik(true)
    setSekme('envanter')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const urunSil = (u) => {
    if (zimmetliAdet(u.id) > 0)
      return bildir('hata', `"${u.ad}" üzerinde aktif zimmet var, önce iade alınmalı.`)
    onayIste(`"${u.ad}" envanterden kalıcı olarak silinsin mi?`, async () => {
      try {
        await api.urunSil(u.id)
        if (duzenlenenId === u.id) { setUrunForm(bosUrun()); setDuzenlenenId(null); setFormAcik(false) }
        bildir('ok', `"${u.ad}" silindi.`)
        await tumuYukle({ sessiz: true })
      } catch (hata) {
        bildir('hata', hata.message)
      }
    })
  }

  // ---- Ürün listesi (combobox kaynağı; her ürün SQL'de kendi id'siyle bir satır) ----

  const listeyeEkle = async () => {
    const ad = yeniListeAdi.trim()
    if (!ad) return
    if (urunListesi.some((u) => u.ad.toLocaleLowerCase('tr') === ad.toLocaleLowerCase('tr')))
      return bildir('hata', `"${ad}" zaten listede.`)
    try {
      await api.urunListesiEkle(ad)
      setYeniListeAdi('')
      await tumuYukle({ sessiz: true })
    } catch (hata) {
      bildir('hata', hata.message)
    }
  }

  const listedenCikar = async (u) => {
    try {
      await api.urunListesiSil(u.id)
      await tumuYukle({ sessiz: true })
    } catch (hata) {
      bildir('hata', hata.message)
    }
  }

  // ---- Konum listesi (Konum/Depo combobox kaynağı; her konum SQL'de kendi id'siyle bir satır) ----

  const konumEkle = async () => {
    const ad = yeniKonumAdi.trim()
    if (!ad) return
    if (konumListesi.some((k) => k.ad.toLocaleLowerCase('tr') === ad.toLocaleLowerCase('tr')))
      return bildir('hata', `"${ad}" zaten listede.`)
    try {
      await api.konumListesiEkle(ad)
      setYeniKonumAdi('')
      await tumuYukle({ sessiz: true })
    } catch (hata) {
      bildir('hata', hata.message)
    }
  }

  const konumCikar = async (k) => {
    try {
      await api.konumListesiSil(k.id)
      await tumuYukle({ sessiz: true })
    } catch (hata) {
      bildir('hata', hata.message)
    }
  }

  // ---- Kategori listesi (Kategori combobox kaynağı; her kategori SQL'de kendi id'siyle bir satır) ----

  const kategoriEkle = async () => {
    const ad = yeniKategoriAdi.trim()
    if (!ad) return
    if (kategoriListesi.some((k) => k.ad.toLocaleLowerCase('tr') === ad.toLocaleLowerCase('tr')))
      return bildir('hata', `"${ad}" zaten listede.`)
    try {
      await api.kategoriListesiEkle(ad)
      setYeniKategoriAdi('')
      await tumuYukle({ sessiz: true })
    } catch (hata) {
      bildir('hata', hata.message)
    }
  }

  const kategoriCikar = async (k) => {
    try {
      await api.kategoriListesiSil(k.id)
      await tumuYukle({ sessiz: true })
    } catch (hata) {
      bildir('hata', hata.message)
    }
  }

  // ---- Marka/Model listesi (Marka/Model combobox kaynağı; her marka SQL'de kendi id'siyle bir satır) ----

  const markaEkle = async () => {
    const ad = yeniMarkaAdi.trim()
    if (!ad) return
    if (markaListesi.some((m) => m.ad.toLocaleLowerCase('tr') === ad.toLocaleLowerCase('tr')))
      return bildir('hata', `"${ad}" zaten listede.`)
    try {
      await api.markaListesiEkle(ad)
      setYeniMarkaAdi('')
      await tumuYukle({ sessiz: true })
    } catch (hata) {
      bildir('hata', hata.message)
    }
  }

  const markaCikar = async (m) => {
    try {
      await api.markaListesiSil(m.id)
      await tumuYukle({ sessiz: true })
    } catch (hata) {
      bildir('hata', hata.message)
    }
  }

  // ---- Cep telefonu Marka/Model listesi (envanterin marka listesinden ayrı) ----

  const cepMarkaEkle = async () => {
    const ad = yeniCepMarkaAdi.trim()
    if (!ad) return
    if (cepMarkaListesi.some((m) => m.ad.toLocaleLowerCase('tr') === ad.toLocaleLowerCase('tr')))
      return bildir('hata', `"${ad}" zaten listede.`)
    try {
      await api.cepMarkaListesiEkle(ad)
      setYeniCepMarkaAdi('')
      await tumuYukle({ sessiz: true })
    } catch (hata) {
      bildir('hata', hata.message)
    }
  }

  const cepMarkaCikar = async (m) => {
    try {
      await api.cepMarkaListesiSil(m.id)
      await tumuYukle({ sessiz: true })
    } catch (hata) {
      bildir('hata', hata.message)
    }
  }

  // ---- Personel listesi (Zimmet: Adı Soyadı combobox; seçilince bölüm/görev dolar) ----

  // Ada göre upsert eder (aynı ad varsa bölüm/görev güncellenir).
  const personelKaydet = async () => {
    const adSoyad = personelForm.adSoyad.trim()
    if (!adSoyad) return bildir('hata', 'Adı Soyadı zorunludur.')
    try {
      await api.personelKaydet({ adSoyad, bolum: personelForm.bolum.trim(), gorev: personelForm.gorev.trim() })
      setPersonelForm(bosPersonel())
      await tumuYukle({ sessiz: true })
    } catch (hata) {
      bildir('hata', hata.message)
    }
  }

  const personelDuzenle = (p) => setPersonelForm({ ...bosPersonel(), ...p })

  const personelSil = async (p) => {
    try {
      await api.personelSil(p.id)
      if (personelForm.adSoyad === p.adSoyad) setPersonelForm(bosPersonel())
      await tumuYukle({ sessiz: true })
    } catch (hata) {
      bildir('hata', hata.message)
    }
  }

  // ---- Cep telefonu taahhüt kayıtları ----

  const cepKayitliMi = useMemo(() => cepKayitlari.some((k) => k.id === cepForm.id), [cepKayitlari, cepForm.id])
  // Yeni telefon girişi modu: kişisiz, "boşta" kayıt (önizleme/PDF yok).
  const cepStokModu = cepForm.durum === 'bosta'
  // Formdaki kayıt, boştaki bir telefonun bir kişiye zimmetlenmesi mi?
  const cepBostaZimmet = !cepStokModu && cepKayitlari.some((k) => k.id === cepForm.id && k.durum === 'bosta')
  const bostakiTelefonlar = useMemo(() => cepKayitlari.filter((k) => k.durum === 'bosta'), [cepKayitlari])

  // Adı Soyadı combobox'tan personel seçilince Teslim Alan da otomatik dolar (telefonu alan kişi).
  const cepPersonelSec = (adSoyad) =>
    setCepForm((f) => ({ ...f, adSoyad, teslimAlan: adSoyad || f.teslimAlan }))

  const cepMarkaSec = (markaModel) => setCepForm((f) => ({ ...f, markaModel }))

  const cepYeni = () => { setCepForm(bosCepKayit()); setCepFormAcik(true) }
  const cepStokYeni = () => { setCepForm({ ...bosCepKayit(), durum: 'bosta' }); setCepFormAcik(true) }

  // Boştaki bir telefonu zimmet formuna alır; formda girilmiş kişi bilgileri korunur.
  const cepBostaSec = (id) => {
    const t = cepKayitlari.find((k) => k.id === id)
    if (!t) { setCepForm((f) => ({ ...bosCepKayit(), adSoyad: f.adSoyad, teslimAlan: f.teslimAlan, teslimEden: f.teslimEden, tarih: f.tarih })); return }
    setCepForm((f) => ({
      ...f, id: t.id, olusturma: t.olusturma, durum: 'zimmetli',
      imei: t.imei, seriNo: t.seriNo, markaModel: t.markaModel, hatNo: t.hatNo,
      tarih: f.tarih || bugun(),
    }))
  }

  const cepBostaZimmetle = (t) => {
    setCepForm({ ...bosCepKayit(), ...JSON.parse(JSON.stringify(t)), durum: 'zimmetli', tarih: bugun() })
    setCepFormAcik(true)
    bildir('ok', 'Telefon zimmet formuna alındı. Kişiyi seçip "Kaydet" deyin.')
  }

  // ---- Cep tutanağı PDF'i: zimmet tutanaklarından AYRI bir klasöre yazılır ----

  const cepDosyaAdiUret = (k) => {
    const kisi = dosyaAdiTemizle(k.adSoyad || k.teslimAlan || 'Cep Telefonu') || 'Cep Telefonu'
    const t = k.olusturma ? new Date(k.olusturma) : new Date()
    const tarih = `${String(t.getDate()).padStart(2, '0')}.${String(t.getMonth() + 1).padStart(2, '0')}.${t.getFullYear()}`
    const hat = dosyaAdiTemizle(k.hatNo)
    return [kisi, tarih, 'Cep Taahhüt', hat].filter(Boolean).join(' - ') + '.pdf'
  }

  // Klasör iznini peşinen alır (kullanıcı jesti tazeyken). İptal edilirse null → PDF indirilir.
  const cepKlasorEdin = async () => {
    if (!dosyaSistemiDestekli()) return null
    try {
      const dir = await kayitKlasoruGetir({ klasor: CEP_KLASORU })
      setCepKlasorAdi(dir.name)
      return dir
    } catch (e) {
      if (e?.name === 'AbortError') {
        bildir('hata', 'Klasör seçimi iptal edildi; PDF indirme olarak kaydedilecek.')
        return null
      }
      throw e
    }
  }

  const cepKlasorSec = async () => {
    if (!dosyaSistemiDestekli()) return bildir('hata', 'Klasör seçimi için Chrome veya Edge kullanın.')
    try {
      const dir = await kayitKlasoruGetir({ yenidenSec: true, klasor: CEP_KLASORU })
      setCepKlasorAdi(dir.name)
      bildir('ok', 'Cep tutanağı klasörü ayarlandı: ' + dir.name)
    } catch (e) {
      if (e?.name !== 'AbortError') bildir('hata', 'Klasör seçilemedi.')
    }
  }

  // Formdaki önizleme kartından PDF üretip cep klasörüne yazar (klasör yoksa indirir).
  // Güncellemede dosya adı değiştiyse (ad soyad / hat no) eski PDF silinir.
  const cepPdfKlasoreYaz = async (kayit, dir, eskiAd = null) => {
    const dosyaAdi = cepDosyaAdiUret(kayit)
    const pdf = await pdfOlustur(cepKartRef.current)
    if (!dir) {
      pdf.save(dosyaAdi)
      return { dosyaAdi, indirildi: true }
    }
    await blobYaz(dir, dosyaAdi, pdf.output('blob'))
    if (eskiAd && eskiAd !== dosyaAdi) {
      try { await dosyaSil(dir, eskiAd) } catch { /* eski dosya yoksa sorun değil */ }
    }
    return { dosyaAdi, klasor: dir.name }
  }

  const cepKaydet = async () => {
    if (cepStokModu) {
      if (!cepForm.markaModel && !cepForm.imei.trim() && !cepForm.seriNo.trim())
        return bildir('hata', 'En az Marka / Model, IMEI veya Seri No girin.')
      try {
        await api.cepEkle(cepForm)
        bildir('ok', 'Yeni telefon boşta olarak eklendi.')
        setCepForm({ ...bosCepKayit(), durum: 'bosta' }) // art arda giriş için form açık kalır
        await tumuYukle({ sessiz: true })
      } catch (hata) {
        bildir('hata', hata.message)
      }
      return
    }
    if (!cepForm.adSoyad.trim()) return bildir('hata', 'Lütfen "Adı Soyadı" alanını doldurun.')
    setPdfYapiliyor(true)
    try {
      const dir = await cepKlasorEdin() // kullanıcı jesti tazeyken (API beklemesinden önce)
      try {
        // Boştaki telefon zimmetleniyorsa aynı kayıt güncellenir; değilse yeni kayıt açılır.
        if (cepBostaZimmet) await api.cepGuncelle(cepForm.id, { ...cepForm, durum: 'zimmetli' })
        else await api.cepEkle({ ...cepForm, durum: 'zimmetli' })
      } catch (hata) {
        bildir('hata', hata.message)
        return
      }
      const r = await cepPdfKlasoreYaz(cepForm, dir)
      bildir('ok', r.indirildi
        ? `Cep telefonu kaydı eklendi; "${r.dosyaAdi}" indirildi.`
        : `Cep telefonu kaydı eklendi → "${r.klasor}" klasörüne "${r.dosyaAdi}" yazıldı.`)
      setCepForm(bosCepKayit())
      setCepFormAcik(false)
      await tumuYukle({ sessiz: true })
    } catch (e) {
      yazmaHatasi(e)
    } finally {
      setPdfYapiliyor(false)
    }
  }

  const cepGuncelle = async () => {
    if (!cepKayitliMi) return bildir('hata', 'Güncellenecek kayıt yok. Önce "Kaydet" deyin.')
    if (cepStokModu) {
      try {
        await api.cepGuncelle(cepForm.id, cepForm)
        bildir('ok', 'Telefon bilgileri güncellendi.')
        await tumuYukle({ sessiz: true })
      } catch (hata) {
        bildir('hata', hata.message)
      }
      return
    }
    if (!cepForm.adSoyad.trim()) return bildir('hata', 'Lütfen "Adı Soyadı" alanını doldurun.')
    const eski = cepKayitlari.find((k) => k.id === cepForm.id)
    setPdfYapiliyor(true)
    try {
      const dir = await cepKlasorEdin() // kullanıcı jesti tazeyken (API beklemesinden önce)
      try {
        await api.cepGuncelle(cepForm.id, cepForm)
      } catch (hata) {
        bildir('hata', hata.message)
        return
      }
      const r = await cepPdfKlasoreYaz({ ...cepForm, olusturma: eski?.olusturma || cepForm.olusturma }, dir, eski ? cepDosyaAdiUret(eski) : null)
      bildir('ok', r.indirildi
        ? `Kayıt güncellendi; "${r.dosyaAdi}" indirildi.`
        : `Kayıt güncellendi → "${r.klasor}" klasöründe "${r.dosyaAdi}" yenilendi.`)
      await tumuYukle({ sessiz: true })
    } catch (e) {
      yazmaHatasi(e)
    } finally {
      setPdfYapiliyor(false)
    }
  }

  // Bu telefonun en son iade dönemi (boştaki telefonda "İade Tutanağı" için)
  const cepSonIade = (k) => cepGecmisi
    .filter((g) => g.cepId === k.id || (k.imei && g.imei === k.imei) || (k.seriNo && g.seriNo === k.seriNo))
    .sort((a, b) => String(b.olusturma || b.iadeTarihi).localeCompare(String(a.olusturma || a.iadeTarihi)))[0] || null

  const cepIadeDosyaAdi = (g) => {
    const kisi = dosyaAdiTemizle(g.adSoyad || 'Cep Telefonu') || 'Cep Telefonu'
    const hat = dosyaAdiTemizle(g.hatNo)
    return [kisi, trTarih(g.iadeTarihi), 'Cep İade', hat].filter(Boolean).join(' - ') + '.pdf'
  }

  // İade Al: zimmet tutanağına dokunulmaz; telefon boşta olur ve ayrıca bir İADE TUTANAĞI
  // üretilip cep tutanağı klasörüne yazılır (klasör yoksa indirilir).
  const cepDurumDegistir = (k, durum) => {
    if (durum !== 'iade') return
    onayIste(`${k.adSoyad || '(isimsiz)'} üzerindeki ${k.markaModel || 'cep telefonu'} iade alınsın mı? İade tutanağı oluşturulacak.`, async () => {
      setPdfYapiliyor(true)
      try {
        const dir = await cepKlasorEdin() // kullanıcı jesti tazeyken
        let r
        try {
          r = await api.cepDurum(k.id, 'iade')
        } catch (hata) {
          bildir('hata', hata.message)
          return
        }
        const g = r.gecmis || { ...k, iadeTarihi: r.iadeTarihi }
        setCepIadePdf(g)
        await new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok)))
        const pdf = await pdfOlustur(cepIadeRef.current)
        const dosyaAdi = cepIadeDosyaAdi(g)
        if (dir) {
          await blobYaz(dir, dosyaAdi, pdf.output('blob'))
          bildir('ok', `Telefon iade alındı; boşta olarak listelendi → "${dir.name}" klasörüne "${dosyaAdi}" yazıldı.`)
        } else {
          pdf.save(dosyaAdi)
          bildir('ok', `Telefon iade alındı; "${dosyaAdi}" indirildi.`)
        }
        setCepGecmisTutanak({ kayit: g, tur: 'iade' })
        await tumuYukle({ sessiz: true })
      } catch (e) {
        yazmaHatasi(e)
        await tumuYukle({ sessiz: true })
      } finally {
        setCepIadePdf(null)
        setPdfYapiliyor(false)
      }
    })
  }

  const cepYukle = (k) => {
    setCepForm({ ...bosCepKayit(), ...JSON.parse(JSON.stringify(k)) })
    setCepFormAcik(true)
    bildir('ok', 'Kayıt forma yüklendi. Değişiklikleri yapıp "Güncelle" deyin.')
  }

  const cepSil = (k) => {
    onayIste(`"${k.adSoyad || '(isimsiz)'}" cep telefonu kaydı ve klasördeki PDF'i silinsin mi?`, async () => {
      // Klasör erişimi kullanıcı jesti tazeyken (API beklemesinden ÖNCE) alınır
      let dir = null
      if (dosyaSistemiDestekli()) {
        try { dir = await kayitKlasoruVarsa(CEP_KLASORU) } catch { dir = null }
      }
      try {
        await api.cepSil(k.id)
      } catch (hata) {
        return bildir('hata', hata.message)
      }
      if (cepForm.id === k.id) { setCepForm(bosCepKayit()); setCepFormAcik(false) }
      await tumuYukle({ sessiz: true })
      if (!dir) return bildir('ok', 'Kayıt silindi.')
      try {
        await dosyaSil(dir, cepDosyaAdiUret(k))
        bildir('ok', 'Kayıt ve PDF dosyası silindi.')
      } catch (e) {
        bildir('ok', e?.name === 'NotFoundError' ? 'Kayıt silindi. (PDF dosyası klasörde bulunamadı.)' : 'Kayıt silindi.')
      }
    })
  }

  const cepPdfIndir = async () => {
    if (!cepKartRef.current) return
    setPdfYapiliyor(true)
    try {
      const pdf = await pdfOlustur(cepKartRef.current)
      const adi = `cep-taahhut-${(cepForm.adSoyad || 'kayit').replace(/[\\/:*?"<>|]+/g, '_')}-${cepForm.tarih || bugun()}.pdf`
      pdf.save(adi)
      bildir('ok', 'PDF indirildi.')
    } catch (e) {
      console.error(e)
      bildir('hata', 'PDF oluşturulurken hata oluştu.')
    } finally {
      setPdfYapiliyor(false)
    }
  }

  const cepGosterilen = useMemo(() => {
    const q = norm(cepArama)
    const liste = cepKayitlari.filter((k) => k.durum !== 'iade')
    if (!q) return liste
    return liste.filter((k) =>
      [k.adSoyad, k.hatNo, k.markaModel, k.imei, k.seriNo].some((x) => norm(x).includes(q)))
  }, [cepKayitlari, cepArama])

  const stokPencereAc = (urun, tip) =>
    setStokPencere({ urun, tip, adet: 1, tarih: bugun(), aciklama: '' })

  const stokUygula = async (e) => {
    e.preventDefault()
    const p = stokPencere
    const adet = Number(p.adet)
    if (!adet || adet <= 0) return bildir('hata', 'Geçerli bir adet girin.')
    if (p.tip === 'cikis' && adet > bostaAdet(p.urun.id))
      return bildir('hata', `Boşta yalnızca ${bostaAdet(p.urun.id)} ${p.urun.birim} var (zimmetli ürünler çıkışa dahil edilemez).`)
    try {
      await api.stokIslem(p.urun.id, { tip: p.tip, adet, tarih: p.tarih, aciklama: p.aciklama })
      bildir('ok', `${p.urun.ad}: ${adet} ${p.urun.birim} ${p.tip === 'giris' ? 'giriş' : 'çıkış'} yapıldı.`)
      setStokPencere(null)
      await tumuYukle({ sessiz: true })
    } catch (hata) {
      bildir('hata', hata.message)
    }
  }

  // ---- zimmet belgesi: Belge No, adet limiti ----

  // Belge No: ZMT-YYYYAAGG-NNN. NNN = o güne ait mevcut EN BÜYÜK sıra + 1.
  const belgeNoUret = (teslimTarihiISO, mevcutId) => {
    const ymd = tarihYMD(teslimTarihiISO)
    if (ymd.length !== 8) return ''
    const siralar = belgeler
      .filter((b) => b.id !== mevcutId && tarihYMD(b.teslimTarihi) === ymd)
      .map((b) => {
        const m = /-(\d+)\s*$/.exec(b.belgeNo || '')
        return m ? parseInt(m[1], 10) : 0
      })
    const enBuyuk = siralar.length ? Math.max(...siralar) : 0
    return `ZMT-${ymd}-${String(enBuyuk + 1).padStart(3, '0')}`
  }

  const teslimTarihiGuncelle = (iso) =>
    setZimmetForm((f) => ({ ...f, teslimTarihi: iso, belgeNo: belgeNoUret(iso, f.id) }))

  // Bu ürün için, düzenlenmekte olan belge dışındaki tüm belgelerde zimmetli olan adet
  const digerBelgelerZimmetli = (urunId) =>
    belgeler
      .filter((b) => b.id !== zimmetForm.id)
      .flatMap((b) => b.items)
      .filter((it) => it.urunId === urunId && it.durum === 'zimmetli')
      .reduce((t, it) => t + Number(it.adet || 0), 0)

  // Bu formun İÇİNDE, aynı ürünü kullanan diğer satırlarda ayrılmış adet
  const formIciKullanilan = (urunId, kalemIdHaric) =>
    zimmetForm.items
      .filter((it) => it.urunId === urunId && it.id !== kalemIdHaric)
      .reduce((t, it) => t + Number(it.adet || 0), 0)

  // Bu satır için seçilebilecek en fazla adet (mevcut belgenin kendi rezervasyonu hariç tutulur)
  const maksAdet = (urunId, kalemId) => {
    if (!urunId) return 0
    const u = urunler.find((x) => x.id === urunId)
    if (!u) return 0
    const taban = Number(u.stok || 0) - digerBelgelerZimmetli(urunId)
    return Math.max(0, taban - formIciKullanilan(urunId, kalemId))
  }

  const kayitliMi = useMemo(() => belgeler.some((b) => b.id === zimmetForm.id), [belgeler, zimmetForm.id])

  // ---- dosya adı / PDF ----

  const dosyaAdiUret = (k) => {
    const kisi = dosyaAdiTemizle(k.teslimAlan || k.adSoyad || 'Zimmet') || 'Zimmet'
    const t = k.olusturma ? new Date(k.olusturma) : new Date()
    const tarih = `${String(t.getDate()).padStart(2, '0')}.${String(t.getMonth() + 1).padStart(2, '0')}.${t.getFullYear()}`
    const belge = dosyaAdiTemizle(k.belgeNo)
    return [kisi, tarih, belge].filter(Boolean).join(' - ') + '.pdf'
  }

  const pdfOlustur = async (el = kartRef.current) => {
    const canvas = await html2canvas(el, { scale: 2, useCORS: true, backgroundColor: '#ffffff' })
    const img = canvas.toDataURL('image/jpeg', 0.97)
    const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' })
    const sayfaG = pdf.internal.pageSize.getWidth()
    const sayfaY = pdf.internal.pageSize.getHeight()
    const oran = Math.min(sayfaG / canvas.width, sayfaY / canvas.height)
    const w = canvas.width * oran
    const h = canvas.height * oran
    const x = (sayfaG - w) / 2
    pdf.addImage(img, 'JPEG', x, 0, w, h)
    return pdf
  }

  // Klasör iznini PEŞİNEN alır — kullanıcı tıklamasının hemen ardından, API beklemelerinden
  // ÖNCE çağrılmalı (tarayıcı, showDirectoryPicker için taze kullanıcı jesti ister).
  // İptal edilirse null döner; PDF normal indirme olarak kaydedilir.
  const klasorEdin = async () => {
    if (!dosyaSistemiDestekli()) return null
    try {
      const dir = await kayitKlasoruGetir()
      setKlasorAdi(dir.name)
      return dir
    } catch (e) {
      if (e?.name === 'AbortError') {
        bildir('hata', 'Klasör seçimi iptal edildi; PDF indirme olarak kaydedilecek.')
        return null
      }
      throw e
    }
  }

  const pdfKlasoreYaz = async (belge, el, dir = null) => {
    const dosyaAdi = dosyaAdiUret(belge)
    const pdf = await pdfOlustur(el)
    if (!dir) {
      pdf.save(dosyaAdi)
      return { dosyaAdi, indirildi: true, pdf }
    }
    await blobYaz(dir, dosyaAdi, pdf.output('blob'))
    return { dosyaAdi, klasor: dir.name, pdf }
  }

  const yazmaHatasi = (e) => {
    if (e?.name === 'AbortError') {
      bildir('hata', 'Klasör seçimi iptal edildi. Kayıt yalnızca tarayıcıya alındı.')
    } else {
      console.error(e)
      bildir('hata', 'Dosya yazılamadı: ' + (e?.message || e))
    }
  }

  const demirbaslarMetni = (b) =>
    b.items
      .map((it, i) => {
        const u = urunler.find((x) => x.id === it.urunId)
        const parca = [
          `${i + 1}. ${urunAdi(it.urunId)}`,
          u ? `(${it.adet} ${u.birim})` : '',
          it.aciklama ? `- ${it.aciklama}` : '',
        ].filter(Boolean)
        return parca.join(' ')
      })
      .join('\n')

  const epostaBildir = async (belge, r) => {
    if (!epostaHazir(epostaAyar)) return
    try {
      const ek = { dosyaAdi: r?.dosyaAdi, demirbaslarMetni: demirbaslarMetni(belge) }
      if (epostaAyar.pdfEkle && r?.pdf) ek.pdfBase64 = r.pdf.output('datauristring').split(',')[1]
      await epostaGonder(epostaAyar, belge, ek)
      bildir('ok', 'Amirlere bildirim e-postası gönderildi.')
    } catch (e) {
      console.error(e)
      bildir('hata', 'Bildirim e-postası gönderilemedi: ' + (e?.text || e?.message || e))
    }
  }

  // ---- Kaydet: HER ZAMAN yeni belge oluşturur (asla mevcut belgenin/PDF'in üzerine yazmaz) ----

  const kaydet = async () => {
    if (!zimmetForm.teslimTarihi) return bildir('hata', 'Teslim tarihi seçmeden kayıt yapılamaz.')
    if (!zimmetForm.adSoyad.trim()) return bildir('hata', 'Lütfen "Adı Soyadı" alanını doldurun.')
    const gecerliItems = zimmetForm.items.filter((it) => it.urunId && Number(it.adet) > 0)
    if (!gecerliItems.length) return bildir('hata', 'En az bir ürün seçip adet girin.')
    for (const it of gecerliItems) {
      const maks = maksAdet(it.urunId, it.id)
      if (Number(it.adet) > maks) return bildir('hata', `"${urunAdi(it.urunId)}" için en fazla ${maks} adet zimmetlenebilir.`)
    }

    // Belge No SUNUCUDA kesinleşir (iki bilgisayar aynı anda kaydetse bile çakışmaz).
    const taslak = {
      ...zimmetForm,
      id: yeniId(),
      items: gecerliItems.map((it) => ({ ...it, durum: 'zimmetli' })),
    }
    setPdfYapiliyor(true)
    try {
      const dir = await klasorEdin() // kullanıcı jesti tazeyken (API beklemelerinden önce)
      let belge
      try {
        ({ belge } = await api.belgeEkle(taslak))
      } catch (hata) {
        bildir('hata', hata.message)
        return
      }
      setZimmetForm(belge) // önizleme karta sunucunun kesinleştirdiği belge no yansır
      await tumuYukle({ sessiz: true })
      const r = await pdfKlasoreYaz(belge, undefined, dir)
      bildir('ok', r.indirildi
        ? `Yeni belge saklandı; "${r.dosyaAdi}" indirildi. Form sıfırlandı.`
        : `Yeni belge eklendi → "${r.klasor}" klasörüne "${r.dosyaAdi}" yazıldı. Form sıfırlandı.`)
      await epostaBildir(belge, r)
      setZimmetForm(bosZimmetBelge())
      setZimmetFormAcik(false) // kayıt sonrası forma dönüş yerine liste görünümü
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (e) {
      yazmaHatasi(e)
    } finally {
      setPdfYapiliyor(false)
    }
  }

  // ---- Güncelle: yalnızca yüklü belgeyi yerinde günceller; stok deltalarını hareket olarak kaydeder ----

  const guncelle = async () => {
    if (!kayitliMi) return bildir('hata', 'Güncellenecek belge yok. Önce "Kaydet" ile kaydedin.')
    if (!zimmetForm.teslimTarihi) return bildir('hata', 'Teslim tarihi seçmeden güncelleme yapılamaz.')
    if (!zimmetForm.adSoyad.trim()) return bildir('hata', 'Lütfen "Adı Soyadı" alanını doldurun.')
    const gecerliItems = zimmetForm.items.filter((it) => it.urunId && Number(it.adet) > 0)
    if (!gecerliItems.length) return bildir('hata', 'En az bir ürün seçip adet girin.')
    for (const it of gecerliItems) {
      const maks = maksAdet(it.urunId, it.id)
      if (Number(it.adet) > maks) return bildir('hata', `"${urunAdi(it.urunId)}" için en fazla ${maks} adet zimmetlenebilir.`)
    }

    // Hareket farkları (yeni satır→zimmet, adet değişimi, kaldırılan satır→iade) SUNUCUDA,
    // güncellemeyle aynı transaction içinde yazılır. Belge No güncellemede değişmez.
    const gonderilecek = {
      ...zimmetForm,
      items: gecerliItems.map((it) => ({ ...it, durum: it.durum || 'zimmetli' })),
    }
    setPdfYapiliyor(true)
    try {
      const dir = await klasorEdin() // kullanıcı jesti tazeyken (API beklemelerinden önce)
      let belge
      try {
        ({ belge } = await api.belgeGuncelle(gonderilecek))
      } catch (hata) {
        bildir('hata', hata.message)
        return
      }
      setZimmetForm(belge)
      await tumuYukle({ sessiz: true })
      const r = await pdfKlasoreYaz(belge, undefined, dir)
      bildir('ok', r.indirildi
        ? `Belge güncellendi; "${r.dosyaAdi}" indirildi.`
        : `Güncellendi → "${r.klasor}" klasöründe "${r.dosyaAdi}" yenilendi.`)
    } catch (e) {
      yazmaHatasi(e)
    } finally {
      setPdfYapiliyor(false)
    }
  }

  const klasorSec = async () => {
    if (!dosyaSistemiDestekli()) return bildir('hata', 'Klasör seçimi için Chrome veya Edge kullanın.')
    try {
      const dir = await kayitKlasoruGetir({ yenidenSec: true })
      setKlasorAdi(dir.name)
      bildir('ok', 'Kayıt klasörü ayarlandı: ' + dir.name)
    } catch (e) {
      if (e?.name !== 'AbortError') bildir('hata', 'Klasör seçilemedi.')
    }
  }

  const yeniKayit = () => {
    setZimmetForm(bosZimmetBelge())
    bildir('ok', 'Yeni boş form hazır.')
  }

  // İadesi alınmış belgedeki ürünleri yeni bir zimmet belgesine aktarır (cep telefonundaki "Zimmetle" gibi).
  // Yalnızca stokta hâlâ boşta olan ürünler alınır; başka birine zimmetlenmiş olanlar atlanır.
  const belgedenZimmetle = (b, secilen = b.items) => {
    const kalemler = secilen
      .filter((it) => it.durum === 'iade' && urunler.some((u) => u.id === it.urunId))
      .map((it) => ({ ...bosKalem(), urunId: it.urunId, sabit: true, adet: Math.min(Number(it.adet) || 1, Math.max(0, bostaAdet(it.urunId))) }))
      .filter((it) => it.adet > 0)
    if (!kalemler.length) {
      bildir('hata', 'Bu belgedeki ürünler şu an boşta değil (başka birine zimmetlenmiş ya da silinmiş).')
      return
    }
    setZimmetForm({ ...bosZimmetBelge(), items: kalemler })
    setZimmetFormAcik(true)
    setSekme('zimmet')
    window.scrollTo({ top: 0, behavior: 'smooth' })
    bildir('ok', `${kalemler.length} ürün yeni zimmet formuna alındı. Kişiyi ve teslim tarihini seçip "Kaydet" deyin.`)
  }

  const kayitYukle = (id) => {
    const b = belgeler.find((x) => x.id === id)
    if (!b) return
    setZimmetForm({ ...bosZimmetBelge(), ...JSON.parse(JSON.stringify(b)) })
    setZimmetFormAcik(true)
    setSekme('zimmet')
    bildir('ok', 'Belge güncellemek için forma yüklendi. Değişiklikleri yapıp "Güncelle" deyin.')
  }

  // Zimmet iadesi: seçilen kalemleri iade alır; ürünler stokta boşta görünür.
  const iadeDosyaAdi = (belge, tarih) => {
    const kisi = dosyaAdiTemizle(belge.adSoyad || 'Zimmet') || 'Zimmet'
    return [kisi, trTarih(tarih), 'İade', dosyaAdiTemizle(belge.belgeNo)].filter(Boolean).join(' - ') + '.pdf'
  }

  // Zimmet iadesi: seçilen kalemleri iade alır (ürünler stokta boşta görünür) ve bir
  // MALZEME İADE TUTANAĞI üretip zimmet tutanağı klasörüne yazar (klasör yoksa indirilir).
  // Zimmet tutanağı olduğu gibi kalır.
  const belgeIadeAl = (belge, kalemler) => {
    const acik = kalemler.filter((it) => it.durum !== 'iade')
    if (!acik.length) return
    const ad = acik.length === 1
      ? `"${urunAdi(acik[0].urunId)}${urunSeriNo(acik[0].urunId) ? ` (SN: ${urunSeriNo(acik[0].urunId)})` : ''}"`
      : `${acik.length} ürün`
    onayIste(`${belge.adSoyad || '(isimsiz)'} üzerindeki ${ad} iade alınsın mı? İade tutanağı oluşturulacak.`, async () => {
      setPdfYapiliyor(true)
      const tarih = bugun()
      const yapilan = []
      try {
        const dir = await klasorEdin() // kullanıcı jesti tazeyken
        try {
          for (const it of acik) { await api.iadeAl(belge.id, it.id); yapilan.push({ ...it, durum: 'iade', iadeTarihi: tarih }) }
        } catch (hata) {
          bildir('hata', hata.message)
          if (!yapilan.length) return
        }
        setIadePdf({ belge, kalemler: yapilan, iadeTarihi: tarih, teslimAlan: kullanici?.gorunenAd || kullanici?.kullaniciAdi || '' })
        await new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok)))
        const pdf = await pdfOlustur(iadeRef.current)
        const dosyaAdi = iadeDosyaAdi(belge, tarih)
        const n = yapilan.length === 1 ? 'Ürün' : `${yapilan.length} ürün`
        if (dir) {
          await blobYaz(dir, dosyaAdi, pdf.output('blob'))
          bildir('ok', `${n} iade alındı; stokta boşta → "${dir.name}" klasörüne "${dosyaAdi}" yazıldı.`)
        } else {
          pdf.save(dosyaAdi)
          bildir('ok', `${n} iade alındı; "${dosyaAdi}" indirildi.`)
        }
        setBelgeDetayId(null)
        setIadeOnizleme({ belge, kalemler: yapilan, iadeTarihi: tarih, teslimAlan: kullanici?.gorunenAd || kullanici?.kullaniciAdi || '' })
      } catch (e) {
        yazmaHatasi(e)
      } finally {
        setIadePdf(null)
        setPdfYapiliyor(false)
        await tumuYukle({ sessiz: true })
      }
    })
  }

  const kayitSil = (id) => {
    const belge = belgeler.find((b) => b.id === id)
    if (!belge) return
    onayIste(
      `Bu belge (${belge.belgeNo || '—'}) ve klasördeki ilgili PDF dosyası silinsin mi? Üzerindeki zimmetli ürünler otomatik iade edilmiş sayılacak.`,
      async () => {
        // Klasör erişimi kullanıcı jesti tazeyken (API beklemesinden ÖNCE) alınır
        let dir = null
        if (dosyaSistemiDestekli()) {
          try { dir = await kayitKlasoruVarsa() } catch { dir = null }
        }

        try {
          await api.belgeSil(id) // iade hareketleri sunucuda yazılır
        } catch (hata) {
          return bildir('hata', hata.message)
        }
        if (zimmetForm.id === id) setZimmetForm(bosZimmetBelge())
        await tumuYukle({ sessiz: true })

        if (!dosyaSistemiDestekli()) {
          bildir('hata', 'Belge silindi. (PDF tarayıcı tarafından yönetilmiyor; varsa İndirilenler\'den elle silin.)')
          return
        }
        try {
          if (!dir) { bildir('hata', 'Belge silindi. PDF klasörüne erişilemediği için dosya silinemedi.'); return }
          await dosyaSil(dir, dosyaAdiUret(belge))
          bildir('ok', 'Belge ve PDF dosyası silindi; zimmetli ürünler iade edildi.')
        } catch (e) {
          if (e?.name === 'NotFoundError') bildir('hata', 'Belge silindi. (PDF dosyası klasörde bulunamadı.)')
          else if (e?.name === 'AbortError') bildir('hata', 'Belge silindi. (Klasör izni verilmediği için PDF silinemedi.)')
          else { console.error(e); bildir('hata', 'Belge silindi; PDF silinemedi: ' + (e?.message || e)) }
        }
      }
    )
  }

  const iadeAl = (belgeId, kalemId) => {
    const belge = belgeler.find((b) => b.id === belgeId)
    const it = belge?.items.find((x) => x.id === kalemId)
    if (!belge || !it) return
    onayIste(`${belge.adSoyad} üzerindeki "${urunAdi(it.urunId)}" iade alınsın mı?`, async () => {
      try {
        await api.iadeAl(belgeId, kalemId) // kalem durumu + iade hareketi sunucuda güncellenir
      } catch (hata) {
        return bildir('hata', hata.message)
      }
      const tarih = bugun()
      if (zimmetForm.id === belgeId) {
        setZimmetForm((f) => ({ ...f, items: f.items.map((x) => (x.id !== kalemId ? x : { ...x, durum: 'iade', iadeTarihi: tarih })) }))
      }
      await tumuYukle({ sessiz: true })
      bildir('ok', 'İade alındı, ürün boşa düştü.')
    })
  }

  const pdfIndir = async () => {
    if (!kartRef.current) return
    setPdfYapiliyor(true)
    try {
      const pdf = await pdfOlustur()
      pdf.save(dosyaAdiUret(zimmetForm))
      bildir('ok', 'PDF indirildi.')
    } catch (e) {
      console.error(e)
      bildir('hata', 'PDF oluşturulurken hata oluştu.')
    } finally {
      setPdfYapiliyor(false)
    }
  }

  const yazdir = () => window.print()

  // ---- Toplu dışa aktarma ----

  const tumunuExcel = () => {
    if (!belgeler.length) return bildir('hata', 'Dışa aktarılacak belge yok.')
    const baslik = [
      'Belge No', 'Adı Soyadı', 'Görevi', 'Bölümü', 'Teslim Tarihi',
      'Ürün', 'Adet', 'İade Tarihi', 'Durum', 'Açıklama',
      'Teslim Alan', 'Teslim Eden',
    ]
    const satirlar = []
    belgeler.forEach((b) => {
      const items = b.items?.length ? b.items : [{}]
      items.forEach((it) => {
        satirlar.push([
          b.belgeNo || '', b.adSoyad || '', b.gorev || '', b.bolum || '', trTarih(b.teslimTarihi),
          it.urunId ? urunAdi(it.urunId) : '', it.adet ?? '', it.iadeTarihi ? trTarih(it.iadeTarihi) : '',
          it.durum === 'iade' ? 'İade edildi' : 'Zimmetli', it.aciklama || '',
          b.teslimAlan || '', b.teslimEden || '',
        ])
      })
    })
    const ws = XLSX.utils.aoa_to_sheet([baslik, ...satirlar])
    ws['!cols'] = [16, 20, 16, 16, 13, 26, 6, 13, 12, 28, 16, 16].map((w) => ({ wch: w }))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Zimmet Belgeleri')
    XLSX.writeFile(wb, `Zimmet_Belgeleri_${bugun()}.xlsx`)
    bildir('ok', `${belgeler.length} belge (${satirlar.length} satır) Excel'e aktarıldı.`)
  }

  const ekranDisiCiz = (belge) =>
    new Promise((res) => {
      setTopluData(belge)
      requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(res, 250)))
    })

  const tumPdfKaydet = async () => {
    if (!belgeler.length) return bildir('hata', 'PDF üretilecek belge yok.')
    let dir = null
    if (dosyaSistemiDestekli()) {
      try {
        dir = await kayitKlasoruGetir()
        setKlasorAdi(dir.name)
      } catch (e) {
        yazmaHatasi(e)
        return
      }
    }
    setTopluYapiliyor(true)
    let sayac = 0
    try {
      for (const b of belgeler) {
        await ekranDisiCiz(b)
        const pdf = await pdfOlustur(topluRef.current)
        const ad = dosyaAdiUret(b)
        if (dir) await blobYaz(dir, ad, pdf.output('blob'))
        else pdf.save(ad)
        sayac++
      }
      bildir('ok', dir ? `${sayac} PDF "${dir.name}" klasörüne yazıldı.` : `${sayac} PDF indirildi.`)
    } catch (e) {
      console.error(e)
      bildir('hata', 'Toplu PDF sırasında hata: ' + (e?.message || e))
    } finally {
      setTopluYapiliyor(false)
      setTopluData(null)
    }
  }

  const gosterilenBelgeler = useMemo(() => {
    const q = norm(arama)
    if (!q) return belgeler
    return belgeler.filter((b) => {
      const kalemler = b.items.flatMap((it) => [urunAdi(it.urunId), urunSeriNo(it.urunId), it.durum === 'iade' ? 'iade' : 'zimmetli'])
      const hedef = norm([b.adSoyad, b.belgeNo, b.teslimAlan, b.teslimEden, b.gorev, b.bolum, ...kalemler].join(' '))
      return hedef.includes(q)
    })
  }, [belgeler, arama, urunler])

  // Liste satırları: her kalem ayrı satır, ama her cihaz (ürün) için yalnızca SON kayıt görünür.
  //  - Ürün şu an zimmetliyse yalnız zimmetli satır(lar)ı gösterilir (adetli ürünlerde birden çok olabilir).
  //  - Hiç zimmetli değilse yalnız en son iade satırı gösterilir (Zimmetle ile yeniden verilebilir).
  // Önceki kayıtlar silinmez: Kişiler kartında, tutanaklarda ve loglarda durur. Satırda
  // "kimden alındı / kime verildi" görünsün diye önceki kullanıcı (onceki) eklenir.
  const belgeSatirlari = useMemo(() => {
    const zaman = (b) => String(b.olusturma || b.teslimTarihi || '')
    const tumKalemler = belgeler.flatMap((b) => b.items.map((it) => ({ b, it })))
    const urunKalemleri = new Map()
    for (const k of tumKalemler) {
      if (!urunKalemleri.has(k.it.urunId)) urunKalemleri.set(k.it.urunId, [])
      urunKalemleri.get(k.it.urunId).push(k)
    }
    for (const l of urunKalemleri.values()) l.sort((x, y) => zaman(y.b).localeCompare(zaman(x.b))) // yeniden eskiye
    const gorunur = new Set()
    const onceki = new Map()
    for (const l of urunKalemleri.values()) {
      const zimmetli = l.filter((k) => k.it.durum !== 'iade')
      const secilen = zimmetli.length ? zimmetli : l.slice(0, 1)
      for (const k of secilen) {
        gorunur.add(k.it.id)
        // bu kayıttan önceki son iade: "önceki kullanıcı"
        const once = l.find((x) => x.it.id !== k.it.id && x.it.durum === 'iade' && zaman(x.b) <= zaman(k.b))
        if (k.it.durum === 'iade') onceki.set(k.it.id, k.b.adSoyad)
        else if (once) onceki.set(k.it.id, once.b.adSoyad)
      }
    }
    return gosterilenBelgeler.flatMap((b) => {
      if (!b.items.length) return [{ b, it: null }]
      return b.items.filter((it) => gorunur.has(it.id)).map((it) => ({ b, it, onceki: onceki.get(it.id) || '' }))
    })
  }, [gosterilenBelgeler, belgeler])

  const suzulmusHareketler = useMemo(() => {
    let l = hareketler
    if (hTip !== 'tumu') l = l.filter((h) => h.tip === hTip)
    if (hBaslangic) l = l.filter((h) => String(h.tarih) >= hBaslangic)
    if (hBitis) l = l.filter((h) => String(h.tarih) <= hBitis)
    const a = hArama.trim().toLocaleLowerCase('tr')
    if (a) {
      l = l.filter((h) =>
        [urunAdi(h.urunId), urunSeriNo(h.urunId), h.aciklama].some((v) => String(v || '').toLocaleLowerCase('tr').includes(a)))
    }
    return l
  }, [hareketler, hTip, hBaslangic, hBitis, hArama, urunler])

  // ---- yedekleme ----

  const yedekle = () => {
    const veri = { uygulama: 'zimmet-envanter', surum: 1, tarih: new Date().toISOString(), urunler, belgeler, hareketler }
    const blob = new Blob([JSON.stringify(veri, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `zimmet-envanter-yedek-${bugun()}.json`
    a.click()
    URL.revokeObjectURL(a.href)
    bildir('ok', 'Yedek dosyası indirildi.')
  }

  const geriYukle = (e) => {
    const dosya = e.target.files?.[0]
    e.target.value = ''
    if (!dosya) return
    const ad = dosya.name.toLowerCase()
    // Excel (.xlsx/.xls) → Rapor'un Envanter sayfasından toplu YENİ ürün ekle
    if (ad.endsWith('.xlsx') || ad.endsWith('.xls')) return excelIceAktar(dosya)
    // .json → mevcut yedek geri yükleme (üzerine yaz)
    const okuyucu = new FileReader()
    okuyucu.onload = () => {
      try {
        const v = JSON.parse(okuyucu.result)
        if (!Array.isArray(v.urunler) || !Array.isArray(v.belgeler) || !Array.isArray(v.hareketler))
          throw new Error('biçim hatası')
        onayIste(
          `Yedekte ${v.urunler.length} ürün, ${v.belgeler.length} zimmet belgesi var. Veritabanındaki mevcut verilerin ÜZERİNE yazılsın mı?`,
          async () => {
            try {
              await api.yedekYukle(v)
              await tumuYukle({ sessiz: true })
              bildir('ok', 'Yedek veritabanına geri yüklendi.')
            } catch (hata) {
              bildir('hata', 'Geri yükleme başarısız: ' + hata.message)
            }
          }
        )
      } catch {
        bildir('hata', 'Geçersiz dosya. Yedek için .json, toplu ürün/zimmet eklemek için Rapor (.xlsx) dosyası seçin.')
      }
    }
    okuyucu.readAsText(dosya)
  }

  // Rapor Excel'ini içe aktarır: "Envanter" sayfasından YENİ ürünler,
  // "Zimmet" sayfasından YENİ zimmet belgeleri oluşturulur. İki sayfa da isteğe bağlıdır.
  // Zimmetli/Boşta gibi hesaplanan sütunlar okunmaz; ürün adı boş satırlar atlanır.
  const excelIceAktar = async (dosya) => {
    try {
      const data = await dosya.arrayBuffer()
      const wb = XLSX.read(data, { type: 'array' })
      const sayfaOku = (ad) => (wb.Sheets[ad] ? XLSX.utils.sheet_to_json(wb.Sheets[ad], { defval: '' }) : [])

      // --- Envanter sayfası → yeni ürünler ---
      const envanterSayfasi = wb.Sheets['Envanter'] || (!wb.Sheets['Zimmet'] ? wb.Sheets[wb.SheetNames[0]] : null)
      const urunSatirlari = envanterSayfasi ? XLSX.utils.sheet_to_json(envanterSayfasi, { defval: '' }) : []
      const yeniUrunler = urunSatirlari.map((r) => ({
        ad: String(r['Ürün'] ?? '').trim(),
        kategori: String(r['Kategori'] ?? '').trim(),
        markaModel: String(r['Marka / Model'] ?? '').trim(),
        seriNo: String(r['Seri No'] ?? '').trim(),
        barkod: String(r['Barkod'] ?? '').trim(),
        birim: String(r['Birim'] ?? '').trim() || 'Adet',
        konum: String(r['Konum / Depo'] ?? '').trim(),
        stok: Math.max(0, Number(r['Stok'] || 0)),
        minStok: Math.max(0, Number(r['Kritik Seviye'] || 0)),
        aciklama: String(r['Açıklama'] ?? '').trim(),
      })).filter((u) => u.ad)

      // --- Zimmet sayfası → belgeler (her satır bir kalem; aynı belge birden çok satır olabilir) ---
      // Gruplama anahtarı: Belge No; boşsa "Adı Soyadı + Teslim Tarihi".
      const zimmetSatirlari = sayfaOku('Zimmet')
      const gruplar = new Map()
      for (const r of zimmetSatirlari) {
        const adSoyad = String(r['Adı Soyadı'] ?? '').trim()
        const urunMetni = String(r['Ürün'] ?? '').trim()
        if (!adSoyad || !urunMetni) continue // eksik satırı atla
        const teslimTarihi = isoTarih(r['Teslim Tarihi']) || bugun()
        const anahtar = String(r['Belge No'] ?? '').trim() || `${adSoyad}|${teslimTarihi}`
        if (!gruplar.has(anahtar)) {
          gruplar.set(anahtar, {
            adSoyad, teslimTarihi,
            gorev: String(r['Görevi'] ?? '').trim(),
            bolum: String(r['Bölümü'] ?? '').trim(),
            teslimAlan: String(r['Teslim Alan'] ?? '').trim(),
            teslimEden: String(r['Teslim Eden'] ?? '').trim(),
            kalemler: [],
          })
        }
        gruplar.get(anahtar).kalemler.push({
          urunMetni,
          adet: Math.max(1, Number(r['Adet'] || 1)),
          iadeTarihi: isoTarih(r['İade Tarihi']) || '',
          aciklama: String(r['Açıklama'] ?? '').trim(),
        })
      }
      const belgeTaslaklari = [...gruplar.values()]

      if (!yeniUrunler.length && !belgeTaslaklari.length) {
        return bildir('hata',
          'Excel’de aktarılacak veri bulunamadı. "Envanter" sayfasında Ürün, "Zimmet" sayfasında Adı Soyadı ve Ürün sütunları dolu olmalı.')
      }

      const ozet = [
        yeniUrunler.length ? `${yeniUrunler.length} ürün` : '',
        belgeTaslaklari.length ? `${belgeTaslaklari.length} zimmet belgesi` : '',
      ].filter(Boolean).join(' ve ')

      onayIste(
        `Excel'den ${ozet} YENİ olarak eklenecek (mevcut kayıtlar korunur). Devam edilsin mi?`,
        async () => {
          try {
            // 1) Önce ürünler: zimmet kalemleri envanterdeki ürüne bağlandığından sıra önemli.
            let eklenenUrun = 0
            if (yeniUrunler.length) {
              const r = await api.urunTopluEkle(yeniUrunler)
              eklenenUrun = r.eklenen ?? yeniUrunler.length
            }
            // Yeni ürünlerin de eşleşebilmesi için güncel listeyi al.
            const veri = await tumuYukle({ sessiz: true })
            const guncelUrunler = veri?.urunler || urunler

            // 2) Zimmet belgeleri
            let eklenenBelge = 0
            const hatalar = []
            for (const t of belgeTaslaklari) {
              const items = []
              let eksikUrun = ''
              for (const k of t.kalemler) {
                const u = urunBul(k.urunMetni, guncelUrunler)
                if (!u) { eksikUrun = k.urunMetni; break }
                items.push({ id: yeniId(), urunId: u.id, adet: k.adet, iadeTarihi: k.iadeTarihi, aciklama: k.aciklama, durum: 'zimmetli' })
              }
              if (eksikUrun) { hatalar.push(`${t.adSoyad}: "${eksikUrun}" envanterde yok`); continue }
              try {
                await api.belgeEkle({ ...bosZimmetBelge(), ...t, id: yeniId(), items })
                eklenenBelge++
              } catch (hata) {
                hatalar.push(`${t.adSoyad}: ${hata.message}`)
              }
            }

            await tumuYukle({ sessiz: true })
            const parcalar = [
              eklenenUrun ? `${eklenenUrun} ürün` : '',
              eklenenBelge ? `${eklenenBelge} zimmet belgesi` : '',
            ].filter(Boolean).join(', ')
            if (hatalar.length) {
              bildir('hata', `${parcalar || 'Kayıt'} eklendi; ${hatalar.length} belge eklenemedi → ${hatalar.slice(0, 3).join(' | ')}${hatalar.length > 3 ? ' …' : ''}`)
            } else {
              bildir('ok', `${parcalar} Excel'den eklendi.`)
            }
          } catch (hata) {
            bildir('hata', 'İçe aktarma başarısız: ' + hata.message)
          }
        }
      )
    } catch (err) {
      console.error(err)
      bildir('hata', 'Excel okunamadı. Geçerli bir .xlsx dosyası seçin.')
    }
  }

  // ---- görünüm ----

  const detayUrunu = detayId ? urunler.find((u) => u.id === detayId) : null
  const tutanakBelge = tutanakId ? belgeler.find((b) => b.id === tutanakId) : null
  const cepTutanakKayit = cepTutanakId ? cepKayitlari.find((k) => k.id === cepTutanakId) : null
  const cepDetayKayit = cepDetayId ? cepKayitlari.find((k) => k.id === cepDetayId) : null

  // Menü, kullanıcının SUNUCUDAN gelen izinlerine göre süzülür.
  // (Arayüz kolaylığıdır; erişimi asıl engelleyen sunucudaki politikadır.)
  const SEKMELER = YOLLAR.filter((y) => !y.izin || izinVar(y.izin))

  const yazabilir = izinVar(Izin.ENVANTER_YAZ)
  const iceAktarabilir = izinVar(Izin.VERI_ICE_AKTAR)

  // Yetkisiz yolda hiçbir sekme içeriği çizilmez; yerine 403 gösterilir.
  const gorunum = yolYasak ? '_yasak' : sekme

  const cikis = () => onayIste('Oturumu kapatmak istediğinize emin misiniz?', async () => {
    await cikisYap()
    navigate('/login', { replace: true })
  })

  return (
    <div className="uygulama">
      <header className="ust-bar">
        <div className="marka">
          <img src="/logo.png" alt="logo" className="marka-logo" onError={(e) => { e.target.style.display = 'none' }} />
          <div>
            <h1>Zimmet &amp; Envanter</h1>
            <span>Ürün, stok ve zimmet takibi — tek uygulama</span>
          </div>
        </div>
        <nav className="sekmeler">
          {SEKMELER.map((y) => (
            <button key={y.sekme} className={sekme === y.sekme ? 'aktif' : ''} onClick={() => setSekme(y.sekme)}>{y.etiket}</button>
          ))}
        </nav>
        <div className="ust-aksiyon">
          {/* Rapor ve yedek alma yazma işlemi değildir ama tüm veriyi dışa aktarır →
              yalnızca zimmet/envanter yazma yetkisi olanlara açıktır. */}
          {izinVar(Izin.RAPOR_OKU) && (
            <button
              className="btn btn-ikincil sm"
              onClick={() => {
                if (urunler.length === 0) return bildir('hata', 'Rapor için önce ürün ekleyin.')
                excelRaporIndir(urunler, belgeler, hareketler, { zimmetliAdet, bostaAdet, urunAdi })
                bildir('ok', 'Excel raporu indirildi.')
              }}
              title="Envanter, zimmet ve hareketleri Excel dosyası olarak indir"
            >📊 Rapor</button>
          )}
          {izinVar(Izin.RAPOR_OKU) && (
            <button className="btn btn-ghost sm" onClick={yedekle} title="Tüm verileri .json dosyası olarak indir">⬇ Yedekle</button>
          )}
          {iceAktarabilir && (
            <>
              <button className="btn btn-ghost sm" onClick={() => yedekRef.current?.click()} title="Yedek (.json) geri yükle veya Rapor (.xlsx) ile toplu ürün/zimmet ekle">⬆ Geri Yükle</button>
              <input ref={yedekRef} type="file" accept="application/json,.json,.xlsx,.xls" hidden onChange={geriYukle} />
            </>
          )}

          <div className="kullanici-kutu" title={kullanici?.kullaniciAdi}>
            <span className="kullanici-ad">{kullanici?.gorunenAd || kullanici?.kullaniciAdi}</span>
            <span className={`rozet ${adminMi ? 'rozet-mavi' : 'rozet-gri'}`}>{kullanici?.rol}</span>
          </div>
          <button className="btn btn-ghost sm" onClick={cikis} title="Oturumu kapat">⏻ Çıkış</button>
        </div>
      </header>

      {mesaj && <div className={`bildirim ${mesaj.tip}`}>{mesaj.metin}</div>}

      {sunucuYok && (
        <div className="uyari-banner">
          ⚠ Sunucuya ulaşılamıyor — veriler yüklenemedi. Sunucunun çalıştığından emin olun.{' '}
          <button className="btn btn-ikincil sm" onClick={() => tumuYukle()}>Yeniden dene</button>
        </div>
      )}
      {yukleniyor && !sunucuYok && <div className="bildirim ok">Veriler yükleniyor…</div>}

      {/* Özet kartları yalnızca Genel Bakış ve Hareketler'de */}
      {(gorunum === 'ozet' || gorunum === 'hareket') && (
        <div className="ozet-kartlar">
          <div className="ozet-kart"><b>{ozet.cesit}</b><span>Ürün Çeşidi</span></div>
          <div className="ozet-kart"><b>{ozet.stok}</b><span>Toplam Stok</span></div>
          <div className="ozet-kart"><b>{ozet.zimmetli}</b><span>Zimmetli</span></div>
          <div className={`ozet-kart ${ozet.kritik ? 'kritik' : ''}`}><b>{ozet.kritik}</b><span>Kritik Stok</span></div>
        </div>
      )}

      {kritikUrunler.length > 0 && ['ozet', 'envanter', 'hareket'].includes(gorunum) && (
        <div className="uyari-banner">
          ⚠ Kritik stok: {kritikUrunler.map((u) => `${u.ad} (boşta ${bostaAdet(u.id)}, min ${u.minStok})`).join(' · ')}
        </div>
      )}

      {gorunum === '_yasak' && <Forbidden />}

      {gorunum === 'kullanicilar' && <KullaniciYonetimi bildir={bildir} onayIste={onayIste} />}
      {gorunum === 'loglar' && <DenetimGunlugu bildir={bildir} />}
      {gorunum === 'yonetim' && <YonetimAyarlari bildir={bildir} />}

      {gorunum === 'ozet' && (
        <main className="govde tek-sutun">
          {urunler.length === 0 ? (
            <section className="panel bos-panel">
              <h2>Envanteriniz henüz boş</h2>
              <p>{yazabilir
                ? 'İlk ürününüzü ekleyerek başlayın; stok durumu, zimmetler ve hareketler burada özetlenecek.'
                : 'Envantere ürün eklendiğinde stok durumu ve zimmetler burada özetlenecek.'}</p>
              {yazabilir && <button className="btn btn-ana" onClick={() => setSekme('envanter')}>İlk Ürünü Ekle</button>}
            </section>
          ) : (
            <div className="pano-grid">
              <section className="panel">
                <div className="panel-baslik">Kategori Dağılımı (stok)</div>
                {(() => {
                  const enCok = Math.max(...kategoriOzeti.map((k) => k.stok), 1)
                  return kategoriOzeti.map((k) => (
                    <div className="cubuk-satir" key={k.kategori}>
                      <span className="cubuk-ad" title={k.kategori}>{k.kategori}</span>
                      <div className="cubuk-dis"><div className="cubuk-ic" style={{ width: `${Math.max(3, (k.stok / enCok) * 100)}%` }} /></div>
                      <span className="cubuk-deger">{k.stok} adet · {k.cesit} çeşit</span>
                    </div>
                  ))
                })()}
              </section>

              <section className="panel">
                <div className="panel-baslik-satir">
                  <div className="panel-baslik">Kişi Bazlı Zimmet</div>
                  {izinVar(Izin.ZIMMET_OKU) && <button className="btn btn-ghost sm" onClick={() => setSekme('kisiler')}>Tümünü Gör</button>}
                </div>
                {kisiOzeti.length === 0 ? (
                  <p className="bos-metin">Aktif zimmet yok.</p>
                ) : (
                  <table className="tablo">
                    <thead>
                      <tr><th>Kişi</th><th className="sag">Belge</th><th className="sag">Toplam Adet</th></tr>
                    </thead>
                    <tbody>
                      {kisiOzeti.map((k) => (
                        <tr key={k.kisi}>
                          <td className="tikla" onClick={() => setDetayKisi(k.kisi)} title="Kişi kartını aç"><b>{k.kisi}</b></td>
                          <td className="sag">{k.kayit}</td>
                          <td className="sag">{k.adet}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </section>

              <section className="panel">
                <div className="panel-baslik">Kritik Stok</div>
                {kritikUrunler.length === 0 ? (
                  <p className="bos-metin">✓ Tüm ürünlerin stok seviyesi yeterli.</p>
                ) : (
                  <table className="tablo">
                    <thead>
                      <tr><th>Ürün</th><th className="sag">Boşta</th><th className="sag">Min</th><th>İşlem</th></tr>
                    </thead>
                    <tbody>
                      {kritikUrunler.map((u) => (
                        <tr key={u.id}>
                          <td><b>{u.ad}</b></td>
                          <td className="sag">{bostaAdet(u.id)}</td>
                          <td className="sag">{u.minStok}</td>
                          <td>{yazabilir
                            ? <button className="btn btn-ikincil sm" onClick={() => stokPencereAc(u, 'giris')}>+ Giriş</button>
                            : <span className="bos-metin">—</span>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </section>

              <section className="panel">
                <div className="panel-baslik-satir">
                  <div className="panel-baslik">Son Hareketler</div>
                  {yazabilir && <button className="btn btn-ghost sm" onClick={() => setSekme('hareket')}>Tümünü Gör</button>}
                </div>
                {hareketler.length === 0 ? (
                  <p className="bos-metin">Henüz hareket yok.</p>
                ) : (
                  <table className="tablo">
                    <thead>
                      <tr><th>Tarih</th><th>Ürün</th><th>Tip</th><th className="sag">Adet</th></tr>
                    </thead>
                    <tbody>
                      {hareketler.slice(0, 8).map((h) => {
                        const [etiket, sinif] = HAREKET_ETIKET[h.tip] || [h.tip, 'rozet-gri']
                        return (
                          <tr key={h.id}>
                            <td>{trTarih(h.tarih)}</td>
                            <td><b>{urunAdi(h.urunId)}</b></td>
                            <td><span className={`rozet ${sinif}`}>{etiket}</span></td>
                            <td className="sag">{h.adet}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                )}
              </section>
            </div>
          )}
        </main>
      )}

      {gorunum === 'envanter' && (
        <main className="govde tek-sutun">
          {/* Yazma butonları yalnızca ENVANTER_YAZ iznine sahip kullanıcıya gösterilir.
              Gizlemek güvenlik değildir — aynı kural sunucuda da uygulanır (403). */}
          {yazabilir ? (
            <div className="envanter-ust-cubuk">
              <button
                className="btn btn-ana"
                onClick={() => {
                  setSeriNolar([])
                  if (formAcik) {
                    setFormAcik(false)
                    setUrunForm(bosUrun())
                    setDuzenlenenId(null)
                  } else {
                    setUrunForm(bosUrun())
                    setDuzenlenenId(null)
                    setFormAcik(true)
                  }
                }}
              >
                {formAcik ? '✕ Vazgeç' : '＋ Yeni Ürün Ekle'}
              </button>
            </div>
          ) : (
            <div className="bilgi-serit">
              👁 Görüntüleme yetkisiyle giriş yaptınız. Envanteri listeleyip arayabilir, ürün
              detaylarını görebilirsiniz; ekleme, düzenleme ve silme işlemleri yetkiniz dışındadır.
            </div>
          )}

          {yazabilir && formAcik && (
          <section className="panel">
            <div className="panel-baslik">{duzenlenenId ? 'Ürünü Düzenle' : 'Yeni Ürün'}</div>
            <form onSubmit={urunKaydet}>
              <div className="grid-2">
                <label className="field"><span>Ürün Adı *</span>
                  <div className="urun-ad-satir">
                    <select value={urunForm.ad} onChange={(e) => setUrunForm({ ...urunForm, ad: e.target.value })}>
                      <option value="">— Ürün seçin —</option>
                      {urunForm.ad && !urunListesi.some((u) => u.ad === urunForm.ad) && (
                        <option value={urunForm.ad}>{urunForm.ad}</option>
                      )}
                      {urunListesi.map((u) => <option key={u.id} value={u.ad}>{u.ad}</option>)}
                    </select>
                    <button type="button" className="btn btn-ikincil sm" onClick={() => setListeYonetimAcik(true)} title="Ürün listesini düzenle (ekle/çıkar)">⚙ Liste</button>
                  </div>
                </label>
                <label className="field"><span>Kategori</span>
                  <div className="urun-ad-satir">
                    <select value={urunForm.kategori} onChange={(e) => setUrunForm({ ...urunForm, kategori: e.target.value })}>
                      <option value="">— Kategori seçin —</option>
                      {urunForm.kategori && !kategoriListesi.some((k) => k.ad === urunForm.kategori) && (
                        <option value={urunForm.kategori}>{urunForm.kategori}</option>
                      )}
                      {kategoriListesi.map((k) => <option key={k.id} value={k.ad}>{k.ad}</option>)}
                    </select>
                    <button type="button" className="btn btn-ikincil sm" onClick={() => setKategoriYonetimAcik(true)} title="Kategori listesini düzenle (ekle/çıkar)">⚙ Liste</button>
                  </div>
                </label>
                <label className="field"><span>Marka / Model</span>
                  <div className="urun-ad-satir">
                    <select value={urunForm.markaModel} onChange={(e) => setUrunForm({ ...urunForm, markaModel: e.target.value })}>
                      <option value="">— Marka / Model seçin —</option>
                      {urunForm.markaModel && !markaListesi.some((m) => m.ad === urunForm.markaModel) && (
                        <option value={urunForm.markaModel}>{urunForm.markaModel}</option>
                      )}
                      {markaListesi.map((m) => <option key={m.id} value={m.ad}>{m.ad}</option>)}
                    </select>
                    <button type="button" className="btn btn-ikincil sm" onClick={() => setMarkaYonetimAcik(true)} title="Marka / Model listesini düzenle (ekle/çıkar)">⚙ Liste</button>
                  </div>
                </label>
                <label className="field"><span>Seri No</span>
                  {cokluSeriAlani ? (
                    <input value={`${seriAdet} adet — aşağıdan her biri için girin`} disabled className="salt-okunur" />
                  ) : (
                    <BarkodAlan
                      value={urunForm.seriNo}
                      onChange={(v) => setUrunForm({ ...urunForm, seriNo: v })}
                      placeholder="Okuyucu, foto veya elle"
                      ocr
                      bildir={bildir}
                    />
                  )}
                </label>
                <label className="field"><span>Barkod / Demirbaş No</span>
                  <BarkodAlan
                    value={urunForm.barkod || ''}
                    onChange={(v) => setUrunForm({ ...urunForm, barkod: v })}
                    placeholder="Okuyucu, foto veya elle"
                    bildir={bildir}
                  />
                </label>
                <label className="field"><span>Birim</span>
                  <select value={urunForm.birim} onChange={(e) => setUrunForm({ ...urunForm, birim: e.target.value })}>
                    {BIRIMLER.map((b) => <option key={b}>{b}</option>)}
                  </select>
                </label>
                <label className="field"><span>Konum / Depo</span>
                  <div className="urun-ad-satir">
                    <select value={urunForm.konum} onChange={(e) => setUrunForm({ ...urunForm, konum: e.target.value })}>
                      <option value="">— Konum seçin —</option>
                      {urunForm.konum && !konumListesi.some((k) => k.ad === urunForm.konum) && (
                        <option value={urunForm.konum}>{urunForm.konum}</option>
                      )}
                      {konumListesi.map((k) => <option key={k.id} value={k.ad}>{k.ad}</option>)}
                    </select>
                    <button type="button" className="btn btn-ikincil sm" onClick={() => setKonumYonetimAcik(true)} title="Konum listesini düzenle (ekle/çıkar)">⚙ Liste</button>
                  </div>
                </label>
                <label className="field"><span>Stok Adedi{duzenlenenId ? ' (düzenlemede değiştirilemez)' : ''}</span>
                  <input
                    type="number" min="0" value={urunForm.stok}
                    onChange={(e) => setUrunForm({ ...urunForm, stok: e.target.value })}
                    placeholder="0"
                    disabled={!!duzenlenenId}
                    className={duzenlenenId ? 'salt-okunur' : ''}
                    title={duzenlenenId ? 'Mevcut ürünün stok adedi burada değiştirilemez.' : ''}
                  />
                </label>
                <label className="field"><span>Durum</span>
                  <select value={urunForm.calismaDurumu === 'arizali' ? 'arizali' : 'calisir'} onChange={(e) => setUrunForm({ ...urunForm, calismaDurumu: e.target.value })}>
                    <option value="calisir">Çalışır</option>
                    <option value="arizali">Arızalı</option>
                  </select>
                </label>
                <label className="field"><span>Kritik Stok Seviyesi</span>
                  <input type="number" min="0" value={urunForm.minStok} onChange={(e) => setUrunForm({ ...urunForm, minStok: e.target.value })} placeholder="Uyarı eşiği (0 = kapalı)" />
                </label>
              </div>
              {cokluSeriAlani && (
                <div className="seri-listesi" style={{ marginTop: 12 }}>
                  <div className="alt-metin" style={{ marginBottom: 8 }}>
                    Her seri no ayrı bir kayıt olarak eklenir (stok 1), böylece cihazlar tek tek zimmetlenebilir.
                    Seri no girmeyecekseniz tüm alanları boş bırakın; ürün tek kayıt olarak {seriAdet} adet eklenir.
                  </div>
                  <div className="grid-2">
                    {Array.from({ length: seriAdet }, (_, i) => (
                      <label className="field" key={i}><span>Seri No {i + 1}</span>
                        <BarkodAlan
                          value={seriNoDegeri(i)}
                          onChange={(v) => setSeriNolar((onceki) => { const y = [...onceki]; y[i] = v; return y })}
                          placeholder="Okuyucu, foto veya elle"
                          ocr
                          bildir={bildir}
                        />
                      </label>
                    ))}
                  </div>
                </div>
              )}
              {!duzenlenenId && seriAdet > SERI_ALAN_SINIRI && (
                <div className="alt-metin" style={{ marginTop: 12 }}>
                  {SERI_ALAN_SINIRI} adetten fazlası için ayrı seri no alanları gösterilmez; ürün tek kayıt olarak eklenir.
                </div>
              )}
              <label className="field" style={{ marginTop: 12 }}><span>Açıklama</span>
                <input value={urunForm.aciklama} onChange={(e) => setUrunForm({ ...urunForm, aciklama: e.target.value })} />
              </label>
              <div className="form-aksiyon">
                <button type="submit" className="btn btn-ana">{duzenlenenId ? 'Güncelle' : 'Envantere Ekle'}</button>
                <button type="button" className="btn btn-ghost" onClick={() => { setUrunForm(bosUrun()); setSeriNolar([]); setDuzenlenenId(null); setFormAcik(false) }}>Vazgeç</button>
              </div>
            </form>
          </section>
          )}

          <section className="panel">
            <div className="panel-baslik-satir">
              <div className="panel-baslik">Envanter Listesi ({suzulmusUrunler.length})</div>
              <input className="arama" value={urunArama} onChange={(e) => setUrunArama(e.target.value)} placeholder="Ara: ad, kategori, seri no, barkod…" />
            </div>
            {suzulmusUrunler.length === 0 ? (
              <p className="bos-metin">{urunler.length === 0 ? 'Kayıtlı ürün yok. Yukarıdaki "＋ Yeni Ürün Ekle" butonundan ilk ürünü ekleyin.' : 'Aramaya uyan ürün yok.'}</p>
            ) : (
              <div className="tablo-kaydir">
                <table className="tablo liste-tablo">
                  <thead>
                    <tr>
                      {siraTh('ad', 'Ürün')}
                      {siraTh('kategori', 'Kategori')}
                      <th>Seri No</th>
                      {siraTh('konum', 'Konum')}
                      {siraTh('stok', 'Stok', true)}
                      {siraTh('zimmetli', 'Zimmetli')}
                      <th>Durum</th><th>İşlem</th>
                    </tr>
                  </thead>
                  <tbody>
                    {suzulmusUrunler.map((u) => (
                      <tr key={u.id} className={kritikMi(u) ? 'satir-kritik' : ''}>
                        <td className="tikla baslik-hucre" onClick={() => setDetayId(u.id)} title="Detayları görüntüle">
                          <b>{u.ad}</b>{u.markaModel && <div className="alt-metin">{u.markaModel}</div>}
                        </td>
                        <td data-label="Kategori">{u.kategori || '—'}</td>
                        <td data-label="Seri No">{u.seriNo || '—'}{u.barkod && <div className="alt-metin">{u.barkod}</div>}</td>
                        <td data-label="Konum">{u.konum || '—'}</td>
                        <td className="sag" data-label="Stok">{u.stok} {u.birim}</td>
                        <td data-label="Zimmetli">{Number(u.stok) > 1
                          ? <>{zimmetliAdet(u.id) > 0 ? <span className="rozet rozet-mavi">{zimmetliAdet(u.id)} Zimmetli</span> : null}{' '}
                              {bostaAdet(u.id) > 0 ? <span className="rozet rozet-yesil">{bostaAdet(u.id)} Boşta</span> : null}</>
                          : zimmetliAdet(u.id) > 0
                            ? <span className="rozet rozet-mavi">Zimmetli</span>
                            : <span className="rozet rozet-yesil">Boşta</span>}</td>
                        <td data-label="Durum">{u.calismaDurumu === 'arizali'
                          ? <span className="rozet rozet-kirmizi">Arızalı</span>
                          : <span className="rozet rozet-yesil">Çalışır</span>}</td>
                        <td className="islem">
                          <button className="btn btn-ghost sm" onClick={() => setDetayId(u.id)}>Detay</button>
                          {yazabilir && <button className="btn btn-ghost sm" onClick={() => urunDuzenle(u)}>Düzenle</button>}
                          {yazabilir && <button className="btn sm btn-sil" onClick={() => urunSil(u)}>Sil</button>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </main>
      )}

      {gorunum === 'zimmet' && (
        <>
          <div className="zimmet-ust-cubuk">
            <button
              className="btn btn-ana"
              onClick={() => {
                if (zimmetFormAcik) {
                  setZimmetFormAcik(false)
                } else {
                  setZimmetForm(bosZimmetBelge())
                  setZimmetFormAcik(true)
                }
              }}
            >
              {zimmetFormAcik ? '✕ Kapat' : '＋ Yeni Zimmet Belgesi'}
            </button>
          </div>

          {zimmetFormAcik && (
          <main className={onizlemeAcik ? 'govde govde-zimmet' : 'govde tek-sutun'}>
            <div className="panel form-panel">
              <div className="panel-baslik-satir">
                <h2 className="panel-baslik">{kayitliMi ? 'Zimmet Belgesini Düzenle' : 'Yeni Zimmet Belgesi'}</h2>
                <div className="kucuk-aksiyon">
                  <button className="btn btn-ghost sm" onClick={() => setOnizlemeAcik((a) => !a)} title="Belge önizlemesini göster/gizle">
                    {onizlemeAcik ? '👁 Önizlemeyi Gizle' : '👁 Önizleme'}
                  </button>
                  <button className="btn btn-ghost sm" onClick={klasorSec} title="Kayıt klasörünü seç/değiştir">
                    📁 {klasorAdi || 'Klasör seç'}
                  </button>
                  <button className="btn btn-ghost sm" onClick={() => setAyarAcik(true)} title="Amir e-postaları ve otomatik mail ayarları">
                    ✉ Mail{epostaHazir(epostaAyar) ? ' ✓' : ''}
                  </button>
                  <button className="btn btn-ghost sm" onClick={yeniKayit}>＋ Yeni</button>
                </div>
              </div>

              <ZimmetForm
                form={zimmetForm}
                setForm={setZimmetForm}
                urunler={urunler}
                maksAdet={maksAdet}
                teslimTarihiGuncelle={teslimTarihiGuncelle}
                bildir={bildir}
                personelListesi={personelListesi}
                personelListeAc={() => setPersonelYonetimAcik(true)}
              />

              <div className="form-aksiyon">
                <button className="btn btn-ikincil" onClick={kaydet} disabled={pdfYapiliyor || kayitliMi} title={kayitliMi ? 'Yüklü belge üzerindeyken pasiftir; değişiklik için Güncelle\'yi kullanın. Yeni belge için önce "Yeni".' : 'YENİ belge + yeni PDF oluşturur (mevcut belgeleri/PDF\'leri silmez).'}>
                  {pdfYapiliyor ? 'İşleniyor…' : '💾 Kaydet'}
                </button>
                <button className="btn btn-ikincil" onClick={guncelle} disabled={pdfYapiliyor || !kayitliMi} title={kayitliMi ? 'Yüklü belgeyi yerinde günceller ve stok farkını hareket olarak kaydeder' : 'Önce listeden bir belge yükleyin'}>
                  ✏️ Güncelle
                </button>
                <button className="btn btn-ikincil" onClick={yazdir}>🖨 Yazdır</button>
                <button className="btn btn-ana" onClick={pdfIndir} disabled={pdfYapiliyor}>
                  {pdfYapiliyor ? 'PDF hazırlanıyor…' : '⬇ PDF İndir'}
                </button>
              </div>
            </div>

            {/* Kart her zaman DOM'da kalır (kartRef → PDF/yazdırma); önizleme kapalıyken
                ekran dışına alınır ki form tam genişlik olsun ama PDF üretimi bozulmasın. */}
            <section className={onizlemeAcik ? 'panel onizleme-panel' : 'ekran-disi'} aria-hidden={!onizlemeAcik}>
              <div className="onizleme-ust">
                <span>Önizleme {kayitliMi ? '· kayıtlı' : '· kaydedilmedi'}</span>
              </div>
              <div className="onizleme-kaydirma">
                <ZimmetKart ref={kartRef} data={zimmetForm} urunler={urunler} minSatir={MIN_SATIR} />
              </div>
            </section>
          </main>
          )}

          <main className="govde tek-sutun">
            <section className="panel">
              <div className="panel-baslik-satir">
                <div className="panel-baslik">Zimmet Belgeleri ({new Set(belgeSatirlari.map((x) => x.b.id)).size})</div>
                <div className="filtre-grup">
                  <input className="arama" type="search" value={arama} onChange={(e) => setArama(e.target.value)} placeholder="🔎 Ara: ad, belge no, ürün, seri no…" />
                  <button className="btn btn-ghost sm" onClick={tumunuExcel} disabled={!belgeler.length} title="Tüm belgeleri tek Excel dosyasına aktar">⬇ Tümü Excel</button>
                  <button className="btn btn-ikincil sm" onClick={tumPdfKaydet} disabled={!belgeler.length || topluYapiliyor} title="Tüm belgelerin PDF'ini klasöre yaz">
                    {topluYapiliyor ? 'PDF üretiliyor…' : '⬇ Tüm PDF'}
                  </button>
                </div>
              </div>
              {belgeler.length === 0 ? (
                <p className="bos-metin">Henüz belge yok. Yukarıdaki formu doldurup "Kaydet" deyin.</p>
              ) : belgeSatirlari.length === 0 ? (
                <p className="bos-metin">"{arama}" ile eşleşen belge yok.</p>
              ) : (
                <div className="tablo-kaydir">
                  <table className="tablo liste-tablo">
                    <thead>
                      <tr><th>Belge No</th><th>Adı Soyadı</th><th>Görev</th><th>Marka/Model</th><th>Seri No</th><th>Zimmetli</th><th>Teslim Tarihi</th><th>İşlem</th></tr>
                    </thead>
                    <tbody>
                      {belgeSatirlari.map(({ b, it, onceki }) => {
                        const u = it ? urunler.find((x) => x.id === it.urunId) : null
                        const iade = it?.durum === 'iade'
                        return (
                          <tr key={`${b.id}-${it?.id || 'bos'}`} className={b.id === zimmetForm.id ? 'satir-aktif' : ''}>
                            <td className="baslik-hucre"><b>{b.belgeNo || '—'}</b></td>
                            <td data-label="Adı Soyadı">
                              {iade ? '—' : (b.adSoyad || '(isimsiz)')}
                              {onceki && <div className="alt-metin">{iade ? `İade eden: ${onceki}` : `Önceki: ${onceki}`}</div>}
                            </td>
                            <td data-label="Görev">{iade ? '—' : (b.gorev || '—')}</td>
                            <td data-label="Marka/Model">
                              {!it ? '—' : u ? (
                                <><b>{u.markaModel || u.ad}</b>{u.markaModel && <span className="alt-metin"> · {u.ad}</span>}
                                  {Number(it.adet) > 1 && <> × {it.adet}</>}</>
                              ) : '(silinmiş ürün)'}
                            </td>
                            <td data-label="Seri No">{(it && urunSeriNo(it.urunId)) || '—'}</td>
                            <td data-label="Zimmetli">{!it ? '—' : iade
                              ? <>Hayır{it.iadeTarihi && <div className="alt-metin">İade: {trTarih(it.iadeTarihi)}</div>}</>
                              : 'Evet'}</td>
                            <td data-label="Teslim Tarihi">{trTarih(b.teslimTarihi)}</td>
                            <td className="islem">
                              <button className="btn btn-ghost sm" onClick={() => setBelgeDetayId(b.id)} title="Belgenin tüm bilgileri ve ürünleri">Detay</button>
                              <button className="btn btn-ikincil sm" onClick={() => kayitYukle(b.id)} title="Belgeyi forma yükleyip güncelle">Güncelle</button>
                              {it && !iade && (
                                <button className="btn btn-ghost sm" onClick={() => belgeIadeAl(b, [it])} title="Bu ürünü iade al; stokta boşta görünür">İade Al</button>
                              )}
                              {it && iade && (
                                <button className="btn btn-ikincil sm" onClick={() => belgedenZimmetle(b, [it])} title="İade alınan ürünü yeni bir kişiye zimmetle">Zimmetle</button>
                              )}
                              {it && iade
                                ? <button className="btn btn-ghost sm" title="En son iade tutanağını görüntüle"
                                    onClick={() => setIadeOnizleme({ belge: b, kalemler: [it], iadeTarihi: it.iadeTarihi, teslimAlan: '' })}>İade Tutanağı</button>
                                : <button className="btn btn-ghost sm" onClick={() => setTutanakId(b.id)}>Tutanak</button>}
                              <button className="btn sm btn-sil" onClick={() => kayitSil(b.id)}>Sil</button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </main>

          {/* Toplu PDF üretimi için ekran dışı (görünmez) kart */}
          {topluData && (
            <div className="ekran-disi" aria-hidden="true">
              <ZimmetKart ref={topluRef} data={topluData} urunler={urunler} minSatir={MIN_SATIR} />
            </div>
          )}

          {ayarAcik && (
            <MailAyarPenceresi
              ayar={epostaAyar}
              onKaydet={async (yeni) => {
                try {
                  await api.epostaAyarKaydet(yeni) // tüm bilgisayarlarda ortak (veritabanında)
                  setEpostaAyar(yeni)
                  setAyarAcik(false)
                  bildir('ok', 'Mail ayarları kaydedildi.')
                } catch (hata) {
                  bildir('hata', 'Ayarlar kaydedilemedi: ' + hata.message)
                }
              }}
              onKapat={() => setAyarAcik(false)}
            />
          )}
        </>
      )}

      {gorunum === 'cep' && (
        <>
          <div className="zimmet-ust-cubuk">
            {cepFormAcik ? (
              <button className="btn btn-ana" onClick={() => { setCepFormAcik(false); setCepForm(bosCepKayit()) }}>✕ Kapat</button>
            ) : (
              <>
                <button className="btn btn-ikincil" onClick={cepStokYeni} title="Yeni alınan telefonu kimseye vermeden boşta olarak kaydet">＋ Yeni Telefon Girişi</button>
                <button className="btn btn-ana" onClick={cepYeni}>＋ Cep Telefonu Zimmet Kaydı</button>
              </>
            )}
          </div>

          {cepFormAcik && (
          <main className={cepStokModu ? 'govde tek-sutun' : 'govde govde-zimmet'}>
            <div className="panel form-panel">
              <div className="panel-baslik-satir">
                <h2 className="panel-baslik">{cepStokModu
                  ? (cepKayitliMi ? 'Telefon Bilgilerini Düzenle (Boşta)' : 'Yeni Telefon Girişi')
                  : (cepKayitliMi && !cepBostaZimmet ? 'Cep Telefonu Zimmet Kaydını Düzenle' : 'Cep Telefonu Zimmet Kaydı')}</h2>
                {!cepStokModu && <div className="kucuk-aksiyon">
                  <button className="btn btn-ghost sm" onClick={cepKlasorSec} title="Cep tutanağı PDF'lerinin kaydedileceği klasörü seç/değiştir (zimmet klasöründen ayrı)">
                    📁 {cepKlasorAdi || 'Klasör seç'}
                  </button>
                </div>}
              </div>
              {cepStokModu && (
                <p className="alt-metin" style={{ marginBottom: 12 }}>
                  Yeni alınan telefon kimseye zimmetlenmeden "Boşta" olarak listelenir. Sonra listedeki "Zimmetle" düğmesiyle
                  ya da Cep Telefonu Zimmet Kaydı formunda "Boştaki telefon" seçerek bir kişiye verebilirsiniz.
                </p>
              )}
              {!cepStokModu && (!cepKayitliMi || cepBostaZimmet) && bostakiTelefonlar.length > 0 && (
                <Field label={`Boştaki telefon (${bostakiTelefonlar.length})`}>
                  <select value={cepBostaZimmet ? cepForm.id : ''} onChange={(e) => cepBostaSec(e.target.value)}>
                    <option value="">— Yeni telefon (listeden seçmeden) —</option>
                    {bostakiTelefonlar.map((t) => (
                      <option key={t.id} value={t.id}>
                        {[t.markaModel || 'Telefon', t.imei && `IMEI ${t.imei}`, t.seriNo && `SN ${t.seriNo}`, t.hatNo && `Hat ${t.hatNo}`].filter(Boolean).join(' · ')}
                      </option>
                    ))}
                  </select>
                </Field>
              )}
              <div className="grid-2">
                {!cepStokModu && <Field label="Adı Soyadı *">
                  <div className="urun-ad-satir">
                    <select value={cepForm.adSoyad} onChange={(e) => cepPersonelSec(e.target.value)}>
                      <option value="">— Personel seçin —</option>
                      {cepForm.adSoyad && !personelListesi.some((p) => p.adSoyad === cepForm.adSoyad) && (
                        <option value={cepForm.adSoyad}>{cepForm.adSoyad}</option>
                      )}
                      {personelListesi.map((p) => <option key={p.id} value={p.adSoyad}>{p.adSoyad}</option>)}
                    </select>
                    <button type="button" className="btn btn-ikincil sm" onClick={() => setPersonelYonetimAcik(true)} title="Personel listesini düzenle (ekle/çıkar)">⚙ Liste</button>
                  </div>
                </Field>}
                <Field label="Hat No (telefon)">
                  <input value={cepForm.hatNo} onChange={(e) => setCepForm({ ...cepForm, hatNo: e.target.value })} placeholder="Örn: 0555 123 45 67" />
                </Field>
                <Field label="IMEI kodu">
                  <BarkodAlan
                    value={cepForm.imei}
                    onChange={(v) => setCepForm({ ...cepForm, imei: v })}
                    placeholder="Okuyucu, foto veya elle"
                    ocr
                    bildir={bildir}
                  />
                </Field>
                <Field label="Seri No">
                  <BarkodAlan
                    value={cepForm.seriNo}
                    onChange={(v) => setCepForm({ ...cepForm, seriNo: v })}
                    placeholder="Okuyucu, foto veya elle"
                    ocr
                    bildir={bildir}
                  />
                </Field>
                <Field label="Marka / Model">
                  <div className="urun-ad-satir">
                    <select value={cepForm.markaModel} onChange={(e) => cepMarkaSec(e.target.value)}>
                      <option value="">— Marka / Model seçin —</option>
                      {cepForm.markaModel && !cepMarkaListesi.some((m) => m.ad === cepForm.markaModel) && (
                        <option value={cepForm.markaModel}>{cepForm.markaModel}</option>
                      )}
                      {cepMarkaListesi.map((m) => <option key={m.id} value={m.ad}>{m.ad}</option>)}
                    </select>
                    <button type="button" className="btn btn-ikincil sm" onClick={() => setCepMarkaYonetimAcik(true)} title="Cep telefonu Marka / Model listesini düzenle (ekle/çıkar)">⚙ Liste</button>
                  </div>
                </Field>
                {!cepStokModu && <>
                <Field label="Tarih">
                  <input type="date" value={cepForm.tarih} onChange={(e) => setCepForm({ ...cepForm, tarih: e.target.value })} title="Takvimden seçin" />
                </Field>
                <Field label="Telefonu Teslim Eden">
                  <input value={cepForm.teslimEden} onChange={(e) => setCepForm({ ...cepForm, teslimEden: e.target.value })} placeholder="Ad Soyad" />
                </Field>
                <Field label="Telefonu Teslim Alan">
                  <input value={cepForm.teslimAlan} onChange={(e) => setCepForm({ ...cepForm, teslimAlan: e.target.value })} placeholder="Ad Soyad" />
                </Field>
                </>}
              </div>
              <div className="form-aksiyon">
                <button className="btn btn-ikincil" onClick={cepKaydet} disabled={pdfYapiliyor || (cepKayitliMi && !cepBostaZimmet)} title={cepBostaZimmet ? 'Boştaki telefonu seçilen kişiye zimmetler.' : cepKayitliMi ? 'Yüklü kayıtta pasiftir; değişiklik için Güncelle kullanın.' : 'YENİ kayıt oluşturur.'}>💾 {cepStokModu ? 'Boşta Olarak Kaydet' : 'Kaydet'}</button>
                <button className="btn btn-ikincil" onClick={cepGuncelle} disabled={pdfYapiliyor || !cepKayitliMi || cepBostaZimmet} title={cepKayitliMi ? 'Yüklü kaydı günceller' : 'Önce listeden bir kayıt yükleyin'}>✏️ Güncelle</button>
                {!cepStokModu && <>
                <button className="btn btn-ikincil" onClick={() => window.print()}>🖨 Yazdır</button>
                <button className="btn btn-ana" onClick={cepPdfIndir} disabled={pdfYapiliyor}>{pdfYapiliyor ? 'PDF hazırlanıyor…' : '⬇ PDF İndir'}</button>
                </>}
              </div>
            </div>

            {!cepStokModu && (
            <section className="panel onizleme-panel">
              <div className="onizleme-ust"><span>Önizleme {cepKayitliMi && !cepBostaZimmet ? '· kayıtlı' : '· kaydedilmedi'}</span></div>
              <div className="onizleme-kaydirma">
                <CepTelefonuKart ref={cepKartRef} data={cepForm} />
              </div>
            </section>
            )}
          </main>
          )}

          <main className="govde tek-sutun">
            <section className="panel">
              <div className="panel-baslik-satir">
                <div className="panel-baslik">Cep Telefonu Kayıtları ({cepGosterilen.length})</div>
                <input className="arama" type="search" value={cepArama} onChange={(e) => setCepArama(e.target.value)} placeholder="🔎 Ara: ad, hat no, marka…" />
              </div>
              {cepKayitlari.length === 0 ? (
                <p className="bos-metin">Henüz kayıt yok. Yukarıdaki "＋ Cep Telefonu Zimmet Kaydı" ile ekleyin.</p>
              ) : cepGosterilen.length === 0 ? (
                <p className="bos-metin">{cepArama ? `"${cepArama}" ile eşleşen kayıt yok.` : 'Zimmetli ya da boşta telefon yok.'}</p>
              ) : (
                <div className="tablo-kaydir">
                  <table className="tablo liste-tablo">
                    <thead>
                      <tr><th>Adı Soyadı</th><th>Hat No</th><th>Marka/Model</th><th>IMEI</th><th>Tarih</th><th>Zimmetli</th><th>Durum</th><th>İşlem</th></tr>
                    </thead>
                    <tbody>
                      {cepGosterilen.map((k) => (
                        <tr key={k.id} className={k.id === cepForm.id ? 'satir-aktif' : ''}>
                          <td className="baslik-hucre"><b>{k.adSoyad || (k.durum === 'bosta' ? '—' : '(isimsiz)')}</b></td>
                          <td data-label="Hat No">{k.hatNo || '—'}</td>
                          <td data-label="Marka/Model">{k.markaModel || '—'}</td>
                          <td data-label="IMEI">{k.imei || '—'}</td>
                          <td data-label="Tarih">{k.tarih ? trTarih(k.tarih) : '—'}</td>
                          <td data-label="Zimmetli">{k.durum === 'zimmetli' ? 'Evet' : 'Hayır'}</td>
                          <td data-label="Durum">{k.durum === 'bosta'
                            ? <span className="rozet rozet-yesil">Boşta</span>
                            : k.durum === 'iade'
                            ? <span className="rozet rozet-gri" title={k.iadeTarihi ? `İade: ${trTarih(k.iadeTarihi)}` : ''}>İade edildi{k.iadeTarihi ? ` · ${trTarih(k.iadeTarihi)}` : ''}</span>
                            : <span className="rozet rozet-mavi">Zimmetli</span>}</td>
                          <td className="islem">
                            <button className="btn btn-ghost sm" onClick={() => setCepDetayId(k.id)} title="Kaydın tüm bilgileri ve bu telefonun geçmişi">Detay</button>
                            <button className="btn btn-ikincil sm" onClick={() => cepYukle(k)} title="Kaydı forma yükleyip güncelle">Güncelle</button>
                            {k.durum === 'bosta'
                              ? <button className="btn btn-ghost sm" onClick={() => cepBostaZimmetle(k)} title="Bu telefonu bir kişiye zimmetle">Zimmetle</button>
                              : k.durum === 'iade'
                              ? null
                              : <button className="btn btn-ghost sm" onClick={() => cepDurumDegistir(k, 'iade')} title="Telefonu iade al: iade tutanağı oluşturulur, telefon boşta olarak listelenir">İade Al</button>}
                            {k.durum !== 'bosta' && <button className="btn btn-ghost sm" onClick={() => setCepTutanakId(k.id)} title="Taahhüt ve teslim tutanağını görüntüle, yazdır veya PDF indir">Tutanak</button>}
                            {k.durum === 'bosta' && cepSonIade(k) && <button className="btn btn-ghost sm" onClick={() => setCepGecmisTutanak({ kayit: cepSonIade(k), tur: 'iade' })} title="En son iade tutanağını görüntüle">İade Tutanağı</button>}
                            <button className="btn sm btn-sil" onClick={() => cepSil(k)}>Sil</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </main>
        </>
      )}

      {gorunum === 'kisiler' && (
        <main className="govde tek-sutun">
          <section className="panel">
            <div className="panel-baslik-satir">
              <div className="panel-baslik">Kişiler ({kisiler.length})</div>
              <input className="arama" value={kisiArama} onChange={(e) => setKisiArama(e.target.value)} placeholder="Ara: kişi, görev…" />
            </div>
            {kisiler.length === 0 ? (
              <p className="bos-metin">{belgeler.length === 0
                ? 'Henüz zimmet belgesi yok. Zimmet verdikçe kişiler burada listelenir.'
                : 'Aramaya uyan kişi yok.'}</p>
            ) : (
              <div className="tablo-kaydir">
                <table className="tablo liste-tablo">
                  <thead>
                    <tr>
                      <th>Kişi</th><th>Görev / Bölüm</th>
                      <th className="sag">Aktif Zimmet</th><th className="sag">Üzerindeki Adet</th>
                      <th className="sag">Toplam Belge</th><th>Son Teslim</th><th>Durum</th><th>İşlem</th>
                    </tr>
                  </thead>
                  <tbody>
                    {kisiler.map((k) => (
                      <tr key={k.kisi}>
                        <td className="tikla baslik-hucre" onClick={() => setDetayKisi(k.kisi)} title="Kişi kartını aç">
                          <b>{k.kisi}</b>
                        </td>
                        <td data-label="Görev / Bölüm">{k.gorev || '—'}</td>
                        <td className="sag" data-label="Aktif Zimmet">{k.aktifKayit}</td>
                        <td className="sag" data-label="Üzerindeki Adet"><b>{k.aktifAdet}</b></td>
                        <td className="sag" data-label="Toplam Belge">{k.toplamBelge}</td>
                        <td data-label="Son Teslim">{trTarih(k.sonTeslim)}</td>
                        <td data-label="Durum">{k.aktifKayit > 0
                          ? <span className="rozet rozet-mavi">Zimmetli</span>
                          : <span className="rozet rozet-gri">Temiz</span>}</td>
                        <td className="islem">
                          <button className="btn btn-ikincil sm" onClick={() => setDetayKisi(k.kisi)}>Kişi Kartı</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </main>
      )}

      {gorunum === 'hareket' && (
        <main className="govde tek-sutun">
          <section className="panel">
            <div className="panel-baslik-satir">
              <div className="panel-baslik">Stok Hareketleri ({suzulmusHareketler.length})</div>
              <div className="filtre-grup">
                <select value={hTip} onChange={(e) => setHTip(e.target.value)}>
                  <option value="tumu">Tüm tipler</option>
                  <option value="giris">Giriş</option>
                  <option value="cikis">Çıkış</option>
                  <option value="zimmet">Zimmet</option>
                  <option value="iade">İade</option>
                  <option value="duzeltme">Düzeltme</option>
                </select>
                <input type="date" value={hBaslangic} onChange={(e) => setHBaslangic(e.target.value)} title="Başlangıç tarihi" />
                <input type="date" value={hBitis} onChange={(e) => setHBitis(e.target.value)} title="Bitiş tarihi" />
                <input className="arama" value={hArama} onChange={(e) => setHArama(e.target.value)} placeholder="Ara: ürün, seri no, açıklama…" />
              </div>
            </div>
            {suzulmusHareketler.length === 0 ? (
              <p className="bos-metin">{hareketler.length === 0
                ? 'Henüz hareket yok. Ürün ekledikçe, giriş/çıkış ve zimmet yaptıkça burada listelenir.'
                : 'Bu filtreye uyan hareket yok.'}</p>
            ) : (
              <div className="tablo-kaydir">
                <table className="tablo liste-tablo">
                  <thead>
                    <tr><th>Tarih</th><th>Ürün</th><th>Seri No</th><th>Tip</th><th className="sag">Adet</th><th>Açıklama</th></tr>
                  </thead>
                  <tbody>
                    {suzulmusHareketler.map((h) => {
                      const [etiket, sinif] = HAREKET_ETIKET[h.tip] || [h.tip, 'rozet-gri']
                      return (
                        <tr key={h.id}>
                          <td data-label="Tarih">{trTarih(h.tarih)}</td>
                          <td className="baslik-hucre"><b>{urunAdi(h.urunId)}</b></td>
                          <td data-label="Seri No">{urunSeriNo(h.urunId)
                            ? <button type="button" className="btn btn-ghost sm" title="Bu seri numaralı cihazın tüm hareketlerini göster"
                                onClick={() => setHArama(urunSeriNo(h.urunId))}>{urunSeriNo(h.urunId)}</button>
                            : '—'}</td>
                          <td data-label="Tip"><span className={`rozet ${sinif}`}>{etiket}</span></td>
                          <td className="sag" data-label="Adet">{h.adet}</td>
                          <td data-label="Açıklama">{h.aciklama || '—'}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </main>
      )}

      {listeYonetimAcik && (
        <div className="perde" onClick={() => setListeYonetimAcik(false)}>
          <div className="pencere" onClick={(e) => e.stopPropagation()}>
            <div className="panel-baslik">Ürün Listesi ({urunListesi.length})</div>
            <div className="liste-ekle-satir">
              <input
                autoFocus
                value={yeniListeAdi}
                onChange={(e) => setYeniListeAdi(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); listeyeEkle() } }}
                placeholder="Yeni ürün adı…"
              />
              <button type="button" className="btn btn-ana sm" onClick={listeyeEkle}>＋ Ekle</button>
            </div>
            {urunListesi.length === 0 ? (
              <p className="bos-metin">Liste boş. Yukarıdan ürün adı ekleyin.</p>
            ) : (
              <ul className="liste-yonetim">
                {urunListesi.map((u) => (
                  <li key={u.id}>
                    <span>{u.ad}</span>
                    <button type="button" className="btn sm btn-sil" onClick={() => listedenCikar(u)}>Sil</button>
                  </li>
                ))}
              </ul>
            )}
            <div className="form-aksiyon">
              <button type="button" className="btn btn-ghost" onClick={() => setListeYonetimAcik(false)}>Kapat</button>
            </div>
          </div>
        </div>
      )}

      {konumYonetimAcik && (
        <div className="perde" onClick={() => setKonumYonetimAcik(false)}>
          <div className="pencere" onClick={(e) => e.stopPropagation()}>
            <div className="panel-baslik">Konum / Depo Listesi ({konumListesi.length})</div>
            <div className="liste-ekle-satir">
              <input
                autoFocus
                value={yeniKonumAdi}
                onChange={(e) => setYeniKonumAdi(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); konumEkle() } }}
                placeholder="Yeni konum / depo…"
              />
              <button type="button" className="btn btn-ana sm" onClick={konumEkle}>＋ Ekle</button>
            </div>
            {konumListesi.length === 0 ? (
              <p className="bos-metin">Liste boş. Yukarıdan konum ekleyin.</p>
            ) : (
              <ul className="liste-yonetim">
                {konumListesi.map((k) => (
                  <li key={k.id}>
                    <span>{k.ad}</span>
                    <button type="button" className="btn sm btn-sil" onClick={() => konumCikar(k)}>Sil</button>
                  </li>
                ))}
              </ul>
            )}
            <div className="form-aksiyon">
              <button type="button" className="btn btn-ghost" onClick={() => setKonumYonetimAcik(false)}>Kapat</button>
            </div>
          </div>
        </div>
      )}

      {kategoriYonetimAcik && (
        <div className="perde" onClick={() => setKategoriYonetimAcik(false)}>
          <div className="pencere" onClick={(e) => e.stopPropagation()}>
            <div className="panel-baslik">Kategori Listesi ({kategoriListesi.length})</div>
            <div className="liste-ekle-satir">
              <input
                autoFocus
                value={yeniKategoriAdi}
                onChange={(e) => setYeniKategoriAdi(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); kategoriEkle() } }}
                placeholder="Yeni kategori…"
              />
              <button type="button" className="btn btn-ana sm" onClick={kategoriEkle}>＋ Ekle</button>
            </div>
            {kategoriListesi.length === 0 ? (
              <p className="bos-metin">Liste boş. Yukarıdan kategori ekleyin.</p>
            ) : (
              <ul className="liste-yonetim">
                {kategoriListesi.map((k) => (
                  <li key={k.id}>
                    <span>{k.ad}</span>
                    <button type="button" className="btn sm btn-sil" onClick={() => kategoriCikar(k)}>Sil</button>
                  </li>
                ))}
              </ul>
            )}
            <div className="form-aksiyon">
              <button type="button" className="btn btn-ghost" onClick={() => setKategoriYonetimAcik(false)}>Kapat</button>
            </div>
          </div>
        </div>
      )}

      {markaYonetimAcik && (
        <div className="perde" onClick={() => setMarkaYonetimAcik(false)}>
          <div className="pencere" onClick={(e) => e.stopPropagation()}>
            <div className="panel-baslik">Marka / Model Listesi ({markaListesi.length})</div>
            <div className="liste-ekle-satir">
              <input
                autoFocus
                value={yeniMarkaAdi}
                onChange={(e) => setYeniMarkaAdi(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); markaEkle() } }}
                placeholder="Yeni marka / model…"
              />
              <button type="button" className="btn btn-ana sm" onClick={markaEkle}>＋ Ekle</button>
            </div>
            {markaListesi.length === 0 ? (
              <p className="bos-metin">Liste boş. Yukarıdan marka / model ekleyin.</p>
            ) : (
              <ul className="liste-yonetim">
                {markaListesi.map((m) => (
                  <li key={m.id}>
                    <span>{m.ad}</span>
                    <button type="button" className="btn sm btn-sil" onClick={() => markaCikar(m)}>Sil</button>
                  </li>
                ))}
              </ul>
            )}
            <div className="form-aksiyon">
              <button type="button" className="btn btn-ghost" onClick={() => setMarkaYonetimAcik(false)}>Kapat</button>
            </div>
          </div>
        </div>
      )}

      {cepMarkaYonetimAcik && (
        <div className="perde" onClick={() => setCepMarkaYonetimAcik(false)}>
          <div className="pencere" onClick={(e) => e.stopPropagation()}>
            <div className="panel-baslik">Cep Telefonu Marka / Model Listesi ({cepMarkaListesi.length})</div>
            <div className="liste-ekle-satir">
              <input
                autoFocus
                value={yeniCepMarkaAdi}
                onChange={(e) => setYeniCepMarkaAdi(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); cepMarkaEkle() } }}
                placeholder="Yeni marka / model…"
              />
              <button type="button" className="btn btn-ana sm" onClick={cepMarkaEkle}>＋ Ekle</button>
            </div>
            {cepMarkaListesi.length === 0 ? (
              <p className="bos-metin">Liste boş. Yukarıdan marka / model ekleyin.</p>
            ) : (
              <ul className="liste-yonetim">
                {cepMarkaListesi.map((m) => (
                  <li key={m.id}>
                    <span>{m.ad}</span>
                    <button type="button" className="btn sm btn-sil" onClick={() => cepMarkaCikar(m)}>Sil</button>
                  </li>
                ))}
              </ul>
            )}
            <div className="form-aksiyon">
              <button type="button" className="btn btn-ghost" onClick={() => setCepMarkaYonetimAcik(false)}>Kapat</button>
            </div>
          </div>
        </div>
      )}

      {personelYonetimAcik && (
        <div className="perde" onClick={() => setPersonelYonetimAcik(false)}>
          <div className="pencere" onClick={(e) => e.stopPropagation()}>
            <div className="panel-baslik">Personel Listesi ({personelListesi.length})</div>
            <p className="bos-metin" style={{ marginTop: 0 }}>
              Zimmet formunda Adı Soyadı seçilince, buradaki Bölüm ve Görev otomatik dolar.
            </p>
            <div className="sablon-form">
              <label className="field"><span>Adı Soyadı *</span>
                <input value={personelForm.adSoyad} onChange={(e) => setPersonelForm({ ...personelForm, adSoyad: e.target.value })}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); personelKaydet() } }}
                  placeholder="Ör. Ahmet Yılmaz" />
              </label>
              <label className="field"><span>Bölümü</span>
                <input value={personelForm.bolum} onChange={(e) => setPersonelForm({ ...personelForm, bolum: e.target.value })} placeholder="Ör. Bilgi İşlem" />
              </label>
              <label className="field"><span>Görevi</span>
                <input value={personelForm.gorev} onChange={(e) => setPersonelForm({ ...personelForm, gorev: e.target.value })} placeholder="Ör. Satış Uzmanı" />
              </label>
              <div className="sablon-form-aksiyon">
                <button type="button" className="btn btn-ana sm" onClick={personelKaydet}>
                  {personelListesi.some((p) => p.adSoyad === personelForm.adSoyad.trim()) ? '✔ Güncelle' : '＋ Ekle'}
                </button>
                {personelForm.adSoyad && (
                  <button type="button" className="btn btn-ghost sm" onClick={() => setPersonelForm(bosPersonel())}>Temizle</button>
                )}
              </div>
            </div>
            {personelListesi.length === 0 ? (
              <p className="bos-metin">Liste boş. Yukarıdan personel ekleyin.</p>
            ) : (
              <ul className="liste-yonetim">
                {personelListesi.map((p) => (
                  <li key={p.id}>
                    <div className="sablon-bilgi">
                      <b>{p.adSoyad}</b>
                      <span>{[p.bolum, p.gorev].filter(Boolean).join(' · ') || '—'}</span>
                    </div>
                    <div className="islem">
                      <button type="button" className="btn btn-ghost sm" onClick={() => personelDuzenle(p)}>Düzenle</button>
                      <button type="button" className="btn sm btn-sil" onClick={() => personelSil(p)}>Sil</button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <div className="form-aksiyon">
              <button type="button" className="btn btn-ghost" onClick={() => setPersonelYonetimAcik(false)}>Kapat</button>
            </div>
          </div>
        </div>
      )}

      {stokPencere && (
        <div className="perde" onClick={() => setStokPencere(null)}>
          <div className="pencere" onClick={(e) => e.stopPropagation()}>
            <div className="panel-baslik">
              {stokPencere.tip === 'giris' ? 'Stok Girişi' : 'Stok Çıkışı'} — {stokPencere.urun.ad}
            </div>
            <form onSubmit={stokUygula}>
              <div className="grid-2">
                <label className="field"><span>Adet ({stokPencere.urun.birim})</span>
                  <input type="number" min="1" autoFocus value={stokPencere.adet}
                    onChange={(e) => setStokPencere({ ...stokPencere, adet: e.target.value })} />
                </label>
                <label className="field"><span>Tarih</span>
                  <input type="date" value={stokPencere.tarih}
                    onChange={(e) => setStokPencere({ ...stokPencere, tarih: e.target.value })} />
                </label>
              </div>
              <label className="field" style={{ marginTop: 12 }}><span>Açıklama</span>
                <input value={stokPencere.aciklama} placeholder={stokPencere.tip === 'giris' ? 'Örn: Satın alma' : 'Örn: Hurdaya ayrıldı'}
                  onChange={(e) => setStokPencere({ ...stokPencere, aciklama: e.target.value })} />
              </label>
              <div className="form-aksiyon">
                <button type="submit" className="btn btn-ana">Kaydet</button>
                <button type="button" className="btn btn-ghost" onClick={() => setStokPencere(null)}>Vazgeç</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {detayUrunu && (
        <UrunDetay
          urun={detayUrunu}
          zimmetli={zimmetliAdet(detayUrunu.id)}
          bosta={bostaAdet(detayUrunu.id)}
          belgeler={belgeler}
          hareketler={hareketler}
          kapat={() => setDetayId(null)}
        />
      )}

      {detayKisi && (
        <KisiDetay
          kisi={detayKisi}
          belgeler={belgeler}
          urunAdi={urunAdi}
          tutanakAc={(id) => { setDetayKisi(null); setTutanakId(id) }}
          kapat={() => setDetayKisi(null)}
        />
      )}

      {tutanakBelge && (
        <TutanakOnizleme
          belge={tutanakBelge}
          urunler={urunler}
          kartRef={tutanakRef}
          pdfOlustur={() => pdfOlustur(tutanakRef.current)}
          dosyaAdiUret={dosyaAdiUret}
          kapat={() => setTutanakId(null)}
        />
      )}

      {belgeDetayId && belgeler.find((b) => b.id === belgeDetayId) && (() => {
        const b = belgeler.find((x) => x.id === belgeDetayId)
        return (
          <BelgeDetay
            belge={b}
            urunAdi={urunAdi}
            urunSeriNo={urunSeriNo}
            iadeAl={(it) => belgeIadeAl(b, [it])}
            tumunuIadeAl={() => belgeIadeAl(b, b.items)}
            tutanakAc={() => { setBelgeDetayId(null); setTutanakId(b.id) }}
            iadeTutanakAc={(kalemler) => setIadeOnizleme({ belge: b, kalemler, iadeTarihi: kalemler[0]?.iadeTarihi, teslimAlan: '' })}
            kapat={() => setBelgeDetayId(null)}
          />
        )
      })()}

      {cepDetayKayit && (
        <CepDetay
          kayit={cepDetayKayit}
          kayitlar={cepKayitlari}
          gecmis={cepGecmisi}
          gecmisTutanakAc={(g, tur) => setCepGecmisTutanak({ kayit: g, tur })}
          tutanakAc={() => { setCepDetayId(null); setCepTutanakId(cepDetayKayit.id) }}
          kapat={() => setCepDetayId(null)}
        />
      )}

      {iadePdf && (
        <div className="ekran-disi" aria-hidden="true">
          <ZimmetIadeKart ref={iadeRef} data={iadePdf} urunler={urunler} />
        </div>
      )}

      {iadeOnizleme && (
        <div className="perde" onClick={() => setIadeOnizleme(null)}>
          <div className="pencere genis" onClick={(e) => e.stopPropagation()}>
            <div className="onizleme-kaydirma">
              <ZimmetIadeKart ref={iadeOnizRef} data={iadeOnizleme} urunler={urunler} />
            </div>
            <div className="form-aksiyon yazdirma-gizle">
              <button className="btn btn-ana" onClick={() => window.print()}>🖨 Yazdır</button>
              <button className="btn btn-ikincil" disabled={pdfYapiliyor} onClick={async () => {
                setPdfYapiliyor(true)
                try {
                  const pdf = await pdfOlustur(iadeOnizRef.current)
                  pdf.save(iadeDosyaAdi(iadeOnizleme.belge, iadeOnizleme.kalemler[0]?.iadeTarihi || bugun()))
                } catch (e) { console.error(e) } finally { setPdfYapiliyor(false) }
              }}>⬇ PDF İndir</button>
              <button className="btn btn-ghost" onClick={() => setIadeOnizleme(null)}>Kapat</button>
            </div>
          </div>
        </div>
      )}

      {/* İade Al sonrası PDF'e çevrilen iade tutanağı (ekran dışı) */}
      {cepIadePdf && (
        <div className="ekran-disi" aria-hidden="true">
          <CepIadeKart ref={cepIadeRef} data={cepIadePdf} />
        </div>
      )}

      {cepGecmisTutanak && (
        <CepTutanakOnizleme
          kayit={cepGecmisTutanak.kayit}
          tur={cepGecmisTutanak.tur}
          kartRef={cepTutanakRef}
          pdfOlustur={() => pdfOlustur(cepTutanakRef.current)}
          kapat={() => setCepGecmisTutanak(null)}
        />
      )}

      {cepTutanakKayit && (
        <CepTutanakOnizleme
          kayit={cepTutanakKayit}
          kartRef={cepTutanakRef}
          pdfOlustur={() => pdfOlustur(cepTutanakRef.current)}
          kapat={() => setCepTutanakId(null)}
        />
      )}

      {onay && (
        <div className="perde" onClick={() => setOnay(null)}>
          <div className="pencere dar" onClick={(e) => e.stopPropagation()}>
            <p className="onay-metin">{onay.metin}</p>
            <div className="form-aksiyon">
              <button className="btn btn-ana" onClick={() => { onay.eylem(); setOnay(null) }}>Evet</button>
              <button className="btn btn-ghost" onClick={() => setOnay(null)}>Vazgeç</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// Kaydedilmiş bir cep telefonu kaydının taahhüt tutanağını önizleyip yazdırma/PDF indirme penceresi
function CepTutanakOnizleme({ kayit, tur = 'zimmet', kartRef, pdfOlustur, kapat }) {
  const [yapiliyor, setYapiliyor] = useState(false)
  const indir = async () => {
    setYapiliyor(true)
    try {
      const pdf = await pdfOlustur()
      const ad = (kayit.adSoyad || 'kayit').replace(/[\\/:*?"<>|]+/g, '_')
      pdf.save(tur === 'iade'
        ? `cep-iade-${ad}-${kayit.iadeTarihi || bugun()}.pdf`
        : `cep-taahhut-${ad}-${kayit.tarih || bugun()}.pdf`)
    } catch (e) {
      console.error(e)
    } finally {
      setYapiliyor(false)
    }
  }
  return (
    <div className="perde" onClick={kapat}>
      <div className="pencere genis" onClick={(e) => e.stopPropagation()}>
        <div className="onizleme-kaydirma">
          {tur === 'iade' ? <CepIadeKart ref={kartRef} data={kayit} /> : <CepTelefonuKart ref={kartRef} data={kayit} />}
        </div>
        <div className="form-aksiyon yazdirma-gizle">
          <button className="btn btn-ana" onClick={() => window.print()}>🖨 Yazdır</button>
          <button className="btn btn-ikincil" onClick={indir} disabled={yapiliyor}>{yapiliyor ? 'Hazırlanıyor…' : '⬇ PDF İndir'}</button>
          <button className="btn btn-ghost" onClick={kapat}>Kapat</button>
        </div>
      </div>
    </div>
  )
}

// Kaydedilmiş bir belgenin tutanağını önizleyip yazdırma/PDF indirme penceresi
function TutanakOnizleme({ belge, urunler, kartRef, pdfOlustur, dosyaAdiUret, kapat }) {
  const [yapiliyor, setYapiliyor] = useState(false)
  const indir = async () => {
    setYapiliyor(true)
    try {
      const pdf = await pdfOlustur()
      pdf.save(dosyaAdiUret(belge))
    } catch (e) {
      console.error(e)
    } finally {
      setYapiliyor(false)
    }
  }
  return (
    <div className="perde" onClick={kapat}>
      <div className="pencere genis" onClick={(e) => e.stopPropagation()}>
        <div className="onizleme-kaydirma">
          <ZimmetKart ref={kartRef} data={belge} urunler={urunler} minSatir={MIN_SATIR} />
        </div>
        <div className="form-aksiyon yazdirma-gizle">
          <button className="btn btn-ana" onClick={() => window.print()}>🖨 Yazdır</button>
          <button className="btn btn-ikincil" onClick={indir} disabled={yapiliyor}>{yapiliyor ? 'Hazırlanıyor…' : '⬇ PDF İndir'}</button>
          <button className="btn btn-ghost" onClick={kapat}>Kapat</button>
        </div>
      </div>
    </div>
  )
}

// Amir e-postaları ve EmailJS bağlantı ayarları penceresi
function MailAyarPenceresi({ ayar, onKaydet, onKapat }) {
  const [a, setA] = useState(() => ({ ...bosEpostaAyar(), ...ayar }))
  const [test, setTest] = useState(null)
  const [testYap, setTestYap] = useState(false)
  const g = (k, v) => setA((o) => ({ ...o, [k]: v }))

  const testGonder = async () => {
    if (!a.serviceId.trim() || !a.templateId.trim() || !a.publicKey.trim()) {
      setTest({ tip: 'hata', mesaj: 'Önce Service ID, Template ID ve Public Key girin.' })
      return
    }
    if (!alicilar(a).length) {
      setTest({ tip: 'hata', mesaj: 'En az bir geçerli amir e-postası girin.' })
      return
    }
    setTestYap(true)
    setTest({ tip: 'bilgi', mesaj: 'Test maili gönderiliyor…' })
    const ornek = {
      belgeNo: 'ZMT-TEST-001',
      adSoyad: 'Test Personel',
      gorev: 'Deneme',
      bolum: 'Bilgi İşlem',
      teslimTarihi: new Date().toISOString().slice(0, 10),
      teslimAlan: 'Test Alan',
      teslimEden: 'Test Eden',
    }
    try {
      await epostaGonder(a, ornek, { dosyaAdi: 'Test.pdf', demirbaslarMetni: '1. Test Ürünü (1 Adet)' })
      setTest({ tip: 'ok', mesaj: `Test maili gönderildi → ${alicilar(a).join(', ')}. Gelen kutusu/Spam klasörünü kontrol edin.` })
    } catch (e) {
      console.error(e)
      const detay = e?.text || e?.message || (typeof e === 'object' ? JSON.stringify(e) : String(e))
      setTest({ tip: 'hata', mesaj: `Gönderilemedi: ${detay}` })
    } finally {
      setTestYap(false)
    }
  }

  return (
    <div className="modal-katman" onClick={onKapat}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-ust">
          <h2>✉ Mail Bildirim Ayarları</h2>
          <button className="modal-kapat" onClick={onKapat} title="Kapat">✕</button>
        </div>

        <label className="ayar-aktif">
          <input type="checkbox" checked={a.aktif} onChange={(e) => g('aktif', e.target.checked)} />
          <span>Kayıt yapılınca amirlere otomatik e-posta gönder</span>
        </label>

        <Field label="Amir e-postaları (virgülle ayırın)">
          <input value={a.amirEpostalari} onChange={(e) => g('amirEpostalari', e.target.value)} placeholder="amir1@firma.com, amir2@firma.com" />
        </Field>

        <p className="ayar-not">
          Otomatik gönderim <a href="https://www.emailjs.com" target="_blank" rel="noreferrer">EmailJS</a> üzerinden yapılır.
          Ücretsiz bir hesap açıp bir <em>Email Service</em> ve <em>Template</em> oluşturduktan sonra aşağıdaki üç değeri girin.
          Template'te <code>to_email, belge_no, ad_soyad, teslim_tarihi, demirbaslar, teslim_alan, teslim_eden, onay, dosya_adi</code> değişkenlerini kullanabilirsiniz.
        </p>

        <div className="grid-3">
          <Field label="Service ID">
            <input value={a.serviceId} onChange={(e) => g('serviceId', e.target.value)} placeholder="service_xxx" />
          </Field>
          <Field label="Template ID">
            <input value={a.templateId} onChange={(e) => g('templateId', e.target.value)} placeholder="template_xxx" />
          </Field>
          <Field label="Public Key">
            <input value={a.publicKey} onChange={(e) => g('publicKey', e.target.value)} placeholder="xxxxxxxxxxxx" />
          </Field>
        </div>

        <label className="ayar-aktif">
          <input type="checkbox" checked={a.pdfEkle} onChange={(e) => g('pdfEkle', e.target.checked)} />
          <span>PDF'i ek olarak gönder (template'te <code>{'{{pdf_base64}}'}</code> dinamik ek olarak ayarlanmalı)</span>
        </label>

        {test && <div className={`test-sonuc ${test.tip}`}>{test.mesaj}</div>}

        <div className="modal-aksiyon">
          <button className="btn btn-ghost" onClick={onKapat}>Vazgeç</button>
          <button className="btn btn-ikincil" onClick={testGonder} disabled={testYap}>
            {testYap ? 'Gönderiliyor…' : '✉ Test maili gönder'}
          </button>
          <button className="btn btn-ana" onClick={() => onKaydet(a)}>Kaydet</button>
        </div>
      </div>
    </div>
  )
}
