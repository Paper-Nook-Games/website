# MINTHAVEN Playtest backend

Bu repo statik "coming soon" sitesini (`index.html`, `style.css`) ve MINTHAVEN Playtest
geri bildirim / hata raporu / anonim telemetri API'sini tasir. Statik dosyalar oldugu gibi
servis edilir; API, `api/` altindaki Vercel Node Functions'dir. Framework, build adimi ve
npm bagimliligi yoktur.

## Mimari

```text
MINTHAVEN Playtest (oyun istemcisi)
        | HTTPS POST (JSON, cookie/credential yok)
        v
papernookgames.com/api/playtest/*   (Vercel Node Functions)
        | whitelist dogrulama + boyut limiti + installation_id rate limit
        v
Supabase PostgREST  (service_role, yalniz sunucu tarafinda)
```

Oyun Supabase'e dogrudan baglanmaz; oyunda Supabase URL'i veya herhangi bir anahtar yoktur.

| Endpoint | Tablo | Govde limiti | Rate limit (installation_id basina) |
|---|---|---|---|
| `POST /api/playtest/feedback` | `playtest_feedback` | 32 KB | 5 kayit / 1 saat |
| `POST /api/playtest/bug-report` | `playtest_bug_reports` | 32 KB | 10 kayit / 1 saat |
| `POST /api/playtest/events` | `playtest_events` | 64 KB, 1..50 event | 1500 event / 10 dk (= 30 dolu batch) |

Yanitlar: `200 {"ok":true}`, `400 {"ok":false,"error":"<kod>"}`, `405` (POST disi),
`204` (OPTIONS preflight), `413` (govde limiti), `429` (`Retry-After` ile), `500
{"ok":false,"error":"server_error"}`. CORS: `Access-Control-Allow-Origin: *`,
`Allow-Methods: POST, OPTIONS`, `Allow-Headers: Content-Type`; credential kullanilmaz.
`Content-Type: application/json` zorunludur (degilse `400 invalid_content_type`).

Dosyalar:

- `api/playtest/{feedback,bug-report,events}.js` - endpoint'ler (ince sarmalayicilar).
- `api/_lib/handler.js` - ortak akis (CORS, method, boyut, dogrulama, rate limit, insert).
- `api/_lib/validate.js` - alan whitelist'i ve limitler; bilinmeyen alanlar sessizce duser.
- `api/_lib/supabase.js` - PostgREST cagrilari; service role anahtarini okuyan TEK dosya.
- `api/_lib/config.js` - limitler, rate limit pencereleri, tablo adlari.
- `supabase/migrations/20260927120000_playtest_feedback.sql` - tablolar, CHECK'ler, index'ler, RLS.
- `tests/playtest_api.test.mjs` - bagimliliksiz testler: `node tests/playtest_api.test.mjs`.

`api/_lib/` alt cizgiyle basladigi icin Vercel onu endpoint olarak yayinlamaz.

## Dogrulama kurallari (ozet)

- `installation_id`, `session_id`: UUID v4. `version`: semver (`0.1.4`). `profile`: tam olarak `playtest`.
- Feedback: `rating` 1..5 tam sayi; `would_wishlist` `yes|maybe|no`; metin alanlari <= 3000.
- Bug: `title` 1..120, `what_happened` 1..3000; `recent_events`/`recent_errors` en fazla 10.
- Events: `event_name` `[a-z0-9_]{1,64}`; `properties` duz nesne, <= 20 anahtar, deger
  string<=200 | sayi | boolean | null, serialize <= 2048 byte.
- Metin trim edilir; limiti asan metin **reddedilir** (kesilmez).
- Bilinmeyen ust seviye / event alanlari DB'ye gecmez (hata da vermez).
- Zaman damgalari (`created_at`) sunucuda uretilir; istemcinin `occurred_at`'i ayri kolondur.

## Rate limit tercihi

