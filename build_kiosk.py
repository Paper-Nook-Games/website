#!/usr/bin/env python3
"""Kiosk assetleri: Sans Kutusu oyuncaginin kart yuzleri, paketleri ve makinesi.

Site ana projeden BAGIMSIZ yayinlanir. Bu script tek koprudur: uretim aninda
game/'e uzanir, ciktiyi assets/kiosk/ altina yazar ve YAYINLANAN klasorde
game/'e giden tek bir yol bile birakmaz. build_bg.py ile ayni sozlesme.

Kart yuzleri oyunun KENDI renderer'i (game/src/gfx/cardart.js) ile pisirilir --
Python'da ikinci bir kart cizim kodu YAZILMAZ. Bu yuzden calisan bir dev
sunucuya ihtiyac var:

    cd game && node tools/serve.js        # http://127.0.0.1:8787
    cd marketing/site && python build_kiosk.py

Gereksinim (bir kez):
    pip install playwright && python -m playwright install chromium

Cikti (hepsi assets/kiosk/ altinda, hepsi commit'lenir):
    cards/<dil>/<KART-ID>.webp   24 kart x 2 dil, 96x144, KAYIPSIZ webp
    pack_<tip>.webp              4 paket gorseli
    machine.webp                 kapsul otomati sprite'i
    pool.js                      kiosk.js'in okudugu tek veri dosyasi
"""
import base64
import hashlib
import io
import json
import os
import sys
import time

import numpy as np
from PIL import Image
from playwright.sync_api import sync_playwright

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")   # Windows cp1252 Turkce'yi kirar

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
GAME = os.path.join(ROOT, "game")
OUT = os.path.join(HERE, "assets", "kiosk")
SERVER = "http://127.0.0.1:8787/"

LANGS = ("tr", "en")
PACK_TYPES = ("standard", "expansion", "event", "collector")
MACHINE_SRC = os.path.join(GAME, "art", "world", "imports", "custom_gacha_mechine_1.png")

# Kart yuzu 192x288 pisirilir ve sitede 1:1 (en fazla 192 px) gosterilir.
#
# Once 96x144 pisirilip 2.2x BUYUTULUYORDU ve yanlisti: oyun karti 288x432 render
# edip 214 px'de gosteriyor (`.stackcard canvas`, style.css). Yani oyunda kart
# KUCULTULEREK ciziliyor, bende BUYUTULEREK. Sonuc: illustrasyon detayi eziliyor ve
# kartin kendi siyah konturu blok blok kalinlasip "kosede siyahlik" olarak okunuyordu.
#
# Olculdu (kayipsiz webp, ortalama, 5 kart):
#    96 px  23.7 KB  -> cekim basina 115 KB   (detay kaybi: RED)
#   144 px  46.8 KB  -> 229 KB
#   192 px  75.1 KB  -> 367 KB                (1:1 gosterim: SECILDI)
#   288 px 123.1 KB  -> 601 KB                (oyunla birebir ama 1.6x pahali)
# 192 secildi cunku 1:1 gosterimde olcekleme artefakti HIC yok; 288'in ek detayi
# ancak 214 px'e kucultulunce goruluyor ve cekim basina 234 KB daha yuklüyor.
CARD_W = 192


# --- kart silueti: yuvarlak kosenin DISINI saydam yap -----------------------
# `drawCard` illustrasyonu cercevenin ALTINA, yuvarlak kosenin disina kadar
# ciziyor; sonuc kartin dort kosesinde opak (cogu zaman koyu) bir ucgen kaliyor.
# Oyunun kendi ciktisi da boyle (olculdu: oyun %0.23 saydam, biz %0.22) ama orada
# mor zemin + hale yuzunden goze batmiyor; sitede kartin kenari kirik gorunuyor.
#
# CERCEVENIN KENDI SILUETI YETMEZ, olculdu. `card-type-frames/*.png`nin alfasi
# disaridan flood-fill edilince kartin disi cikiyor (dokuz cercevede de BIREBIR
# ayni bolge, 4846 piksel) ama o maskeyi uygulamak neredeyse hicbir sey degistirmedi
# (saydam piksel 121 -> 121): kosedeki siyahlik siluetin ICINDE, cunku cerceve
# sanatinin KENDI konturu orada. Kaynakta 7 px'lik saydam ucgenden hemen sonra
# parlakligi 1-27 olan opak pikseller geliyor.
#
# Yani bu, oyundan BILINCLI bir sapma: kart sitede yuvarlak koseli okunsun diye
# konturun kose parcasi kesiliyor. Yaricap gozle secildi (192 px'de 8/12/16
# karsilastirildi): 8 siyah centigi birakiyor, 16 altin cerceveyi yemeye basliyor,
# 12 centigi tam temizleyip cerceveyi kesintisiz birakiyor.
CORNER_R = 12 / 192.0        # kart genisliginin orani — CARD_W degisirse birlikte olcekler


