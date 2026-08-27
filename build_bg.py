#!/usr/bin/env python3
"""Site arka plani: oyunun KENDI proplarindan ton-uzeri-ton "oyma" (etch) desen.

Potion Craft'in parsomen uzerine simyaci aletleri cizimi bizde: koyu yesil playmat
uzerine, oyunun kendi UI assetlerinden turetilmis tek renkli kontur cizimleri.
Hicbir yeni sanat uretilmez -- her sey game/art/ui/ altindan gelir (bizim assetlerimiz,
Cute Fantasy tile'lari DEGIL; onlar lisansli ve siteye giremez).

Cikti: assets/bg_playmat.png (2400x1200) + assets/logo.png + assets/fg_desk.png
"""
import os
import numpy as np
from PIL import Image, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
UI = os.path.join(ROOT, "game", "art", "ui")
CAPS = os.path.join(ROOT, "marketing", "steam", "capsules")
CARDS = os.path.join(ROOT, "marketing", "steam", "work", "cards", "en")
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "assets")
os.makedirs(OUT, exist_ok=True)

W, H = 2400, 1200

# --- palet (game/src/gfx/pixel.js PAL'den turetildi) ---
BG_TOP = (14, 38, 24)       # playmat ustu
BG_BOT = (9, 26, 17)        # playmat alti (vinyet)
ETCH = (74, 148, 104)       # kontur rengi -- PAL.grassD'nin acilmis hali
ETCH_SOFT = (24, 60, 42)    # ic dolgu


def load(path):
    return Image.open(path).convert("RGBA")


def etch_lines(img, thr=34):
    """Piksel sprite'i -> 1px kontur cizimi (L maskesi, native cozunurlukte).

    Iki kaynak birlestirilir: (1) alfa silueti kenari, (2) ic renk gecisleri.
    Native cozunurlukte hesaplanir, sonra NEAREST ile buyutulur -- boylece
    cizgiler buyudukce kalinlasir ve gravur hissi korunur.

    Tam opak sprite'larda (display_case, duel_table gibi tam kadraj gorseller)
    siluet konturu kadrajin kendisidir; cizilirse kutu gibi durur, o yuzden atlanir.
    """
    a = np.array(img.getchannel("A"))
    solid = (a > 24).astype(np.uint8) * 255
    solid_img = Image.fromarray(solid, "L")
    coverage = (solid > 0).mean()

    outline = np.zeros(solid.shape, dtype=bool)
    if coverage < 0.98:
        eroded = np.array(solid_img.filter(ImageFilter.MinFilter(3)))
        outline = (solid > 0) & (eroded == 0)

    # ic kenarlar: gri tonda gradyan
    gray = np.array(img.convert("L"), dtype=np.int16)
    gray[solid == 0] = 0
    dx = np.abs(np.diff(gray, axis=1, prepend=gray[:, :1]))
    dy = np.abs(np.diff(gray, axis=0, prepend=gray[:1, :]))
    inner = ((dx > thr) | (dy > thr)) & (solid > 0)

    return Image.fromarray(((outline | inner) * 255).astype(np.uint8), "L"), solid_img


def prop(path, scale, alpha=1.0, flip=False, thr=34):
    """Etch'lenmis prop -> RGBA katman (saf cizgi, dolgusuz)."""
    img = load(path)
    if flip:
        img = img.transpose(Image.FLIP_LEFT_RIGHT)
    lines, _ = etch_lines(img, thr)
    w, h = img.size
    sz = (max(1, int(w * scale)), max(1, int(h * scale)))
    lines = lines.resize(sz, Image.NEAREST)

    layer = Image.new("RGBA", sz, (0, 0, 0, 0))
    ink = Image.new("RGBA", sz, ETCH + (int(255 * alpha),))
    layer.paste(ink, (0, 0), lines)
    return layer


