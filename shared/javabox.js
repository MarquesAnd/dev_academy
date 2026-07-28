/* JavaBox — o laboratório Java da Dev Academy.
   Transpila um subconjunto didático de Java para JS e executa com runtime fiel.
   Não é um JDK: é um simulador de ensino. O curso avisa as diferenças. */
(function(){
const W = (typeof window!=='undefined') ? window : globalThis;

/* ---------- utilidades de parsing ---------- */
function protectStrings(s){
  const strs=[];
  s = s.replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g, m=>{ strs.push(m); return '\u0001'+(strs.length-1)+'\u0001'; });
  return {s, strs};
}
function restoreStrings(s, strs){
  return s.replace(/\u0001(\d+)\u0001/g, (m,i)=>strs[+i]);
}
function balancedParen(s, open){ // índice do '(' → índice do ')' correspondente
  let d=0;
  for(let i=open;i<s.length;i++){
    if(s[i]==='(') d++;
    else if(s[i]===')'){ d--; if(d===0) return i; }
  }
  return -1;
}
function injectGuards(code){
  let out='', i=0;
  while(i<code.length){
    const m = /\b(while|for|do)\b/.exec(code.slice(i));
    if(!m){ out+=code.slice(i); break; }
    const at = i+m.index;
    out += code.slice(i, at+m[1].length);
    i = at+m[1].length;
    if(m[1]==='do'){
      const rest = code.slice(i);
      const brace = rest.match(/^\s*\{/);
      if(brace){ out += rest.slice(0,brace[0].length) + '__lg();'; i += brace[0].length; }
      continue;
    }
    const p = code.indexOf('(', i);
    if(p<0){ continue; }
    const q = balancedParen(code, p);
    if(q<0){ continue; }
    out += code.slice(i, q+1);
    i = q+1;
    const rest = code.slice(i);
    const brace = rest.match(/^\s*\{/);
    if(brace){ out += rest.slice(0,brace[0].length) + '__lg();'; i += brace[0].length; }
  }
  return out;
}
/* passada estrutural: campos de classe + definições de método */
const KW_TIPO_BLOQ = new Set(['return','new','else','case','throw','typeof','instanceof','do','in','of','let','const','function','await','delete','static']);
const KW_NOME_BLOQ = new Set(['if','for','while','switch','catch']);
function structurePass(code){
  const lines = code.split('\n');
  const stack=[];
  const reMet = /^(\s*)(static\s+)?([A-Za-z_$][\w$]*(?:\[\])*)\s+([a-zA-Z_$][\w$]*)\s*\(([^)]*)\)\s*\{(.*)$/;
  for(let li=0; li<lines.length; li++){
    let line = lines[li];
    const top = stack[stack.length-1];
    if(top==='class'){
      const cut = line.indexOf('{');
      const head = cut>=0 ? line.slice(0,cut) : line;
      const tail = cut>=0 ? line.slice(cut) : '';
      line = head.replace(/\blet\s+/g,'') + tail;
    }
    const m = reMet.exec(line);
    if(m && !KW_TIPO_BLOQ.has(m[3]) && !KW_NOME_BLOQ.has(m[4]) && m[3]!=='constructor'){
      if(top==='class') line = m[1]+(m[2]||'')+m[4]+'('+m[5]+') {'+m[6];
      else line = m[1]+'function '+m[4]+'('+m[5]+') {'+m[6];
    }
    lines[li]=line;
    for(let c=0;c<line.length;c++){
      if(line[c]==='{'){
        if(/\bclass\s+\w+[^{]*$/.test(line.slice(0,c))) stack.push('class');
        else if(stack[stack.length-1]==='class') stack.push('member');
        else stack.push('block');
      } else if(line[c]==='}') stack.pop();
    }
  }
  return lines.join('\n');
}
/* cast (int) com parênteses balanceados */
function castFix(code){
  let i;
  while((i = code.indexOf('(int)')) >= 0){
    let j = i+5;
    while(code[j]===' ') j++;
    if(code[j]==='('){
      const q = balancedParen(code, j);
      code = code.slice(0,i) + 'Math.trunc(' + code.slice(j+1,q) + ')' + code.slice(q+1);
    } else {
      const m = /^[\w.$\[\]]+/.exec(code.slice(j));
      if(m) code = code.slice(0,i) + 'Math.trunc(' + m[0] + ')' + code.slice(j+m[0].length);
      else code = code.slice(0,i) + code.slice(i+5);
    }
  }
  return code;
}

/* ---------- o transpiler ---------- */
function transpile(src){
  let {s, strs} = protectStrings(src);
  // fora: package/import/annotations/throws
  s = s.replace(/^\s*(package|import)\s+[^;]+;\s*$/gm,'');
  s = s.replace(/@\w+\s*/g,'');
  s = s.replace(/\bthrows\s+[\w.,\s]+(?=\{)/g,'');
  // assinaturas puras de interface (sem corpo)
  s = s.replace(/^\s*[\w<>\[\]]+\s+\w+\s*\([^)]*\)\s*;\s*$/gm,'');
  s = s.replace(/\binterface\b/g,'class');
  // saída
  s = s.replace(/System\.out\.println/g,'__println');
  s = s.replace(/System\.out\.printf/g,'__printf');
  s = s.replace(/System\.out\.print/g,'__print');
  // main
  const temClasse = /\bclass\s+\w+/.test(s);
  if(temClasse){
    s = s.replace(/public\s+static\s+void\s+main\s*\(\s*String\s*\[\]\s*\w*\s*\)/,'static main(args)');
  } else {
    s = s.replace(/public\s+static\s+void\s+main\s*\(\s*String\s*\[\]\s*\w*\s*\)/,'function __main()');
  }
  // modificadores (static fica — JS tem!)
  s = s.replace(/\b(public|private|protected|final|abstract)\s+/g,'');
  s = s.replace(/\bimplements\s+[\w<>,.\s]+?(?=\{)/g,'');
  // catch (Tipo e) → catch (e)
  s = s.replace(/catch\s*\(\s*[\w.|\s]+\s+(\w+)\s*\)/g,'catch($1)');
  // for-each
  s = s.replace(/for\s*\(\s*[\w<>\[\]]+\s+(\w+)\s*:\s*([^)]+)\)/g,'for (let $1 of $2)');
  // new arrays
  s = s.replace(/new\s+[\w]+\s*\[([^\]\[]+)\]\s*\[([^\]\[]+)\]/g,'__mat2($1,$2)');
  s = s.replace(/new\s+(int|long|short|byte)\s*\[([^\]]+)\]/g,'new Array($2).fill(0)');
  s = s.replace(/new\s+(double|float)\s*\[([^\]]+)\]/g,'new Array($2).fill(0.0)');
  s = s.replace(/new\s+boolean\s*\[([^\]]+)\]/g,'new Array($1).fill(false)');
  s = s.replace(/new\s+(String|char)\s*\[([^\]]+)\]/g,'new Array($2).fill("")');
  s = s.replace(/new\s+(\w+)\s*\[([^\]]+)\]/g,'new Array($2).fill(null)');
  // generics fora
  s = s.replace(/\b(ArrayList|HashMap|HashSet|List|Map|Set)\s*<[^<>]*(?:<[^<>]*>)?[^<>]*>/g,'$1');
  // Scanner(System.in)
  s = s.replace(/new\s+Scanner\s*\(\s*System\.in\s*\)/g,'new Scanner()');
  // construtores: NomeDaClasse( no início de linha → constructor(
  const classNames = [...s.matchAll(/\bclass\s+(\w+)/g)].map(m=>m[1]);
  classNames.forEach(n=>{
    s = s.replace(new RegExp('^([ \\t]*)'+n+'\\s*\\(','gm'), '$1constructor(');
  });
  // parâmetros: "Tipo nome" antes de , ou )
  s = s.replace(/\b([A-Za-z_$][\w$]*(?:\[\])*)\s+([a-z_$][\w$]*)\s*(?=[,)])/g, (m,t,v)=>{
    if(t==='return'||t==='new'||t==='typeof'||t==='of'||t==='in'||t==='let'||t==='const'||t==='case'||t==='instanceof'||t==='throw'||t==='else') return m;
    return v;
  });
  // declarações: tipos primitivos + conhecidos + classes do código
  const tipos = ['int','long','double','float','short','byte','boolean','char','var','String','Object','Integer','Double','Boolean','Character',
                 'ArrayList','HashMap','HashSet','List','Map','Set','Random','Scanner','Exception','RuntimeException', ...classNames];
  const T = tipos.join('|');
  // com atribuição (ou for-each residual)
  s = s.replace(new RegExp('\\b(?:'+T+')(?:\\[\\])*\\s+([a-zA-Z_$][\\w$]*)\\s*(?==|:)','g'),'let $1 ');
  // sem valor: defaults do Java (int→0, boolean→false, objetos→null)
  s = s.replace(new RegExp('\\b(?:int|long|short|byte|double|float)\\s+([a-zA-Z_$][\\w$]*)\\s*;','g'),'let $1 = 0;');
  s = s.replace(/\bboolean\s+([a-zA-Z_$][\w$]*)\s*;/g,'let $1 = false;');
  s = s.replace(new RegExp('\\b(?:'+T+')(?:\\[\\])*\\s+([a-zA-Z_$][\\w$]*)\\s*;','g'),'let $1 = null;');
  // genérica: TipoCustom ident
  s = s.replace(/\b[A-Z]\w*(?:\[\])*\s+([a-z_$][\w$]*)\s*(?==)/g,'let $1 ');
  s = s.replace(/\b[A-Z]\w*(?:\[\])*\s+([a-z_$][\w$]*)\s*;/g,'let $1 = null;');
  // literais de array (1 nível)
  s = s.replace(/(=\s*)\{([^;{}]*)\}(\s*;)/g,'$1[$2]$3');
  // strings/idiomas
  s = s.replace(/\.length\s*\(\s*\)/g,'.length');
  s = s.replace(/\.equalsIgnoreCase\s*\(/g,'.__eqi(');
  s = s.replace(/\.replace\s*\(/g,'.replaceAll(');
  s = s.replace(/\.equals\s*\(/g,'.__eq(');
  s = s.replace(/\bInteger\.parseInt\b/g,'parseInt');
  s = s.replace(/\bDouble\.parseDouble\b/g,'parseFloat');
  s = s.replace(/\bString\.valueOf\b/g,'String');
  s = s.replace(/\bString\.format\b/g,'__fmt');
  s = s.replace(/\bMath\.floorDiv\b/g,'__fdiv');
  // casts
  s = castFix(s);
  s = s.replace(/\((double|float|long|char)\)\s*/g,'');
  // enum
  s = s.replace(/\benum\s+(\w+)\s*\{([^}]*)\}/g,(m,n,body)=>'const '+n+' = __enum("'+n+'","'+body.replace(/\s/g,'')+'");');
  s = restoreStrings(s, strs);
  s = structurePass(s);
  s = injectGuards(s);
  // chamador
  let caller='';
  if(temClasse && /\bstatic main\s*\(/.test(s)){
    const mainAt = s.search(/\bstatic main\s*\(/);
    let cls=null;
    for(const m of s.matchAll(/\bclass\s+(\w+)/g)){ if(m.index<mainAt) cls=m[1]; }
    if(cls) caller = '\n;'+cls+'.main([]);';
  } else if(/function __main\b/.test(s)){
    caller = '\n;__main();';
  }
  return s + caller;
}

/* ---------- runtime ---------- */
const RUNTIME = `
let __out=[]; let __ops=0;
function __lg(){ if(++__ops>200000) throw new Error("⏱ Loop demais! O JavaBox parou seu código depois de 200.000 voltas — provável loop infinito. Confira a condição de parada."); }
function __str(x){
  if(x===null||x===undefined) return "null";
  if(Array.isArray(x)) return "["+x.map(__str).join(", ")+"]";
  if(typeof x==="number" && !Number.isInteger(x)) return String(Math.round(x*1e9)/1e9);
  return String(x);
}
function __print(...a){ __out.push(a.map(__str).join("")); }
function __println(...a){ __out.push((a.length?a.map(__str).join(""):"")+"\\n"); }
function __fmt(f,...a){ let i=0;
  return String(f).replace(/%(\\.\\d+)?[dsfbn%]/g, m=>{
    if(m==="%%") return "%"; if(m==="%n") return "\\n";
    const v=a[i++];
    if(m==="%d") return String(Math.trunc(v));
    if(m==="%s") return __str(v);
    if(m==="%b") return String(!!v);
    const p=m.match(/%\\.(\\d+)f/); if(p) return Number(v).toFixed(+p[1]);
    if(m==="%f") return Number(v).toFixed(6);
    return m;
  });
}
function __printf(f,...a){ __out.push(__fmt(f,...a)); }
function __fdiv(a,b){ return Math.floor(a/b); }
function __mat2(r,c){ return Array.from({length:r},()=>new Array(c).fill(0)); }
function __enum(nome, corpo){
  const o={}; const nomes=corpo.split(",").filter(Boolean);
  nomes.forEach((n,i)=>{ o[n]={name:()=>n, ordinal:()=>i, toString:()=>n}; });
  o.values=()=>nomes.map(n=>o[n]);
  return Object.freeze(o);
}
String.prototype.__eq=function(o){ return String(this)===String(o); };
String.prototype.contains=function(x){ return this.includes(x); };
String.prototype.isEmpty=function(){ return this.length===0; };
String.prototype.__eqi=function(o){ return String(this).toLowerCase()===String(o).toLowerCase(); };
Number.prototype.__eq=function(o){ return Number(this)===Number(o); };
class ArrayList{
  constructor(outro){ this.a = outro ? [...(outro.a||outro)] : []; }
  add(x,y){ if(y===undefined) this.a.push(x); else this.a.splice(x,0,y); return true; }
  get(i){ if(i<0||i>=this.a.length) throw new Error("IndexOutOfBounds: índice "+i+" numa lista de tamanho "+this.a.length); return this.a[i]; }
  set(i,x){ this.a[i]=x; } size(){ return this.a.length; }
  remove(i){ return (typeof i==="number") ? this.a.splice(i,1)[0] : (this.a.splice(this.a.indexOf(i),1),true); }
  contains(x){ return this.a.some(v=>v&&v.__eq?v.__eq(x):v===x); }
  indexOf(x){ return this.a.findIndex(v=>v&&v.__eq?v.__eq(x):v===x); }
  isEmpty(){ return this.a.length===0; } clear(){ this.a=[]; }
  toString(){ return "["+this.a.map(__str).join(", ")+"]"; }
  [Symbol.iterator](){ return this.a[Symbol.iterator](); }
  __eq(o){ return String(this)===String(o); }
}
class HashMap{
  constructor(){ this.m=new Map(); }
  put(k,v){ this.m.set(k,v); } get(k){ return this.m.has(k)?this.m.get(k):null; }
  containsKey(k){ return this.m.has(k); } remove(k){ const v=this.m.get(k); this.m.delete(k); return v; }
  size(){ return this.m.size; } isEmpty(){ return this.m.size===0; }
  keySet(){ return new ArrayList([...this.m.keys()]); } values(){ return new ArrayList([...this.m.values()]); }
  toString(){ return "{"+[...this.m.entries()].map(([k,v])=>k+"="+__str(v)).join(", ")+"}"; }
}
class HashSet{
  constructor(){ this.s=new Set(); }
  add(x){ const t=this.s.has(x); this.s.add(x); return !t; }
  contains(x){ return this.s.has(x); } size(){ return this.s.size; }
  remove(x){ return this.s.delete(x); }
  toString(){ return "["+[...this.s].map(__str).join(", ")+"]"; }
  [Symbol.iterator](){ return this.s[Symbol.iterator](); }
}
const List=ArrayList;
class Scanner{
  next(){ return __nextTok(); }
  nextInt(){ return parseInt(__nextTok()); }
  nextDouble(){ return parseFloat(__nextTok().replaceAll(",",".")); }
  nextBoolean(){ return __nextTok()==="true"; }
  nextLine(){ return __nextLn(); }
  close(){}
}
class Random{
  constructor(seed){ this.s = (seed===undefined) ? Math.floor(Math.random()*2147483647) : (seed>>>0)||1; }
  _n(){ this.s = (this.s*1103515245 + 12345) & 0x7fffffff; return this.s; }
  nextInt(n){ return n===undefined ? this._n() : this._n()%n; }
  nextDouble(){ return this._n()/2147483647; }
  nextBoolean(){ return this._n()%2===0; }
}
class Exception extends Error{ constructor(m){ super(m); this.name="Exception"; } getMessage(){ return this.message; } }
class RuntimeException extends Exception{ constructor(m){ super(m); this.name="RuntimeException"; } }
class IllegalArgumentException extends RuntimeException{ constructor(m){ super(m); this.name="IllegalArgumentException"; } }
class ArithmeticException extends RuntimeException{ constructor(m){ super(m); this.name="ArithmeticException"; } }
const Integer={ parseInt:(s)=>parseInt(s), MAX_VALUE:2147483647, MIN_VALUE:-2147483648, valueOf:(s)=>parseInt(s) };
const Character={ isDigit:c=>/^[0-9]$/.test(c), isLetter:c=>/^[a-zA-ZÀ-ú]$/.test(c), toUpperCase:c=>String(c).toUpperCase(), toLowerCase:c=>String(c).toLowerCase() };
const Arrays={ toString:(a)=>"["+a.map(__str).join(", ")+"]", sort:(a)=>a.sort((x,y)=>x<y?-1:x>y?1:0) };
`;

function run(src, inputsText){
  let code;
  try{ code = transpile(src); }
  catch(e){ return {ok:false, out:'', err:'Erro de tradução: '+e.message}; }
  const linhas = String(inputsText||'').split('\n').map(l=>l.trim()).filter(l=>l.length);
  const io = `
let __BUF=[];
function __needIn(){ throw new Error("⌨️ O programa pediu uma entrada, mas a caixa de Entradas acabou. Escreva as respostas lá (uma por linha) e rode de novo."); }
function __nextTok(){ if(__BUF.length===0){ if(__LN.length===0) __needIn(); __BUF = __LN.shift().split(/\\s+/).filter(t=>t.length); if(__BUF.length===0) return __nextTok(); } return __BUF.shift(); }
function __nextLn(){ if(__BUF.length){ const r=__BUF.join(" "); __BUF=[]; return r; } if(__LN.length===0) __needIn(); return __LN.shift(); }
`;
  try{
    const fn = new Function('__LN', RUNTIME + io + '\n' + code + '\nreturn __out.join("");');
    const out = fn([...linhas]);
    return {ok:true, out, err:null, code};
  }catch(e){
    return {ok:false, out:'', err:(e && e.message) ? e.message : String(e), code};
  }
}

/* ---------- UI ---------- */
function jbRun(id){
  const d = W.document;
  const srcEl = d.getElementById(id);
  const inEl = d.getElementById(id+'-in');
  const outEl = d.getElementById(id+'-out');
  if(!srcEl||!outEl) return;
  const r = run(srcEl.value, inEl ? inEl.value : '');
  if(r.ok){
    outEl.textContent = r.out.length ? r.out : '(o programa rodou, mas não imprimiu nada — cadê o System.out.println? 😄)';
    outEl.classList.remove('jb-err');
  } else {
    outEl.textContent = '💥 ' + r.err;
    outEl.classList.add('jb-err');
  }
  return r;
}
W.JavaBox = { transpile, run, jbRun };
W.jbRun = jbRun;
if (typeof module!=='undefined' && module.exports) module.exports = W.JavaBox;
})();
