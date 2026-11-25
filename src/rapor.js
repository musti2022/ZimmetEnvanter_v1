import * as XLSX from 'xlsx'
import { bugun, trTarih, HAREKET_ETIKET } from './yardimci.js'

// Tüm veriyi 3 sayfalık (Envanter / Zimmet / Hareketler) Excel dosyası olarak indirir
export function excelRaporIndir(urunler, belgeler, hareketler, { zimmetliAdet, bostaAdet, urunAdi }) {
  const wb = XLSX.utils.book_new()

  const envanterSayfa = urunler.map((u) => ({
    'Ürün': u.ad,
    'Kategori': u.kategori || '',
    'Marka / Model': u.markaModel || '',
    'Seri No': u.seriNo || '',
    'Barkod': u.barkod || '',
    'Birim': u.birim,
    'Konum / Depo': u.konum || '',
    'Stok': Number(u.stok || 0),
    'Zimmetli': zimmetliAdet(u.id),
    'Boşta': bostaAdet(u.id),
    'Kritik Seviye': Number(u.minStok || 0),
    'Açıklama': u.aciklama || '',
  }))

  // Her belgenin her kalemi ayrı satır olur (belge başlık bilgileri tekrarlanır)
  const zimmetSayfa = belgeler.flatMap((b) =>
    b.items.map((it) => ({
      'Belge No': b.belgeNo || '',
      'Adı Soyadı': b.adSoyad,
      'Görevi': b.gorev || '',
      'Bölümü': b.bolum || '',
      'Teslim Tarihi': trTarih(b.teslimTarihi),
      'Ürün': urunAdi(it.urunId),
      'Adet': Number(it.adet || 0),
      'İade Tarihi': it.iadeTarihi ? trTarih(it.iadeTarihi) : '',
      'Durum': it.durum === 'zimmetli' ? 'Zimmetli' : 'İade edildi',
      'Açıklama': it.aciklama || '',
      'Teslim Alan': b.teslimAlan || '',
      'Teslim Eden': b.teslimEden || '',
    }))
  )

  const hareketSayfa = hareketler.map((h) => ({
    'Tarih': trTarih(h.tarih),
    'Ürün': urunAdi(h.urunId),
    'Tip': (HAREKET_ETIKET[h.tip] || [h.tip])[0],
    'Adet': Number(h.adet || 0),
    'Açıklama': h.aciklama || '',
  }))

  const sayfaEkle = (veri, ad, genislikler) => {
    const ws = XLSX.utils.json_to_sheet(veri)
    ws['!cols'] = genislikler.map((w) => ({ wch: w }))
    XLSX.utils.book_append_sheet(wb, ws, ad)
  }

  sayfaEkle(envanterSayfa, 'Envanter', [24, 16, 18, 14, 14, 8, 18, 7, 9, 7, 13, 28])
  sayfaEkle(zimmetSayfa, 'Zimmet', [18, 22, 18, 16, 13, 26, 6, 13, 12, 28, 16, 16])
  sayfaEkle(hareketSayfa, 'Hareketler', [11, 26, 10, 6, 40])

  XLSX.writeFile(wb, `zimmet-envanter-rapor-${bugun()}.xlsx`)
}