def cut_corners(im):
    from PIL import ImageDraw
    r = max(1, round(im.width * CORNER_R))
    m = Image.new("L", im.size, 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, im.width - 1, im.height - 1], radius=r, fill=255)
    a = np.array(im.convert("RGBA"))
    a[..., 3] = np.minimum(a[..., 3], np.asarray(m))
    return Image.fromarray(a, "RGBA")


def webp(png_bytes, corners=False):
    """PNG -> KAYIPSIZ webp. Olculdu: gorunur (alfa=255) piksellerde sapma 0,
    alfa kanalinda sapma 0; PNG'ye gore ~%23 kucuk. Kayipli webp REDDEDILDI
    (q90'da piksellerin %49-68'i >8 sapiyor), PNG-8 de reddedildi (painterly
    illustrasyonlarda bantlanma -- bkz. marketing-site.md fg_desk.png notu)."""
    im = Image.open(io.BytesIO(png_bytes)).convert("RGBA")
    if corners:
        im = cut_corners(im)
    b = io.BytesIO()
    im.save(b, "WEBP", lossless=True, quality=100, method=6)
    return b.getvalue()


def write(path, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "wb") as f:
        f.write(data)
    return len(data)


def wait_globals(page, expr, timeout=25.0):
    """page.wait_for_function bu sayfada ASILI KALIYOR (rAF-polling; timeout'u da
    atesleniyor degil -- bkz. .claude/skills/verify). Kendi dongumuzle poll ederiz."""
    t0 = time.time()
    while time.time() - t0 < timeout:
        if page.evaluate(f"() => !!({expr})"):
            return
        page.wait_for_timeout(200)
    raise SystemExit(f"HATA: sayfa hazir olmadi ({expr}). Dev sunucu 8787'de ayakta mi?")


