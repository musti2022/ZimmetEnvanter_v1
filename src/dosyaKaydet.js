// Kayıt klasörünü (DirectoryHandle) IndexedDB'de saklar ve dosyaları oraya yazar.
// File System Access API yalnızca güvenli bağlamda (localhost / https) ve Chrome/Edge'de çalışır.

const DB_ADI = 'zimmet-fs'
const STORE = 'handles'
const ANAHTAR = 'kayitKlasoru'

// Ayrı klasörler: her biri kendi IndexedDB anahtarı ve seçici kimliğiyle saklanır.
export const ZIMMET_KLASORU = { anahtar: ANAHTAR, seciciId: 'zimmet-kayit' }
export const CEP_KLASORU = { anahtar: 'cepKlasoru', seciciId: 'cep-kayit' }

function idbAc() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB_ADI, 1)
    r.onupgradeneeded = () => r.result.createObjectStore(STORE)
    r.onsuccess = () => res(r.result)
    r.onerror = () => rej(r.error)
  })
}

async function handleYaz(handle, anahtar = ANAHTAR) {
  const db = await idbAc()
  return new Promise((res, rej) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(handle, anahtar)
    tx.oncomplete = () => res()
    tx.onerror = () => rej(tx.error)
  })
}

async function handleOku(anahtar = ANAHTAR) {
  const db = await idbAc()
  return new Promise((res) => {
    const tx = db.transaction(STORE, 'readonly')
    const rq = tx.objectStore(STORE).get(anahtar)
    rq.onsuccess = () => res(rq.result || null)
    rq.onerror = () => res(null)
  })
}

export function dosyaSistemiDestekli() {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window
}

async function izinVar(handle, mode = 'readwrite') {
  const opts = { mode }
  if ((await handle.queryPermission(opts)) === 'granted') return true
  if ((await handle.requestPermission(opts)) === 'granted') return true
  return false
}

/**
 * Kayıt klasörünü döndürür. Daha önce seçilmişse onu kullanır (gerekirse izin tazeler);
 * seçilmemişse veya yenidenSec=true ise klasör seçtirir. Kullanıcı tıklaması içinde çağrılmalı.
 */
export async function kayitKlasoruGetir({ yenidenSec = false, klasor = ZIMMET_KLASORU } = {}) {
  let handle = yenidenSec ? null : await handleOku(klasor.anahtar)
  if (handle) {
    if (await izinVar(handle)) return handle
    handle = null // izin yok → yeniden seçtir
  }
  handle = await window.showDirectoryPicker({ id: klasor.seciciId, mode: 'readwrite', startIn: 'desktop' })
  await izinVar(handle)
  await handleYaz(handle, klasor.anahtar)
  return handle
}

/** Saklı klasörün adını döndürür (yoksa null). İzin sormaz. */
export async function mevcutKlasorAdi(klasor = ZIMMET_KLASORU) {
  const h = await handleOku(klasor.anahtar)
  return h ? h.name : null
}

/**
 * Daha önce seçilmiş klasörü döndürür (yeni klasör SEÇTİRMEZ). Gerekirse izin ister
 * (kullanıcı tıklaması içinde çağrılmalı). Klasör hiç seçilmemişse veya izin yoksa null.
 */
export async function kayitKlasoruVarsa(klasor = ZIMMET_KLASORU) {
  const h = await handleOku(klasor.anahtar)
  if (!h) return null
  return (await izinVar(h)) ? h : null
}

/** Klasörden bir dosyayı siler. Dosya yoksa NotFoundError fırlatır. */
export async function dosyaSil(dirHandle, dosyaAdi) {
  await dirHandle.removeEntry(dosyaAdi)
}

/** Blob'u verilen klasöre dosya olarak yazar. */
export async function blobYaz(dirHandle, dosyaAdi, blob) {
  const fh = await dirHandle.getFileHandle(dosyaAdi, { create: true })
  const w = await fh.createWritable()
  await w.write(blob)
  await w.close()
}

// Windows'ta dosya adında geçersiz olan karakterler. Tire ve nokta KORUNUR.
const GECERSIZ = '<>:"/|?*'

/** Geçersiz karakterleri boşlukla değiştirir, boşlukları sadeleştirir. */
export function dosyaAdiTemizle(s) {
  let out = ''
  for (const ch of String(s || '')) {
    out += (GECERSIZ.includes(ch) || ch === '\\' || ch.charCodeAt(0) < 32) ? ' ' : ch
  }
  return out.replace(/\s+/g, ' ').trim()
}
