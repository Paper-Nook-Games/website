/* ============================================================
   Sans Kutusu (kiosk) — sitenin tek interaktif ogesi.

   BAGIMSIZLIK: bu dosya oyunun hicbir modulunu kullanmaz. Ihtiyac
   duydugu her sey assets/kiosk/pool.js icinde (build_kiosk.py uretir):
   kart listesi, nadirlik renkleri, paket olasiliklari, yirtma cizgileri.
   Yayinlanan klasorde game/'e giden tek bir yol YOKTUR.

   KAYIT YOK: cekilen kartlar hicbir yere yazilmaz. Tek kalici durum
   oturum basina cekim hakkidir ve o da sessionStorage'dadir — sekme
   kapaninca gider.

   Oyunla AYNI olan seyler (kasitli, "ayni oyun" hissi icin):
     - cekim olasiliklari + foil oranlari (econ.js PACKS/VENDING)
     - ritual zaman cizgisi ve egrileri (world.js World.VFX)
     - tirtikli yirtma kenari (screens_cards.js jaggedTear)
     - prosedurel sesler (audio.js SFX)
   Oyunda olup burada OLMAYANLAR: pity, koleksiyon, para, deger,
   yeni/kopya rozeti, gizli baskilar, WebGL foil.
   ============================================================ */
