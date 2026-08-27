/* URETILDI - build_kiosk.py, kaynak: game/src/gfx/fxgl.js — ELLE DUZENLEME. */
// fxgl.js — Kart finish efektlerinin WebGL uygulaması. Laboratuvar (lab/fx-lab.js)
// ve ana oyun AYNI dosyayı yükler.
//
// Mimari kısıt (tek katı kural): KART BAŞINA CONTEXT AÇILMAZ.
// Tarayıcı sayfa başına ~16 eşzamanlı WebGL context tutar, fazlası en eskiyi düşürür;
// binder sayfası 15 kart + popup ile zaten o sınırın dibinde. Bu yüzden burada TEK
// paylaşılan offscreen context var: efekt ona çizilir, sonuç her kartın 2D tuvaline
// blit edilir. Gerçek entegrasyon da bu deseni izlemek zorunda.
(function(G){
'use strict';

const VERT = `
attribute vec2 aPos;
varying vec2 vUv;
void main(){
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

// Efekt SİYAH zemine çizilir ve 2D tarafta globalCompositeOperation='screen' ile bindirilir.
// Siyah, screen altında etkisizdir; böylece alfa/premultiply karmaşasına girmeden bugünkü
// cardfx.js'in additif parlama davranışı korunur.
const FRAG = `
precision mediump float;
varying vec2 vUv;
uniform sampler2D uArt;
uniform vec2  uTexel;   // 1 / illüstrasyon çözünürlüğü
uniform vec4  uCover;   // drawArtCover kırpması (ölçek.xy, ofset.xy) — bkz. cardart.js:254
uniform float uTime;
uniform vec2  uTilt;    // -1..1, popup'taki rotateY/rotateX ile aynı kaynak
uniform vec2  uSeed;    // CPU'daki RNG.make('fx.…') akışından — determinizm CPU'da kalır
uniform float uGain;
uniform int   uMode;    // 0 foil · 1 holo · 2 rainbow · 3 crystal

// --- yalnız foil / holo / rainbow (uMode 0-2), ortak "bant treni" ------------
// Üçü de aynı diyagonal bant mekaniğini paylaşır (yalnız renklendirme farklı),
// bu yüzden TEK uniform seti var: hangi mod aktifse CPU tarafı (fxgl.js render())
// bu değerleri o modun kayıtlı parametreleriyle doldurur.
uniform float uBandFreq;   // Wave Count — kart boyunca kaç tekrar eden ışık bandı
uniform float uBandWidth;  // Band Thickness — her bandın kalınlığı
uniform float uBandWarp;   // yüzey normaline bağlı mikro büküm gücü
uniform float uBandSpec;   // renk/parlaklık katmanının genel çarpanı
uniform float uBandGrain;  // yalnız holo: tane eşiği (düşük = daha yoğun sparkle)
uniform float uBandInt;    // genel karışım gücü

// --- yalnız kristal katmanı (bkz. "Tera / Crystal Effect Shader Tasarımı") ---
uniform vec2  uSize;    // çıktı çözünürlüğü, KART PİKSELİ cinsinden (piksel-grid kilidi için)
uniform vec3  uElem;    // ikincil ışığın element rengi (Px.ELEM_COL_L)
uniform float uCrystal; // Crystal Amount — normal görünümden tam kristale
uniform float uFacet;   // Facet Scale, kart pikseli
uniform float uIrid;    // Iridescence Strength
uniform float uRefr;    // Refraction Strength, kart pikseli (0–2)
uniform float uMask;    // otomatik kontrast maskesinin gücü (yalnız GERÇEK maske yokken)
uniform float uBeam;    // ışık hüzmesinin gücü (0 = kapalı)
uniform float uBeamW;   // hüzme genişliği, kart yüksekliğinin oranı

// --- yalnız anizotropik prizmatik foil ("Anizotropik Prizmatik Foil Shader" belgesi) ---
uniform float uFoilInt;    // genel güç
uniform float uFoilSat;    // prizmatik renk doygunluğu
uniform float uFoilBand;   // kart boyunca spektrum tekrarı — aynı anda kaç renk şeridi
uniform float uFoilScale;  // oluk periyodu, KART pikseli
uniform float uFoilEmb;    // oluk derinliği (yüzey normalinin eğilmesi)
uniform float uFoilFlow;   // desenin illüstrasyonun formunu ne kadar takip ettiği
uniform float uFoilSpec;   // beyaz specular gücü
uniform float uFoilSplit;  // kromatik ayrışma, tam piksel

// --- yalnız gold foil ---------------------------------------------------------
uniform float uGoldInt;       // genel güç
uniform float uGoldTreat;     // 0 = Gold Overlay · 1 = Full Gold Treatment (§5.8)
uniform float uGoldContrast;  // metal kontrastı
uniform float uGoldEngr;      // gravür derinliği
uniform float uGoldScale;     // gravür periyodu, KART pikseli
uniform float uGoldSweepW;    // Gold Sweep genişliği
uniform float uGoldSpec;      // şampanya specular gücü
uniform float uGoldBorder;    // çerçevenin gövdeden ne kadar ayrıldığı (§5.10)

// --- yalnız cosmos / galaxy holo ---------------------------------------------
uniform float uCosInt;      // genel güç
uniform float uCosBg;       // kozmik zemin folyosu (§7)
uniform float uCosNeb;      // nebula yoğunluğu (§8.5)
uniform float uCosOrb;      // büyük orb yoğunluğu (§8.1)
uniform float uCosOrbSize;  // orb yarıçapı, KART pikseli
uniform float uCosStar;     // küçük yıldız yoğunluğu (§8.2)
uniform float uCosStarBr;   // yıldız parlaklığı
uniform float uCosRing;     // halka/gezegen yoğunluğu (§8.3)
uniform float uCosBurst;    // starburst yoğunluğu (§8.4)
uniform float uCosSpark;    // micro spark yoğunluğu (§8.6)
uniform float uCosSweep;    // specular sweep gücü (§13)
uniform float uCosPara;     // katman kayması, KART pikseli (§14.2 üst sınırı 2)
// Maske YOKKEN efektin uygulanacağı varsayılan alan (§6.1 klasik uygulama =
// illüstrasyon penceresi). Kart uzayında x0,y0,x1,y1 — y aşağıdan. Çağıran veriyor:
// full-art kartlarda pencere kartın tamamıdır ve shader'ın bunu bilmesinin yolu yok.
uniform vec4 uCosWin;

// --- yalnız Full-Surface Iridescent Rainbow Foil ------------------------------
uniform float uIrfInt;      // Foil Intensity — genel karışım (0 = temel kart, 1 = tam efekt)
uniform float uIrfSat;      // Rainbow Saturation
uniform float uIrfScale;    // Spectrum Scale, KART pikseli (bant periyodu)
uniform float uIrfSwirl;    // Swirl Strength, radyan (merkeze yakın döndürme açısı)
uniform float uIrfSwirlR;   // Swirl Radius, KART pikseli
uniform float uIrfSpec;     // Specular Strength
uniform float uIrfSpecW;    // Specular Width
uniform float uIrfTex;      // Micro Texture Strength
uniform float uIrfTexScale; // Micro Texture Scale, KART pikseli
uniform float uIrfEdge;     // Chromatic Split Strength, tam piksel
uniform float uIrfBorder;   // Border Foil Strength (çerçeve güçlendirmesi, §15)

// Elle çizilmiş Crystal Mask. Varsa kontrast tahmini tamamen devre dışı kalır.
// Gri tonlar korunur: belge §3.1 "Gri: kısmi kristalleşme" — eşiklemiyoruz.
uniform sampler2D uMaskTex;
uniform float uHasMask;    // 0 = maske yüklü değil
uniform float uMaskFlip;   // 1 = maskeyi ters çevir (siyah bölge efekt alır)
// Efekt dikdörtgeninin KART içindeki yeri (x, y, en, boy — 0..1, y aşağıdan).
// Maske kart uzayında örnekleniyor: illüstrasyon penceresi 84×68, kart 96×144 ve
// oranları farklı; maske auv'den örneklenirse tam kart maskesi hem kayar hem gerilir.
uniform vec4 uCardRect;

// vUv efekt dikdörtgeninin içinde 0..1; maske TÜM KART için çizildiği için önce
// kart uzayına taşınır.
vec2 cardUv(){ return uCardRect.xy + vUv * uCardRect.zw; }

float lum(vec2 uv){
  vec3 c = texture2D(uArt, uv).rgb;
  return dot(c, vec3(0.299, 0.587, 0.114));
}

// İllüstrasyonun parlaklığını yükseklik haritası sayıp yüzey normali türetir.
// 2D canvas'ta yapılamayan şey tam olarak budur: ışık artık resmin İÇİNDEKİ
// konturları takip eder, kartın üstünden geçen kör bir gradient bandı olmaz.
vec3 artNormal(vec2 uv, float relief){
  float l = lum(uv - vec2(uTexel.x, 0.0));
  float r = lum(uv + vec2(uTexel.x, 0.0));
  float d = lum(uv - vec2(0.0, uTexel.y));
  float u = lum(uv + vec2(0.0, uTexel.y));
  return normalize(vec3((l - r) * relief, (d - u) * relief, 1.0));
}

vec3 spectrum(float h){
  return clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
}

float hash(vec2 p){
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

// ============================ KRİSTAL KATMANI ================================
// Belgedeki sekiz maskenin (Crystal/Detail/Facet/Normal/Thickness/Vein/Sparkle/
// Occlusion) HİÇBİRİ elimizde yok ve elde de olmayacak: illüstrasyonlar 160×160
// TAMAMEN OPAK PNG'ler — yaratık ile arka plan tek katmana pişmiş, alfa yok.
// Bu yüzden burada maskeler ÇİZİLMİYOR, resmin kendisinden TÜRETİLİYOR.
// Türetilebilenler aşağıda; türetilemeyenler (iç enerji damarları, Crystal Crest,
// gerçek Detail Protection) bilinçli olarak YOK — bkz. dosya sonundaki not.

// Facet haritası: kart pikseli uzayında jitter'lı Voronoi. Piksel uzayında olması şart,
// çünkü belgenin §17 kuralı facet sınırlarının piksel grid'ine oturmasını istiyor;
// UV uzayında kurulsaydı kart ölçeklendikçe hücreler kayardı.
vec2 facetSite(vec2 cell){
  return (cell + vec2(hash(cell + uSeed), hash(cell.yx + uSeed + 7.3))) * uFacet;
}
// → xy = kazanan hücre kimliği · z = merkeze uzaklık · w = F2-F1 (kenara yakınlık)
vec4 facetCell(vec2 px){
  vec2 g = floor(px / uFacet);
  float f1 = 1e9, f2 = 1e9;
  vec2 id = g;
  for(int j = -1; j <= 1; j++){
    for(int i = -1; i <= 1; i++){
      vec2 c = g + vec2(float(i), float(j));
      float d = length(px - facetSite(c));
      if(d < f1){ f2 = f1; f1 = d; id = c; }
      else if(d < f2){ f2 = d; }
    }
  }
  return vec4(id, f1, f2 - f1);
}

// Otomatik "Crystal Mask" ikamesi: yerel kontrast. Arka plan bizim üretimimizde
// yumuşak yatay bantlar (düşük kontrast), yaratık ise kontrastlı. Mükemmel değil —
// kontrastlı bir arka plan da kristalleşir — ama elle maske olmadan alınabilecek en iyi şey.
float detailAt(vec2 uv, float rad){
  float c = lum(uv);
  vec2 e = uTexel * rad;
  return abs(lum(uv + vec2(e.x, 0.0)) - c) + abs(lum(uv - vec2(e.x, 0.0)) - c)
       + abs(lum(uv + vec2(0.0, e.y)) - c) + abs(lum(uv - vec2(0.0, e.y)) - c);
}

// Pixel-art uyumu (§17): sürekli aydınlatma yerine beş ışık kademesi.
float bandLight(float v){
  return (floor(clamp(v, 0.0, 0.999) * 5.0) + 0.5) / 5.0;
}

// EKLENEN terimler için kademelendirme. bandLight'ın tabanı 0.1'dir (kademe ORTASINI
// döndürür); difüz aydınlatmada doğru, toplamada değil — sıfır girdiye 0.1 dönerse
// kartın TAMAMI sabit bir miktar parlar ve efekt "yıkanmış" görünür. Bu sürüm sıfırı
// sıfır bırakır.
float bandAdd(float v){
  return floor(clamp(v, 0.0, 0.999) * 5.0) / 5.0;
}

// --- IŞIK HÜZMESİ ------------------------------------------------------------
// Kristalin aydınlatması facet BAŞINA çalışıyor; kart ÖLÇEĞİNDE "ışık vurdu" hissi
// vermiyordu — her yüzey kendi açısına göre parlıyor, ortak bir kaynak okunmuyordu.
// Bu bant onu tamamlıyor: kartın üstünden geçen geniş, tek bir aydınlanma.
//
// Yön uTilt'ten gelir ve uTilt fareyle TERS işaretli üretilir (bkz. fx-lab.js
// tiltSign) — dolayısıyla hüzme daima farenin KARŞI kenarından girer. Ayrı bir
// "ışık yönü" uniform'u tutulmuyor: iki kaynak olsaydı kart ile ışık ayrışabilirdi.
//
// vUv kullanılıyor, auv değil: bant KARTA çakılı kalmalı. auv illüstrasyonun cover
// kırpması olduğu için oradan sürülseydi bant Full Art'ta farklı hızda kayardı.
float beamEnv(vec2 uv){
  float m = length(uTilt);
  if(uBeam < 0.001 || m < 1e-4) return 0.0;      // yalnız 0'a bölmeyi engeller
  vec2 axis = uTilt / m;
  // Bandın merkezi KENARDA sabit duruyor. Merkez eğim miktarıyla kaydırılırsa
  // (ilk sürümün hatası) hüzme kartın ortasından geçip gidiyor ve "ışık vurdu"
  // değil "kartın üstünde şerit geziyor" gibi okunuyor. Eğim artık yalnız
  // hüzmenin YÖNÜNÜ ve ŞİDDETİNİ belirliyor, KONUMUNU değil: ışığın geldiği kenar
  // aydınlanır, içeri doğru söner.
  float d = dot(uv - vec2(0.5), axis) - 0.48;
  float w = max(uBeamW, 0.02);
  // Kuyruk kesiliyor: exp() hiçbir zaman sıfırlanmaz, kesilmezse bant kartın
  // tamamını hafifçe yıkar ve "hüzme" değil genel parlaklık artışı gibi okunur.
  float e = max(0.0, (exp(-d * d / (w * w)) - 0.08) / 0.92);
  // Parlaklık DOĞRUDAN dönme miktarı: kart düzleştikçe 0'a iner, tam dönüşte 1.
  // Eşik ya da smoothstep kullanılmıyor — ikisi de eğimin bir kısmında çarpanı
  // doyurur, kart daha dönmeye devam ederken parlaklık sabit kalırdı.
  // Köşede iki bileşen birden ±1'e gittiği için m 1.41'e çıkabilir; clamp şart.
  return e * min(m, 1.0);
}

// Elle çizilmiş maske. Yoksa 1.0 döner, yani efekt her yerde — foil/holo/rainbow'un
// bugünkü davranışı maske yüklenmediğinde AYNEN korunur, sessizce değişmez.
// KART uzayından örneklenir (bkz. cardUv): maske artık illüstrasyona değil kartın
// tamamına çiziliyor, dolayısıyla çerçeve ve metin kutusu da maskelenebilir alan.
// Kart uzayında HERHANGİ bir noktadan okunabilir: cosmos motiflerini kendi
// MERKEZLERİNDEKİ maske değerine göre eliyor, çizilen pikseldekine göre değil.
float maskAt(vec2 cuv){
  if(uHasMask < 0.5) return 1.0;
  float v = texture2D(uMaskTex, cuv).r;
  return clamp(mix(v, 1.0 - v, uMaskFlip), 0.0, 1.0);
}
float handMask(){ return maskAt(cardUv()); }

// Kristal maskesiz çalışamaz: maske yoksa kontrast tahminine düşer. Tahmin YALNIZ
// burada var — elle maske geldiği anda tamamen devre dışı kalır.
float crystalMask(vec2 auv){
  if(uHasMask > 0.5) return handMask();
  return mix(1.0, smoothstep(0.03, 0.16, detailAt(auv, 2.0)), uMask);
}

vec3 crystal(vec2 auv){
  vec2 px  = vUv * uSize;                 // kart pikseli
  vec2 apx = uCover.xy / uSize;           // 1 kart pikseli = kaç auv birimi

  vec4 fc  = facetCell(px);
  vec2 id  = fc.xy;
  vec3 An  = artNormal(auv, 1.6);         // anatomiden gelen normal

  // Facet normali: hücreye SABİT rastgele yön + anatominin katkısı. Saf rastgele
  // kullanılırsa belgenin uyardığı "folyo ambalaj" görüntüsü çıkıyor; anatomi
  // karışınca yüzeyler gövdeyi takip ediyor. Rastgelelik hücre başına sabit olduğu
  // için kare kare titremiyor — belgedeki "sabit rastgelelik" kuralı.
  vec2 rnd = vec2(hash(id + 3.31) * 2.0 - 1.0, hash(id.yx + 9.17) * 2.0 - 1.0);
  vec3 Fn  = normalize(vec3(rnd * 0.80 + An.xy * 1.30, 0.90));

  // Thickness ikamesi: hücre merkezine yakın = kalın, kenara yakın = ince.
  float thick = clamp(1.0 - fc.z / (uFacet * 0.85), 0.0, 1.0);

  // "Detail Protection" YERİNE geçen tek şey: yüksek frekanslı detay. Göz, ağız ve
  // ince desenler 1 texel ölçeğinde kontrast üretir; arka plandaki ağaç/çim ise
  // kabaca 2+ texel ölçeğinde. Kusursuz değil — elle çizilmiş maskenin yerini tutmaz,
  // sadece yüzün tamamen erimesini engelliyor.
  float protect = smoothstep(0.12, 0.50, detailAt(auv, 1.0));

  // Kırılma TAM PİKSEL miktarında ve en fazla ~2 px. Ara değer bırakılırsa
  // pixel-art bulanıklaşıyor; belgenin §7 sınırı burada zorunluluk.
  // Korunan bölgede (yüz/göz) neredeyse sıfıra iniyor: çift görüntü okunabilirliği öldürür.
  vec2 ro  = Fn.xy * uRefr * (0.45 + 0.55 * thick) * (1.0 - 0.80 * protect);
  ro = floor(ro + 0.5);
  vec2 ruv = auv + ro * apx;

  vec3 L   = normalize(vec3(uTilt.x * 0.95, uTilt.y * 0.95, 0.70));
  vec3 L2  = normalize(vec3(-uTilt.x * 0.5 - 0.45, -0.30, 0.62));   // ikincil, element renkli
  vec3 H   = normalize(L + vec3(0.0, 0.0, 1.0));
  // Ana ışık DAR: kuvvet alınmazsa yüzeyin yarısı birden parlıyor ve facet yapısı
  // beyazın içinde kayboluyor (belge §6: aynı anda %20–35 yeter).
  float raw  = max(dot(Fn, L), 0.0);
  float nl   = bandLight(pow(raw, 1.8));
  float nl2  = max(dot(Fn, L2), 0.0);
  float spec = pow(max(dot(Fn, H), 0.0), 26.0) * (1.0 - 0.6 * protect);

  // Kromatik ayrışma: kırılma yönünde ±1 piksel, yalnız güçlü ışık ve facet kenarında.
  float chroma = smoothstep(0.55, 1.0, nl) + (1.0 - smoothstep(0.0, 1.1, fc.w));
  chroma = clamp(chroma, 0.0, 1.0) * uIrid * (1.0 - 0.85 * protect);
  vec2 cd = normalize(Fn.xy + vec2(0.0001)) * apx;
  vec3 base = vec3(texture2D(uArt, ruv + cd * chroma).r,
                   texture2D(uArt, ruv).g,
                   texture2D(uArt, ruv - cd * chroma).b);

  // İridesans: gökkuşağı BANDI DEĞİL. Renk her facet'in kendi açısından çıkıyor,
  // o yüzden komşu yüzeyler aynı anda farklı renk gösteriyor. Bugünkü rainbow
  // modundan asıl farkı bu; kart durduğunda da kaybolmuyor.
  float ang  = dot(Fn, normalize(vec3(uTilt.x * 0.8, uTilt.y * 0.8, 1.0)));
  vec3  irid = spectrum(fract(ang * 0.85 + hash(id + 21.7) * 0.18));
  irid = mix(irid, irid * uElem * 1.7, 0.45);          // element paleti
  // Gölgedeki facet ana yaratık rengine döner; iridesans yalnız ışığa bakanda çıkar.
  float iridW = uIrid * smoothstep(0.22, 0.92, raw) * (1.0 - 0.70 * protect);

  // Ana renk kimliği korunur (%60–70). Gölge siyaha düşmez: mor/lacivert taban.
  vec3 col = base * (0.68 + 0.40 * nl)
           + uElem * nl2 * 0.17 * thick
           + irid * iridW
           + vec3(1.0) * spec * 0.55;
  col = max(col, base * 0.36 + vec3(0.08, 0.05, 0.16));

  // Facet sınırı: siyah çizgi YOK. Kenarların yalnız ~üçte biri ince highlight alır,
  // gerisi parlaklık farkıyla hissediliyor — aksi halde vitray görünümü çıkıyor.
  float edge = 1.0 - smoothstep(0.0, 1.15, fc.w);
  col += vec3(0.88, 0.94, 1.0) * edge * step(0.66, hash(id + 41.3)) * 0.16 * (1.0 - protect);

  // Kırık rim: siluetin tamamına eşit beyaz çizgi çekilmiyor, ışığa bakan
  // kontrast kenarlarında parçalı çıkıyor.
  float relief = length(vec2(An.x, An.y));
  col += mix(vec3(1.0), uElem, 0.45) * smoothstep(0.20, 0.60, relief)
       * pow(raw, 2.5) * 0.30;

  // Işık hüzmesi yüzeye ÇARPAR: düz bir parlaklık eklenmiyor, facet'in ışığa bakışıyla
  // çarpılıyor. Böylece bant kristalin içinden geçerken kırılıyor gibi okunuyor —
  // düz çarpılsaydı illüstrasyonun üstünden geçen mat bir şerit kalırdı.
  float braw = beamEnv(vUv);
  float beam = braw > 0.0 ? bandLight(braw) : 0.0;   // §17: kademeli, sürekli değil
  float bw = beam * (0.30 + 0.70 * pow(raw, 1.3)) * uBeam * (1.0 - 0.55 * protect);
  // TOPLAMA değil SCREEN: col + b*w toplandığında bandın çekirdeği düz beyaza kırpılıyor
  // ve o şeritte illüstrasyon tamamen kayboluyordu (ölçüldü: sol üçte bir 74 → 137).
  // (1-col) çarpanı zaten parlak pikselleri az, koyu pikselleri çok itiyor; hüzme
  // güçlendikçe bant parlıyor ama altındaki desen okunmaya devam ediyor.
  col += mix(vec3(1.0), uElem, 0.30) * bw * (vec3(1.0) - min(col, vec3(1.0)));
  // "Vurma" anı asıl buradan okunuyor: hüzmenin çekirdeğine denk gelen speküler
  // noktalar kısa süreliğine beyaza çıkıyor. Bu terim NOKTASAL olduğu için toplanabilir.
  col += vec3(1.0) * spec * beam * uBeam * 0.80;

  // Glint: facet MERKEZİNE bağlı, seyrek ve kısa. Dört kollu, tam piksel.
  vec2 lp = px - facetSite(id);
  float gate = step(0.90, fract(hash(id + 57.1) * 11.0 + uTime * 0.22)) * step(0.55, spec);
  float star = max(0.0, 1.0 - min(abs(lp.x), abs(lp.y)) * 1.6)
             * max(0.0, 1.0 - length(lp) * 0.30);
  col += vec3(1.0) * star * gate * (1.0 - protect);

  // Karışım artık ALFA ile yapılıyor, shader içinde mix() ile değil: kristal tüm kartı
  // kaplayabildiği için maske dışındaki piksel "illüstrasyonun kendisi" değil, kartın o
  // noktada ne olduğuysa odur (çerçeve, metin, kenar boşluğu). Alfa 0 bırakılınca
  // source-over o pikselleri hiç yazmıyor ve kart olduğu gibi kalıyor — shader'ın
  // altındaki pikseli tahmin etmesi gerekmiyor.
  return col;
}
// =============================================================================
// ANİZOTROPİK PRİZMATİK FOİL
// =============================================================================
// Belgedeki beş katman: Base Card · Emboss · Prismatic · Specular · Mask.
// Kristalden TAMAMEN AYRI bir efekt: kristal malzemeyi yeniden çizer, bu ise kartı
// korur ve üstüne yüzey yansıması ekler (belgenin dengesi ~%70 temel kart).
//
// Belgeden BİLEREK SAPILAN tek yer kabartma ölçeği. Belge 1 piksel kalınlığında
// yoğun çizgiler + ayrı bir Flow Map istiyor. İllüstrasyon penceremiz 84x68 kart
// pikseli; o alanda hem çizgiler okunmuyor hem de kart başına iki el yapımı harita
// daha gerekiyordu. Onun yerine oluk periyodu ~5 kart pikseline çıkarıldı ve yön
// haritasız üretiliyor: illüstrasyonun kendi normali (desen saçın/kumaşın formunu
// takip eder) + hücre başına sabit rastgelelik (düz alanlar da yön kazanır).
// Belgenin §4'te kabartmadan beklediği sonuç — "aynı anda bütün kart aynı renge
// dönmesin" — bu ikiliyle zaten çıkıyor.

// Yüzeyin o noktadaki oluk yönü.
vec2 foilDir(vec2 auv, vec2 cpx){
  vec3 An = artNormal(auv, 1.6);
  // Yön alanı SÜREKLİ ve GENİŞ ölçekli olmalı. Hücre başına rastgele yön denendi:
  // kart 10 pikselde bir yön değiştirdiği için geniş şeritler yerine yamalı bir doku
  // çıktı. Üç düşük frekanslı sinüs (periyot ~90-110 kart pikseli, yani karttan biraz
  // büyük) haritasız olarak belgenin istediği "yön değiştiren çizgi kümeleri" ve
  // "parmak izi benzeri halkalar" hissini veriyor. Seed CPU'dan: kart başına farklı.
  float a = sin(cpx.x * 0.055 + uSeed.x)
          + sin(cpx.y * 0.041 - uSeed.y)
          + sin((cpx.x + cpx.y) * 0.030);
  vec2 rnd = vec2(cos(a * 1.1), sin(a * 1.1));
  // Anatomi ancak yeterince güçlüyken devralır; düz arka planda normal gürültüdür.
  float w = clamp(length(An.xy) * 2.2, 0.0, 1.0) * uFoilFlow;
  vec2 d = mix(rnd, normalize(An.xy + vec2(1e-5)), w);
  return normalize(d + vec2(1e-5));
}

vec3 prismFoil(vec2 auv){
  // cardUv normalize kart uzayı, uTexel = 1/96,1/144 → bölüm doğrudan KART pikseli.
  // uSize kullanılmıyor: o çıktı çözünürlüğünde ve piksel kilidiyle anlam değiştiriyor,
  // oluk periyodu ise ekrandan bağımsız olmalı.
  vec2 cpx  = cardUv() / uTexel;
  vec2 dir  = foilDir(auv, cpx);
  vec2 perp = vec2(-dir.y, dir.x);

  // Oluk fazı ve ondan türetilen yüzey normali. Oluk boyunca sabit, oluğa dik yönde
  // salınıyor — anizotropi tam olarak bu: ışık oluk yönünde yayılır, dik yönde toplanır.
  float ph = dot(cpx, perp) * 6.28318 / max(uFoilScale, 2.0);
  // Normal GÜÇLÜ eğilmeli. Zayıf eğimde ndh her yerde ~1 çıkıyor, yansıma kartın
  // tamamında aynı anda parlıyor ve belge §18'in "bütün bölgeler aynı renkte"
  // hatası oluşuyor — anizotropi ancak yüzey gerçekten yön değiştirirse okunur.
  vec3  N  = normalize(vec3(perp * cos(ph) * uFoilEmb * 1.60, 1.0));

  vec3 L = normalize(vec3(uTilt.x * 0.95, uTilt.y * 0.95, 0.70));
  vec3 H = normalize(L + vec3(0.0, 0.0, 1.0));
  float ndh   = max(dot(N, H), 0.0);
  // Üsler yüksek: specular DAR, yansıma ondan geniş ama yine de kartın tamamını
  // kaplamayacak kadar seçici.
  float spec  = pow(ndh, 60.0);
  float sheen = pow(ndh, 14.0);

  // Kromatik ayrışma: yalnız oluğun YAMAÇLARINDA, tepe/dip düz kalır (belge §7).
  // Kaydırma vektörü tam piksele oturtuluyor; ara değer bırakılırsa kart bulanır.
  float slope = step(0.55, abs(cos(ph)));
  vec2  so    = floor(perp * uFoilSplit + 0.5) * uTexel * slope;
  vec3  base  = vec3(texture2D(uArt, auv + so).r,
                     texture2D(uArt, auv).g,
                     texture2D(uArt, auv - so).b);

  // Prizmatik bant. Ekseni ve konumu YALNIZ eğimden gelir; uTime hiç girmiyor —
  // belge §18'in ilk hata işareti "rainbow kendi kendine kayıyorsa".
  // Eksen yataya yakın: bant DİKEY okunur (fotoğraftaki gibi).
  vec2  axis = normalize(vec2(0.95, 0.28 + uTilt.y * 0.35));
  float pos  = dot(vUv - vec2(0.5), axis) - uTilt.x * 0.55;
  pos += cos(ph) * 0.035;                    // oluk bandı büker: düz gradyan görünmesin
  vec3  pris = spectrum(fract(pos * uFoilBand));
  // Bant ZARFI: spektrum her yerde eşit güçte değil, şeritler hâlinde toplanıyor.
  // Periyodu tonun periyoduyla AYNI (ikisi de uFoilBand), böylece her spektrum turuna
  // bir parlak şerit düşüyor — belgenin "aynı anda 2-4 renk şeridi" tarifi.
  float env = 0.15 + 0.85 * pow(abs(sin(3.14159 * pos * uFoilBand)), 1.0);

  float lume = dot(base, vec3(0.299, 0.587, 0.114));
  // Spektrumun EN GÜÇLÜ olduğu yer ORTA tonlardır, beyazlar değil. İlk sürüm
  // parlaklıkla birlikte monoton artıyordu; Rainbow/Gold belgesi §4.3 bunu açıkça
  // yasaklıyor ("Beyaz bölgeler, spektrumun en güçlü olduğu alanlar olmamalıdır;
  // aksi hâlde metin ve yüzler kolayca kaybolur") — metin kutusu ve isim şeridi
  // kartın en açık yerleri olduğu için tam da onlar yanıyordu.
  // Koyu uç yine korunuyor: belge §4.3 "koyu bölgelerde renkler daha derin ve sınırlı".
  float open = 0.12 + 0.88 * smoothstep(0.05, 0.45, lume) * (1.0 - 0.72 * smoothstep(0.62, 0.94, lume));

  vec3 col = base;
  // SCREEN: (1-col) çarpanı parlak pikselleri az, koyu pikselleri çok iter. Düz
  // toplama yapılsaydı açık bölgeler beyaza kırpılır ve illüstrasyon kaybolurdu.
  // Oluk yansıması bandı MODÜLE eder, KAPATMAZ. Kapı olarak kullanıldığında geniş
  // şeritler yerine serpiştirilmiş parlak noktalar çıkıyordu (ölçüldü: temel karttan
  // sapma 36 → 6.9'a düştü ve şerit tamamen kayboldu).
  float aniso = 0.70 + 0.30 * bandLight(sheen);
  col += pris * uFoilSat * env * aniso * open * (vec3(1.0) - min(col, vec3(1.0)));
  // Kabartı yalnız renk değil HACİM: oluğun bir yanı koyulaşıyor, diğeri aydınlanıyor.
  col += vec3(cos(ph) * uFoilEmb * 0.055 * open);
  // Beyaz specular rainbow'un üstünde, ondan dar ve parlak; oluk tarafından parçalı.
  col += vec3(1.0) * bandAdd(spec) * uFoilSpec;

  return mix(base, col, clamp(uFoilInt, 0.0, 1.0));
}
// =============================================================================
// GOLD FOIL
// =============================================================================
// Prizmatik foil'le AYNI yüzey makinesini (oluk yönü, anizotropik yansıma) kullanır
// ama rengi tamamen farklı üretir: spektrum yok, sınırlı bir metal rampası var.
// Belge §5.15 "Rainbow renk eklemek" başlığıyla ikisinin karışmasını açıkça yasaklıyor —
// bu yüzden burada spectrum() hiç çağrılmıyor.
//
// Efektin gücü renk çeşitliliğinden değil IŞIK-KONTRASTINDAN geliyor (§5.2). Bunun
// somut karşılığı: metalik tepki 7 kademeye kuantalanıyor ve her kademe rampanın bir
// durağına düşüyor. Sürekli bir gradyan bırakılsaydı belge §5.15'in "her yeri aynı
// parlaklıkta yapmak" hatası çıkardı; kademeler ayrıca pixel-art kuralı (§7.1).

// §5.3 rampası. Saf sarı TEK BAŞINA yok, koyu uç siyaha düşmüyor (kahve-bronz),
// açık uç şampanya-krem. Belge §5.15'in ilk iki hatası tam olarak bunlar.
vec3 goldRamp(float t){
  float s = clamp(t, 0.0, 1.0) * 6.0;
  vec3 c = mix(vec3(0.24, 0.13, 0.07), vec3(0.45, 0.22, 0.10), clamp(s,       0.0, 1.0));
  c = mix(c, vec3(0.66, 0.38, 0.12), clamp(s - 1.0, 0.0, 1.0));   // derin turuncu-altın
  c = mix(c, vec3(0.83, 0.58, 0.20), clamp(s - 2.0, 0.0, 1.0));   // klasik sıcak altın
  c = mix(c, vec3(0.94, 0.76, 0.33), clamp(s - 3.0, 0.0, 1.0));   // sarı-altın
  c = mix(c, vec3(0.98, 0.90, 0.68), clamp(s - 4.0, 0.0, 1.0));   // açık şampanya
  c = mix(c, vec3(1.00, 0.97, 0.86), clamp(s - 5.0, 0.0, 1.0));   // krem-şampanya
  // Rampanın tepesi SAF BEYAZ DEĞİL. Beyaz durak bırakıldığında kartın %18.8'i
  // neredeyse akromatik çıkıyordu — belge §5.15 "saf beyazı aşırı kullanmak".
  // Gerçek beyaza yalnız specular terimi yaklaşır, o da dar.
  return c;
}

vec3 goldFoil(vec2 auv){
  vec2 cpx  = cardUv() / uTexel;
  vec2 dir  = foilDir(auv, cpx);
  vec2 perp = vec2(-dir.y, dir.x);

  // Gravür: prizmatik foil'in oluğuyla aynı mekanizma. Belge §5.7 "çizgi texture'ı
  // doğrudan siyah çizgi olarak bindirilmemelidir, hacim normal/height mantığıyla
  // verilmelidir" diyor — o yüzden çizgi çizilmiyor, yüzey normali eğiliyor.
  float ph = dot(cpx, perp) * 6.28318 / max(uGoldScale, 2.0);
  vec3  N  = normalize(vec3(perp * cos(ph) * uGoldEngr * 1.60, 1.0));

  vec3 L = normalize(vec3(uTilt.x * 0.95, uTilt.y * 0.95, 0.70));
  vec3 H = normalize(L + vec3(0.0, 0.0, 1.0));
  float ndh = max(dot(N, H), 0.0);

  vec3  base = texture2D(uArt, auv).rgb;
  float lume = dot(base, vec3(0.299, 0.587, 0.114));

  // Gold Sweep (§5.5): TEK geniş bant, rainbow'un tekrar eden şeritlerinden farklı.
  // Konumu yalnız eğimden; belge §5.15 "sürekli hareketli sweep" hatasını yasaklıyor.
  vec2  axis = normalize(vec2(0.95, 0.25 + uTilt.y * 0.30));
  float d    = dot(vUv - vec2(0.5), axis) - uTilt.x * 0.55;
  float w    = max(uGoldSweepW, 0.05);
  float sweep = exp(-d * d / (w * w));

  // Çerçeve gövdeden AYRI davranır (§5.10). Maske gerekmiyor: çerçeve kart uzayında
  // sabit bir yerde duruyor, kenara olan uzaklıktan türetiliyor.
  vec2  q      = abs(cardUv() - vec2(0.5)) * 2.0;
  float border = smoothstep(0.87, 1.00, max(q.x, q.y));

  // Metalik tepki. Kartın kendi aydınlık/karanlığı rampanın ekseni oluyor; üstüne
  // gravürün ışık tepkisi ve sweep biniyor. "Dark angle" (§5.4 "bazı açılarda yüzey
  // koyulaşabilir") sweep'in dışında kalan alanı aşağı çekerek geliyor.
  // Üsler ve katsayılar birlikte ayarlandı: ilk sürümde t'nin tavanı 1.68'di, yani
  // pikselin büyük kısmı rampanın son durağında toplanıyordu. ndh üssü 10'dan 24'e
  // çıkarıldı (yansıma daha seçici) ve toplam kazanç düşürüldü.
  float t = 0.10 + 0.46 * lume
          + 0.30 * pow(ndh, 24.0)
          + 0.28 * sweep
          - 0.22 * (1.0 - sweep)
          + 0.35 * border * uGoldBorder;
  t = 0.5 + (t - 0.5) * max(uGoldContrast, 0.05);       // metal kontrastı
  // 7 kademe = rampanın 7 durağı. Ara ton bırakılmıyor.
  t = floor(clamp(t, 0.0, 0.999) * 7.0) / 6.0;

  vec3 gold = goldRamp(t);

  // Specular ŞAMPANYA, saf beyaz değil (§12.2). Dar ve gravür tarafından parçalı.
  // sweep de KADEMELİ giriyor: sürekli bırakılınca kuantalamayı deliyor ve iç bölgede
  // 7 rampa durağı yerine 1841 ayrı renk çıkıyordu (ölçüldü).
  gold += vec3(1.0, 0.96, 0.82) * bandAdd(pow(ndh, 60.0)) * uGoldSpec * (0.6 + 0.4 * bandAdd(sweep));

  // Yaklaşım A (Gold Overlay) ↔ Yaklaşım B (Full Gold Treatment) tek kaydırakta:
  // 0'da kartın kendi renkleri korunup üstüne altın yansıma biner, 1'de yüzey
  // tamamen altın malzemeye döner. Belge §5.8'de bunlar iki ayrı tasarım yaklaşımı;
  // aralarındaki fark yalnızca temel rengin ne kadar kaldığı olduğu için tek eksen.
  vec3 overlay = base + gold * 0.55 * (vec3(1.0) - min(base, vec3(1.0)));
  vec3 col     = mix(overlay, gold, clamp(uGoldTreat, 0.0, 1.0));

  return mix(base, col, clamp(uGoldInt, 0.0, 1.0));
}
// =============================================================================
// COSMOS / GALAXY HOLO
// =============================================================================
// "Cosmos Holo / Galaxy Holo Shader Tasarım Belgesi"nin karşılığı. Önceki beş mod
// YÜZEY işlemiydi (her piksele bir şey uygula); bu ilk MOTİF efekti — kartın belirli
// noktalarında duran, sayılabilir nesneler var (orb, ring, starburst, yıldız).
//
// Motifler CPU'da yerleştirilmiyor. Jitter'lı ızgara — facetSite'ın aynı fikri —
// belgenin üç kuralını birden bedavaya veriyor:
//   §9.1 sabit yerleşim      hücre kimliği + uSeed; kare kare değişmez, kart başına farklı
//   §9.2 minimum mesafe      iki motif aynı hücreye giremez, hücre boyu alt sınırdır
//   §9.3 asimetrik yoğunluk  hücre başına varlık eşiği; düzenli dizilim çıkmaz
// BÜYÜK motiflerin üçü (orb, ring, starburst) TEK ızgarayı paylaşır: aynı yere iki
// büyük motif düşemez ve üç aile için tek 3×3 döngü yetiyor.
//
// uTime hiç girmiyor. Belge §20'nin ilk iki hatası ("motiflerin her karede yer
// değiştirmesi", "her şeyin sürekli parlaması") zamandan doğuyor; burada motif
// yalnız kart eğildikçe açılıp kapanıyor.

const float BIG_CELL   = 26.0;   // kart pikseli — 84×68 pencerede ~8 hücre
const float STAR_CELL  = 9.0;    // ~57 hücre
const float SPARK_CELL = 4.5;

// §7.1 paleti: lacivert → mor → magenta → cyan → turkuaz. Sarı/yeşil YOK ve
// spectrum() bilerek çağrılmıyor — belge §20 "tüm yüzeyi rainbow yapmak" hatası.
vec3 cosmosRamp(float t){
  float s = clamp(t, 0.0, 1.0) * 4.0;
  vec3 c = mix(vec3(0.05, 0.07, 0.22), vec3(0.24, 0.13, 0.44), clamp(s, 0.0, 1.0));
  c = mix(c, vec3(0.50, 0.18, 0.55), clamp(s - 1.0, 0.0, 1.0));   // magenta-mor
  c = mix(c, vec3(0.16, 0.50, 0.70), clamp(s - 2.0, 0.0, 1.0));   // mavi-cyan
  c = mix(c, vec3(0.44, 0.84, 0.88), clamp(s - 3.0, 0.0, 1.0));   // turkuaz
  return c;
}

// Efektin uygulanabildiği ALAN. Maske varsa maskenin kendisi; yoksa çağıranın
// verdiği pencere. Gri tonlar korunuyor — anlamları cosmos()'ta iki eşikle ayrılıyor.
float cosRegion(vec2 cuv){
  if(uHasMask > 0.5) return maskAt(cuv);
  vec2 lo = step(uCosWin.xy, cuv), hi = step(cuv, uCosWin.zw);
  return lo.x * lo.y * hi.x * hi.y;
}

// Hücrenin jitter'lı merkezi. Jitter 0.20–0.80 ile SINIRLI: motif hücre sınırına
// oturmadığı için küçük ızgaralar (yıldız, spark) komşuları taramadan tek hücreyle
// yetinebiliyor — 3×3 döngü yalnız büyük motiflerde gerekiyor.
vec2 motifSite(vec2 cell, float cellPx, float salt){
  return (cell + vec2(0.20 + 0.60 * hash(cell + uSeed + salt),
                      0.20 + 0.60 * hash(cell.yx + uSeed - salt))) * cellPx;
}

// Motifin "tercih ettiği açı"ya göre görünürlüğü (§11). Kart düzken 0'a iner; eşik
// aralığı motif ailesine göre daralır — orb geniş açıda görünür, starburst dar.
float aim(float pa, float lo, float hi){
  float m = length(uTilt);
  if(m < 1e-4) return 0.0;
  float al = dot(uTilt / m, vec2(cos(pa), sin(pa)));
  return smoothstep(lo, hi, al) * min(m, 1.0);
}

// Katman kayması. Tam KART pikseline yuvarlanıyor (§16 "parallax hareketi grid'e
// yuvarlanmalı"); ara değerde motif baskı yüzeyinden kopar ve titrer.
vec2 paraOff(float depth){ return floor(uTilt * uCosPara * depth + 0.5); }

// Orta katman (§10.2): orb, ring, starburst.
vec3 bigMotifs(vec2 cpx){
  vec2 off = paraOff(0.5);
  vec2 q   = cpx - off;
  vec2 pix = floor(q);
  vec2 g   = floor(q / BIG_CELL);
  // Tür olasılıkları TOPLANIYOR ve hücrenin dolu olma olasılığını veriyor. Üç tür
  // ayrı ayrı eşiklenseydi aynı hücreye iki motif düşebilir, §9.2'nin minimum
  // mesafesi bozulurdu — belgenin "büyük motifler birbirine çok yakın mı" sorusu.
  float pOrb = uCosOrb * 0.55, pRing = uCosRing * 0.28, pBurst = uCosBurst * 0.20;
  vec3 acc = vec3(0.0);
  for(int j = -1; j <= 1; j++){
    for(int i = -1; i <= 1; i++){
      vec2 cell = g + vec2(float(i), float(j));
      float ex = hash(cell + uSeed + 1.7);
      if(ex >= pOrb + pRing + pBurst) continue;

      float h2 = hash(cell.yx + uSeed + 11.3);            // boy
      float pa = hash(cell + uSeed + 19.7) * 6.28318;     // tercih edilen açı
      float h4 = hash(cell.yx + uSeed + 27.1);            // renk
      vec2  c  = floor(motifSite(cell, BIG_CELL, 3.1));
      vec2  p  = pix - c;
      vec3  cc = cosmosRamp(fract(h4 * 0.87 + 0.12));
      vec3  add = vec3(0.0);

      if(ex < pOrb){
        // §8.1 — yumuşak merkez, parlak dış halka, tam opak değil. Gövde kademeli:
        // sürekli gradyan bırakılsaydı pixel-art netliği giderdi (§16 "fazla blur").
        float r    = max(uCosOrbSize * (0.55 + 0.80 * h2), 2.0);
        float d    = length(p) / r;
        float body = bandAdd(1.0 - smoothstep(0.25, 1.0, d));
        float rim  = 1.0 - smoothstep(0.0, 0.16, abs(d - 0.90));
        float vis  = 0.42 + 0.58 * aim(pa, -0.55, 0.85);   // §11.1: tamamen kaybolmaz
        add = (cc * body * 0.62 + mix(vec3(1.0), cc, 0.40) * rim * 0.75) * vis;
      } else if(ex < pOrb + pRing){
        // §8.3 — hafif eğik elips. Elips BASIK OLAMAZ: length(e)'nin piksel başına
        // değişimi dikey kolda 1/squash'a çıkıyor, yani bant orada incelip halka
        // kopuyor. Ölçüldü — 0.52'de tek halka 16-25 ayrı parçaya bölünüyordu, artık
        // en dar yerde bile ~1.6 piksel kalıyor. §11.2: halkanın tamamı aynı anda
        // parlamaz, o yüzden açıya bağlı bir segment penceresiyle çarpılıyor.
        float sq   = 0.72 + 0.24 * h2;
        vec2  e    = vec2(p.x, p.y / sq);
        float rr   = 6.0 + 9.0 * h2;
        float ring = 1.0 - smoothstep(0.0, 2.2, abs(length(e) - rr));
        float seg  = 0.28 + 0.72 * max(0.0, cos(atan(e.y, e.x + 1e-4) * 2.0 + pa));
        float vis  = 0.18 + 0.82 * aim(pa, 0.05, 0.90);
        add = mix(cc, vec3(0.75, 0.92, 1.0), 0.35) * ring * seg * vis * 0.95;
      } else {
        // §8.4 — dört kollu. p tam sayı olduğu için kollar tam piksel çizgiler (§16).
        float len  = 5.0 + 6.0 * h2;
        float ax   = max(0.0, 1.0 - abs(p.y) / 0.85) * max(0.0, 1.0 - abs(p.x) / len);
        float ay   = max(0.0, 1.0 - abs(p.x) / 0.85) * max(0.0, 1.0 - abs(p.y) / len);
        float core = max(0.0, 1.0 - length(p) / 2.2);
        float vis  = aim(pa, 0.70, 0.99);                  // §11.3: durgunda kapalı
        add = mix(vec3(1.0), cc, 0.22) * (max(ax, ay) + core * 0.9) * vis;
      }

      // Motif MERKEZDE elenir, piksel piksel solmaz: maskenin kenarından ısırılmış
      // yarım bir orb "efekt kesilmiş" gibi okunuyor, hiç doğmamış olan ise kasıtlı.
      // Örnekleme koşullu ama doku NEAREST ve mipmap'siz — LOD türevi hiç
      // hesaplanmadığı için burada tanımsız davranış oluşmuyor.
      if(dot(add, vec3(1.0)) > 0.002)
        acc += add * step(0.68, cosRegion((c + off) * uTexel));
    }
  }
  return acc;
}

// Ön katman (§10.3) — küçük yıldız noktaları.
vec3 smallStars(vec2 cpx){
  vec2 off  = paraOff(1.0);
  vec2 q    = cpx - off;
  vec2 cell = floor(q / STAR_CELL);
  // §8.2 "küme oluşturabilme": düşük frekanslı bir alan yoğunluğu modüle ediyor.
  // Sabit eşikle yıldızlar eşit dağılıp süs deseni gibi okunuyordu.
  float cl = 0.45 + 0.55 * abs(sin(cell.x * 0.85 + uSeed.x) * sin(cell.y * 0.63 - uSeed.y));
  if(hash(cell + uSeed + 31.1) >= uCosStar * cl) return vec3(0.0);
  vec2 c = floor(motifSite(cell, STAR_CELL, 7.7));
  if(cosRegion((c + off) * uTexel) < 0.68) return vec3(0.0);

  vec2  p   = floor(q) - c;
  float h2  = hash(cell.yx + uSeed + 43.9);
  float sz  = h2 < 0.55 ? 0.7 : (h2 < 0.88 ? 1.3 : 2.0);      // 1–3 piksel
  float len = length(p);
  // §8.2 "bazıları keskin, bazıları yumuşak": yumuşak hâle yalnız büyük yıldızlar geçiyor.
  float core = step(len, sz);
  float soft = (1.0 - smoothstep(0.0, sz + 1.4, len)) * step(0.62, h2);
  float h3 = hash(cell + uSeed + 55.3);
  vec3 col = h3 < 0.42 ? vec3(1.00, 1.00, 1.00)
           : h3 < 0.70 ? vec3(0.62, 0.95, 1.00)
           : h3 < 0.88 ? vec3(1.00, 0.94, 0.66)
                       : vec3(1.00, 0.72, 0.86);
  float vis = 0.34 + 0.66 * aim(hash(cell.yx + uSeed + 67.7) * 6.28318, 0.10, 0.92);
  return col * (core + soft * 0.55) * vis * uCosStarBr;
}

// §8.6 — yalnız güçlü ışıkta görünen tek piksellik parlamalar.
vec3 sparks(vec2 cpx){
  if(uCosSpark < 0.001) return vec3(0.0);
  vec2 off  = paraOff(1.0);
  vec2 q    = cpx - off;
  vec2 cell = floor(q / SPARK_CELL);
  if(hash(cell + uSeed + 71.9) >= uCosSpark * 0.35) return vec3(0.0);
  vec2 c = floor(motifSite(cell, SPARK_CELL, 13.3));
  if(length(floor(q) - c) > 0.8) return vec3(0.0);
  // §11.4 — EŞİKLİ: rastgele titremiyor, aynı anda yalnız birkaçı açık.
  if(aim(hash(cell.yx + uSeed + 83.1) * 6.28318, 0.72, 0.99) < 0.55) return vec3(0.0);
  if(cosRegion((c + off) * uTexel) < 0.68) return vec3(0.0);
  return vec3(1.0, 0.98, 0.92) * 0.9;
}

// Arka katman (§10.1) — motiflerin altındaki holografik taban ve nebula.
vec3 cosmicBg(vec2 cpx){
  vec2 q = cpx - paraOff(0.2);
  // Üç düşük frekanslı alan; periyotlar karttan büyük, o yüzden geçişler geniş (§7.3).
  float n = sin(q.x * 0.048 + uSeed.x * 1.3)
          + sin(q.y * 0.034 - uSeed.y * 1.1)
          + sin((q.x - q.y) * 0.026 + uSeed.x * 0.4);
  // §7.3 / §12.3 — eğimle mavi-mor ↔ cyan-magenta kayması. Sürekli dönen rainbow
  // DEĞİL: konumu yalnız tilt belirliyor, kart durunca renk de duruyor.
  float t = clamp(n / 6.0 + 0.5 + uTilt.x * 0.16 + uTilt.y * 0.09, 0.0, 1.0);
  vec3 c = cosmosRamp(bandAdd(t) + 0.1);            // 5 kademe (§16)
  float nb = sin(q.x * 0.021 - uSeed.y) * sin(q.y * 0.017 + uSeed.x) * 0.5 + 0.5;
  c *= 0.55 + 0.45 * bandLight(nb) + uCosNeb * 0.55 * smoothstep(0.15, 0.95, nb);
  return mix(c, c * uElem * 1.6, 0.30);             // element kimliği (§12.2)
}

vec3 cosmos(vec2 auv){
  vec2  cpx  = cardUv() / uTexel;
  vec3  base = texture2D(uArt, auv).rgb;
  float lume = dot(base, vec3(0.299, 0.587, 0.114));

  // Maskenin GRİ tonu bu efektte özel anlam taşıyor. Tek kanallı siyah-beyaz maske
  // kuralı bozulmadan belge §6.2'nin ayrı "karakter" maskesini veriyor:
  //   siyah → efekt yok · gri → kozmik zemin var, MOTİF yok · beyaz → hepsi.
  float region = cosRegion(cardUv());
  float bgG = smoothstep(0.30, 0.42, region);
  float mtG = smoothstep(0.68, 0.80, region);
  // §5 "holo motifleri kartı örtmemeli". Kartın en açık yerleri isim şeridi ve metin
  // kutusu; maske çizilmemişse bile okunur kalmalılar.
  float open = 1.0 - 0.72 * smoothstep(0.58, 0.94, lume);

  // §13 — Rainbow Foil'den SAKİN: geniş, düşük doygunluklu, beyaz-cyan. Konumu
  // yalnız eğimden (§13.3 "idle'da sabit"), uTime yok.
  vec2  ax = normalize(vec2(0.92, 0.30 + uTilt.y * 0.30));
  float sd = dot(vUv - vec2(0.5), ax) - uTilt.x * 0.55;
  float sw = bandAdd(exp(-sd * sd / 0.10));

  vec3 col = base;
  // Zemin SCREEN gibi biniyor: koyu pikselleri çok, açıkları az itiyor — altındaki
  // illüstrasyon ve yazı okunmaya devam ediyor (§7.2 dengesi ~%10-20 zemin).
  col += cosmicBg(cpx) * uCosBg * bgG * open * (vec3(1.0) - min(col, vec3(1.0)));

  // §13.2 "motiflerin üzerinde daha güçlü": sweep motifleri MODÜLE ediyor, ayrı bir
  // parlak şerit olarak binmiyor.
  vec3 mot = (bigMotifs(cpx) + smallStars(cpx) + sparks(cpx)) * (0.72 + 0.55 * sw * uCosSweep);
  col += mot * mtG * open;
  col += vec3(0.66, 0.88, 1.0) * sw * uCosSweep * 0.22 * bgG * open
       * (vec3(1.0) - min(col, vec3(1.0)));

  return mix(base, col, clamp(uCosInt, 0.0, 1.0));
}
// =============================================================================
// FULL-SURFACE IRIDESCENT RAINBOW FOIL
// =============================================================================
// "Mint Condition — Full-Surface Iridescent Rainbow Foil Shader Tasarım Belgesi"nin
// karşılığı. Belgenin §3'ü bunu prizmatik foil'den (uMode 4) AÇIKÇA ayırıyor: o
// düz, tarama yönlü, doğrusal bantlar kullanır (belgenin kendi tabiriyle "standart
// Rainbow Foil"); bu ise kıvrımlı, yağ tabakası benzeri, çok yönlü organik alanlar
// istiyor (§3: "spiral, dalga, halka veya yağ tabakası benzeri deformasyonlar").
// Bu yüzden ayrı bir mod: aynı oluk/anizotropi makinesini yeniden kullanmak düz
// bant görünümünü miras alırdı.
//
// Maske ile alan azaltımı GOLD FOIL'İN aynısı: fonksiyon içinde maskeye hiç
// bakılmıyor, yalnız main()'de alfaya gidiyor. Neden yeterli: 2D tuval üstüne
// zaten FX'siz temel kart çizili (drawBaseWithoutFx), o yüzden source-over'da
// alfa<1 olduğunda sonuç base + iridescent*alfa'ya eşdeğer — belge §7'nin
// "gri: azaltılmış foil" kuralı EK bir iç çarpan yazmadan kendiliğinden çıkıyor.

// Kartın ortasına yakın, kart başına SABİT bir girdap merkezi (§10.3 "girdap
// merkezi" karta göre değişir, karede değişmez). 96×144 kart uzayının ortasına
// (48,74) yakın ±26 px jitter — kenara taşmasın diye kart yarısının içinde tutuluyor.
vec2 irfSwirlCenter(){
  return vec2(48.0, 74.0) + vec2(hash(uSeed + 4.1) - 0.5, hash(uSeed.yx + 8.3) - 0.5) * 26.0;
}

// Merkeze yakın noktaları döndürür, uzaktakine dokunmaz (Gaussian sönüm). Düz bir
// gradyanı spirale büker — belge §10.1'in "geniş spiral" ve "yumuşak spiral
// deformasyon" istekleri. uTime YOK: açı yalnız KONUMA bağlı, kare kare sabit.
vec2 irfSwirl(vec2 p, vec2 ctr, float radius, float strength){
  vec2 d = p - ctr;
  float r = length(d);
  float ang = strength * exp(-(r * r) / max(radius * radius, 1.0));
  float s = sin(ang), c = cos(ang);
  return vec2(d.x * c - d.y * s, d.x * s + d.y * c) + ctr;
}

// Geniş, düşük frekanslı domain warp — üç sinüs (prismFoil'in foilDir'iyle aynı
// fikir): tek girdap tüm kartı aynı merkezden büker, bu ONA EK olarak kartın
// farklı köşelerinin farklı yönde akmasını sağlıyor (§9.2 "bölgesel akış").
vec2 irfWarp(vec2 cpx){
  float wx = sin(cpx.y * 0.017 + uSeed.x * 1.3) + sin((cpx.x + cpx.y) * 0.011 - uSeed.y * 0.8);
  float wy = sin(cpx.x * 0.019 - uSeed.y * 1.1) + sin((cpx.x - cpx.y) * 0.013 + uSeed.x * 0.6);
  return vec2(wx, wy);
}

vec3 iridFoil(vec2 auv){
  vec2  cpx  = cardUv() / uTexel;                 // kart pikseli, 96×144 uzayı
  vec3  base = texture2D(uArt, auv).rgb;
  float lume = dot(base, vec3(0.299, 0.587, 0.114));

  vec2 ctr = irfSwirlCenter();
  vec2 sw  = irfSwirl(cpx, ctr, max(uIrfSwirlR, 10.0), uIrfSwirl);
  vec2 wp  = sw + irfWarp(cpx) * 9.0;

  // Yatay tilt fazı KAYDIRIR (§11.1), dikey tilt ölçeği SIKIŞTIRIR (§11.2). Eksen
  // yataya yakın tutuluyor ki spektrum çoğunlukla dikey okunsun (prismFoil/goldFoil
  // ile aynı fotoğrafik referans).
  vec2  axis  = normalize(vec2(0.90, 0.35 + uTilt.y * 0.25));
  float scale = max(uIrfScale, 6.0) * (1.0 - 0.35 * abs(uTilt.y));
  float t     = dot(wp - ctr, axis) / scale + uTilt.x * 0.4;

  // §8.2 "yalnızca tek doğrultuda akmaz, geniş alanlara yayılır": faz SÜREKLİ
  // değil basamaklı — düz gradyan yerine yağ lekesi benzeri düz renk adaları
  // çıkıyor. Bu aynı zamanda §22'nin ilk hatasının ("düz rainbow gradient")
  // doğrudan panzehiri: basamak sınırları warp/swirl'den geçtiği için kıvrımlı.
  float steps = 7.0;
  float band  = floor(fract(t) * steps) / steps;
  vec3  spec  = spectrum(band + 0.12);

  // §8.3 "baskın renk sınırı" (kartın yalnız %25-45'i güçlü renk alsın) BİLEREK
  // UYGULANMADI — kullanıcı isteği: kartın tamamı aynı güçte etkilensin, ayrı
  // "ada" bölgeleri olmasın (§4'ün "Full-Surface" adını daha gerçek anlamda
  // karşılıyor). Önceki sürümde bu sınırı warp/swirl'den geçmiş bir alanla
  // veriyordum; kaldırıldı, irid artık island çarpanı almıyor.

  // §11.3/§11.4: kart düzken sakin ama SIFIR DEĞİL (pattern hafif görünür kalır),
  // eğildikçe doygunluk ve specular açılır.
  float tm  = clamp(length(uTilt), 0.0, 1.0);
  float sat = uIrfSat * (0.45 + 0.75 * tm);

  // §5 "yazı ve stat alanları okunabilir kalır": kartın en açık yerleri (isim
  // şeridi, metin kutusu) iridesansa daha az açılıyor — prismFoil'deki aynı fikir.
  float open = 1.0 - 0.60 * smoothstep(0.60, 0.95, lume);

  // "screen" karışımı (1-col) parlak temel piksellerde HEADROOM'u neredeyse sıfıra
  // indiriyor — isim şeridi ve stat kutusu kart şablonunda düz, açık krem renkte
  // çizildiği için rainbow katmanı ORADA görünmez oluyordu (ölçüldü: illüstrasyonda
  // sapma 122, metin kutusunda 28 — §16.2'nin istediği "azaltılmış" değil, göze
  // "hiç etki yok" gibi okunan bir kesinti). Belge §4 açıkça "kartın tamamı foil
  // etkisi alır" diyor; specular ve çerçeve gibi YÜZEY tepkisi ifade eden terimler
  // için headroom'a bir TABAN konuyor — rainbow renk katmanı (irid) BUNUN DIŞINDA,
  // §16.2 metin korumasının asıl gücü hâlâ ondan geliyor.
  vec3 col  = base;
  vec3 irid = spec * sat;
  col += irid * open * (vec3(1.0) - min(col, vec3(1.0)));

  // §12 specular: dar, tilt'e hızlı tepki veren, flow tarafından hafif eğrilmiş
  // (wp.x - cpx.x farkı bandı büker). specGate düzken tamamen SÖNMEZ (§11.3
  // "specular zayıf", sıfır değil) ama belirgin şekilde zayıflar. Gerçek foilde
  // parlak yansıma açık kartona da vurur — specular'ın headroom'u TABANLI, rainbow
  // renk katmanınınki değil.
  float sd = dot(vUv - vec2(0.5), axis) - uTilt.x * 0.5 - uTilt.y * 0.12;
  sd += (wp.x - cpx.x) * 0.004;
  float sw2 = max(uIrfSpecW, 0.03);
  float specGate = 0.05 + 0.95 * tm;
  float specBand = exp(-sd * sd / (sw2 * sw2)) * specGate;
  vec3  specCol  = mix(vec3(1.0, 0.98, 0.90), vec3(0.85, 1.0, 0.95), 0.30);
  vec3  hr       = max(vec3(1.0) - min(col, vec3(1.0)), vec3(0.16));
  col += specCol * specBand * uIrfSpec * hr;

  // §14 kromatik kenar: yalnız specular bandının KENARINDA (çekirdek ve dışı hariç),
  // tam piksel kaydırma. Belge §22 "çok güçlü chromatic split → glitch hissi"
  // uyarısı yüzünden eşik dar tutuluyor.
  float edgeMask = smoothstep(0.15, 0.55, specBand) * (1.0 - smoothstep(0.55, 0.95, specBand));
  vec2  eo = floor(vec2(uIrfEdge, 0.0) + 0.5) * uTexel;
  vec3  ce = vec3(texture2D(uArt, auv + eo).r, base.g, texture2D(uArt, auv - eo).b) - base;
  col += ce * edgeMask;

  // §13 mikro folyo dokusu: kart uzayında SABİT ince çapraz çizgiler, spektrumla
  // birlikte KAYMAZ (§13.1) — cpx'ten değil, doğrudan kart pikselinden geliyor.
  float diag = fract((cpx.x - cpx.y) / max(uIrfTexScale, 3.0));
  float line = smoothstep(0.0, 0.06, diag) * (1.0 - smoothstep(0.10, 0.16, diag));
  col += vec3(line * 0.10 * uIrfTex) * (0.4 + 0.6 * tm);

  // §15 çerçeve güçlendirmesi: kenara yaklaştıkça foil artıyor (goldFoil'deki aynı
  // kenar-mesafesi tekniği). Rarity sembolü boost'u YOK — goldFoil'deki gibi
  // sembolün yeri kart uzayında işaretli değil.
  vec2  q      = abs(cardUv() - vec2(0.5)) * 2.0;
  float border = smoothstep(0.86, 1.0, max(q.x, q.y));
  col += irid * border * uIrfBorder * max(vec3(1.0) - min(col, vec3(1.0)), vec3(0.16));

  return mix(base, col, clamp(uIrfInt, 0.0, 1.0));
}
// =============================================================================

void main(){
  // Illüstrasyon karta cover kırpmasıyla oturuyor; normali DOĞRU pikselden almak için
  // aynı kırpmayı burada tekrarlıyoruz, yoksa ışık resmin kaymış bir kopyasını takip eder.
  vec2 auv = vUv * uCover.xy + uCover.zw;

  // Kristal bir BİNDİRME değil, materyalin yeniden çizimidir: illüstrasyonun
  // rengini kendisi üretir. Bu yüzden 'screen' ile değil 'source-over' ile
  // yapıştırılmalı — çağıran tarafa blend bilgisini render() döndürüyor.
  if(uMode == 3){
    float a = clamp(crystalMask(auv) * uCrystal, 0.0, 1.0);
    gl_FragColor = vec4(crystal(auv) * uGain, a);
    return;
  }
  // Foil de kristal gibi kartın YERİNE geçer (temel rengi kendi taşır), o yüzden
  // maske alfaya gidiyor: maskesiz bölgeyi source-over hiç yazmaz.
  if(uMode == 4){
    gl_FragColor = vec4(prismFoil(auv) * uGain, handMask());
    return;
  }
  if(uMode == 5){
    gl_FragColor = vec4(goldFoil(auv) * uGain, handMask());
    return;
  }
  if(uMode == 6){
    // Alfa = efektin uygulanabildiği ALAN, maskenin kendisi değil: maske yokken
    // varsayılan pencere (illüstrasyon) geçerli oluyor ve kartın saydam köşeleri
    // pencerenin dışında kaldığı için source-over onlara hiç dokunmuyor.
    gl_FragColor = vec4(cosmos(auv) * uGain, smoothstep(0.30, 0.42, cosRegion(cardUv())));
    return;
  }
  // "Full-Surface" — goldFoil/prismFoil gibi kartın YERİNE geçer, alfa maskeye gider.
  if(uMode == 7){
    gl_FragColor = vec4(iridFoil(auv) * uGain, handMask());
    return;
  }

  vec3 N    = artNormal(auv, 1.8);
  float base = lum(auv);

  vec3 L = normalize(vec3(uTilt.x * 0.9, uTilt.y * 0.9, 0.75));
  vec3 H = normalize(L + vec3(0.0, 0.0, 1.0));
  float ndh   = max(dot(N, H), 0.0);
  float spec  = pow(ndh, 34.0);
  float sheen = pow(ndh, 5.0);

  // Baskıya ait mikro-prizma dokusu: kart uzayında SABİT durur, kart hareketsizken de
  // okunur. Seed CPU'dan gelir, GLSL içinde uydurulmaz — "her şey seed'li" kuralı korunur.
  float grain = hash(floor(auv / uTexel / 2.0) + uSeed);

  // Bandın EKSENİ tilt ile döner — cardfx.js'teki rainbow() ile aynı fikir.
  vec2 axis = normalize(vec2(0.78 + uTilt.y * 0.20, 0.62 - uTilt.x * 0.30));
  float d = dot(vUv - vec2(0.5), axis) - (uTilt.x * 0.30 + uTilt.y * 0.10);

  // Normal dalga boyunu YALNIZ büker (mikro detay); genlik uBandWarp ile ayarlanır.
  // Baskın terim düşük frekanslı KONUM olmalı; normal baskın olursa gökkuşağı piksel
  // gürültüsüne döner (ilk denemenin hatası).
  float warp = dot(N.xy, axis) * uBandWarp;

  // TEK Gauss tepesi yerine TEKRAR EDEN bant treni: eksen boyunca uBandFreq kadar
  // döngü sığdırılır, her döngünün merkezine yakınlık uBandWidth ile Gauss'lanır —
  // "kaç dalga / ne kalınlıkta" isteğinin doğrudan karşılığı (önceden ikisi de KOD
  // İÇİNDE sabitti). uTime YERİNE uSeed: faz kart başına SABİT, iridfoil/cosmos'taki
  // "no uTime" kuralıyla tutarlı.
  float freq  = max(uBandFreq, 0.5);
  float cell  = d * freq + warp + uSeed.x * 0.11;
  float bf    = fract(cell) - 0.5;
  float bw    = max(uBandWidth, 0.02);
  float env   = exp(-(bf * bf) / (bw * bw));

  vec3 col = vec3(0.0);
  if(uMode == 2){          // rainbow — tekrar eden difraksiyon bantları
    col  = spectrum(fract(cell)) * env * (0.30 + 0.45 * sheen) * uBandSpec;
    col += vec3(1.0) * spec * env * 0.55;
    // Folyo mürekkebin üstünde farklı parlar: koyu alanlarda sönümlenir.
    col *= 0.60 + 0.55 * smoothstep(0.10, 0.70, base);
  } else if(uMode == 1){   // holo — dar bantlı, taneli
    col  = spectrum(fract(cell)) * env * sheen * 0.42 * uBandSpec;
    col += vec3(0.85, 0.98, 1.0) * spec * env * 0.50 * step(uBandGrain, grain);
  } else {                 // foil — renksiz specular, tekrar eden bantlar
    col  = vec3(0.72, 0.86, 1.0) * env * (spec * 0.85 + sheen * 0.10) * uBandSpec;
  }
  // Maske foil/holo/rainbow için de geçerli: gerçek kartlarda da holo katmanı
  // yüzeyin tamamını değil, baskıda ayrılmış bölgeleri kaplar. Bu modlar siyah
  // zemine çizildiği için maskeyle ÇARPMAK yeterli — siyah 'screen' altında etkisiz.
  gl_FragColor = vec4(col * uGain * uBandInt * handMask(), 1.0);
}`;

const MODES = {foil:0, holo:1, rainbow:2, crystal:3, prismfoil:4, goldfoil:5, cosmos:6,
               iridfoil:7};

// Foil/holo/rainbow siyah zemine çizilip 'screen' ile bindirilir; kristal, prizmatik
// foil, gold foil, cosmos ve iridescent foil temel rengi kendileri taşır, o yüzden
// 'source-over'. Karıştırma modunu mod belirler, çağıran değil.
const BLEND = {crystal:'source-over', prismfoil:'source-over', goldfoil:'source-over',
               cosmos:'source-over', iridfoil:'source-over'};

// Element başına ikincil ışık rengi (belge §6). Px.ELEM_COL_L'den okunur;
// tablo burada tutulmaz ki oyunun paleti tek kaynak kalsın.
const ELEM_FALLBACK = '#cfd8ff';

// Tuval SABİT boyutta tutulur ve her kart gl.viewport ile bir alt dikdörtgene çizer.
// Kart başına canvas.width yazmak drawing buffer'ı yeniden ayırır; 15 kartlık ızgarada
// ölçüldü: kart başına ~2.1 ms, yani tek başına 30 FPS bütçesini yiyor. Bu boyut en büyük
// durumu (Full Art 90×138 @3×) kapsar.
const MAXW = 288, MAXH = 432;

let cv = null, gl = null, prog = null, uni = null, quad = null, lost = false, initTried = false;
const texCache = new Map();   // art canvas → WebGLTexture (art() aynı tuvali döndürdüğü için anahtar güvenli)
let lastErr = '';

function compile(type, src){
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if(!gl.getShaderParameter(sh, gl.COMPILE_STATUS)){
    lastErr = gl.getShaderInfoLog(sh) || 'shader derlenemedi';
    console.error('[FXGL] ' + lastErr);
    gl.deleteShader(sh);
    return null;
  }
  return sh;
}

function init(){
  if(initTried) return !!gl;
  initTried = true;
  if(typeof document === 'undefined') return false;   // node/test bağlamı: sessizce yok say
  cv = document.createElement('canvas');
  cv.width = MAXW; cv.height = MAXH;
  // alpha+premultipliedAlpha:false — kristal maske dışında ALFA 0 döndürüyor, böylece
  // source-over o pikselleri hiç yazmıyor. alpha:false olsaydı maskesiz bölge de opak
  // yazılır ve kartın çerçevesi shader'ın ürettiğiyle ezilirdi. Düz (premultiply
  // edilmemiş) alfa şart: canvas'ı drawImage ile okuyacağız, premultiply'da kenarlar kararır.
  // preserveDrawingBuffer: aynı karede drawImage ile okuyacağız; laboratuvarda maliyeti önemsiz.
  const opts = {alpha:true, premultipliedAlpha:false, antialias:false, depth:false, stencil:false, preserveDrawingBuffer:true};
  gl = cv.getContext('webgl', opts) || cv.getContext('experimental-webgl', opts);
  if(!gl){ lastErr = 'WebGL context alınamadı'; return false; }

  // Context kaybı gerçek bir senaryo (sekme arkaplanı, GPU sürücü resetii). Kaybolunca
  // available() false döner ve çağıran taraf mevcut 2D yola düşer — üretimde de şart olan davranış.
  cv.addEventListener('webglcontextlost', e=>{ e.preventDefault(); lost = true; texCache.clear(); });
  cv.addEventListener('webglcontextrestored', ()=>{ lost = false; initTried = false; prog = null; gl = null; });

  const vs = compile(gl.VERTEX_SHADER, VERT), fs = compile(gl.FRAGMENT_SHADER, FRAG);
  if(!vs || !fs){ gl = null; return false; }
  prog = gl.createProgram();
  gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
  if(!gl.getProgramParameter(prog, gl.LINK_STATUS)){
    lastErr = gl.getProgramInfoLog(prog) || 'program bağlanamadı';
    console.error('[FXGL] ' + lastErr);
    gl = null; return false;
  }
  gl.useProgram(prog);

  quad = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, 'aPos');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

  uni = {};
  for(const n of ['uArt','uTexel','uCover','uTime','uTilt','uSeed','uGain','uMode',
                  'uBandFreq','uBandWidth','uBandWarp','uBandSpec','uBandGrain','uBandInt',
                  'uSize','uElem','uCrystal','uFacet','uIrid','uRefr','uMask',
                  'uBeam','uBeamW','uMaskTex','uHasMask','uMaskFlip','uCardRect',
                  'uFoilInt','uFoilSat','uFoilBand','uFoilScale','uFoilEmb',
                  'uFoilFlow','uFoilSpec','uFoilSplit',
                  'uGoldInt','uGoldTreat','uGoldContrast','uGoldEngr','uGoldScale',
                  'uGoldSweepW','uGoldSpec','uGoldBorder',
                  'uCosInt','uCosBg','uCosNeb','uCosOrb','uCosOrbSize','uCosStar',
                  'uCosStarBr','uCosRing','uCosBurst','uCosSpark','uCosSweep',
                  'uCosPara','uCosWin',
                  'uIrfInt','uIrfSat','uIrfScale','uIrfSwirl','uIrfSwirlR',
                  'uIrfSpec','uIrfSpecW','uIrfTex','uIrfTexScale','uIrfEdge','uIrfBorder'])
    uni[n] = gl.getUniformLocation(prog, n);

  // Tek uber-shader olduğu için uniform sayısı her modla birlikte artıyor. GLES2'nin
  // spec alt sınırı 16 vec4; masaüstünde 200+ ama sınır AŞILIRSA link sessizce değil
  // gürültüyle patlamalı. Ölçüp söylüyoruz, tahmin etmiyoruz.
  const cap = gl.getParameter(gl.MAX_FRAGMENT_UNIFORM_VECTORS);
  if(cap < 64) console.warn('[FXGL] fragment uniform bütçesi dar: ' + cap + ' vec4');
  return true;
}

// '#rrggbb' → [0..1, 0..1, 0..1]
function rgb(hex){
  const h = /^#([0-9a-f]{6})$/i.exec(hex || '') ? hex : ELEM_FALLBACK;
  const n = parseInt(h.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

// volatile: içeriği her karede değişen tuval (kartın çizilmiş hâli). Doku nesnesi
// önbellekte kalır ama piksel verisi yeniden yüklenir — aksi hâlde shader ilk karenin
// kartını okur ve dil/eğim/animasyon değişimleri efektin altında donar.
function texture(artCanvas, volatil){
  let t = texCache.get(artCanvas);
  if(t){
    if(!volatil) return t;
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, artCanvas);
    return t;
  }
  t = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, t);
  // NEAREST zorunlu: piksel sanatı yeniden örneklenirse efekt katmanı kartın geri
  // kalanından daha "pürüzsüz" görünür ve stil anında kırılır.
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  // GL'in y ekseni canvas'ın tersi. Çevirmezsek shader resmin BAŞ AŞAĞI halinden normal
  // türetir; sonuç "neredeyse doğru" görünür ama ışık yanlış konturlarda kırılır.
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, artCanvas);
  texCache.set(artCanvas, t);
  return t;
}

// {card, art, mode, t, tiltX, tiltY, w, h, gain}
//   → {canvas, sx, sy, sw, sh} — drawImage'a verilecek KAYNAK dikdörtgeni | null
function render(o){
  if(!init() || lost) return null;
  const art = o.art;
  if(!art || !art.width || !art.height) return null;

  const w = Math.min(MAXW, Math.max(1, o.w|0)), h = Math.min(MAXH, Math.max(1, o.h|0));
  gl.viewport(0, 0, w, h);

  // Seed CPU tarafında, oyunun kendi akışından üretilir; shader onu yalnız tüketir.
  const r = G.RNG.make('fx.gl:' + (o.card && o.card.id || 'x'));
  const seed = [r() * 64, r() * 64];

  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, texture(art, o.volatile));
  gl.uniform1i(uni.uArt, 0);
  // texel = normal/detay türetmesinin adım boyu. Varsayılan kaynağın kendi çözünürlüğü;
  // kaynak KARTIN çizilmiş hâliyse çağıran onu kart pikseline (1/96, 1/144) sabitler,
  // yoksa 3× tuvalde adım üçte bire düşer ve kontrast tahmini bambaşka davranır.
  const tx = o.texel || [1 / art.width, 1 / art.height];
  gl.uniform2f(uni.uTexel, tx[0], tx[1]);
  // Maskenin kart uzayındaki çerçevesi. Verilmezse "efekt dikdörtgeni = tüm kart".
  const cr4 = o.cardRect || [0, 0, 1, 1];
  gl.uniform4f(uni.uCardRect, cr4[0], cr4[1], cr4[2], cr4[3]);

  // Maske 1. birime. Maske YOKKEN de bir doku bağlı kalmalı: WebGL'de boş sampler
  // tanımsız davranıştır ve bazı sürücülerde siyah döner, bazılarında uyarı basar.
  // Bu yüzden yedek olarak illüstrasyonun kendisi bağlanıp uHasMask=0 veriliyor.
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, texture(o.mask || art));
  gl.uniform1i(uni.uMaskTex, 1);
  gl.uniform1f(uni.uHasMask, o.mask ? 1 : 0);
  gl.uniform1f(uni.uMaskFlip, o.maskFlip ? 1 : 0);
  gl.activeTexture(gl.TEXTURE0);

  // cardart.js:254 drawArtCover'ın kırpmasının birebir kopyası — shader ekranda GÖRÜNEN
  // pikselden normal türetmeli, kaynağın kırpılıp atılan kenarlarından değil.
  const srcRatio = art.width / art.height, dstRatio = w / h;
  let sx = 0, sy = 0, sw = art.width, sh = art.height;
  if(srcRatio > dstRatio){ sw = art.height * dstRatio; sx = (art.width - sw) / 2; }
  else if(srcRatio < dstRatio){ sh = art.width / dstRatio; sy = (art.height - sh) / 2; }
  gl.uniform4f(uni.uCover, sw / art.width, sh / art.height, sx / art.width, sy / art.height);
  gl.uniform1f(uni.uTime, o.t || 0);
  // Tilt shader'a -1..1 olarak girer. Normalizasyon üst sınırı ÇAĞIRANDAN gelir:
  // laboratuvarda dönme açısı ayarlanabilir olduğu için sabit 12/10 bölmek, açı
  // büyüdükçe ışığı erken doyurur ve efekt kartla birlikte dönmeyi bırakırdı.
  const mx = o.tiltMax || 12, my = o.tiltMaxY || mx * 0.84;
  gl.uniform2f(uni.uTilt, clamp(o.tiltX || 0, -mx, mx) / mx, clamp(o.tiltY || 0, -my, my) / my);
  gl.uniform2f(uni.uSeed, seed[0], seed[1]);
  gl.uniform1f(uni.uGain, o.gain == null ? 1 : o.gain);
  gl.uniform1i(uni.uMode, MODES[o.mode] == null ? 0 : MODES[o.mode]);

  // Foil/holo/rainbow ortak bant parametreleri. Üçü aynı uniform setini paylaşır
  // (tek seferde yalnız biri çizilir), o yüzden hangi nesne okunacağını o.mode seçer.
  // Varsayılanlar eski koddaki SABİT sayılarla aynı görünümü verecek şekilde seçildi.
  const bandDefaults = {
    foil:    {freq: 1.2,  width: 0.22, warp: 0.14, spec: 1.0, grain: 0.45, intensity: 1.0},
    holo:    {freq: 2.4,  width: 0.15, warp: 0.22, spec: 1.0, grain: 0.45, intensity: 1.0},
    rainbow: {freq: 1.35, width: 0.24, warp: 0.14, spec: 1.0, grain: 0.45, intensity: 1.0},
  };
  const bd = bandDefaults[o.mode] || bandDefaults.foil;
  const bp = o[o.mode] || {};
  gl.uniform1f(uni.uBandFreq,  bp.freq      == null ? bd.freq      : bp.freq);
  gl.uniform1f(uni.uBandWidth, bp.width     == null ? bd.width     : bp.width);
  gl.uniform1f(uni.uBandWarp,  bp.warp      == null ? bd.warp      : bp.warp);
  gl.uniform1f(uni.uBandSpec,  bp.spec      == null ? bd.spec      : bp.spec);
  gl.uniform1f(uni.uBandGrain, bp.grain     == null ? bd.grain     : bp.grain);
  gl.uniform1f(uni.uBandInt,   bp.intensity == null ? bd.intensity : bp.intensity);

  // Kristal parametreleri (belge §18'in küçültülmüş hâli). Varsayılanlar §19'daki
  // "Standart Crystal Rare" satırından: renk kimliği yüksek, kırılma düşük.
  const cr = o.crystal || {};
  gl.uniform2f(uni.uSize, w, h);
  gl.uniform3fv(uni.uElem, rgb(cr.elemColor));
  gl.uniform1f(uni.uCrystal, cr.amount   == null ? 0.85 : cr.amount);
  gl.uniform1f(uni.uFacet,   cr.facet    == null ? 5.0  : cr.facet);
  gl.uniform1f(uni.uIrid,    cr.irid     == null ? 0.35 : cr.irid);
  gl.uniform1f(uni.uRefr,    cr.refract  == null ? 1.0  : cr.refract);
  gl.uniform1f(uni.uMask,    cr.mask     == null ? 1.0  : cr.mask);
  gl.uniform1f(uni.uBeam,    cr.beam     == null ? 0.70 : cr.beam);
  gl.uniform1f(uni.uBeamW,   cr.beamW    == null ? 0.26 : cr.beamW);

  // Anizotropik prizmatik foil parametreleri. Varsayılanlar belgenin §13
  // "fotoğraftaki görünüm için özel ayar" satırından.
  const pf = o.prismfoil || {};
  gl.uniform1f(uni.uFoilInt,   pf.intensity == null ? 0.85 : pf.intensity);
  gl.uniform1f(uni.uFoilSat,   pf.sat       == null ? 0.90 : pf.sat);
  gl.uniform1f(uni.uFoilBand,  pf.band      == null ? 2.60 : pf.band);
  gl.uniform1f(uni.uFoilScale, pf.scale     == null ? 5.00 : pf.scale);
  gl.uniform1f(uni.uFoilEmb,   pf.emboss    == null ? 0.60 : pf.emboss);
  gl.uniform1f(uni.uFoilFlow,  pf.flow      == null ? 0.75 : pf.flow);
  gl.uniform1f(uni.uFoilSpec,  pf.spec      == null ? 0.55 : pf.spec);
  gl.uniform1f(uni.uFoilSplit, pf.split     == null ? 1.00 : pf.split);

  // Gold foil. Varsayılanlar belgenin §12.2 "nihai reçete" satırından.
  const gf = o.goldfoil || {};
  gl.uniform1f(uni.uGoldInt,      gf.intensity == null ? 0.90 : gf.intensity);
  gl.uniform1f(uni.uGoldTreat,    gf.treatment == null ? 0.55 : gf.treatment);
  gl.uniform1f(uni.uGoldContrast, gf.contrast  == null ? 1.35 : gf.contrast);
  gl.uniform1f(uni.uGoldEngr,     gf.engrave   == null ? 0.70 : gf.engrave);
  gl.uniform1f(uni.uGoldScale,    gf.scale     == null ? 4.00 : gf.scale);
  gl.uniform1f(uni.uGoldSweepW,   gf.sweepW    == null ? 0.30 : gf.sweepW);
  gl.uniform1f(uni.uGoldSpec,     gf.spec      == null ? 0.60 : gf.spec);
  gl.uniform1f(uni.uGoldBorder,   gf.border    == null ? 1.00 : gf.border);

  // Cosmos / Galaxy Holo. Varsayılanlar belgenin §18.1 "Classic Cosmos" preset'i +
  // §24 nihai reçetesi; Galaxy aynı modun yoğun parametre seti, ayrı kod değil.
  const ch = o.cosmos || {};
  gl.uniform1f(uni.uCosInt,     ch.intensity == null ? 0.90 : ch.intensity);
  gl.uniform1f(uni.uCosBg,      ch.bg        == null ? 0.30 : ch.bg);
  gl.uniform1f(uni.uCosNeb,     ch.nebula    == null ? 0.35 : ch.nebula);
  gl.uniform1f(uni.uCosOrb,     ch.orb       == null ? 0.50 : ch.orb);
  gl.uniform1f(uni.uCosOrbSize, ch.orbSize   == null ? 9.00 : ch.orbSize);
  gl.uniform1f(uni.uCosStar,    ch.star      == null ? 0.25 : ch.star);
  gl.uniform1f(uni.uCosStarBr,  ch.starBr    == null ? 0.85 : ch.starBr);
  gl.uniform1f(uni.uCosRing,    ch.ring      == null ? 0.40 : ch.ring);
  gl.uniform1f(uni.uCosBurst,   ch.burst     == null ? 0.35 : ch.burst);
  gl.uniform1f(uni.uCosSpark,   ch.spark     == null ? 0.30 : ch.spark);
  gl.uniform1f(uni.uCosSweep,   ch.sweep     == null ? 0.55 : ch.sweep);
  gl.uniform1f(uni.uCosPara,    ch.parallax  == null ? 0.00 : ch.parallax);
  // Maske yokken efektin uygulanacağı pencere. Verilmezse tüm kart — ama çağıranın
  // vermesi beklenir, çünkü klasik uygulama (§6.1) illüstrasyon penceresidir ve
  // hangi kartın full-art olduğunu shader bilemez.
  const cw4 = o.cosWin || [0, 0, 1, 1];
  gl.uniform4f(uni.uCosWin, cw4[0], cw4[1], cw4[2], cw4[3]);

  // Full-Surface Iridescent Rainbow Foil. Varsayılanlar belgenin §20.2 "Classic
  // Full-Surface Rainbow" preset'inden başlayıp laboratuvarda ölçülüp ayarlandı.
  const rf = o.iridfoil || {};
  gl.uniform1f(uni.uIrfInt,      rf.intensity == null ? 0.85 : rf.intensity);
  gl.uniform1f(uni.uIrfSat,      rf.sat       == null ? 0.85 : rf.sat);
  gl.uniform1f(uni.uIrfScale,    rf.scale     == null ? 26.0 : rf.scale);
  gl.uniform1f(uni.uIrfSwirl,    rf.swirl     == null ? 0.90 : rf.swirl);
  gl.uniform1f(uni.uIrfSwirlR,   rf.swirlR    == null ? 46.0 : rf.swirlR);
  gl.uniform1f(uni.uIrfSpec,     rf.spec      == null ? 0.55 : rf.spec);
  gl.uniform1f(uni.uIrfSpecW,    rf.specW     == null ? 0.14 : rf.specW);
  gl.uniform1f(uni.uIrfTex,      rf.tex       == null ? 0.35 : rf.tex);
  gl.uniform1f(uni.uIrfTexScale, rf.texScale  == null ? 5.00 : rf.texScale);
  gl.uniform1f(uni.uIrfEdge,     rf.edge      == null ? 1.00 : rf.edge);
  gl.uniform1f(uni.uIrfBorder,   rf.border    == null ? 0.50 : rf.border);

  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

  // GL'in y=0 satırı görüntünün ALT satırıdır: viewport(0,0,w,h) çıktısı tuvalin sol
  // ALT köşesine oturur. Kaynak dikdörtgenini buna göre veriyoruz.
  return {canvas: cv, sx: 0, sy: MAXH - h, sw: w, sh: h, blend: BLEND[o.mode] || 'screen'};
}

function clamp(n, lo, hi){ return Math.max(lo, Math.min(hi, n)); }

// İlk pack açılışında shader'ın o karede derlenip donma yaratmaması için: boot
// sırasında bir kere çağrılır, sonucu atılır. init() zaten idempotent (initTried
// bayrağı) — warmup ikinci bir yol değil, birinciyi erken tetikliyor.
function warmup(){ return init() && !lost; }

// Değişen bir art/mask tuvali GPU'da eski dokuyu kullanmaya devam etmesin diye:
// kart editörü/manifest hot-reload aynı canvas nesnesini YERİNDE güncellemez,
// yeni bir <img>/<canvas> üretir — ama üretmediği ender yolda (ör. laboratuvarın
// sürükle-bırak maskesi) çağıran bunu elle bildirebilir.
function invalidate(source){
  if(!source) return;
  const t = texCache.get(source);
  if(t){ if(gl) gl.deleteTexture(t); texCache.delete(source); }
}
function clearTextures(){
  if(gl) for(const t of texCache.values()) gl.deleteTexture(t);
  texCache.clear();
}

G.FXGL = {
  render, MODES, warmup, invalidate, clearTextures,
  available: ()=> init() && !lost,
  error: ()=> lastErr,
};
})(globalThis);
