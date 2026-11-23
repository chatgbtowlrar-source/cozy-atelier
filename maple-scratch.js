/* Cozy Atelier v8 — soft-edged canvas scratch and animated autumn reward. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const leaf = $('scratchLeaf'), canvas = $('scratchCanvas'), result = $('scratchResult');
  if (!leaf || !canvas || !result) return;
  const hint = $('scratchHint'), skip = $('scratchUnlock'), copy = $('scratchCopy');
  const progress = $('scratchProgress'), bar = $('scratchProgressBar'), title = $('scratchTitle');
  const ctx = canvas.getContext('2d', {willReadFrequently:true});
  if (!ctx) { skip.hidden = false; return; }
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const cover = new Image(); cover.src = 'assets/leaf-maple.webp';
  let ready = false, opened = false, drawing = false, prev = null;
  let resolution=1, leafPixelCount=1, lastCountAt=0;
  const getSaved = () => { try {return sessionStorage.getItem('cozyCouponUnlocked') === 'COZY10';}catch {return false;} };
  const saveUnlock = () => { try {sessionStorage.setItem('cozyCouponUnlocked','COZY10');}catch {} };
  function init(){
    if(opened || !cover.complete || !cover.naturalWidth) return;
    const box = canvas.getBoundingClientRect(); if(box.width<40) return;
    resolution=Math.min(window.devicePixelRatio||1,2);
    canvas.width=Math.round(box.width*resolution);canvas.height=Math.round(box.height*resolution);
    ctx.clearRect(0,0,canvas.width,canvas.height);
    ctx.drawImage(cover,0,0,canvas.width,canvas.height);
    // Make the wax coat opaque inside the leaf silhouette: hidden lettering must not peek through.
    const coated=ctx.getImageData(0,0,canvas.width,canvas.height);
    for(let i=3;i<coated.data.length;i+=4){
      const a=coated.data[i];
      coated.data[i]=a>65?Math.min(255,Math.round(a*2.15)):Math.min(255,Math.round(a*1.4));
    }
    ctx.putImageData(coated,0,0);
    // A subtle bronzed wax finish, clipped to actual leaf pixels.
    ctx.globalCompositeOperation='source-atop';
    const wax=ctx.createLinearGradient(0,0,canvas.width,canvas.height);
    wax.addColorStop(0,'rgba(246,180,90,.18)');wax.addColorStop(.55,'rgba(116,61,33,.21)');wax.addColorStop(1,'rgba(248,195,121,.12)');
    ctx.fillStyle=wax;ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.globalCompositeOperation='source-over';
    leafPixelCount=countAlpha();ready=true;
  }
  function countAlpha(){
    const data=ctx.getImageData(0,0,canvas.width,canvas.height).data;
    let count=0;
    for(let y=3;y<canvas.height;y+=7)for(let x=3;x<canvas.width;x+=7)if(data[(y*canvas.width+x)*4+3]>85)count++;
    return count;
  }
  function pos(e){ const r=canvas.getBoundingClientRect();return {x:(e.clientX-r.left)*resolution,y:(e.clientY-r.top)*resolution}; }
  function speck(p,burst=false){
    if(reducedMotion.matches)return;
    if(Math.random()>.48&&!burst)return;
    const radius=burst?24:7;
    const n=burst?22:2;
    const rect=canvas.getBoundingClientRect(), base=leaf.getBoundingClientRect();
    for(let i=0;i<n;i++){
      const s=document.createElement('span');s.className='scratch-particle';
      const x=burst?base.width*.5:p.x/resolution+(rect.left-base.left);
      const y=burst?base.height*.48:p.y/resolution+(rect.top-base.top);
      s.style.left=(x+Math.random()*radius-radius/2)+'px';s.style.top=(y+Math.random()*radius-radius/2)+'px';
      s.style.setProperty('--dx',((Math.random()-.5)*(burst?158:52))+'px');
      s.style.setProperty('--dy',((Math.random()-.5)*(burst?150:57))+'px');
      leaf.appendChild(s);s.addEventListener('animationend',()=>s.remove(),{once:true});
      setTimeout(()=>s.remove(),1200);
    }
  }
  // Stamp a radial gradient continuously along the pointer path, keeping feathered edges.
  function stamp(x,y){
    const r=Math.max(10,Math.min(canvas.width,canvas.height)*.084);
    ctx.save();ctx.globalCompositeOperation='destination-out';
    const soft=ctx.createRadialGradient(x,y,r*.12,x,y,r);
    soft.addColorStop(0,'rgba(0,0,0,1)');
    soft.addColorStop(.59,'rgba(0,0,0,.99)');
    soft.addColorStop(.80,'rgba(0,0,0,.48)');
    soft.addColorStop(1,'rgba(0,0,0,0)');
    ctx.fillStyle=soft;ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();ctx.restore();
  }
  function stroke(p){
    if(!ready||opened)return;
    if(!prev)stamp(p.x,p.y);
    else{
      const dist=Math.hypot(p.x-prev.x,p.y-prev.y);
      const spacing=Math.max(2,canvas.width*.013);
      const steps=Math.min(130,Math.max(1,Math.ceil(dist/spacing)));
      for(let i=1;i<=steps;i++){
        const t=i/steps;stamp(prev.x+(p.x-prev.x)*t,prev.y+(p.y-prev.y)*t);
      }
    }
    speck(p);prev=p;
    if(performance.now()-lastCountAt>110){lastCountAt=performance.now();updateProgress();}
  }
  function updateProgress(){
    if(!ready||opened)return;
    const removed=Math.max(0,1-countAlpha()/leafPixelCount);
    if(bar)bar.style.width=(Math.min(1,removed/.36)*100).toFixed(0)+'%';
    if(removed>.08){hint.textContent=removed>.22?'Ещё немного — подарок почти открыт!':'Продолжай стирать, под листом спрятан подарок';}
    if(removed>=.34)unlock();
  }
  function unlock(){
    if(opened)return;
    opened=true;drawing=false;prev=null;saveUnlock();
    leaf.classList.remove('is-scratching');
    // The reward is revealed through the erased portions, then the remaining coat dissolves.
    leaf.classList.add('unlocked');
    if(progress)progress.classList.add('is-complete');
    title.textContent='✦ ПОДАРОК ОТКРЫТ';title.parentElement?.classList.add('is-open');
    hint.textContent='Твоя скидка на первый заказ — 10%';
    skip.hidden=true;result.hidden=false;
    canvas.setAttribute('aria-label','Подарок открыт. Промокод COZY10');
    if(!reducedMotion.matches){speck({x:canvas.width*.5,y:canvas.height*.5},true);requestAnimationFrame(()=>requestAnimationFrame(()=>result.classList.add('is-visible')));}
    else result.classList.add('is-visible');
  }
  canvas.addEventListener('pointerdown',e=>{
    if(opened)return;if(!ready)init();if(!ready)return;
    e.preventDefault();drawing=true;prev=null;leaf.classList.add('is-scratching');
    canvas.setPointerCapture?.(e.pointerId);stroke(pos(e));
  });
  canvas.addEventListener('pointermove',e=>{
    if(!drawing||opened)return;e.preventDefault();
    const events=e.getCoalescedEvents?.()||[e];
    for(const event of events)stroke(pos(event));
  });
  const end=()=>{if(!drawing)return;drawing=false;prev=null;leaf.classList.remove('is-scratching');updateProgress()};
  ['pointerup','pointercancel','lostpointercapture'].forEach(t=>canvas.addEventListener(t,end));
  canvas.addEventListener('keydown',e=>{if((e.key==='Enter'||e.key===' ')&&!opened){e.preventDefault();unlock();}});
  skip?.addEventListener('click',unlock);
  copy?.addEventListener('click',async()=>{
    let ok=false;
    try{if(navigator.clipboard&&window.isSecureContext){await navigator.clipboard.writeText('COZY10');ok=true;}}catch{}
    if(!ok){let el=document.createElement('textarea');el.value='COZY10';el.style.position='fixed';el.style.left='-9999px';document.body.appendChild(el);el.select();try{ok=document.execCommand('copy')}catch{}el.remove();}
    copy.textContent=ok?'Скопировано ✓':'Код: COZY10';
  });
  if(getSaved())unlock();
  else if(cover.complete&&cover.naturalWidth)init();
  else {cover.onload=init;cover.onerror=()=>{hint.textContent='Нажми «Открыть», чтобы получить подарок';skip.hidden=false;}};
  // Width only changes at breakpoints. Preserve a partially erased leaf otherwise.
  let lastWidth=0;const observer=new ResizeObserver(entries=>{
    const width=Math.round(entries[0]?.contentRect.width||0);
    if(!opened&&width>30&&Math.abs(lastWidth-width)>5){lastWidth=width;init();}
  });observer.observe(canvas);
})();