Ucretli servis veya ek altyapi yok. Her istekte Supabase'e `HEAD ... ?installation_id=eq.<id>
&created_at=gte.<pencere basi>` + `Prefer: count=exact` sorgusu atilir; son penceredeki
satir sayisi + yeni satir sayisi limiti asarsa `429` doner. Sayim hata verirse istek
reddedilir (`500`, fail-closed).

Bilinen sinirlar: `installation_id` istemci tarafindan uretildigi icin kararli bir
saldirgan kimligi dondurerek limiti asabilir; eszamanli istekler pencere sinirinda birkac
fazla satir yazabilir. Playtest olcegi icin kabul edilen denge budur. Daha guclu koruma
gerekirse Vercel Firewall rate limit kurali (IP bazli, Vercel tarafinda, DB'ye yazilmaz)
eklenebilir.

## Gizlilik siniri

- Uygulama kodu **ham IP'yi, request header'larini, cookie'leri veya user-agent'i hicbir
  tabloya yazmaz**; rate limit IP kullanmaz. Satirlar yalniz whitelist alanlarindan kurulur.
- Steam kimligi (SteamID, kullanici adi), isim, email, konum, donanim seri no/MAC,
  ekran goruntusu, tam save/log, dosya yolu **toplanmaz**; bu alanlar istemci gonderse bile duser.
- `installation_id` / `session_id` rastgele UUID'lerdir; gercek kullanici kimligi degildir.
- Vercel'in kendi operasyonel loglari platform tarafindadir ve bu kodun kontrolunde degildir.
- Hata durumunda log'a yalniz asama + HTTP status yazilir; DB hata govdesi ve anahtar asla.

## Kullanicinin yapmasi gerekenler

### 1. Vercel Environment Variables

Vercel projesinde (Settings -> Environment Variables), Production (ve istenirse Preview) icin:

| Degisken | Deger |
|---|---|
| `SUPABASE_URL` | `https://<project-ref>.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase -> Project Settings -> API Keys -> `service_role` (legacy JWT) veya `secret` anahtari |

Gercek degerleri repoya, `.env.example`'a veya istemci koduna yazmayin. Yerel deneme icin
`.env.local` kullanin (`.gitignore` tum `.env*` dosyalarini disarida tutar, `.env.example` haric).
Degisken eklendikten sonra yeniden deploy gerekir.

### 2. Migration'i uygulama

Iki yoldan biri:

- Supabase CLI: `supabase link --project-ref <ref>` ardindan `supabase db push`.
- Supabase Studio -> SQL Editor: `supabase/migrations/20260927120000_playtest_feedback.sql`
  icerigini yapistirip calistirin.

Sonra Studio'da uc tablonun "RLS enabled" gosterdigini ve hicbir policy olmadigini kontrol
edin. Veriler Studio'dan okunur; `status` (`new|reviewing|planned|fixed|wont_fix`) ve
`developer_note` elle guncellenir.

### 3. Domain

Site su an GitHub Pages ile yayinlaniyor (`.github/workflows/static.yml`). GitHub Pages
sunucu fonksiyonu calistiramaz: `https://papernookgames.com/api/playtest/*` ancak
`papernookgames.com` domain'i **Vercel projesine baglandiginda** (Vercel -> Domains, DNS
kayitlari Vercel'i gosterecek sekilde) calisir. Domain Vercel'e tasininca GitHub Pages
workflow'u devre disi birakilabilir; statik `index.html`/`style.css` Vercel'den ayni sekilde
servis edilir. `.vercelignore`, `tests/`, `supabase/`, `docs/` ve `.github/`'i deployment'a
dahil etmez.

## Test

```bash
node tests/playtest_api.test.mjs
```

Handler'lar mock `req`/`res` ve mock `fetch` ile cagrilir; ag veya gercek Supabase gerekmez.
Gercek Vercel + Supabase entegrasyonu bu testlerle dogrulanmaz; deploy sonrasi bir test
kaydi gonderip Studio'dan kontrol edin (ve silin).