def gradient_bg():
    top = np.array(BG_TOP, dtype=np.float32)
    bot = np.array(BG_BOT, dtype=np.float32)
    t = np.linspace(0, 1, H, dtype=np.float32)[:, None, None]
    arr = (top[None, None, :] * (1 - t) + bot[None, None, :] * t)
    img = np.zeros((H, W, 3), dtype=np.float32) + arr
    return Image.fromarray(img.astype(np.uint8), "RGB").convert("RGBA")


def vignette(canvas, strength=0.55):
    """Merkez aydinlik, kenarlar koyu -- logo ve butonlar okunakli kalsin."""
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    cx, cy = W / 2.0, H * 0.42
    d = np.sqrt(((xx - cx) / (W * 0.62)) ** 2 + ((yy - cy) / (H * 0.78)) ** 2)
    v = np.clip((d - 0.35) / 0.9, 0, 1) ** 1.4 * strength
    dark = Image.new("RGBA", (W, H), (5, 16, 11, 255))
    mask = Image.fromarray((v * 255).astype(np.uint8), "L")
    return Image.composite(dark, canvas, mask)


def pocket_grid(canvas):
    """Binder cebi izgarasi -- playmat'in uzerine basilmis gibi cok soluk."""
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    px = np.zeros((H, W, 4), dtype=np.uint8)
    cw, ch, gap = 132, 186, 26
    x0 = (W % (cw + gap)) // 2
    col = np.array(ETCH + (26,), dtype=np.uint8)
    for gy in range(-1, H // (ch + gap) + 2):
        for gx in range(-1, W // (cw + gap) + 2):
            x = x0 + gx * (cw + gap)
            y = gy * (ch + gap) - 40
            if x + cw < 0 or x > W or y + ch < 0 or y > H:
                continue
            xs, xe = max(0, x), min(W, x + cw)
            ys, ye = max(0, y), min(H, y + ch)
            for t in range(3):  # 3px kalinlik
                if 0 <= y + t < H:
                    px[y + t, xs:xe] = col
                if 0 <= y + ch - t < H:
                    px[y + ch - t, xs:xe] = col
                if 0 <= x + t < W:
                    px[ys:ye, x + t] = col
                if 0 <= x + cw - t < W:
                    px[ys:ye, x + cw - t] = col
    layer = Image.fromarray(px, "RGBA")
    canvas.alpha_composite(layer)
    return canvas


def build_bg():
    canvas = gradient_bg()
    canvas = pocket_grid(canvas)

    P = lambda *a: os.path.join(UI, *a)
    # (dosya, x, y, olcek, alfa, ayna) -- x,y sol-ust kose
    # Potion Craft duzeni: agir "aletler" SOL ve SAG kumelerde, orta-ust bos
    # (logo + butonlar oraya oturur), altta tezgah hizasinda kucuk nesneler.
    # NOT: uzerinde yazi olan proplar (paketler, madeni para) AYNALANMAZ --
    # ters yazi hemen goze batiyor. Yalniz vitrin/masa gibi simetrikler aynalanir.
    items = [
        # --- sol kume ---
        (P("arcade_cabinet.png"), 20, 170, 0.90, 0.72, False, 40),
        (P("display_case.png"), -60, 660, 1.55, 0.70, False, 34),
        (P("binder_open.png"), 470, 120, 3.2, 0.55, False, 30),
        (P("packs", "expansion.png"), 760, 620, 1.15, 0.60, False, 34),
        (P("packs", "foilfest.png"), 620, 790, 1.00, 0.48, False, 34),
        (P("duel_slot.png"), 860, 300, 1.7, 0.40, False, 24),
        (P("coin_heads.png"), 700, 470, 1.5, 0.40, False, 30),
        (P("packs", "junkbox.png"), 250, 1010, 0.95, 0.45, False, 34),
        # --- sag kume ---
        (P("display_case.png"), 1660, 130, 1.35, 0.72, True, 34),
        (P("duel_table.png"), 1560, 620, 1.50, 0.55, False, 78),
        (P("binder_open.png"), 2020, 430, 3.4, 0.50, True, 30),
        (P("packs", "collector.png"), 1400, 680, 1.20, 0.60, False, 34),
        (P("packs", "legends.png"), 1270, 830, 1.00, 0.48, False, 34),
        (P("duel_slot.png"), 1490, 320, 1.7, 0.40, False, 24),
        (P("coin_heads.png"), 1690, 1010, 1.5, 0.40, False, 30),
        (P("packs", "elem.png"), 2010, 1000, 0.95, 0.45, False, 34),
        # --- orta alt: on plandaki masanin arkasi, hafif kalsin ---
        (P("panel_frame.png"), 1130, 1010, 2.2, 0.26, False, 30),
        (P("packs", "standard.png"), 960, 1060, 0.80, 0.26, False, 34),
    ]
    for path, x, y, sc, al, mir, thr in items:
        if not os.path.exists(path):
            print("  ! yok:", path)
            continue
        canvas.alpha_composite(prop(path, sc, al, mir, thr), (x, y))

    canvas = vignette(canvas)
    out = os.path.join(OUT, "bg_playmat.png")
    canvas.convert("RGB").save(out, optimize=True)
    print("bg_playmat.png", canvas.size, os.path.getsize(out) // 1024, "KB")


def build_logo():
    im = Image.open(os.path.join(CAPS, "library_logo_1280x720.png")).convert("RGBA")
    im = im.crop(im.getbbox())
    im.save(os.path.join(OUT, "logo.png"), optimize=True)
    print("logo.png", im.size)


def build_fg():
    """Alt kenardaki TEK doygun obje: acik binder + arkasinda paket yelpazesi.

    Potion Craft'ta sayfanin tek doygun ogesi kazan+havan; bizde bu.
    Simetrik kurulur ve sayfanin alt kenarindan kirpilir -- kirpik kenar
    kadrajin DISINDA kalirsa "devam ediyor" okunur (bkz. steam README,
    "Kesik nesne kurali").
    """
    binder = load(os.path.join(UI, "binder_open.png"))
    bs = 8
    binder = binder.resize((binder.width * bs, binder.height * bs), Image.NEAREST)
    bw, bh = binder.size  # 1344 x 896

    # --- cepleri gercek kartlarla doldur -------------------------------
    # Cep izgarasi binder_open.png'den olculdu (cep rengi 191,194,205):
    # sutunlar x=31/49/67 (sol sayfa) ve 101/119/137 (sag), satirlar y=14/38/64,
    # cep 14x22 px. Kart renderlari marketing/steam/work/cards/en (192x288).
    POCKET_X = [31, 49, 67, 101, 119, 137]
    POCKET_Y = [14, 38, 64]
    PW, PH = 14, 22
    # dolu/bos deseni: koleksiyon YARIM -- bos cepler hikayenin parcasi
    filled = [(0, 0), (1, 0), (2, 0), (0, 1), (2, 1), (3, 0), (4, 0), (3, 1),
              (5, 1), (1, 2), (4, 2), (5, 0)]
    if os.path.isdir(CARDS):
        slots = sorted(f for f in os.listdir(CARDS) if f.startswith("slot"))
        for i, (cx, cy) in enumerate(filled):
            if i >= len(slots):
                break
            card = load(os.path.join(CARDS, slots[i]))
            card = card.resize((PW * bs, int(PW * bs * card.height / card.width)), Image.NEAREST)
            x = POCKET_X[cx] * bs
            y = POCKET_Y[cy] * bs + (PH * bs - card.height) // 2
            binder.alpha_composite(card, (x, y))
    else:
        print("  ! kart renderlari yok:", CARDS)

    ps = 1.6

    def pack(name, deg):
        """Paketi olcekle, dondur ve BBOX'A KIRP.

        Kirpma sart: expand=True ile dondurulen goruntunun kenarlarinda aciya gore
        degisen seffaf pay kalir. Kirpmadan kose koordinatiyla yerlestirilince
        sol ve sag paketler farkli mesafede duruyordu.
        """
        q = load(os.path.join(UI, "packs", name))
        q = q.resize((int(q.width * ps), int(q.height * ps)), Image.NEAREST)
        r = q.rotate(deg, resample=Image.NEAREST, expand=True)
        return r.crop(r.getbbox())

    # Ayni |aci|, ayna cift: sol +, sag -
    l_out, r_out = pack("foilfest.png", 16), pack("collector.png", -16)
    l_in,  r_in  = pack("expansion.png", 7), pack("legends.png", -7)

    pad = 620
    cw, ch = bw + pad * 2, bh + 340
    canvas = Image.new("RGBA", (cw, ch), (0, 0, 0, 0))

    base_y = 300
    # NOT: bunlar BBOX olculeridir. Paket egik oldugu icin bbox kosesi bos kalir;
    # gorunur temas noktasi bbox kenarindan ~80px iceridedir. TUCK'i buna gore sec.
    TUCK = 260   # ic paket binder kenarinin kac px ARKASINA girer (bbox)
    STEP = 155   # dis paket ic paketten kac px daha disarida

    # Simetri hesapla garanti: sag taraf, sol tarafin binder merkezine gore aynasi.
    mirror = lambda x, w: int(2 * pad + bw - x - w)

    lx_in = pad - l_in.width + TUCK
    lx_out = lx_in - STEP
    y_in, y_out = base_y + 130, base_y + 60

    # arkadaki paketler: once dis, sonra ic
    canvas.alpha_composite(l_out, (lx_out, y_out))
    canvas.alpha_composite(r_out, (mirror(lx_out, r_out.width), y_out))
    canvas.alpha_composite(l_in, (lx_in, y_in))
    canvas.alpha_composite(r_in, (mirror(lx_in, r_in.width), y_in))
    # onde binder
    canvas.alpha_composite(binder, (pad, base_y + 200))

    canvas = canvas.crop(canvas.getbbox())
    canvas.save(os.path.join(OUT, "fg_desk.png"), optimize=True)
    print("fg_desk.png", canvas.size)


def build_sign():
    """Serit buton cercevesi: PixelLab (pixflux, 1 generation) -> 9-slice.

    `assets/sign_raw.png` uretimi tek seferlik ve kaydedilmis durumda; bu fonksiyon
    onu kirpip CSS border-image'a hazir hale getiriyor ve hover icin altin varyanti
    turetiyor (yeni generation harcamadan, renk esleyerek).

    Palet uretimde `_palette.png` ile zorlandi (PAL.wood/woodD/plank/ui/gold).
    """
    src = os.path.join(OUT, "sign_raw.png")
    if not os.path.exists(src):
        print("  ! sign_raw.png yok — PixelLab ciktisini assets/ icine koy")
        return
    im = Image.open(src).convert("RGBA")
    im = im.crop(im.getbbox())          # olu seffaf kenar 9-slice'i bozar
    im.save(os.path.join(OUT, "sign.png"), optimize=True)

    # hover: krem ic panel -> altin. Ayni pikseller, yeni generation yok.
    a = np.array(im).astype(int)
    swap = {(245, 234, 210): (254, 174, 52),   # ui  -> gold
            (232, 183, 150): (247, 118, 34)}   # plank -> goldD
    for src_c, dst_c in swap.items():
        m = (a[:, :, 0] == src_c[0]) & (a[:, :, 1] == src_c[1]) & (a[:, :, 2] == src_c[2])
        a[m, 0], a[m, 1], a[m, 2] = dst_c
    Image.fromarray(a.astype(np.uint8), "RGBA").save(os.path.join(OUT, "sign_hover.png"), optimize=True)
    print("sign.png / sign_hover.png", im.size)


if __name__ == "__main__":
    build_logo()
    build_sign()
    build_fg()
    build_bg()
