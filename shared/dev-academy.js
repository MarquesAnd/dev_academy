/* DEV ACADEMY · núcleo compartilhado (auth + progresso + UI) */
window.DA = (function(){
  const RANKS = [[0,'Estagiário(a) 🌱'],[150,'Corretor(a) ✏️'],[300,'Aplicador(a) 🧪'],[450,'Neuropsicólogo(a) 🧠'],[600,'Diretor(a) Clínico(a) 👑']];
  let sb = null, user = null;

  function lib(){
    return new Promise(res=>{
      if(window.supabase && window.supabase.createClient) return res(true);
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
      s.onload = ()=>res(true); s.onerror = ()=>res(false);
      document.head.appendChild(s);
      setTimeout(()=>res(!!(window.supabase && window.supabase.createClient)), 8000);
    });
  }
  async function client(){
    if(sb) return sb;
    if(!(window.SUPABASE_CONFIG && SUPABASE_CONFIG.url && SUPABASE_CONFIG.anonKey)) throw { code:'config' };
    if(!await lib()) throw { code:'lib' };
    sb = window.supabase.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey);
    return sb;
  }
  async function session(){
    const c = await client();
    const { data } = await c.auth.getSession();
    user = (data && data.session) ? data.session.user : null;
    return user;
  }
  async function requireAuth(){
    try{
      const u = await session();
      if(!u){ location.replace('index.html'); return null; }
      document.body.classList.remove('locked');
      return u;
    }catch(e){ location.replace('index.html'); return null; }
  }
  function traduzAuth(msg){
    msg = String(msg||'');
    if(/Invalid login credentials/i.test(msg)) return 'E-mail ou senha não conferem. (O porteiro é literal — confere a digitação!)';
    if(/at least 6|Password should/i.test(msg)) return 'A senha precisa de pelo menos 6 caracteres.';
    if(/already registered/i.test(msg)) return 'Esse e-mail já tem conta — use o botão Entrar.';
    if(/valid email|invalid format/i.test(msg)) return 'Esse e-mail não parece válido.';
    if(/rate limit/i.test(msg)) return 'Muitas tentativas seguidas — respira 1 minuto e tenta de novo.';
    return 'A nuvem respondeu: ' + msg;
  }
  async function login(email, pass){
    const c = await client();
    const { data, error } = await c.auth.signInWithPassword({ email, password: pass });
    if(error) return { error: traduzAuth(error.message) };
    user = data.user; return { user };
  }
  async function signup(email, pass, nome){
    const c = await client();
    const { data, error } = await c.auth.signUp({ email, password: pass, options: { data: { nome: nome||'' } } });
    if(error) return { error: traduzAuth(error.message) };
    if(data && data.session){ user = data.user; return { user }; }
    return { confirmar: true };
  }
  async function logout(){
    try{ const c = await client(); await c.auth.signOut(); }catch(e){}
    user = null; location.replace('index.html');
  }
  async function loadProgress(cursoId){
    try{
      const c = await client();
      const { data, error } = await c.from('progresso_cursos').select('estado').eq('user_id', user.id).eq('curso_id', cursoId).maybeSingle();
      if(error) return { estado:{}, error: error.message };
      return { estado: (data && data.estado) || {} };
    }catch(e){ return { estado:{}, error: String(e.message||e.code||e) }; }
  }
  async function saveProgress(cursoId, estado){
    try{
      const c = await client();
      const { error } = await c.from('progresso_cursos').upsert(
        { user_id: user.id, curso_id: cursoId, estado, atualizado_em: new Date().toISOString() },
        { onConflict: 'user_id,curso_id' });
      return { error: error ? error.message : null };
    }catch(e){ return { error: String(e.message||e.code||e) }; }
  }
  async function listProgress(){
    try{
      const c = await client();
      const { data, error } = await c.from('progresso_cursos').select('curso_id, estado, atualizado_em').eq('user_id', user.id);
      if(error) return { rows: [], error: error.message };
      return { rows: data || [] };
    }catch(e){ return { rows: [], error: String(e.message||e.code||e) }; }
  }
  function nome(){
    if(!user) return '';
    return (user.user_metadata && user.user_metadata.nome) ? user.user_metadata.nome : (user.email||'').split('@')[0];
  }
  function rankFor(xp){ let r = RANKS[0][1]; RANKS.forEach(x=>{ if(xp>=x[0]) r = x[1]; }); return r; }
  function toast(msg){
    let t = document.querySelector('.da-toast');
    if(!t){ t = document.createElement('div'); t.className = 'da-toast'; document.body.appendChild(t); }
    t.innerHTML = msg; t.classList.add('show');
    clearTimeout(t._tm); t._tm = setTimeout(()=>t.classList.remove('show'), 2600);
  }
  function confetti(){
    const e = ['🎉','✨','⭐','🎊','💜','💙'];
    for(let i=0;i<16;i++){
      const s = document.createElement('span'); s.className='cf';
      s.textContent = e[Math.floor(Math.random()*e.length)];
      s.style.left = (35+Math.random()*30)+'vw';
      s.style.bottom = (10+Math.random()*20)+'vh';
      s.style.animationDelay = (Math.random()*.35)+'s';
      document.body.appendChild(s);
      setTimeout(()=>s.remove(), 2100);
    }
  }
  function nav(active){
    const el = document.createElement('div'); el.className = 'da-nav';
    el.innerHTML =
      '<a class="da-logo" href="index.html"><span class="da-ast">✱</span><span>Dev <span style="font-weight:400;opacity:.85">Academy</span></span></a>'+
      '<div class="da-links">'+
      '<a href="index.html" class="'+(active==='home'?'on':'')+'">🏠 Principal</a>'+
      '<a href="cursos.html" class="'+(active==='cursos'?'on':'')+'">📚 Cursos</a>'+
      '<a href="certificados.html" class="'+(active==='certificados'?'on':'')+'">🎓 Certificados</a>'+
      '</div>'+
      '<button class="da-user" onclick="if(window.confirm(\'Sair da conta?\'))DA.logout()">👤 '+nome()+' · sair</button>';
    document.body.prepend(el);
  }
  return { RANKS, rankFor, session, requireAuth, login, signup, logout, loadProgress, saveProgress, listProgress, nome, toast, confetti, nav, getUser: ()=>user };
})();
