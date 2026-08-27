/* URETILDI - build_kiosk.py, kaynak: game/src/core/rng.js — ELLE DUZENLEME. */
// rng.js — seedlenebilir RNG ve ortak yardımcılar (tarayıcı + node)
(function(G){
'use strict';
function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
function hashStr(s){let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}return h>>>0;}
const RNG = {
  make(seed){ return mulberry32(typeof seed==='string'?hashStr(seed):(seed>>>0)); },
  hashStr,
  int(r,a,b){ return a+Math.floor(r()*(b-a+1)); },
  pick(r,arr){ return arr[Math.floor(r()*arr.length)]; },
  shuffle(r,arr){ const a=arr.slice(); for(let i=a.length-1;i>0;i--){ const j=Math.floor(r()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } return a; },
  weighted(r,pairs){ // pairs: [[item, weight],...]
    let tot=0; for(const p of pairs) tot+=p[1];
    let x=r()*tot;
    for(const p of pairs){ x-=p[1]; if(x<0) return p[0]; }
    return pairs[pairs.length-1][0];
  },
};
G.RNG = RNG;
G.clamp = (v,a,b)=>Math.max(a,Math.min(b,v));
G.fmt$ = v => '$' + (Math.round(v*100)/100).toLocaleString('en-US',{minimumFractionDigits:0, maximumFractionDigits:2});
})(globalThis);