def main():
    with open(os.path.join(HERE, "pool.json"), encoding="utf-8") as f:
        pool = json.load(f)
    ids = pool["cards"]
    print(f"havuz: {len(ids)} kart")

    with sync_playwright() as pw:
        browser = pw.chromium.launch()
        page = browser.new_page()
        errs = []
        page.on("pageerror", lambda e: errs.append(str(e)))
        try:
            page.goto(SERVER, wait_until="load", timeout=20000)
        except Exception:
            raise SystemExit(
                "HATA: dev sunucuya baglanilamadi.\n"
                "  cd game && node tools/serve.js     (http://127.0.0.1:8787)"
            )
        wait_globals(page, "globalThis.CardArt && globalThis.TCG_INDEX && globalThis.I18N")

        # Illustrasyonlarin HEPSI yuklenene kadar bekle. CardArt.ready() yalniz
        # template+font+ikon kapsar; gercek sanat loadArtFiles ile async gelir ve
        # beklenmezse kart yer tutucu desenle pisirilir -- sessiz, geri donusu zor bir hata.
        loaded = page.evaluate("""async () => {
          await CardArt.ready();
          const a = await CardArt.reloadArt();
          return a;
        }""")
        print(f"illustrasyon: {loaded['loaded']}/{loaded['total']} yuklendi")

        # DRIFT KORUMASI: pool.json elle yazilir, katalog degisir. Eksik id ya da
        # illustrasyonu olmayan kart SESSIZCE gecmemeli.
        missing = page.evaluate(
            "ids => ids.filter(id => !TCG_INDEX[id] || !(globalThis.CardArtFiles||{})[id])", ids)
        if missing:
            raise SystemExit(
                f"HATA: pool.json'daki su id'ler katalogda yok ya da illustrasyonu yok: {missing}\n"
                "  pool.json'u duzelt (elle yazilir, cards.js'ten turetilmez)."
            )

        meta = page.evaluate("""ids => ids.map(id => {
          const c = TCG_INDEX[id];
          return { id, tr:c.name.tr, en:c.name.en, rarity:c.rarity,
                   disp:(globalThis.Rarity ? Rarity.letter(c) : c.rarity[0].toUpperCase()),
                   elem:c.elem, type:c.type, cost:c.cost, atk:c.atk??null, hp:c.hp??null };
        })""", ids)

        # --- SHADER verisi ------------------------------------------------
        # Oyunun gercek holo/prizma katmani (fxgl.js) siteye TASINIR. Tasinmayan
        # tek sey cardart.js: shader'in ihtiyaci olan her sey burada PISIRILIR.
        # Sansli olan taraf: gereken butun profiller rect:'card' + material:'card'
        # kullaniyor (card_finishes.js), yani `cardRectUv` sabit [0,0,1,1] ve
        # malzeme zaten pisirdigimiz kart yuzu. Geriye yalniz MASKE kaliyor —
        # onu da CardArt'in kendi disa acik yardimcilarindan aliyoruz.
        fx = page.evaluate("""ids => {
          const CF = globalThis.CardFinishes;
          return ids.map(id => {
            const c = TCG_INDEX[id];
            const fullArt = !!c.promoFullArt;
            const profile = CF.resolveProfile(c, 'base');
            const overlay = CF.foilOverlay(c, 'base', 'foil', profile);
            const rec = CF.forCard(id);
            const masks = {};
            for (const pid of [profile, overlay]) {
              if (!pid || !CF.has(pid)) continue;
              const f = CF.get(pid);
              if (!f.mode) continue;                       // 2d-only profil
              const hand = f.defaultMask ? null : CardArt.fxMaskFor(c, 'base');
              const m = hand || CardArt.fxDerivedMask(pid, c, fullArt);
              if (!m) continue;
              const cv = document.createElement('canvas');
              cv.width = m.width; cv.height = m.height;
              cv.getContext('2d').drawImage(m, 0, 0);
              masks[pid] = cv.toDataURL('image/png');
            }
            return { id, profile, overlay, fullArt,
                     maskFlip: !!(rec && rec.maskFlip), masks };
          });
        }""", ids)

        fxmeta, nmask, mbytes = {}, 0, 0
        for row in fx:
            for pid, durl in row["masks"].items():
                raw = webp(base64.b64decode(durl.split(",", 1)[1]))
                mbytes += write(os.path.join(OUT, "masks", row["id"] + "__" + pid + ".webp"), raw)
                nmask += 1
            fxmeta[row["id"]] = {
                "profile": row["profile"], "overlay": row["overlay"],
                "fullArt": row["fullArt"], "maskFlip": row["maskFlip"],
                "masks": sorted(row["masks"].keys()),
            }
        have = sum(1 for v in fxmeta.values() if v["profile"] or v["overlay"])
        print(f"shader: {nmask} maske, {mbytes/1024:.0f} KB — {have}/{len(ids)} kartin efekti var")

        tables = page.evaluate("""() => ({
          rarity: CardArt.RAR_FRAME,
          odds: Econ.VENDING.odds,
          packs: Object.fromEntries(['standard','expansion','event','collector'].map(t => [t, {
            cards: Econ.PACKS[t].cards,
            std: Econ.PACKS[t].std, hit: Econ.PACKS[t].hit,
            promoChance: Econ.PACKS[t].promoChance || 0,
            // foil = std yuvalarinin, foilHit = hit yuvasinin foil olma sansi
            foil: Econ.PACKS[t].foil, foilHit: Econ.PACKS[t].foilHit,
            tear: CardArt.packTear(t)
          }]))
        })""")

        # --- kart yuzleri: her dil icin ayri set -------------------------------
        # Isim ve kural metni kart yuzune PISER, yani dil de piser. Site TR/EN
        # oldugu icin tek set yetmez; ziyaretcinin diline gore yalniz bir set
        # indirilir (lazy), o yuzden ikiye katlanan sey depolama, transfer degil.
        total = 0
        digests = {}
        for lang in LANGS:
            digests[lang] = {}
            n = 0
            for cid in ids:
                data_url = page.evaluate("""({id, w, lang}) => {
                  const cv = document.createElement('canvas');
                  cv.width = w; cv.height = Math.round(w*1.5);
                  const cx = cv.getContext('2d');
                  cx.imageSmoothingEnabled = false;
                  // lang: kart yuzunun dili opts.lang'DAN gelir, I18N.lang'dan DEGIL
                  // (cardart.js:791, varsayilan 'tr'). I18N.lang'i kurmak hicbir sey
                  // yapmaz -- iki dil seti de sessizce Turkce cikar.
                  // _noFx: duz taban yuz. Foil/holo kiosk.js'te calisma aninda biner,
                  // boylece kart basina TEK dosya yeter.
                  CardArt.drawCard(cx, id, 0, 0, w,
                    {print:'base', finish:'normal', _noFx:true, lang});
                  return cv.toDataURL('image/png');
                }""", {"id": cid, "w": CARD_W, "lang": lang})
                # koseler yalniz KART YUZUNDE kesilir; paket/makine/maske dokunulmaz
                raw = webp(base64.b64decode(data_url.split(",", 1)[1]), corners=True)
                digests[lang][cid] = hashlib.md5(raw).hexdigest()
                n += write(os.path.join(OUT, "cards", lang, cid + ".webp"), raw)
            print(f"kartlar [{lang}]: {len(ids)} dosya, {n/1024:.0f} KB")
            total += n

        # DIL KORUMASI: dil kart yuzune PISER ve opts.lang ile gelir. Bir kez
        # I18N.lang kurmakla yapilmaya calisildi -- hicbir etkisi yok ve iki set de
        # sessizce Turkce cikti (24/24 birebir ayni dosya). Bu kontrol o hatanin
        # bir daha sessizce gecmesini engeller.
        a, b = LANGS[0], LANGS[1]
        differing = sum(1 for cid in ids if digests[a][cid] != digests[b][cid])
        if differing == 0:
            raise SystemExit(
                f"HATA: {a}/{b} kart yuzlerinin HEPSI birebir ayni -- dil uygulanmamis.\n"
                "  drawCard dili opts.lang'dan alir (cardart.js), I18N.lang'dan DEGIL."
            )
        print(f"dil kontrolu: {differing}/{len(ids)} kart {a}/{b} arasinda farkli")

        if errs:
            print("\nSAYFA HATALARI (cikti supheli):")
            for e in errs[:8]:
                print("  " + e)
        browser.close()

    # --- paketler + makine: yeniden cizilmez, kaynaktan donusturulur -----------
    for t in PACK_TYPES:
        src = os.path.join(GAME, "art", "ui", "packs", t + ".png")
        with open(src, "rb") as f:
            n = write(os.path.join(OUT, f"pack_{t}.webp"), webp(f.read()))
        total += n
    print(f"paketler: {len(PACK_TYPES)} dosya")

    with open(MACHINE_SRC, "rb") as f:
        total += write(os.path.join(OUT, "machine.webp"), webp(f.read()))
    print("makine: 1 dosya")
    total += mbytes

    # --- shader calisma zamani: oyunun dosyalari OLDUGU GIBI kopyalanir --------
    # Elle yazilmis bir kopya TUTULMAZ; ikisi sessizce ayrisirdi. Bunlar uretilmis
    # dosyadir, duzenlenmez. Ucu de disa bagimsiz: card_finishes.js'in hicbir dis
    # bagimliligi yok, fxgl.js yalnizca RNG.make cagiriyor, rng.js zaten tek basina.
    # Sayfa acilisinda YUKLENMEZLER — kiosk.js makineye tiklaninca ceker.
    for src, dst in [(os.path.join(GAME, "src", "core", "rng.js"), "rng.js"),
                     (os.path.join(GAME, "src", "data", "card_finishes.js"), "card_finishes.js"),
                     (os.path.join(GAME, "src", "gfx", "fxgl.js"), "fxgl.js")]:
        with open(src, "rb") as f:
            body = f.read()
        head = ("/* URETILDI - build_kiosk.py, kaynak: game/" +
                os.path.relpath(src, GAME).replace("\\", "/") + " — ELLE DUZENLEME. */\n").encode("utf-8")
        total += write(os.path.join(OUT, dst), head + body)
    print("shader calisma zamani: rng.js + card_finishes.js + fxgl.js kopyalandi")

    # --- pool.js: kiosk.js'in okudugu TEK veri dosyasi -------------------------
    # cards.js, i18n.js ve econ.js siteye HIC kopyalanmaz; ihtiyac duyulan her sey
    # burada. Elle duzenlenmez -- build_kiosk.py yeniden yazar.
    js = (
        "/* URETILDI - build_kiosk.py. ELLE DUZENLEME.\n"
        "   Kaynak: marketing/site/pool.json + game/src/data/cards.js + game/src/core/econ.js */\n"
        "globalThis.KIOSK = " + json.dumps({
            "cards": meta,
            "rarity": tables["rarity"],
            "odds": tables["odds"],
            "packs": tables["packs"],
            "langs": list(LANGS),
            # kart uzayi sabitleri (cardart.js CW/CH) — shader koprusu bunlari ister
            "cw": 96, "ch": 144,
            "fx": fxmeta,
        }, ensure_ascii=False, indent=1) + ";\n"
    )
    total += write(os.path.join(OUT, "pool.js"), js.encode("utf-8"))

    print(f"\ntoplam: {total/1024:.0f} KB  (assets/kiosk/)")
    print("NOT: bunlarin hicbiri sayfa acilisinda yuklenmez -- makineye tiklanana kadar beklerler.")


if __name__ == "__main__":
    main()
