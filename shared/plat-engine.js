/* Plat-Engine — o palco de jogos de plataforma da Dev Academy.
   O aluno escreve as classes em Java (via JavaBox); a engine cuida de palco,
   teclado/touch, mapa de tiles, moedas, inimigos, bandeira e câmera. */
(function(){
const W = (typeof window!=='undefined') ? window : globalThis;
const TILE = 32;
const Fisica = { GRAVIDADE: 0.5, PULO: -10, VELOCIDADE: 3, LARGURA: 24, ALTURA: 28 };

function parseMapa(linhas){
  const m = { solidos:new Set(), moedas:[], inimigos:[], bandeira:null,
              spawn:{x:64,y:64}, cols:0, rows:linhas.length };
  linhas.forEach((linha,cy)=>{
    m.cols = Math.max(m.cols, linha.length);
    [...linha].forEach((ch,cx)=>{
      const x = cx*TILE, y = cy*TILE;
      if(ch==='#') m.solidos.add(cx+','+cy);
      else if(ch==='C') m.moedas.push({x:x+16, y:y+16, pega:false});
      else if(ch==='E') m.inimigos.push({x, y:y+TILE-26, vx:1, vivo:true, w:26, h:26});
      else if(ch==='F') m.bandeira = {x:x+4, y};
      else if(ch==='P') m.spawn = {x, y};
    });
  });
  m.larguraPx = m.cols*TILE; m.alturaPx = m.rows*TILE;
  return m;
}
function solidoEm(mapa, px, py){
  if(px<0 || px>=mapa.larguraPx) return true;
  return mapa.solidos.has(Math.floor(px/TILE)+','+Math.floor(py/TILE));
}
function colideRet(mapa, x, y, w, h){
  return solidoEm(mapa,x,y) || solidoEm(mapa,x+w-1,y) ||
         solidoEm(mapa,x,y+h-1) || solidoEm(mapa,x+w-1,y+h-1) ||
         solidoEm(mapa,x+w/2,y) || solidoEm(mapa,x+w/2,y+h-1);
}
function chaoY(mapa){
  for(let cy=0; cy<mapa.rows; cy++){
    let cheia = true;
    for(let cx=0; cx<mapa.cols; cx++) if(!mapa.solidos.has(cx+','+cy)){ cheia=false; break; }
    if(cheia) return cy*TILE;
  }
  return mapa.alturaPx - TILE;
}
class Teclas{ constructor(){ this.esquerda=false; this.direita=false; this.pulo=false; } }
class PincelFake{
  constructor(){ this.chamadas=0; this.itens=[]; }
  ret(x,y,w,h,cor){ this.chamadas++; this.itens.push(['ret',x,y,w,h,cor]); }
  circulo(x,y,r,cor){ this.chamadas++; this.itens.push(['circ',x,y,r,cor]); }
  texto(t,x,y,tam,cor){ this.chamadas++; this.itens.push(['txt',t]); }
}
class PincelCanvas{
  constructor(ctx, cam){ this.ctx=ctx; this.cam=cam; }
  ret(x,y,w,h,cor){ this.ctx.fillStyle=cor; this.ctx.fillRect(x-this.cam.x, y-this.cam.y, w, h); }
  circulo(x,y,r,cor){ this.ctx.fillStyle=cor; this.ctx.beginPath(); this.ctx.arc(x-this.cam.x,y-this.cam.y,r,0,7); this.ctx.fill(); }
  texto(t,x,y,tam,cor){ this.ctx.fillStyle=cor; this.ctx.font='bold '+(tam||16)+'px system-ui'; this.ctx.fillText(t, x-this.cam.x, y-this.cam.y); }
}
function heroiDefaultSrc(){
  return 'class Heroi {\n  double x; double y; double vx; double vy;\n  boolean noChao; int pontos; int vidas;\n' +
  '  Heroi(double x, double y) { this.x = x; this.y = y; this.vx = 0; this.vy = 0; this.noChao = false; this.pontos = 0; this.vidas = 3; }\n' +
  '  void atualizar(Teclas t) { }\n' +
  '  void desenhar(Pincel g) { g.ret(this.x, this.y, 24, 28, "#7C4DFF"); g.ret(this.x+4, this.y+7, 5, 5, "white"); g.ret(this.x+15, this.y+7, 5, 5, "white"); }\n}';
}
function compilar(codigo, mundoAPI){
  if(!codigo || !codigo.trim()) codigo = heroiDefaultSrc();
  const js = W.JavaBox.transpile(codigo);
  const fn = new Function('Fisica','Mundo','Teclas','Pincel', js +
    '\n;return { Heroi: (typeof Heroi!=="undefined")?Heroi:null, Fundo:(typeof Fundo!=="undefined")?Fundo:null };');
  return fn(Fisica, mundoAPI, Teclas, Object);
}
function fazerMundoAPI(mapa){
  return {
    solido: (x,y)=>solidoEm(mapa,x,y),
    colide: (x,y,w,h)=>colideRet(mapa,x,y,w,h),
    chao: ()=>chaoY(mapa),
    largura: ()=>mapa.larguraPx,
    altura: ()=>mapa.alturaPx
  };
}
/* simulação (com ou sem canvas) — o coração compartilhado */
function passo(st, teclas){
  const {heroi, mapa, sis} = st;
  st.frame++;
  if(heroi.atualizar) heroi.atualizar(teclas);
  if(sis.chaoSimples){
    const ch = chaoY(mapa);
    if(heroi.vy >= 0 && heroi.y + Fisica.ALTURA >= ch){ heroi.y = ch - Fisica.ALTURA; heroi.vy = 0; heroi.noChao = true; }
    else if(heroi.vy < 0) heroi.noChao = false;
    else if(heroi.y + Fisica.ALTURA < ch - 2) heroi.noChao = false;
    if(heroi.x < 0) heroi.x = 0;
    if(heroi.x > mapa.larguraPx - Fisica.LARGURA) heroi.x = mapa.larguraPx - Fisica.LARGURA;
  }
  if(heroi.y > mapa.alturaPx + 100){ // caiu do mundo
    heroi.x = mapa.spawn.x; heroi.y = mapa.spawn.y; heroi.vy = 0;
    if(typeof heroi.vidas === 'number') heroi.vidas--;
  }
  if(sis.moedas){
    mapa.moedas.forEach(mo=>{
      if(!mo.pega && Math.abs((heroi.x+12)-mo.x)<20 && Math.abs((heroi.y+14)-mo.y)<22){
        mo.pega = true;
        if(heroi.aoPegarMoeda) heroi.aoPegarMoeda(); else heroi.pontos=(heroi.pontos||0)+1;
        st.beep && st.beep(880);
      }
    });
  }
  if(sis.inimigos){
    mapa.inimigos.forEach(ini=>{
      if(!ini.vivo) return;
      ini.x += ini.vx;
      const pe = ini.y + ini.h + 2, frente = ini.vx>0 ? ini.x+ini.w+1 : ini.x-1;
      if(colideRet(mapa, frente, ini.y, 1, ini.h) || !solidoEm(mapa, frente, pe)) ini.vx *= -1;
      if(st.invencivel>0) return;
      const sobrepoe = heroi.x < ini.x+ini.w && heroi.x+Fisica.LARGURA > ini.x &&
                       heroi.y < ini.y+ini.h && heroi.y+Fisica.ALTURA > ini.y;
      if(sobrepoe){
        if(heroi.vy > 0 && (heroi.y+Fisica.ALTURA) - ini.y < 14){
          ini.vivo = false; heroi.vy = Fisica.PULO*0.6;
          if(heroi.aoDerrotar) heroi.aoDerrotar(); else heroi.pontos=(heroi.pontos||0)+5;
          st.beep && st.beep(660);
        } else {
          if(heroi.aoLevarDano) heroi.aoLevarDano(); else if(typeof heroi.vidas==='number') heroi.vidas--;
          heroi.x = mapa.spawn.x; heroi.y = mapa.spawn.y; heroi.vy = 0;
          st.invencivel = 60; st.beep && st.beep(180);
        }
      }
    });
  }
  if(st.invencivel>0) st.invencivel--;
  if(sis.bandeira && mapa.bandeira && !st.vitoria){
    if(Math.abs(heroi.x - mapa.bandeira.x)<24 && Math.abs(heroi.y - mapa.bandeira.y)<64){
      st.vitoria = true; st.beep && st.beep(1320);
    }
  }
}
function simular(opts){
  const mapa = parseMapa(opts.mapa);
  const api = fazerMundoAPI(mapa);
  const mod = compilar(opts.code, api);
  if(!mod.Heroi) return {erro:'A classe Heroi não foi encontrada no seu código.'};
  const heroi = new mod.Heroi(mapa.spawn.x, mapa.spawn.y);
  const st = {heroi, mapa, sis:opts.sistemas||{}, frame:0, vitoria:false, invencivel:0};
  const teclas = new Teclas();
  const g = new PincelFake();
  for(let f=0; f<(opts.frames||60); f++){
    teclas.esquerda=false; teclas.direita=false; teclas.pulo=false;
    if(opts.roteiro) opts.roteiro(teclas, f, heroi);
    passo(st, teclas);
  }
  if(heroi.desenhar) heroi.desenhar(g);
  return {heroi, pincel:g, mapa, vitoria:st.vitoria, mod};
}
/* ---------- palco ao vivo ---------- */
const loops = {};
function jogar(id, opts){
  const d = W.document;
  const src = d.getElementById(id);
  const cv = d.getElementById(id+'-canvas');
  const out = d.getElementById(id+'-out');
  if(!cv) return;
  if(loops[id]){ cancelAnimationFrame(loops[id].raf); d.removeEventListener('keydown',loops[id].kd); d.removeEventListener('keyup',loops[id].ku); }
  let st, api, mod, heroi, fundo=null;
  try{
    const mapa = parseMapa(opts.mapa);
    api = fazerMundoAPI(mapa);
    mod = compilar(src ? src.value : '', api);
    const H = mod.Heroi || compilar('', api).Heroi;
    heroi = new H(mapa.spawn.x, mapa.spawn.y);
    if(mod.Fundo) fundo = new mod.Fundo();
    st = {heroi, mapa, sis:opts.sistemas||{}, frame:0, vitoria:false, invencivel:0};
    if(out){ out.textContent = '✅ Código compilado! Use ◀ ▶ e ESPAÇO (ou os botões na tela).'; out.classList.remove('jb-err'); }
  }catch(e){
    if(out){ out.textContent = '💥 ' + (e.message||e); out.classList.add('jb-err'); }
    return;
  }
  if(opts.sons!==false){
    try{
      const AC = W.AudioContext||W.webkitAudioContext;
      st.ac = st.ac || new AC();
      st.beep = (freq)=>{ try{ const o=st.ac.createOscillator(), ga=st.ac.createGain();
        o.frequency.value=freq; o.type='square'; ga.gain.value=.06;
        o.connect(ga); ga.connect(st.ac.destination); o.start(); o.stop(st.ac.currentTime+.09);}catch(e){} };
    }catch(e){}
  }
  const ctx = cv.getContext('2d');
  const cam = {x:0, y:0};
  const g = new PincelCanvas(ctx, cam);
  const teclas = new Teclas();
  const kd = e=>{ if(['ArrowLeft','a','A'].includes(e.key)) teclas.esquerda=true;
                  if(['ArrowRight','d','D'].includes(e.key)) teclas.direita=true;
                  if([' ','ArrowUp','w','W'].includes(e.key)){ teclas.pulo=true; e.preventDefault(); } };
  const ku = e=>{ if(['ArrowLeft','a','A'].includes(e.key)) teclas.esquerda=false;
                  if(['ArrowRight','d','D'].includes(e.key)) teclas.direita=false;
                  if([' ','ArrowUp','w','W'].includes(e.key)) teclas.pulo=false; };
  d.addEventListener('keydown',kd); d.addEventListener('keyup',ku);
  // botões touch
  const wrap = cv.parentElement;
  if(!wrap.querySelector('.pe-touch')){
    const tw = d.createElement('div'); tw.className='pe-touch';
    [['◀','esquerda'],['▶','direita'],['⭡ PULAR','pulo']].forEach(([rot,prop])=>{
      const b = d.createElement('button'); b.textContent = rot; b.className='pe-tb'+(prop==='pulo'?' pe-tb-pulo':'');
      const on = ev=>{ ev.preventDefault(); teclas[prop]=true; };
      const off = ev=>{ ev.preventDefault(); teclas[prop]=false; };
      b.addEventListener('pointerdown',on); b.addEventListener('pointerup',off); b.addEventListener('pointerleave',off);
      tw.appendChild(b);
    });
    wrap.appendChild(tw);
  }
  function desenharMundo(){
    const wpx = cv.width, hpx = cv.height, mapa = st.mapa;
    const grad = ctx.createLinearGradient(0,0,0,hpx);
    grad.addColorStop(0,'#8EC5FF'); grad.addColorStop(1,'#DFF1FF');
    ctx.fillStyle = grad; ctx.fillRect(0,0,wpx,hpx);
    if(fundo && fundo.desenhar){ try{ fundo.desenhar(g, st.frame); }catch(e){} }
    else { ctx.fillStyle='#FDE68A'; ctx.beginPath(); ctx.arc(wpx-70-cam.x*.2, 60, 30, 0, 7); ctx.fill(); }
    mapa.solidos.forEach(k=>{
      const [cx,cy] = k.split(',').map(Number);
      const x = cx*TILE-cam.x, y = cy*TILE-cam.y;
      if(x<-TILE||x>wpx) return;
      ctx.fillStyle = mapa.solidos.has(cx+','+(cy-1)) ? '#8B5A2B' : '#22C55E';
      ctx.fillRect(x,y,TILE,TILE);
      ctx.fillStyle='rgba(0,0,0,.08)'; ctx.fillRect(x,y+TILE-6,TILE,6);
    });
    if(st.sis.moedas) mapa.moedas.forEach(mo=>{ if(!mo.pega){
      ctx.fillStyle='#F59E0B'; ctx.beginPath();
      const r = 7+Math.sin(st.frame/8)*1.5;
      ctx.arc(mo.x-cam.x, mo.y-cam.y, r, 0, 7); ctx.fill();
      ctx.fillStyle='#FDE68A'; ctx.beginPath(); ctx.arc(mo.x-cam.x-2, mo.y-cam.y-2, r*.4, 0, 7); ctx.fill();
    }});
    if(st.sis.inimigos) mapa.inimigos.forEach(ini=>{ if(ini.vivo){
      ctx.fillStyle='#EF4444'; ctx.fillRect(ini.x-cam.x, ini.y-cam.y, ini.w, ini.h);
      ctx.fillStyle='white'; ctx.fillRect(ini.x-cam.x+5, ini.y-cam.y+7, 5, 5); ctx.fillRect(ini.x-cam.x+16, ini.y-cam.y+7, 5, 5);
      ctx.fillStyle='#7F1D1D'; ctx.fillRect(ini.x-cam.x+4, ini.y-cam.y+18, ini.w-8, 3);
    }});
    if(st.sis.bandeira && mapa.bandeira){
      const b = mapa.bandeira;
      ctx.fillStyle='#94A3B8'; ctx.fillRect(b.x-cam.x, b.y-cam.y-32, 4, 64);
      ctx.fillStyle = st.vitoria ? '#22C55E' : '#7C4DFF';
      ctx.beginPath(); ctx.moveTo(b.x+4-cam.x, b.y-cam.y-32);
      ctx.lineTo(b.x+30-cam.x, b.y-cam.y-22); ctx.lineTo(b.x+4-cam.x, b.y-cam.y-12); ctx.fill();
    }
    try{ if(heroi.desenhar) heroi.desenhar(g); }catch(e){}
    // HUD
    ctx.fillStyle='rgba(20,31,60,.75)'; ctx.fillRect(8,8,170,30);
    ctx.fillStyle='white'; ctx.font='bold 14px system-ui';
    ctx.fillText('⭐ '+(heroi.pontos||0)+'   ❤️ '+(typeof heroi.vidas==='number'?heroi.vidas:'-')+'   ⏱ '+Math.floor(st.frame/60)+'s', 16, 28);
    if(st.vitoria){
      ctx.fillStyle='rgba(20,31,60,.82)'; ctx.fillRect(0,hpx/2-46,wpx,92);
      ctx.fillStyle='#FDE68A'; ctx.font='bold 30px system-ui'; ctx.textAlign='center';
      ctx.fillText('🏁 FASE COMPLETA!', wpx/2, hpx/2+2);
      ctx.font='14px system-ui'; ctx.fillStyle='white';
      ctx.fillText('⭐ '+(heroi.pontos||0)+' pontos — aperte ▶ Rodar para jogar de novo', wpx/2, hpx/2+28);
      ctx.textAlign='left';
    }
    if(typeof heroi.vidas==='number' && heroi.vidas<=0){
      ctx.fillStyle='rgba(127,29,29,.85)'; ctx.fillRect(0,hpx/2-40,wpx,80);
      ctx.fillStyle='white'; ctx.font='bold 26px system-ui'; ctx.textAlign='center';
      ctx.fillText('💀 GAME OVER — rode de novo!', wpx/2, hpx/2+8); ctx.textAlign='left';
    }
  }
  function frame(){
    if(!(typeof heroi.vidas==='number' && heroi.vidas<=0) && !st.vitoria) passo(st, teclas);
    if(opts.sistemas && opts.sistemas.camera){
      cam.x = Math.max(0, Math.min(heroi.x - cv.width/2 + 12, st.mapa.larguraPx - cv.width));
    }
    desenharMundo();
    loops[id].raf = requestAnimationFrame(frame);
  }
  loops[id] = {raf:0, kd, ku};
  frame();
}
W.PlatEngine = { TILE, Fisica, parseMapa, solidoEm, colideRet, chaoY, compilar, fazerMundoAPI, simular, jogar, Teclas };
if (typeof module!=='undefined' && module.exports) module.exports = W.PlatEngine;
})();
