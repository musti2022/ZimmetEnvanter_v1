# Kimlik Doğrulama ve Yetkilendirme — Kurulum ve Güvenlik Rehberi

Zimmet & Envanter uygulamasının oturum açma, rol ve yetki sistemi.

---

## 1. Güvenlik modeli — özet

```
                    GİRİŞ
                      │
             Kullanıcı Adı + Parola
                      │
              dbo.Kullanicilar
                      │
             ┌────────┴────────┐
           Doğru            Yanlış
             │                 │
             ▼                 ▼
      dbo.Kullanicilar.rol   REDDET
             │
   ┌─────────┴─────────┐
 ADMIN               VIEWER
   │                   │
   ▼                   ▼
Tüm bölümler    Genel Bakış + Envanter
 (tam yetki)       (SALT OKUNUR)
```

Tek kimlik kaynağı uygulamanın kendi veritabanıdır (`dbo.Kullanicilar`). Parolalar
**Argon2id** ile özetlenir; rol aynı tablodaki `rol` sütunundan gelir.

**Değişmez kurallar**

| # | Kural |
|---|-------|
| 1 | VIEWER yalnızca **Genel Bakış** ve **Envanter**'i görür. |
| 2 | VIEWER **salt okunurdur**: POST / PUT / PATCH / DELETE yasaktır (ekleme, düzenleme, silme, içe aktarma yok). |
| 3 | Rol **her zaman sunucuda** belirlenir; istemciden gelen rol/yetki alanları silinir. |
| 4 | Rol yalnızca **kullanıcı yönetimi uçlarında**, ADMIN tarafından, **başka bir hesap** için atanabilir. |
| 5 | Veritabanındaki tanınmayan rol değeri **VIEWER**'a düşer (yetki yükseltmez). |
| 6 | Giriş başarısızlığının sebebi ne olursa olsun istemciye **tek tip mesaj** döner (kullanıcı sayımına karşı). |
| 8 | Yetkilendirme **varsayılan reddet**tir: politikada tanımsız uç 403 döner. |
| 9 | Bir yönetici **kendi rolünü düşüremez, kendini pasifleştiremez veya silemez**; son aktif yerel yönetici hesabı yetkisiz bırakılamaz. |

---

## 2. Hızlı başlangıç

```bash
npm install
```

```bash
cp .env.example .env
```

Oturum anahtarı üretin ve `.env` içindeki `SESSION_SECRET` alanına yazın:

```bash
npm run anahtar-uret
```

İlk **yönetici** hesabını oluşturun (parola gizli istemle sorulur):

```bash
npm run kullanici -- ekle yerel.yonetici --rol ADMIN --ad "Yerel Yönetici"
```

Salt okunur kullanıcı eklemek için `--rol` vermeyin (varsayılan VIEWER):

```bash
npm run kullanici -- ekle ahmet.yilmaz --ad "Ahmet Yılmaz" --eposta ahmet@firma.com
```

Geliştirme (Vite 5175 + API 5177):

```bash
npm run dev
```

