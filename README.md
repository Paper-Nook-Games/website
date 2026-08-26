# Minthaven — acilis sayfasi

Statik tek sayfa. Bagimlilik, build araci, framework yok.

```bash
python build_bg.py                  # assetleri uret
python -m http.server 8790          # onizleme -> http://127.0.0.1:8790
```

Yayin: klasoru oldugu gibi kopyala. **`build_bg.py`, bu README, `assets/_palette.*` ve
`assets/sign_raw.png` yuklenmez** (uretim girdisi). `assets/og.png` sayfada `<img>`
olarak gecmez ama sosyal onizleme icin sunucuda olmali. Font `.ttf`'leri OFL lisans
metinleriyle birlikte gider.

Sayfa baska bir alt yola tasinirsa `index.html` icindeki `og:url` ve `og:image`
mutlak adreslerini guncelle.

Tasarim kararlari ve asset boru hattinin ayrintisi: `docs/memory/systems/marketing-site.md`
