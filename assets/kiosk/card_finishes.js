/* URETILDI - build_kiosk.py, kaynak: game/src/data/card_finishes.js — ELLE DUZENLEME. */
// card_finishes.js — KART EFEKTİ TANIMLARI + ÜRETİM RESOLVER'I. Tek kaynak.
//
// Burası "hangi efekt neye benziyor ve hangi karta uygulandı" sorusunun tek cevabı.
// Hem laboratuvar (lab/fx-lab.html) hem ana oyun AYNI dosyayı yükler — ikinci bir
// kopya yok. Laboratuvardaki "kaydet" düğmesi bu dosyayı doğrudan üzerine yazar
// (bkz. tools/serve.js POST /save-fx-params), yani kaydırak → dosya → oyun tek yol.
//
// Dosya bilerek SAF VERİ: DOM'a, WebGL'e, laboratuvara bağımlı değil.
//
// ---------------------------------------------------------------------------
// YENİ BİR EFEKT NASIL EKLENİR
//   1. FINISHES'a bir giriş yaz. Shader modu yoksa mode:null bırak — 2D yolundan çizilir.
//   2. Laboratuvarda kaydırakları ayarla, "Kaydet" ile buraya geri yaz (status 'approved' olur).
//   3. Kart bazlı bir uygulamaysa CARDS'a gir; toplu kural ise resolveProfile()'daki
//      tablolardan birine (BASE_BY_RARITY / PRINT_FX / HR_FX / PROMO_FX) gir.
// Kaydedilmemiş bir kaydırak değişikliği sayfa yenilenince kaybolur.
// ---------------------------------------------------------------------------
//
// UYGULANABİLİRLİK PLANI ÖZETİ (docs/card-fx-uygulanabilirlik-plani.md):
//   print     = base | ir | sir | hr | negative   — binder slotu, save'e yazılır
//   finish    = normal | foil                      — fiziksel yüzey, save'e yazılır
//   fxProfile = card + print + rarity üzerinden resolveProfile() ile TÜRETİLİR,
//               save'e YAZILMAZ — bu yüzden yeni efekt/kart eklemek migration istemez.
// Öncelik: negative(2d) > HR kart override'ı > IR/SIR baskı profili > promo profili
//          > base rarity profili > normal (+ finish:'foil' ise renksiz specular katman).
// cosmos/galaxy KASITLI OLARAK hiçbir karta atanmadı (kullanıcı kararı) — shader
// altyapıda kalsın diye tanımları silinmedi, yalnızca resolver hiç seçmiyor.
(function(G){
'use strict';

// --- alan sözlüğü ------------------------------------------------------------
// rect     — efektin çizildiği dikdörtgen. STANDART 'card'TİR (2026-08-22 kararı):
//            shader efekti kartın TAMAMINA uygulanır, illüstrasyon penceresine değil.
//            Okunması gereken alanları (isim şeridi, metin kutusu, stat satırı, alt bant)
//            maske korur: elle maske yoksa cardart.js layout'tan TÜRETİLMİŞ varsayılan
//            maskeyi verir. Yeni bir efekt 'art'/'auto' ile eklenecekse gerekçesi yazılmalı.
//              'card'  tüm kart (96×144) — standart
//              'art'   illüstrasyon penceresi (6,18 · 84×68)
//              'auto'  kart full-art ise 'full', değilse 'art' (artık hiçbir efekt kullanmıyor)
// material — shader'ın OKUDUĞU piksel
//              'card'  kartın çizilmiş hâli. rect:'card' ile zorunlu eşlik eder, yoksa
//                      shader çerçevenin üstünde illüstrasyonu okur ve saçmalar.
//              'art'   ham illüstrasyon
// mask     — 'required'  ELLE çizilmiş maske şart gibi davranılır (kristal: siluete oturmazsa
//                        kart okunmaz). Efekt yine de çizilir; varsayılan maske devreye girer.
//            'optional'  elle maske yoksa varsayılan kart maskesi yeterlidir
// tilt     — kartın dönüşü. invert:true → kart farenin TERS yönüne döner ve ışık
//            farenin karşı kenarından vurur (ikisi aynı uTilt'ten sürülür).

const FINISHES = {
  crystal: {
    id: 'crystal',
    label: 'Kristal',
    status: 'approved',        // approved | draft | 2d-only
    approvedOn: '2026-08-05',
    baseVariant: 'normal',     // kart hangi 2D varyantıyla çizilir (kristal bir varyant DEĞİL)
    mode: 'crystal',           // fxgl.js MODES anahtarı
    rect: 'card',
    material: 'card',
    mask: 'required',
    tilt: {max: 26, invert: true},
    // Belge §19 "Standart Crystal Rare" satırından başlayıp laboratuvarda ayarlandı.
    params: {amount: 0.85, facet: 5, irid: 0.35, refract: 1, mask: 1, beam: 0.7, beamW: 0.26},
    notes: [
      'Kristal bir BİNDİRME değil, malzemenin yeniden çizimidir; maske dışında alfa 0 döner.',
      'Işık hüzmesinin parlaklığı doğrudan dönme miktarı: kart düzken 0, tam dönüşte 1.',
      'Hüzme kenarda sabit durur; eğim yalnız YÖNÜ ve ŞİDDETİ belirler, KONUMU değil.',
    ],
  },

  // "Anizotropik Prizmatik Foil Shader" belgesinin karşılığı. Kristalden AYRI efekt:
  // kristal malzemeyi yeniden çizer, bu kartı korur (~%70 temel kart) ve üstüne
  // yüzey yansıması ekler. Referans: tam yüzey foil, dikey spektral bantlar,
  // illüstrasyonun renkleri altında okunmaya devam ediyor.
  prismfoil: {
    id: 'prismfoil',
    label: 'Prizmatik Foil',
    status: 'approved',
    approvedOn: '2026-08-08',
    baseVariant: 'normal',
    mode: 'prismfoil',
    rect: 'card',
    material: 'card',
    mask: 'optional',      // maskesiz tüm yüzey foil olur; yazı koruması maskeden gelir
    tilt: {max: 26, invert: true},
    params: {intensity: 0.85, sat: 0.90, band: 2.6, scale: 5, emboss: 0.60,
             flow: 0.45, spec: 0.55, split: 1},
    notes: [
      'Belgeden bilerek sapılan tek yer: kabartma 1 px çizgi değil ~5 kart px oluk.',
      'Yön haritası YOK; yön illüstrasyonun normali + üç düşük frekanslı sinüsten geliyor.',
      'Bant konumu yalnız eğimden gelir, uTime hiç girmez (belge §18 ilk hata işareti).',
      'Maske tek kanal, beyaz = efekt. Yazı koruması elle maskeden gelir.',
      'Rainbow/Gold belgesindeki "Rainbow Foil" budur; adı prismfoil kaldı ki oyunun',
      'kendi 2D "rainbow" varyantıyla karışmasın.',
      'Spektrum ORTA tonlarda en güçlü, beyazlarda değil (Rainbow/Gold belgesi §4.3).',
    ],
  },

  // "Rainbow Foil ve Gold Foil Shader Tasarım Belgesi" §5'in karşılığı. Prizmatik
  // foil'le AYNI yüzey makinesini kullanır (oluk yönü, anizotropik yansıma) ama
  // rengi sınırlı bir metal rampasından üretir — belge §5.15 ikisinin karışmasını
  // ("rainbow renk eklemek") açıkça yasaklıyor, bu yüzden spektrum hiç çağrılmıyor.
  goldfoil: {
    id: 'goldfoil',
    label: 'Gold Foil',
    status: 'approved',
    approvedOn: '2026-08-08',
    baseVariant: 'normal',
    mode: 'goldfoil',
    rect: 'card',
    material: 'card',
    mask: 'optional',
    tilt: {max: 26, invert: true},
    // §12.2 "nihai reçete" satırından.
    params: {intensity: 0.90, treatment: 0.55, contrast: 1.35, engrave: 0.70,
             scale: 4, sweepW: 0.30, spec: 0.60, border: 1.00},
    notes: [
      'Metalik tepki 7 kademeye kuantalanır; her kademe rampanın bir durağı (§5.3).',
      'treatment tek eksende §5.8: 0 = Gold Overlay, 1 = Full Gold Treatment.',
      'Çerçeve gövdeden ayrılır (§5.10) ama maske GEREKMEZ — kenara uzaklıktan türetilir.',
      'Specular şampanya, saf beyaz değil (§12.2). Kromatik ayrışma yok (§6 tablosu).',
      'Rarity sembolü boost\'u YOK: sembolün yeri kart uzayında işaretli değil.',
    ],
  },

  // "Cosmos Holo / Galaxy Holo Shader Tasarım Belgesi"nin karşılığı. Öncekilerden
  // YAPISAL farkı: yüzey işlemi değil MOTİF efekti — kartın belirli noktalarında
  // duran sayılabilir nesneler var. Yerleştirme jitter'lı ızgaradan geliyor, CPU'da
  // motif listesi tutulmuyor (fxgl.js COSMOS bölümündeki nota bakın).
  //
  // cosmos ve galaxy AYNI shader modudur, ayrı kod değil: belge §2 ikisini yalnız
  // yoğunluk/renk çeşitliliğiyle ayırıyor, ayrı bir mod ikinci bir bakım yükü olurdu.
  cosmos: {
    id: 'cosmos',
    label: 'Cosmos Holo',
    status: 'draft',
    baseVariant: 'normal',
    mode: 'cosmos',
    rect: 'card',
    material: 'card',
    // Maskesiz de anlamlı: o durumda efekt illüstrasyon penceresine düşer (§6.1
    // klasik uygulama). Maske tam yüzey uygulamasını (§6.2) açar.
    mask: 'optional',
    tilt: {max: 26, invert: true},
    // §18.1 "Classic Cosmos" + §24 nihai reçete; sayılar 84×68 penceresinde 6 kart
    // üzerinde ölçülüp ayarlandı. bg 0.55'ten 0.30'a indi: 0.55'te temel karttan
    // ortalama sapma %22.9 çıkıyordu, belge §7.2 zemin için %10-20 istiyor.
    // Değerler kaydırak adımına (0.05) HİZALI olmalı, yoksa kaydırak etiketiyle
    // konumu ayrışıyor (0.32 yazarken 0.30'a oturuyordu).
    params: {intensity: 0.90, bg: 0.30, nebula: 0.35, orb: 0.50, orbSize: 9,
             star: 0.25, starBr: 0.85, ring: 0.40, burst: 0.35, spark: 0.30,
             sweep: 0.55, parallax: 0},
    notes: [
      'Motif yerleştirme jitter\'lı ızgaradan; sabit yerleşim (§9.1), minimum mesafe',
      '(§9.2) ve asimetrik yoğunluk (§9.3) ızgaranın kendisinden geliyor.',
      'Orb/ring/starburst TEK ızgarayı paylaşır: aynı yere iki büyük motif düşemez.',
      'uTime hiç girmez — §20\'nin ilk iki hatası (her karede yer değiştirme, sürekli',
      'parlama) zamandan doğuyor; motif yalnız kart eğildikçe açılıyor.',
      'Maskede GRİ özel anlam taşır: siyah = efekt yok, gri = kozmik zemin var ama',
      'MOTİF yok, beyaz = hepsi. Tek kanallı maskeyle §6.2\'nin karakter maskesi böyle',
      'çıkıyor — karakteri gri boyarsanız üstünde zemin parlar, orb/starburst doğmaz.',
      'Motif MERKEZDE elenir, piksel piksel solmaz: yarım ısırılmış orb "efekt kesilmiş"',
      'gibi okunuyordu.',
      'Parallax varsayılanı 0 (§20 "fazla parallax"); açılırsa tam kart pikseline yuvarlanır.',
      'Yüz/göz koruması ayrı bir katman olarak YOK — maskeye bırakıldı.',
      '§15 animasyon durumları ve §21 kalite seviyeleri uygulanmadı: laboratuvarda',
      'durum makinesi yok, ikisi de Faz 2/3 entegrasyon işi.',
    ],
  },

  galaxy: {
    id: 'galaxy',
    label: 'Galaxy Holo',
    status: 'draft',
    baseVariant: 'normal',
    mode: 'cosmos',            // AYNI shader; fark yalnız parametrelerde (§2 tablosu)
    rect: 'card',
    material: 'card',
    mask: 'optional',
    tilt: {max: 26, invert: true},
    // §18.2 "Galaxy Holo". Cosmos'la aynı oranda seyreltildi (zemin belge §7.2
    // bandında kalsın diye); motif yoğunlukları §2 tablosundaki "orta-yüksek".
    params: {intensity: 0.95, bg: 0.45, nebula: 0.60, orb: 0.70, orbSize: 10,
             star: 0.40, starBr: 0.95, ring: 0.60, burst: 0.55, spark: 0.45,
             sweep: 0.60, parallax: 0},
    notes: [
      'cosmos ile aynı mod, yoğun preset. Kod farkı yok — §2 farkı sayısal.',
      'Belge §20 "fazla starburst" uyarısı burada daha kritik: burst 0.55\'in üstüne',
      'çıkarılırsa kart ödül ekranına dönüyor.',
    ],
  },

  // "Full-Surface Iridescent Rainbow Foil Shader Tasarım Belgesi"nin karşılığı.
  // Belge §3 bunu prismfoil'den AÇIKÇA ayırıyor: prismfoil düz, tarama yönlü
  // doğrusal bantlar kullanır ("standart Rainbow Foil"), bu ise kıvrımlı, yağ
  // tabakası benzeri organik alanlar istiyor. Aynı oluk/anizotropi makinesini
  // yeniden kullanmak düz bant görünümünü miras alırdı, o yüzden ayrı mod.
  iridfoil: {
    id: 'iridfoil',
    label: 'İridesan Rainbow Foil',
    status: 'approved',
    approvedOn: '2026-08-08',
    baseVariant: 'normal',
    mode: 'iridfoil',
    rect: 'card',
    material: 'card',
    mask: 'optional',      // maskesiz tüm yüzey foil olur (§4: "Kartın tamamı foil etkisi alır")
    tilt: {max: 26, invert: true},
    // §20.2 "Classic Full-Surface Rainbow" preset'inden başlayıp laboratuvarda
    // ölçülüp ayarlandı.
    params: {intensity: 0.85, sat: 0.85, scale: 26, swirl: 0.90, swirlR: 46,
             spec: 0.55, specW: 0.14, tex: 0.35, texScale: 5,
             edge: 1, border: 0.50},
    notes: [
      'Girdap merkezi kart başına SABİT (§10.3); uTime hiç girmez (§22 ilk hata',
      'işareti "pattern zamanla dönmesi").',
      'Faz basamaklı (7 kademe), sürekli gradyan DEĞİL — §22 "düz rainbow gradient"',
      'hatasının panzehiri; basamak sınırları swirl/warp\'tan geçtiği için kıvrımlı.',
      '§8.3 baskın renk sınırı ("kartın yalnız %25-45\'i güçlü renk alsın") BİLEREK',
      'UYGULANMADI — kullanıcı isteği: kartın tamamı aynı güçte etkilensin, ayrı',
      '"ada" bölgeleri olmasın. İlk sürümde bu sınır warp/swirl\'den geçmiş bir alanla',
      'veriliyordu (öncesinde ham kart pikselinden örneklenince düz köşegen çubuklar',
      'çıkıyordu); ikisi de kaldırıldı, `uIrfIsland` uniformu artık yok.',
      'Maske GOLD FOIL ile aynı yolla çalışır: fonksiyon içinde maskeye hiç',
      'bakılmıyor, yalnız alfaya gidiyor — 2D tuvalde zaten FX\'siz temel kart çizili',
      'olduğu için alfa<1 kendiliğinden "base + iridescent*alfa" veriyor (§7 gri kuralı).',
      'Rarity sembolü boost\'u YOK (goldFoil\'deki gibi sembolün yeri işaretli değil).',
      'Yüz/metin koruması ayrı katman olarak YOK — maskeye ve isim şeridi/metin',
      'kutusunun parlaklık eşiğine bırakıldı (prismFoil\'deki aynı "open" fikri).',
      '§17 animasyon durumları, §23 performans kademeleri, §24 erişilebilirlik',
      'anahtarları uygulanmadı — laboratuvarda durum makinesi yok, Faz 2/3 işi.',
    ],
  },

  // Foil/holo/rainbow üçü de fxgl.js'te AYNI "bant treni" mekaniğini paylaşır: tek
  // Gauss tepesi yerine eksen boyunca uBandFreq kadar tekrar eden bant, her bandın
  // kalınlığı uBandWidth. Önceden ikisi de kodda SABİTTİ (tek dalga) — artık kayıtlı
  // parametre, kullanıcı isteğiyle laboratuvarda ayarlanabilir. uTime kaldırıldı,
  // faz artık iridfoil/cosmos gibi uSeed'e sabit (kart döndürülmeden animasyon yok).
  foil: {
    id: 'foil', label: 'Foil', status: 'approved', approvedOn: '2026-08-08',
    baseVariant: 'foil', mode: 'foil', rect: 'card', material: 'card', mask: 'optional',
    tilt: {max: 12, invert: false},
    params: {freq: 1.2, width: 0.22, warp: 0.14, spec: 1.0, intensity: 1.0},
    notes: [
      'Renksiz specular; artık tek bant değil, freq ile tekrar sayısı, width ile',
      'kalınlığı ayarlanabilir. Sanat yönetimi onayı bekliyor (Faz 0).',
    ],
  },

  holo: {
    id: 'holo', label: 'Holo', status: 'approved', approvedOn: '2026-08-08',
    baseVariant: 'holo', mode: 'holo', rect: 'card', material: 'card', mask: 'optional',
    tilt: {max: 12, invert: false},
    params: {freq: 2.4, width: 0.15, warp: 0.22, spec: 1.0, grain: 0.45, intensity: 1.0},
    notes: [
      'Dar bantlı, taneli difraksiyon; bant sayısı/kalınlığı ve tane eşiği (grain)',
      'ayarlanabilir. Sanat yönetimi onayı bekliyor (Faz 0).',
    ],
  },

  rainbow: {
    id: 'rainbow', label: 'Rainbow', status: 'approved', approvedOn: '2026-08-08',
    baseVariant: 'rainbow', mode: 'rainbow', rect: 'card', material: 'card', mask: 'optional',
    tilt: {max: 12, invert: false},
    params: {freq: 1.35, width: 0.24, warp: 0.14, spec: 1.0, intensity: 1.0},
    notes: [
      'Difraksiyon bandı artık tek dalga değil; tekrar sayısı/kalınlığı ayarlanabilir.',
      'Sanat yönetimi onayı bekliyor (Faz 0).',
    ],
  },

  // Pokémon "Reverse Holo"nun karşılığı (docs/card-fx-plan.md §3). Kendi shader MODU YOK:
  // holo modunun (bant treni, uMode 1) sedefli/taneli mekaniğini kendi parametreleriyle
  // yeniden kullanır — reverse'ün kimliği modda değil MASKEDE: parıltı illüstrasyon
  // penceresi HARİÇ her yerde (çerçeve, isim şeridi, metin kutusu ışıldar; resim MAT kalır).
  //
  // SUNUM EKSENİ — resolveProfile() bunu HİÇBİR karta atamaz ve hiçbir save alanı buna
  // dönüşmez (ekonomi/binder/koleksiyon puanı dışında kalması bilinçli: tek eksenli
  // `variant` binder'ı 229 slota şişirdiği için iptal edilmişti, bkz. FAILED_APPROACHES).
  // Yalnız açıkça istendiğinde çizilir: UI.cardEl(id, {fxProfile:'reverse'}) →
  // cardart.js drawTemplateFx opts.fxProfile.
  reverse: {
    id: 'reverse',
    label: 'Reverse Holo',
    status: 'approved',
    approvedOn: '2026-08-25',
    baseVariant: 'normal',     // reverse artık bir 2D varyantı değil; kart normal çizilir
    mode: 'holo',              // AYRI mod açılmadı; holo'nun bant treni yeterli
    rect: 'card',
    material: 'card',
    mask: 'optional',
    // Türetilmiş VARSAYILAN maskesi diğerlerinin TERSİ: kart beyaz, illüstrasyon
    // penceresi siyah (cardart.js inverseArtFxMask). Bu maske efektin TANIMI olduğu
    // için elle çizilmiş maske de onu ezmez — bkz. cardart.js derivedFxMask.
    defaultMask: 'inverse-art',
    tilt: {max: 12, invert: false},
    // holo'nun kendi sayılarına DOKUNULMADI; bunlar reverse'ün KENDİ değerleri.
    // Bant holo'dan ince ve sık, pırıltı seyrek (grain eşiği yükseldikçe step() daha az
    // piksel geçirir — plandaki "seyrek pırıltı").
    // Güç 1.30: efekt yalnız çerçeve/şerit/kutu şeridine sığdığı için 1.00'de video
    // ölçeğinde zor seçiliyordu. Ölçüldü (headless SwiftShader, EL-009, tilt -11↔+11
    // ortalama kanal farkı): çerçeve 8.18 · isim şeridi 7.16 · metin kutusu 4.39 ·
    // alt bant 10.26 · illüstrasyon TAM 0. Kaydırak ızgarasına (0.05) hizalı.
    params: {freq: 3.2, width: 0.10, warp: 0.20, spec: 1.00, grain: 0.55, intensity: 1.30},
    notes: [
      'Kendi GLSL modu YOK — holo (uMode 1) yeniden kullanılıyor; kimlik maskede.',
      "Efekt yazı alanlarını da kaplar: reverse holo'da isim şeridi ve metin kutusu",
      'ışıldar, o yüzden varsayılan maske o alanları KORUMAZ (diğer efektlerin tersi).',
      'uTime yok; parıltı yalnız kart eğildikçe açılır.',
      "Ekonomiye/binder'a girmez: resolveProfile() atamaz, save'e yazılmaz.",
    ],
  },

  // Shader karşılığı olmayanlar. mode:null → laboratuvar da bunları 2D yolundan çizer,
  // "WebGL" etiketi gerçekte 2D çizilen kartı gizlemesin diye.
  fullart:  {id:'fullart',  label:'Full Art', status:'2d-only', baseVariant:'fullart',  mode:null,
             notes:['Şu an foil moduna eşleniyordu; kendi modu olacak mı karar verilmedi.']},

  negative: {id:'negative', label:'Negatif',  status:'2d-only', baseVariant:'negative', mode:null,
             notes:['Duman katmanı 2D. Shader mı olacak karar verilmedi.']},
};

// --- kart bazlı uygulamalar --------------------------------------------------
// Bir kart burada geçiyorsa "bu kartın efekti şudur" demektir. finish zorunlu;
// maskFlip ve params yalnız o kart için sapma varsa yazılır (yoksa FINISHES'taki
// değerler geçerli). mask alanı bilgi amaçlı; ÜRETİMDE maske dosyası
// art/masks/<ID>.png (baskıya özel: <ID>-ir|sir|hr.png) yolunda aranır — kart
// editöründen yüklenir. lab/masks/ yalnız laboratuvarın kendi deneme klasörüdür.
const CARDS = {
  'EL-001': {
    finish: 'crystal',
    // Maskede tilki SİYAH, arka plan beyaz çizildi → efektin tilkiye gelmesi için ters.
    maskFlip: true,
    mask: 'lab/masks/EL-001.png',
    note: 'Kart kenar çizgisi de maskede siyah; ters çevrilince kartın etrafında kristal kontur çıkıyor.',
  },
};

// --- üretim resolver'ı ---------------------------------------------------
// docs/card-fx-uygulanabilirlik-plani.md'deki 80 girdilik dağılımın kod karşılığı.
// Hiçbir save alanı bu tablolardan türemez — kart/baskı/rarity zaten save'de var,
// resolveProfile() saf bir fonksiyon, girdi aynıysa çıktı hep aynı.

// base dropTier profili: common/uncommon efektsiz (yalnız finish:'foil' varsa renksiz
// katman alır), rare→holo, epic→rainbow, legendary/mythic→prismfoil (SIR/HR çekilirse
// PRINT_FX/HR_FX bunu ezer).
const BASE_BY_RARITY = {
  common: null, uncommon: null, promo: null,
  rare: 'holo', epic: 'rainbow', legendary: 'prismfoil', mythic: 'prismfoil',
};
// IR/SIR baskı profili — kartın base rarity'sinden BAĞIMSIZ, tüm IR'ler prismfoil,
// tüm SIR'ler crystal (bkz. plan §"Secret Rare Baskılar").
const PRINT_FX = { ir: 'prismfoil', sir: 'crystal' };
// HR yalnız 2 kartta var ve İKİSİ FARKLI efekt alıyor (Pokémon-tarzı altın vs. tek
// iridesan zirve kart) — PRINT_FX gibi tek değerle ifade edilemez, karta göre tablo.
const HR_FX = { 'EL-012': 'goldfoil', 'EL-055': 'iridfoil' };
// Promo efekti rarity'den TÜRETİLEMEZ (hepsi rarity:'promo') — plandaki temaya göre
// elle atanmış: turnuva/ödül/prestij → goldfoil, geri kalanı foil/holo/prismfoil/crystal.
const PROMO_FX = {
  'PR-001': 'goldfoil', 'PR-002': 'goldfoil', 'PR-003': 'goldfoil',
  'PR-004': 'foil', 'PR-005': 'holo', 'PR-006': 'foil',
  'PR-007': 'holo', 'PR-008': 'goldfoil', 'PR-009': 'goldfoil',
  'PR-010': 'prismfoil', 'PR-011': 'holo', 'PR-012': 'holo',
  'PR-013': 'foil', 'PR-014': 'crystal', 'PR-015': 'goldfoil',
};

// Baskın efekt kimliği (finishes.js anahtarı) ya da null (efektsiz/normal).
// Öncelik: negative(2D, henüz shader'a bağlanmadı) > HR kart override'ı >
// IR/SIR baskı profili > promo profili > base rarity profili.
function resolveProfile(card, print){
  if(!card) return null;
  if(print === 'negative') return null;
  if(print === 'hr') return HR_FX[card.id] || null;
  if(print && print !== 'base') return PRINT_FX[print] || null;
  if(PROMO_FX[card.id]) return PROMO_FX[card.id];
  return BASE_BY_RARITY[card.rarity] || null;
}
// finish:'foil' fiziksel kopya bayrağı BASKIN efekti DEĞİŞTİRMEZ — yalnızca renksiz
// specular ışık katmanı ekler (foil shader modu). Baskın efekt zaten 'foil' ise
// (foil promo grubu, ya da common/uncommon'da tek başına) ikinci bir katman gerekmez.
function foilOverlay(card, print, finish, dominant){
  if(finish !== 'foil') return null;
  if(print === 'negative') return null;
  return dominant === 'foil' ? null : 'foil';
}

// --- okuma yardımcıları ------------------------------------------------------
// Bilinmeyen anahtar SESSİZCE varsayılana düşmez: laboratuvarda yazım hatası
// "efekt neden değişmedi" diye saatler yiyebilir.
function get(id){
  const f = FINISHES[id];
  if(!f) throw new Error('[CardFinishes] tanımsız efekt: ' + id);
  return f;
}
const has = id => !!FINISHES[id];
const forCard = id => CARDS[id] || null;
// Kartın kayıtlı efektinin parametreleri: efekt varsayılanı + karta özel sapma.
function paramsFor(cardId, finishId){
  const f = get(finishId);
  const c = CARDS[cardId];
  const p = Object.assign({}, f.params);
  if(c && c.finish === finishId && c.params) Object.assign(p, c.params);
  return p;
}

G.CardFinishes = {FINISHES, CARDS, get, has, forCard, paramsFor,
                  BASE_BY_RARITY, PRINT_FX, HR_FX, PROMO_FX,
                  resolveProfile, foilOverlay,
                  ids: () => Object.keys(FINISHES)};
})(globalThis);