Üretim (tek sunucu, dist'i de servis eder):

```bash
npm start
```

Testler:

```bash
npm test
```

---

## 2b. Mevcut kuruluma yükseltme (başka bilgisayarda `git pull`)

Auth sistemi öncesi çalışan bir kurulumu güncellerken **kod tek başına yetmez**. Depoya
girmeyen iki şey vardır ve ikisi de olmadan sisteme kimse giremez.

### Neden "sadece pull" yetmiyor

| Gereken | Neden depodan gelmez |
|---|---|
| `.env` dosyası | `.gitignore`'da — oturum anahtarı ve veritabanı ayarları depoya yazılmaz |
| En az bir ADMIN hesabı | Kullanıcılar veritabanında; her makinenin veritabanı ayrıdır |
| `node_modules` | Yeni bağımlılıklar eklendi (argon2, express-session, helmet…) |

Tablolar otomatik oluşur (`semaKur` her açılışta `CREATE TABLE IF NOT EXISTS` ve `rol`
sütunu için `ALTER TABLE` çalıştırır) — **elle SQL çalıştırmanız gerekmez, mevcut envanter
verisi korunur.**

### Adımlar

```bash
git pull
```

```bash
npm install
```

Oturum anahtarı üretin:

```bash
npm run anahtar-uret
```

Çıkan değerle `.env` dosyasını oluşturun (en az bu satır zorunludur):

```env
SESSION_SECRET=<npm run anahtar-uret çıktısı>
```

İlk yönetici hesabını açın — **bu adım atlanırsa giriş ekranı açılır ama kimse giremez**:

```bash
npm run kullanici -- ekle yerel.yonetici --rol ADMIN --ad "Yerel Yönetici"
```

Doğrulayın:

```bash
npm run kullanici -- liste
```

### ⚠ NODE_ENV=production kurarken: HTTPS tuzağı

`NODE_ENV=production` iken oturum çerezi `Secure` işaretlenir ve tarayıcı onu **düz HTTP
üzerinden göndermez**. Kullanıcılar `http://sunucu:5176` ile bağlanıyorsa giriş başarılı
görünür ama oturum tutmaz — sonsuz giriş döngüsü oluşur.

Üç seçenekten biri:

- HTTPS dinleyicisini kullanın: `https://sunucu:5276` (üretim portu + 100). Sertifika
  kendinden imzalıdır; tarayıcı ilk seferde uyarı verir.
- Düz HTTP'de kalacaksanız `.env` içine `SESSION_COOKIE_SECURE=false` yazın.
  (Oturum çerezi ağda şifresiz taşınır — yalnızca güvenilir iç ağda kabul edilebilir.)
- `NODE_ENV`'i hiç ayarlamayın: geliştirme modunda Secure çerez kapalıdır. Bu durumda
  `SESSION_SECRET` yine de tanımlayın; yoksa her yeniden başlatmada herkes düşer.

`NODE_ENV=production` iken `SESSION_SECRET` tanımlı değilse süreç **başlamaz**
(bilinçli: rastgele anahtar her açılışta tüm oturumları geçersiz kılardı).

### Zamanlanmış görevle çalışan kurulum

Sunucu açılışta zamanlanmış görevle başlıyorsa (`node server/index.js`), `.env` dosyası
**görevin çalıştığı dizinin kökünde** olmalıdır — `server/` içinde değil. Görev SYSTEM
olarak çalışıyorsa dosyayı okuyabilir.

`dist/` klasörü depoya girmez; sunucu açılışta kaynakların `dist`'ten yeni olduğunu görür
ve kendisi derler. Bunun için `node_modules` kurulu olmalıdır (`npm install`).

### Mevcut veriyi yeni makineye taşıma

Yukarıdaki adımlar sistemi **boş envanterle** ayağa kaldırır: tablolar otomatik oluşur ama
ürünler, zimmet belgeleri ve kullanıcı hesapları eski makinenin SQL Server'ında kalır.
Veriyle birlikte devam edilecekse yedek alıp geri yükleyin.

Eski makinede tam yedek (yol, SQL örneğinin kendi Backup klasörü olmalı — SYSTEM olarak
çalışan servis oraya yazabilir):

```bash
sqlcmd -S "(local)\SQLEXPRESS" -E -b -Q "BACKUP DATABASE [ZimmetEnvanter] TO DISK = N'C:\Program Files\Microsoft SQL Server\MSSQL16.SQLEXPRESS\MSSQL\Backup\ZimmetEnvanter.bak' WITH FORMAT, INIT"
```

Yeni makinede geri yükleme:

```bash
sqlcmd -S "(local)\SQLEXPRESS" -E -b -Q "RESTORE DATABASE [ZimmetEnvanter] FROM DISK = N'...\ZimmetEnvanter.bak' WITH RECOVERY, REPLACE"
```

⚠ `REPLACE` hedefteki aynı adlı veritabanının üzerine yazar. Yeni makinede zaten veri
varsa önce onun yedeğini alın.

Yedek geri yüklendiğinde kullanıcı hesapları da gelir; `npm run kullanici -- ekle` adımı
tekrarlanmaz. Doğrulamak için `npm run kullanici -- liste`.

`.bak` anlık bir kopyadır: yedeği aldıktan sonra eski makinede yeni belge oluşturulursa
o kayıtlar taşınmaz. Geçiş anında son bir yedek daha alın.

---

## 3. Kullanıcı yönetimi

**Kullanıcılar** sekmesinden (ADMIN) yönetilir: hesap açma, rol değiştirme
("Yönetici Yap" / "Yetkiyi Al"), parola sıfırlama, pasifleştirme, silme.

### Yerel hesaplar (komut satırı)

Henüz hiç yönetici yokken veya AD'ye erişilemediğinde sunucu üzerinde çalışan CLI kullanılır:

```bash
npm run kullanici -- liste
```

```bash
npm run kullanici -- ekle kullanici.adi --rol ADMIN --ad "Ad Soyad" --eposta a@b.c
```

```bash
npm run kullanici -- rol kullanici.adi ADMIN
```

```bash
npm run kullanici -- parola kullanici.adi
```

```bash
npm run kullanici -- pasif kullanici.adi
```

```bash
npm run kullanici -- sil kullanici.adi
```

Parola istemle sorulur; komut satırına yazılmaz (kabuk geçmişine ve süreç listesine
düşmesin diye). Kurulum betiklerinden çağırmak için boru ile beslenebilir:

```bash
printf 'Parola123!\nParola123!\n' | npm run kullanici -- ekle otomatik.hesap
```

Parola politikası: en az `PASSWORD_MIN_LENGTH` karakter (üretim varsayılanı **12**);
küçük harf, büyük harf, rakam ve sembol gruplarından en az üçü. Parolalar **Argon2id**
(19 MiB, 2 tur) ile özetlenir.

---

## 4. Yetkilendirme matrisi

| Uç | VIEWER | ADMIN |
|---|:---:|:---:|
| `GET /api/tumu` (Genel Bakış + Envanter) | ✅ *daraltılmış yanıt* | ✅ |
| `POST/PUT/DELETE /api/cep` (cep telefonu taahhüt kaydı) | ❌ | ✅ |
| `GET /api/urunler`, `GET /api/urunler/:id` | ✅ | ✅ |
| `POST/PUT/PATCH/DELETE /api/urunler…` | ❌ 403 | ✅ |
| `POST /api/urunler/:id/stok` | ❌ 403 | ✅ |
| `POST /api/urunler/toplu` (Excel içe aktarma) | ❌ 403 | ✅ |
| `GET/POST/PUT/DELETE /api/belgeler…` | ❌ 403 | ✅ |
| `POST/DELETE /api/personel`, `…-listesi` | ❌ 403 | ✅ |
| `POST /api/yedek` (geri yükleme) | ❌ 403 | ✅ |
| `GET/PUT /api/ayarlar/…` | ❌ 403 | ✅ |
| `GET/POST/PUT/DELETE /api/kullanicilar…` | ❌ 403 | ✅ |
| `GET /api/loglar` | ❌ 403 | ✅ |
| `GET/POST /api/yonetim/…` | ❌ 403 | ✅ |
| **politikada tanımsız her uç** | ❌ 403 | ❌ 403 |

Kimliği doğrulanmamış istek → **401**.

### VIEWER için kısıtlı yanıt

`GET /api/tumu` VIEWER'a **daraltılmış** yanıt döndürür — yetkisiz veri arayüzde gizlenmez,
sunucudan hiç gönderilmez:

* imza görselleri (`imzaAlan`, `imzaEden`, `imzaOnay`) çıkarılır
* teslim alan/eden/onay bilgileri ve kalem açıklamaları çıkarılır
* e-posta ayarları (EmailJS servis anahtarları) `null` döner
* personel listesi ve yardımcı listeler boş döner

### İstemci yolları

| Yol | Erişim |
|---|---|
| `/login` | herkese açık |
| `/dashboard`, `/inventory` | VIEWER + ADMIN |
| `/assignments`, `/people`, `/movements` | ADMIN |
| `/admin/users`, `/admin/logs`, `/admin/settings` | ADMIN |
| `/403` | yetkisiz erişim sayfası |

VIEWER doğrudan `/admin/users` adresine giderse **403 sayfası** görür.

---

## 5. Oturum güvenliği

| Özellik | Değer |
|---|---|
| Taşıma | `HttpOnly` + `Secure` + `SameSite=Lax` çerez |
| Depolama | SQL Server (`dbo.Oturumlar`) — çerezin **SHA-256 özeti** saklanır |
| Boşta kalma | `SESSION_IDLE_TIMEOUT_MINUTES` (varsayılan 30 dk, her istekte tazelenir) |
| Mutlak ömür | `SESSION_ABSOLUTE_TIMEOUT_HOURS` (varsayılan 8 sa) |
| Oturum sabitleme | Girişte oturum kimliği **zorunlu olarak yenilenir** |
| CSRF | Oturuma bağlı senkronizasyon token'ı, `X-CSRF-Token` başlığıyla |

Token `localStorage`/`sessionStorage`'da **tutulmaz**. CSRF token'ı yalnızca bellektedir.

Parola değişince veya hesap pasifleştirilince kullanıcının **tüm açık oturumları** anında
sonlandırılır.

---

## 6. Denetim günlüğü

`dbo.DenetimKaydi` tablosunda tutulur, **Loglar** sekmesinden (ADMIN) filtrelenebilir.

Kaydedilen olaylar: `LOGIN_SUCCESS`, `LOGIN_FAILED`, `LOGIN_RATE_LIMITED`, `LOGOUT`,
`ACCESS_DENIED`, `SESSION_EXPIRED`, `CSRF_REJECTED`, `INVENTORY_CREATED/UPDATED/DELETED/IMPORTED`,
`STOCK_MOVED`, `ASSIGNMENT_CREATED/UPDATED/DELETED/RETURNED`,
`PHONE_RECORD_CREATED/UPDATED/DELETED`,
`USER_CREATED/UPDATED/DELETED/PASSWORD_RESET`, **`USER_ROLE_CHANGED`**,
`SETTINGS_CHANGED`, `BACKUP_RESTORED`, `REFERENCE_DATA_CHANGED`.

Her kayıtta: zaman, kullanıcı adı, rol, sağlayıcı, eylem, kaynak, sonuç, IP, user-agent ve
teknik sebep.

`LOGIN_SUCCESS` kaydı rolün **neden** verildiğini de yazar (`AD erişim listesi` veya
`veritabanı rolü`). Böylece "bu kişi neden ADMIN'di?" sorusu, o günkü AD grup
üyeliğine geri dönmeden yanıtlanabilir. Rol değişiklikleri ayrıca `USER_ROLE_CHANGED`
olarak eski ve yeni değerle kaydedilir.

**Asla loglanmaz:** parola, parola özeti, oturum anahtarı, access/refresh token, AD bind
parolası. `common/logger.js` bilinen hassas alan adlarını maskeler.

Saklama süresi: `AUDIT_RETENTION_DAYS` (varsayılan 365 gün), saatlik bakımda temizlenir.

---

## 7. Hata mesajı politikası

Giriş başarısızlığının sebebi ne olursa olsun istemciye **tek bir genel mesaj** döner:

> Kullanıcı adı, parola veya erişim yetkisi geçersiz.

Bu, şu durumların hepsini kapsar: yerel hesap yok · yerel parola yanlış · hesap pasif ·
AD kullanıcısı yok · AD parolası yanlış · AD hesabı kilitli/devre dışı · **AD erişim listesinde yok** ·
**AD sunucusuna ulaşılamıyor**. Gerçek sebep yalnızca denetim günlüğüne yazılır.

AD erişilemediğinde bilinçli olarak `503` **değil** `401` döndürülür: `503`, "bu kullanıcı
adı yerel veritabanında yok" bilgisini sızdırırdı (yerel yol asla 503 üretmez). AD sağlık
bilgisi yalnızca ADMIN'e açık `/api/yonetim/saglik` ucundan verilir.

---

## 8. Saldırı yüzeyi ve alınan önlemler

| Saldırı | Önlem |
|---|---|
| SQL Injection | Tüm sorgular parametreli (`mssql .input`); tablo adları sabit eşlemeden |
| XSS | React otomatik kaçışlama + `Content-Security-Policy` (`script-src 'self'`, harici script yok) |
| CSRF | `SameSite=Lax` + oturuma bağlı senkronizasyon token'ı (`X-CSRF-Token`) |
| Brute force | Kullanıcı adı başına 5 deneme / 10 dk → `429` + `Retry-After` |
| Credential stuffing | IP başına ayrı sayaç (varsayılan 20 / 10 dk); başarılı girişte **IP sayacı sıfırlanmaz** |
| Session hijacking | `HttpOnly` + `Secure` çerez, depoda yalnızca SHA-256 özeti, mutlak ömür sınırı |
| Session fixation | Girişte oturum kimliği yenilenir |
| Privilege escalation | Rol sunucuda belirlenir; gövde/query'deki rol alanları silinir ve loglanır. Rol ataması yalnızca ADMIN'e açık kullanıcı yönetimi uçlarında ve **başka bir hesap** için mümkündür; tanınmayan rol değeri VIEWER'a düşer |
| Open redirect | Giriş sonrası yönlendirme yalnızca uygulama içi mutlak yollara izin verir |
| Username enumeration | Tek tip hata mesajı + hesap yokken de gerçek Argon2 doğrulaması (sabit süre) |
| Path traversal | `..` içeren istek yolları reddedilir |
| Clickjacking | `frame-ancestors 'none'` |
| Yetki kontrolü unutma | Varsayılan reddet — politikaya yazılmayan uç 403 |

---

## 9. Üretim güvenlik kontrol listesi

Devreye almadan önce:

- [ ] `NODE_ENV=production`
- [ ] `SESSION_SECRET` üretildi (`npm run anahtar-uret`), en az 32 karakter, `.env.example`'daki örnek **değil**
- [ ] `.env` sürüm kontrolünde **değil** (`.gitignore`'da listeli — doğrulayın: `git check-ignore .env`)
- [ ] Uygulama **HTTPS** arkasında; `SESSION_COOKIE_SECURE=1`
- [ ] Ters vekil varsa `TRUST_PROXY=1`, yoksa **0** (aksi hâlde IP sahteciliğiyle hız sınırı atlatılır)
- [ ] Yönetim sekmesinde yapılandırma uyarısı kalmadı
- [ ] `.env` içinde `PASSWORD_MIN_LENGTH` **yok** (üretim varsayılanı 12 geçerli olsun) ve geliştirmede açılan kısa parolalı hesapların parolası yenilendi
- [ ] SQL Server hesabı gereğinden fazla yetkiye sahip değil
- [ ] `AUDIT_RETENTION_DAYS` kurum politikasına uygun
- [ ] Denetim günlüğü ve `server/server.log` yedekleniyor / izleniyor
- [ ] `npm test` geçiyor
- [ ] Hesap parolaları paylaşılmıyor, kişi başına tek hesap
- [ ] ADMIN hesapları gözden geçirildi (`npm run kullanici -- liste`) — gereksiz yönetici yok
- [ ] En az iki yönetici var (biri kilitlenirse sistem yönetilebilir kalsın)

### Sürüm yükseltirken

Bu sürüm giriş zorunluluğu getirir. Üretim sunucusu yeniden başlatıldığı anda **tüm
kullanıcılar giriş ekranına düşer.** Yeniden başlatmadan önce:

1. `.env` hazırlanmış olmalı (`SESSION_SECRET` zorunlu — yoksa süreç başlamaz).
2. En az bir **yönetici** hesabı oluşturulmuş olmalı:
   `npm run kullanici -- ekle yerel.yonetici --rol ADMIN`

---

## 10. Klasör yapısı

```
server/
  config/      env, auth.config, active-directory.config
  common/      api-error, async-handler, logger
  auth/        roles, password, kullanici-adi, local-auth,
               authentication, authorization, session, rate-limit,
               auth.middleware, auth.controller
  users/       users.repository, users.service, users.controller
  inventory/   inventory.repository, inventory.service,
               inventory.controller, assignments.controller, reference.controller
  settings/    settings.controller
  audit/       audit.service, audit.controller
  admin/       admin.controller
  phones/      phones.controller (cep telefonu taahhüt kayıtları)
  scripts/     kullanici.js (yerel kullanıcı CLI)
  tests/       guvenlik, kimlik-dogrulama, yetkilendirme

src/
  auth/        AuthContext, Login, ProtectedRoute, izinler
  pages/       Forbidden, KullaniciYonetimi, DenetimGunlugu, YonetimAyarlari
```

---

## 11. Veritabanı tabloları

| Tablo | İçerik |
|---|---|
| `dbo.Kullanicilar` | Yerel hesaplar. `rol` sütunu (ADMIN\|VIEWER) CHECK kısıtlıdır, varsayılanı VIEWER'dır. AD kullanıcıları bu tabloda **tutulmaz**. |
| `dbo.Oturumlar` | Sunucu tarafı oturumlar; `id` = çerezin SHA-256 özeti. |
| `dbo.DenetimKaydi` | Denetim günlüğü. |
| `dbo.GirisDenemeleri` | Hız sınırı sayaçları (kullanıcı adı ve IP için ayrı satırlar). |

Tablolar sunucu açılışında otomatik oluşturulur; ayrı migration adımı gerekmez.