(function () {
  'use strict';

  var K = globalThis.KIOSK;
  if (!K || !K.cards || !K.cards.length) return;   // pool.js yuklenmediyse sessizce yok ol

  var BASE = 'assets/kiosk/';
  var PULLS = 3;                                   // oyundaki gunluk 3 hakkin karsiligi
  var LIMIT_KEY = 'mh_kiosk_pulls';
  var MUTE_KEY = 'mh_kiosk_muted';

  // Ritual zaman cizgisi — world.js World.VFX ile BIREBIR (ms, birikimli).
  var VFX = { shake: 1000, eject: 1320, hover: 3320, exit: 3600 };

  // ---- dil ---------------------------------------------------
  // Sitenin setLang()'ine DOKUNULMAZ: o kendi STR sozlugunu geziyor ve
  // buradaki anahtarlari bilmiyor (bilmedigi anahtar textContent'i
  // "undefined" yapardi). Bunun yerine <html lang> izlenir — sifir baglanti.
  var STR = {
    tr: {
      name: 'ŞANS KUTUSU', left: 'HAK', empty: 'BUGÜNLÜK BİTTİ',
      tear: 'FOLYOYU YIRTMAK İÇİN SÜRÜKLE →',
      swipe: 'SÜRÜKLE: DESTEYİ EĞ · TIKLA: SIRADAKİ KART',
      close: 'KAPAT', mute: 'SES', cta: 'ŞANSINI DENE', odds: 'STANDART %50 · GENİŞLEME %28 · ETKİNLİK %17 · KOLEKSİYON %5',
      loading: 'PAKET HAZIRLANIYOR…'
    },
    en: {
      name: 'LUCKY BOX', left: 'LEFT', empty: 'EMPTY FOR NOW',
      tear: 'DRAG TO TEAR THE FOIL →',
      swipe: 'DRAG: TILT THE DECK · CLICK: NEXT CARD',
      close: 'CLOSE', mute: 'SOUND', cta: 'TRY YOUR LUCK', odds: 'STANDARD 50% · EXPANSION 28% · EVENT 17% · COLLECTOR 5%',
      loading: 'PREPARING PACK…'
    }
  };
  function lang() { var l = document.documentElement.lang; return l === 'tr' ? 'tr' : 'en'; }
  function T(k) { return STR[lang()][k]; }

  // ---- seed'li RNG (yalniz yirtma kenari icin) ----------------
  // Ayni paket her acilista AYNI yirtilsin diye. Cekimin kendisi
  // Math.random kullanir — burada tekrar edilebilirlik bir ozellik degil.
  function hash(s) { var h = 2166136261; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function rngFrom(seed) {
    var a = hash(seed);
    return function () { a |= 0; a = a + 0x6D2B79F5 | 0; var t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  }

  // ---- ses: audio.js'ten kirpilmis prosedurel synth --------------
  // Sifir asset: her ses WebAudio'da uretilir. Baglam ilk TIKLAMADA
  // acilir, o yuzden autoplay engeline takilmaz.
  var actx = null, sgain = null;
  var muted = false;
  try { muted = localStorage.getItem(MUTE_KEY) === '1'; } catch (e) { }
  function audio() {
    if (actx) return true;
    try {
      actx = new (window.AudioContext || window.webkitAudioContext)();
      sgain = actx.createGain(); sgain.gain.value = 0.7; sgain.connect(actx.destination);
      return true;
    } catch (e) { return false; }
  }
  function tone(freq, dur, type, gain, delay, slide) {
    if (!actx) return;
    var t0 = actx.currentTime + (delay || 0);
    var o = actx.createOscillator(), g = actx.createGain();
    o.type = type || 'triangle';
    o.frequency.setValueAtTime(freq, t0);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, slide), t0 + dur);
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(gain || 0.2, t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(sgain);
    o.start(t0); o.stop(t0 + dur + 0.05);
  }
  function noise(dur, gain, delay, freq) {
    if (!actx) return;
    var t0 = actx.currentTime + (delay || 0);
    var len = Math.floor(actx.sampleRate * dur);
    var buf = actx.createBuffer(1, len, actx.sampleRate), d = buf.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    var src = actx.createBufferSource(); src.buffer = buf;
    var f = actx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq || 3000; f.Q.value = 0.8;
    var g = actx.createGain(); g.gain.value = gain || 0.3;
    src.connect(f); f.connect(g); g.connect(sgain);
    src.start(t0);
  }
  var N = { C4: 262, E4: 330, G4: 392, A4: 440, B4: 494, C5: 523, E5: 659, G5: 784, C3: 131 };
  var SFX = {
    vendClunk: function () { tone(96, 0.10, 'square', 0.13, 0, 52); noise(0.08, 0.12, 0, 700); },
    vendPop: function () { tone(N.G4, 0.07, 'square', 0.12); tone(N.C5, 0.09, 'square', 0.12, 0.05); tone(N.E5, 0.18, 'triangle', 0.12, 0.10); noise(0.12, 0.10, 0, 3200); },
    tear: function () { noise(0.28, 0.4, 0, 2400); noise(0.18, 0.3, 0.1, 4200); },
    packSpill: function () { noise(0.22, 0.16, 0, 1600); noise(0.14, 0.10, 0.09, 2600); tone(N.G4, 0.08, 'triangle', 0.07, 0.05); tone(N.C5, 0.14, 'triangle', 0.07, 0.12); },
    sting_common: function () { },
    sting_uncommon: function () { tone(880, 0.06, 'square', 0.07); },
    sting_rare: function () { tone(N.C5, 0.1, 'triangle', 0.12); tone(N.E5, 0.14, 'triangle', 0.1, 0.08); },
    sting_epic: function () { [N.C5, N.E5, N.G5].forEach(function (f, i) { tone(f, 0.2, 'triangle', 0.12, i * 0.05); }); },
    sting_legendary: function () { [N.C4, N.G4, N.C5, N.E5, N.G5].forEach(function (f, i) { tone(f, 0.35, 'triangle', 0.13, i * 0.1); }); noise(0.3, 0.06, 0.4, 6000); },
    sting_mythic: function () { [N.C4, N.E4, N.G4, N.B4, N.C5, N.E5, N.G5, N.C5 * 2].forEach(function (f, i) { tone(f, 0.5, 'triangle', 0.12, i * 0.09); }); noise(0.5, 0.08, 0.6, 7000); tone(N.C3, 1.2, 'sawtooth', 0.06, 0.2); },
    sting_promo: function () { tone(N.A4, 0.15, 'triangle', 0.1); tone(N.C5, 0.2, 'triangle', 0.1, 0.1); }
  };
  function sfx(name) { if (muted || !audio()) return; var f = SFX[name]; if (f) f(); }

  // ---- cekim hakki (KAYIT DEGIL) ------------------------------
  function used() { try { return parseInt(sessionStorage.getItem(LIMIT_KEY) || '0', 10) || 0; } catch (e) { return 0; } }
  function useOne() { try { sessionStorage.setItem(LIMIT_KEY, String(used() + 1)); } catch (e) { } }
  function left() { return Math.max(0, PULLS - used()); }

  // ---- cekim: econ.js openPack'in ince web klonu ---------------
  var BY_RARITY = {};
  K.cards.forEach(function (c) { (BY_RARITY[c.rarity] = BY_RARITY[c.rarity] || []).push(c); });
  var ORDER = ['mythic', 'legendary', 'epic', 'rare', 'uncommon', 'common'];

  function weighted(table) {
    var t = 0, i;
    for (i = 0; i < table.length; i++) t += table[i][1];
    var r = Math.random() * t;
    for (i = 0; i < table.length; i++) { r -= table[i][1]; if (r <= 0) return table[i][0]; }
    return table[table.length - 1][0];
  }
  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
  // Havuzda o nadirlikten kart yoksa asagi (commona dogru) duser — oyunla ayni kural.
  function pickRarity(table) {
    var rar = weighted(table), guard = 0;
    while ((!BY_RARITY[rar] || !BY_RARITY[rar].length) && guard++ < 8) {
      var i = ORDER.indexOf(rar);
      rar = ORDER[Math.min(ORDER.length - 1, i + 1)];
    }
    return BY_RARITY[rar] ? pick(BY_RARITY[rar]) : K.cards[0];
  }

  function pull() {
    var type = weighted(K.odds), def = K.packs[type], out = [], i;
    for (i = 0; i < def.cards - 1; i++) {
      out.push({ card: pickRarity(def.std), foil: Math.random() < def.foil });
    }
    // hit yuvasi: event paketinde promo sansi (oyundaki promoChance)
    var hit;
    if (def.promoChance && Math.random() < def.promoChance && BY_RARITY.promo) hit = pick(BY_RARITY.promo);
    else hit = pickRarity(def.hit);
    out.push({ card: hit, foil: Math.random() < def.foilHit });
    return { type: type, items: out };
  }

  // ---- asset yukleme -----------------------------------------
  // Sayfa acilisinda HICBIRI istenmez. Ritual basladiginda tetiklenir ve
  // ritual 3.6 sn surdugu icin indirme penceresi zaten oradadir.
  var imgCache = {};
  function loadImg(url) {
    if (imgCache[url]) return imgCache[url];
    imgCache[url] = new Promise(function (res, rej) {
      var im = new Image();
      im.onload = function () { res(im); };
      im.onerror = function () { rej(new Error(url)); };
      im.src = url;
    });
    return imgCache[url];
  }
  function cardUrl(id) { return BASE + 'cards/' + lang() + '/' + id + '.webp'; }
  function packUrl(t) { return BASE + 'pack_' + t + '.webp'; }

  // ============================================================
  // SHADER KOPRUSU — oyunun GERCEK holo/prizma katmani (fxgl.js)
  // ============================================================
  // Tasinan: rng.js + card_finishes.js + fxgl.js (build_kiosk.py kopyalar).
  // Tasinmayan: cardart.js. Shader'in ondan istedigi her sey pisirildi --
  // sansli olan taraf, gereken butun profillerin rect:'card' + material:'card'
  // kullanmasi: o zaman `cardRectUv` sabit [0,0,1,1] ve malzeme zaten
  // pisirilmis kart yuzu. Geriye yalniz MASKE kaliyor, o da assets/kiosk/masks/.
  //
  // Dosyalar sayfa acilisinda YUKLENMEZ: ilk tiklamada, ritual suruyorken iner.
  var CARD_PX = 192;                       // pisirilmis kart yuzu genisligi
  var fxLoading = null;
  function loadShader() {
    if (fxLoading) return fxLoading;
    fxLoading = ['rng.js', 'card_finishes.js', 'fxgl.js'].reduce(function (p, file) {
      return p.then(function () {
        return new Promise(function (res) {
          var s = document.createElement('script');
          s.src = BASE + file;
          s.onload = res;
          s.onerror = res;                 // shader gelmezse kiosk shader'siz calisir
          document.head.appendChild(s);
        });
      });
    }, Promise.resolve());
    return fxLoading;
  }
  function shaderReady() {
    return !!(globalThis.FXGL && globalThis.CardFinishes &&
              globalThis.FXGL.available && globalThis.FXGL.available());
  }
  function maskUrl(id, pid) { return BASE + 'masks/' + id + '__' + pid + '.webp'; }

  // cardart.js drawShaderProfile'in birebir karsiligi (sadelesmis: rect hep 'card').
  function applyProfile(ctx, item, pid, t, tiltX, tiltY) {
    var CF = globalThis.CardFinishes, FXGL = globalThis.FXGL;
    if (!CF.has(pid)) return false;
    var f = CF.get(pid);
    if (!f.mode) return false;                       // 2d-only profil
    var mask = item._masks && item._masks[pid];
    if (!mask) return false;                         // rect:'card' maskesiz cizilmez
    var W = ctx.canvas.width, H = ctx.canvas.height;
    var bag = {};
    bag[f.mode] = CF.paramsFor(item.card.id, pid);
    var meta = K.fx[item.card.id] || {};
    var arg = Object.assign({
      card: { id: item.card.id },
      mode: f.mode, t: t,
      mask: mask, maskFlip: !!meta.maskFlip,
      cardRect: [0, 0, 1, 1], cosWin: [0, 0, 1, 1],
      tiltX: tiltX || 0, tiltY: tiltY || 0, gain: 1,
      tiltMax: f.tilt ? f.tilt.max : 12,
      tiltMaxY: f.tilt ? f.tilt.max * 0.84 : 10,
      w: W, h: H
    }, bag, { art: item._mat, volatile: true, texel: [1 / W, 1 / H] });
    var out = FXGL.render(arg);
    if (!out) return false;
    ctx.save();
    ctx.globalCompositeOperation = out.blend;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(out.canvas, out.sx, out.sy, out.sw, out.sh, 0, 0, W, H);
    ctx.restore();
    return true;
  }

  // Bir kartin tuvalini yeniden cizer: once pisirilmis yuz, sonra shader katmanlari.
  // Malzeme AYRI bir tuvaldir (`_mat`) -- ciz-uzerine-ciz yapilan tuvali malzeme
  // olarak vermek efekti kendi ciktisiyla besler ve her karede koyulasir.
  function paintCard(item, t, tiltX, tiltY) {
    if (!item._face || !item._ctx) return;
    var ctx = item._ctx, W = ctx.canvas.width, H = ctx.canvas.height;
    ctx.clearRect(0, 0, W, H);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(item._face, 0, 0, W, H);
    if (!shaderReady()) return;
    var meta = K.fx[item.card.id];
    if (!meta) return;
    if (!item._mat) {
      item._mat = document.createElement('canvas');
      item._mat.width = W; item._mat.height = H;
      var mx = item._mat.getContext('2d');
      mx.imageSmoothingEnabled = false;
      mx.drawImage(item._face, 0, 0, W, H);
    }
    if (meta.profile) applyProfile(ctx, item, meta.profile, t, tiltX, tiltY);
    // finish:'foil' baskin efekti DEGISTIRMEZ, renksiz specular katman EKLER.
    if (item.foil && meta.overlay) applyProfile(ctx, item, meta.overlay, t, tiltX, tiltY);
  }

  // ---- DOM yardimcilari ---------------------------------------
  function el(cls, txt) { var d = document.createElement('div'); if (cls) d.className = cls; if (txt != null) d.textContent = txt; return d; }
  var reduced = matchMedia('(prefers-reduced-motion:reduce)').matches;

  // ============================================================
  // 1) Dinlenme hali: masaustunde makine, mobilde plaket
  // ============================================================
  var page = document.querySelector('.page');
  if (!page) return;

  var btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'kiosk-machine';
  var mimg = document.createElement('img');
  mimg.src = BASE + 'machine.webp';
  mimg.alt = '';
  mimg.setAttribute('aria-hidden', 'true');
  mimg.width = 32; mimg.height = 48;
  var label = el('kiosk-label');
  // Cagri metni: hak varken makinenin USTUNDE durur ve okla makineyi gosterir.
  // Ritual baslayinca (btn.shaking) ve hak bitince CSS ile kaybolur — o anlarda
  // soyleyecek bir sey yok ve ucan paketle ayni alani paylasiyor.
  var cta = el('kiosk-cta');
  var ctaText = document.createElement('span');
  var ctaArrow = el('kiosk-cta-arrow', '▼');
  cta.appendChild(ctaText); cta.appendChild(ctaArrow);
  cta.setAttribute('aria-hidden', 'true');   // erisilebilir ad zaten btn'de
  btn.appendChild(cta);
  btn.appendChild(mimg);
  btn.appendChild(label);
  page.appendChild(btn);

  // Mobil girisi: sitenin mevcut .plaque desenine katilir. Ayri bir mobil
  // sayfa yok — tek isaretleme, iki duzen (index.html'deki kural).
  var plaque = null;
  var plaques = document.querySelector('.plaques');
  if (plaques) {
    plaque = document.createElement('button');
    plaque.type = 'button';
    plaque.className = 'plaque pxbox kiosk-plaque';
    plaque.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 2h14v20H5Zm2 2v7h6V4Zm8 0v3h2V4Zm0 5v2h2V9Zm-8 9v2h10v-2Z"/></svg><span></span>';
    plaques.appendChild(plaque);
  }

  function syncLabel() {
    var n = left();
    btn.disabled = n === 0;
    btn.setAttribute('aria-label', T('name') + ' — ' + (n ? T('left') + ' ' + n : T('empty')));
    label.innerHTML = '';
    label.appendChild(document.createTextNode(T('name')));
    label.appendChild(document.createElement('br'));
    var b = document.createElement('b');
    b.textContent = n ? T('left') + ' ' + n + '/' + PULLS : T('empty');
    label.appendChild(b);
    ctaText.textContent = T('cta');
    if (plaque) {
      plaque.querySelector('span').textContent = T('name');
      plaque.disabled = n === 0;
    }
  }
  syncLabel();
  // Site dili degistirince etiket + kart dili yeniden cozulsun.
  new MutationObserver(syncLabel).observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });

  // ============================================================
  // 2) Ritual — world.js drawVendingFx/vendShakeOff ile ayni matematik
  // ============================================================
  var busy = false;

  function ritual(res, done) {
    // Olcek makinenin GERCEK boyutundan turetilir: sprite 32x48, medya
    // sorgusuna gore 96 ya da 128 px cizilir. Sabit carpan birinde yanlis olurdu.
    var S = mimg.getBoundingClientRect().width / 32;
    var baseY = mimg.offsetTop + mimg.offsetHeight;   // makinenin taban cizgisi
    var slotY = baseY - 13 * S;                       // teslim gozu
    var hoverY = baseY - 26 * S;                      // asili kalma hizasi
    var packW = Math.round(19 * S);

    var glow = el('kiosk-glow'), shadow = el('kiosk-shadow');
    var charge = el('kiosk-charge'), chargeFill = document.createElement('i');
    charge.appendChild(chargeFill);
    charge.style.top = (mimg.offsetTop - 10) + 'px';
    var pack = document.createElement('img');
    pack.className = 'kiosk-pack'; pack.alt = ''; pack.style.width = packW + 'px';
    pack.style.visibility = 'hidden';
    btn.appendChild(glow); btn.appendChild(shadow); btn.appendChild(charge); btn.appendChild(pack);
    btn.classList.add('shaking');   // hover gecisini kapat, yoksa sarsinti yutuluyor
    loadImg(packUrl(res.type)).then(function (im) { pack.src = im.src; });

    var t0 = performance.now(), cue = 0, raf = 0;
    function frame(now) {
      var e = now - t0;
      if (e < VFX.shake) {
        // Faz 1: zorlanma — genligi artan titresim + gozden sizan isik + dolum.
        var u = e / VFX.shake;
        // amp OYUN PIKSELI cinsindendir (32x48'lik sprite icin ~0.8..4.2). Ekranda
        // makine S kat buyuk cizildigi icin genlik de S ile CARPILMALI. Once
        // carpilmamisti: oyunda sarsinti sprite genisliginin ~%13'u iken sitede
        // ~%3'u kaliyordu, yani "neredeyse hic titremiyor" goruntusu.
        var amp = (0.8 + 3.4 * Math.pow(u, 2)) * S;
        mimg.style.transform = 'translate(' + Math.round(Math.sin(e / 34) * amp) + 'px,' +
          Math.round(Math.sin(e / 21) * amp * 0.6) + 'px)';
        glow.style.opacity = String(0.25 + 0.55 * u);
        glow.style.top = slotY + 'px';
        glow.style.width = glow.style.height = (24 + 40 * u) * S / 4 + 'px';
        charge.style.opacity = '1';
        chargeFill.style.width = (u * 100).toFixed(1) + '%';
        if (e > cue * 330) { cue++; sfx('vendClunk'); }
      } else {
        charge.style.opacity = '0';
        if (cue < 90) { cue = 90; sfx('vendPop'); }
        // ejeksiyon aninda tek sert geri tepme, sonra makine sakin
        if (e < VFX.eject) {
          var k = (e - VFX.shake) / (VFX.eject - VFX.shake);
          mimg.style.transform = 'translate(0,' + Math.round(3 * (1 - k)) + 'px)';
        } else mimg.style.transform = '';

        pack.style.visibility = 'visible';
        var py, rot = 0, scale = 1, alpha = 1, gl = 0, px = 0;
        if (e < VFX.eject) {
          // Faz 2: firlama — yay cizerek disari, havada hizli donus
          var u2 = (e - VFX.shake) / (VFX.eject - VFX.shake);
          var ee = 1 - Math.pow(1 - u2, 3);
          py = slotY + (hoverY - slotY) * ee - Math.sin(Math.PI * u2) * 10 * S / 4;
          px = Math.sin(u2 * Math.PI) * 3 * S / 4;
          rot = (1 - u2) * Math.PI * 1.6;
          scale = 0.55 + 0.45 * ee;
          gl = u2;
        } else if (e < VFX.hover) {
          // Faz 3: asili kalma — sallanma + yumusak donus + parilti
          var u3 = (e - VFX.eject) / (VFX.hover - VFX.eject);
          py = hoverY + Math.sin(e / 430) * 2.6;
          rot = Math.sin(e / 620) * 0.10;
          scale = 1 + Math.sin(e / 380) * 0.03;
          gl = u3 > 0.88 ? 1 + (u3 - 0.88) / 0.12 : 1;
        } else {
          // Faz 4: kapanis — buyuyerek soner
          var u4 = Math.min(1, (e - VFX.hover) / (VFX.exit - VFX.hover));
          py = hoverY - 6 * u4; rot = 0; scale = 1 + 0.9 * u4; alpha = 1 - u4; gl = 1 - u4;
        }
        pack.style.top = py + 'px';
        pack.style.opacity = String(alpha);
        pack.style.transform = 'translate(calc(-50% + ' + px + 'px),-50%) rotate(' + rot + 'rad) scale(' + scale + ')';
        // yer golgesi: paket yukseldikce kuculup soluklasir
        var lift = Math.max(0, Math.min(1, (slotY - py) / (slotY - hoverY)));
        shadow.style.top = baseY + 'px';
        shadow.style.width = Math.round(packW * (1 - lift * 0.35)) + 'px';
        shadow.style.opacity = String(alpha * 0.28 * (1 - lift * 0.55));
        glow.style.top = py + 'px';
        glow.style.width = glow.style.height = (40 + 20 * gl) * S / 4 + 'px';
        glow.style.opacity = String(gl * alpha * 0.9);
      }
      if (e < VFX.exit) { raf = requestAnimationFrame(frame); return; }
      cancelAnimationFrame(raf);
      mimg.style.transform = '';
      btn.classList.remove('shaking');
      btn.removeChild(glow); btn.removeChild(shadow); btn.removeChild(charge); btn.removeChild(pack);
      done();
    }
    raf = requestAnimationFrame(frame);
  }

  // ============================================================
  // 3) Modal: yirtma -> acilis
  // ============================================================
  function openModal(res) {
    var modal = el('kiosk-modal');
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    var stage = el('kiosk-stage');
    modal.appendChild(stage);

    // Ses anahtari: hem yirtma hem acilis fazinda gorunur olmali, o yuzden
    // stage'e degil modala baglanir. Tercih localStorage'da kalir — bu bir OYUN
    // kaydi degil, ziyaretcinin kendi ayari (cekim hakki hala sessionStorage'da).
    var mute = document.createElement('button');
    mute.type = 'button';
    mute.className = 'kiosk-btn kiosk-mute';
    function syncMute() {
      mute.textContent = T('mute') + ' ' + (muted ? '✕' : '♪');
      mute.setAttribute('aria-pressed', String(!muted));
    }
    mute.onclick = function () {
      muted = !muted;
      try { localStorage.setItem(MUTE_KEY, muted ? '1' : '0'); } catch (e) { }
      syncMute();
    };
    syncMute();
    modal.appendChild(mute);

    document.body.appendChild(modal);

    function close() {
      if (!modal.parentNode) return;
      document.body.removeChild(modal);
      removeEventListener('keydown', onKey);
      busy = false;
      syncLabel();
      btn.focus({ preventScroll: true });
    }
    function onKey(e) { if (e.key === 'Escape') close(); }
    addEventListener('keydown', onKey);
    // ARKA PLANA TIKLAYINCA KAPANMAZ. Once kapaniyordu ve bu bir tuzakti: paket
    // acilirken bosluga denk gelen tek bir tiklama kalan kartlari cope atiyordu
    // (kullanici raporu). Oyunun paket ekrani da arka plana tiklayinca kapanmaz.
    // Cikis yollari: kosedeki kapat dugmesi, acilistaki KAPAT, Escape.

    // Kapat dugmesi modala baglanir (stage'e degil) ki HER IKI fazda dursun --
    // yirtma fazinin kendi butonu yok, arka plan kapanisi da kalkinca fare
    // kullanan biri orada mahsur kalirdi.
    var closeX = document.createElement('button');
    closeX.type = 'button';
    closeX.className = 'kiosk-btn kiosk-close';
    closeX.textContent = '✕';
    closeX.setAttribute('aria-label', T('close'));
    closeX.onclick = close;
    modal.appendChild(closeX);

    tearPhase(stage, res, function () { revealPhase(stage, res, close); });
    return close;
  }

  // --- FAZ A: yirtma ------------------------------------------
  function tearPhase(stage, res, next) {
    var hint = el('kiosk-hint', T('tear'));
    var pack = document.createElement('img');
    pack.className = 'kiosk-bigpack'; pack.alt = '';
    pack.draggable = false;          // yerlesik resim surukleme pointer akisini keser
    pack.src = packUrl(res.type);
    var bar = el('kiosk-tearbar'), fill = el('kiosk-tearfill');
    bar.appendChild(fill);
    stage.appendChild(hint); stage.appendChild(pack); stage.appendChild(bar);

    // Tirtikli kenar: krep bandi duz kesilmez, kagit lif lif kopar.
    // screens_cards.js jaggedTear ile ayni parametreler; seed pakete bagli,
    // yani ayni paket her acilista AYNI yirtilir.
    (function jagged() {
      var t = K.packs[res.type].tear || [24, 6];
      var L = t[0], R = t[1], r = rngFrom('packtear:' + res.type);
      var SEG = 16, TOOTH = 0.9, NOISE = 0.75, pts = [];
      for (var i = 0; i <= SEG; i++) {
        var u = i / SEG, base = L + (R - L) * u;
        var tooth = (i % 2 ? -TOOTH : TOOTH) * (0.55 + r() * 0.45);
        var noiseV = (r() * 2 - 1) * NOISE;
        var damp = (i === 0 || i === SEG) ? 0 : 1;   // uclar olculmus egime sadik kalsin
        pts.push((u * 100).toFixed(2) + '% ' + (base + (tooth + noiseV) * damp).toFixed(2) + '%');
      }
      pack.style.setProperty('--tearpoly', pts.join(',') + ',100% 100%,0 100%');
    })();

    var torn = false, dragging = false, x0 = 0;
    function doTear() {
      if (torn) return;
      torn = true;
      sfx('tear');
      pack.classList.add('torn');
      setTimeout(function () { stage.innerHTML = ''; next(); }, 450);
    }
    // Surukleme dinleyicileri BASILIYKEN window'da durur ve birakisla sokulur.
    // Once kalici olarak baglanmislardi: faz bitince DOM gidiyor ama dinleyiciler
    // sayfada kaliyordu (her cekimde bir takim daha birikirdi).
    function move(e) {
      if (!dragging || torn) return;
      var d = Math.max(0, e.clientX - x0);
      fill.style.width = Math.min(100, d / 2.2) + '%';
      if (d > 180) doTear();
    }
    function up() {
      dragging = false;
      removeEventListener('pointermove', move);
      removeEventListener('pointerup', up);
      removeEventListener('pointercancel', up);
      if (!torn) fill.style.width = '0%';
    }
    pack.addEventListener('pointerdown', function (e) {
      if (dragging || torn) return;
      dragging = true; x0 = e.clientX;
      addEventListener('pointermove', move);
      addEventListener('pointerup', up);
      addEventListener('pointercancel', up);
    });
    // erisilebilirlik: surukleme yapamayan icin cift tik / Enter da yirtar
    pack.addEventListener('dblclick', doTear);
    pack.tabIndex = 0;
    pack.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); doTear(); } });
    pack.focus({ preventScroll: true });
  }

  // --- FAZ B: acilis ------------------------------------------
  function revealPhase(stage, res, close) {
    var hint = el('kiosk-hint', T('swipe'));
    var scene = el('kiosk-scene');
    var stack = el('kiosk-stack');
    scene.appendChild(stack);
    var count = el('kiosk-count');
    stage.appendChild(hint); stage.appendChild(scene); stage.appendChild(count);

    var bar = el('kiosk-bar');
    var closeBtn = document.createElement('button');
    closeBtn.type = 'button'; closeBtn.className = 'kiosk-btn'; closeBtn.textContent = T('close');
    closeBtn.onclick = close;
    bar.appendChild(closeBtn);
    stage.appendChild(bar);

    sfx('packSpill');

    var N2 = res.items.length, cur = 0, holders = [];
    var kw = scene.getBoundingClientRect().width || 192;
    var k = kw / 212;                                  // ofsetler kart genisligiyle olceklenir
    var HEAVY = ['epic', 'legendary', 'mythic'];

    // Kart artik <img> DEGIL <canvas>: shader her karede pisirilmis yuzun ustune
    // yeniden bindiriliyor. Shader yoksa tuval sadece yuzu gosterir ve CSS
    // parlamasi (.foil) yedege gecer.
    var useShader = shaderReady();
    res.items.forEach(function (it) {
      var h = el('kiosk-card' + (it.foil && !useShader ? ' foil' : ''));
      var name = it.card[lang()] || it.card.en;
      var cv = document.createElement('canvas');
      cv.width = CARD_PX; cv.height = Math.round(CARD_PX * 1.5);
      cv.setAttribute('role', 'img');
      cv.setAttribute('aria-label', name);
      h.appendChild(cv);
      it._ctx = cv.getContext('2d');
      loadImg(cardUrl(it.card.id)).then(function (im) {
        it._face = im;
        paintCard(it, 0, 0, 0);
      })['catch'](function () { });
      // Kartin ALTINDA isim etiketi YOK: ad zaten kartin uzerinde yaziyor, altta
      // tekrar etmek hem gereksiz hem de kartin kenarini bozuyordu. Ad yalnizca
      // tuvalin aria-label'inda kaliyor (ekran okuyucu icin).
      // Tiklama karta DEGIL sahneye baglanir: surukleyip birakmak da pointerup
      // uretiyor, iki dinleyici olsaydi kart hem egilip hem gonderilirdi.
      stack.appendChild(h);
      holders.push(h);
    });

    // ---- shader animasyon dongusu -------------------------------
    // YALNIZ ON KART surulur. Bes tuvali birden her karede yeniden cizmek
    // (5 x 192x288 + 5 GL gecisi) hicbir sey kazandirmaz: arkadakilerin ancak
    // ust kenari goruluyor. Oyun da ayni sekilde yalniz one geleni canlandiriyor
    // (screens_cards.js setCardAnim).
    var raf = 0, t0 = performance.now(), shTilt = { x: 0, y: 0 }, tgt = { x: 0, y: 0 };
    function tick(now) {
      if (!stack.isConnected) { raf = 0; return; }
      // Bosta yavas bir salinim: kart dokunulmadan da isildar. Oyunda bunun
      // karsiligi UI.fakeTilt — surekli kayan bir hedef. Hedef TEK bir yaydan
      // gectigi icin surukleme/birakma gecisinde sicrama fiziksel olarak imkansiz.
      if (!dragging) {
        var s = (now - t0) / 1000;
        tgt.x = Math.sin(s * 0.55) * 9;
        tgt.y = Math.sin(s * 0.37 + 1.1) * 6;
      }
      // egim yumusak bir yayla takip eder — surukleme birakildiginda sicrama olmasin
      shTilt.x += (tgt.x - shTilt.x) * 0.18;
      shTilt.y += (tgt.y - shTilt.y) * 0.18;
      // Shader script'leri/maskeleri sonradan gelmis olabilir (ritual boyunca
      // iniyorlar). Geldikleri anda CSS yedek parlamasi SOKULUR, yoksa iki
      // parlama ust uste biner.
      if (!useShader && shaderReady()) {
        useShader = true;
        holders.forEach(function (h) { h.classList.remove('foil'); });
      }
      var it = res.items[cur];
      if (it) paintCard(it, (now - t0) / 1000, shTilt.x, shTilt.y);
      raf = requestAnimationFrame(tick);
    }
    if (!reduced) raf = requestAnimationFrame(tick);

    function layout() {
      for (var i = cur; i < N2; i++) {
        var d = i - cur;
        holders[i].style.setProperty('--sz', (-22 * k * d) + 'px');
        holders[i].style.setProperty('--sx', (3 * k * d) + 'px');
        holders[i].style.setProperty('--sy', (2 * k * d) + 'px');
        holders[i].style.zIndex = String(N2 - d);
      }
      count.textContent = Math.min(cur + 1, N2) + ' / ' + N2;
    }
    // Kivilcimlar — oyundaki `sparkle()` ile ayni okuma: nadir kart one geldiginde
    // kartin uzerinden yukari savrulan renkli noktalar.
    function sparkle(h, col, n) {
      if (reduced) return;
      for (var i = 0; i < n; i++) {
        var s = el('kiosk-spark');
        s.style.background = col;
        s.style.left = (10 + Math.random() * 80) + '%';
        s.style.top = (20 + Math.random() * 60) + '%';
        s.style.setProperty('--r', String(Math.random()));
        s.style.animationDelay = (Math.random() * 0.25) + 's';
        h.appendChild(s);
        (function (node) { setTimeout(function () { if (node.parentNode) node.parentNode.removeChild(node); }, 1700); })(s);
      }
    }
    function fanfare(i) {
      var it = res.items[i], h = holders[i];
      var rar = it.card.rarity;
      var col = (K.rarity[rar] || K.rarity.common).light;
      var heavy = HEAVY.indexOf(rar) >= 0;
      h.style.boxShadow = it.foil ? '0 0 26px 8px rgba(180,230,255,.8)' : '0 0 24px 8px ' + col;
      if (heavy) {
        h.classList.add('rare-pop');
        setTimeout(function () { h.classList.remove('rare-pop'); }, 700);
        sparkle(h, col, rar === 'mythic' ? 26 : 12);
      }
      sfx('sting_' + rar);
      setTimeout(function () { h.style.boxShadow = 'none'; }, heavy ? 1400 : 900);
    }
    function advance() {
      if (cur >= N2) return;
      var h = holders[cur];
      h.style.setProperty('--fx', '540px');
      h.style.setProperty('--fr', '16deg');
      h.classList.add('flyoff');
      setTimeout(function () { if (h.parentNode) h.parentNode.removeChild(h); }, 300);
      cur++;
      if (cur >= N2) { count.textContent = N2 + ' / ' + N2; setTimeout(close, 550); return; }
      setTilt(0, 0);
      layout(); fanfare(cur);
    }

    // ---- desteyi surukleyerek EGME (oyundaki .stackscene davranisi) ----
    // Saf CSS 3B donusumu: perspektif sahnede, `transform-style:preserve-3d`.
    // Maliyeti yok — WebGL, kutuphane ya da her kare canvas cizimi gerektirmiyor.
    // Basma→birakma yer degistirmesi TAP_MAX altindaysa "tik" sayilir ve kart ucar;
    // ustundeyse oyuncu karti incelemistir: desteyi duzeltiriz ama karti GONDERMEYIZ.
    var TAP_MAX = 12, dragging = false, dx0 = 0, dy0 = 0;
    function setTilt(ry, rx, instant) {
      stack.style.transition = instant ? 'none' : '';
      stack.style.transform = 'rotateY(' + ry + 'deg) rotateX(' + rx + 'deg)';
    }
    // Dinleyiciler surukleme boyunca WINDOW'a baglanir, setPointerCapture'a DEGIL.
    // Yakalama denendi ve guvenilir degil: parmak/imlec sahnenin disina ciktiginda
    // (kart 192 px, surukleme kolayca disari tasiyor) olaylar dusuyor ve deste
    // yarim acida takili kaliyordu. Window yolunda bu imkansiz; ustelik dinleyiciler
    // birakisla birlikte SOKULUYOR, sayfada birikmiyorlar.
    function onMove(e) {
      if (!dragging) return;
      var ry = Math.max(-38, Math.min(38, (e.clientX - dx0) * 0.28));
      var rx = Math.max(-26, Math.min(26, -(e.clientY - dy0) * 0.22));
      setTilt(ry, rx, true);
      tgt.x = ry; tgt.y = rx;      // shader de ayni aciyi okusun
    }
    function onUp(e) {
      if (!dragging) return;
      dragging = false;
      removeEventListener('pointermove', onMove);
      removeEventListener('pointerup', onUp);
      removeEventListener('pointercancel', onUp);
      setTilt(0, 0);
      if (Math.hypot(e.clientX - dx0, e.clientY - dy0) <= TAP_MAX) advance();
    }
    scene.addEventListener('pointerdown', function (e) {
      if (dragging) return;
      dragging = true; dx0 = e.clientX; dy0 = e.clientY;
      addEventListener('pointermove', onMove);
      addEventListener('pointerup', onUp);
      addEventListener('pointercancel', onUp);
    });

    layout(); fanfare(0);
  }

  // ============================================================
  // 4) Giris noktasi
  // ============================================================
  function start() {
    if (busy || left() === 0) return;
    busy = true;
    audio();                       // baglami TIKLAMA icinde ac (autoplay kurali)
    useOne();
    var res = pull();
    // Yukleme SIRASI onemli: modalin ilk karesi icin yalniz PAKET gorseli (~72 KB)
    // gerekli; kartlar ancak yirtmadan sonra goruluyor. Ikisi birlikte beklenirse
    // modal gereksiz gecikir — ozellikle mobilde, cunku orada ritual atlaniyor ve
    // 3.6 sn'lik indirme penceresi hic olmuyor. Kartlar (~367 KB) arka planda,
    // ziyaretci paketi yirtarken iner.
    var packReady = loadImg(packUrl(res.type))['catch'](function () { });
    res.items.forEach(function (it) { loadImg(cardUrl(it.card.id))['catch'](function () { }); });
    // Shader calisma zamani (~97 KB) ve FX maskeleri de simdi insin. Modal
    // BUNLARI BEKLEMEZ: acilis fazina birkac saniye var (yirtma), gelmezlerse
    // kiosk shader'siz calisir ve dongu geldikleri anda kendini toparlar.
    loadShader();
    res.items.forEach(function (it) {
      var meta = K.fx && K.fx[it.card.id];
      if (!meta) return;
      it._masks = {};
      (meta.masks || []).forEach(function (pid) {
        loadImg(maskUrl(it.card.id, pid))
          .then(function (im) { it._masks[pid] = im; })['catch'](function () { });
      });
    });

    function go() { packReady.then(function () { openModal(res); }); }
    syncLabel();
    // Hareket azaltma tercihi VE mobil: 3.6 sn'lik ritual atlanir.
    if (reduced || !matchMedia('(min-width:880px) and (min-height:700px)').matches) go();
    else ritual(res, go);
  }

  btn.addEventListener('click', start);
  if (plaque) plaque.addEventListener('click', start);
})();
