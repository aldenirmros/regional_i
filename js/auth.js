// ══ AUTH.JS ══

function doLogin(){
  const uname = document.getElementById('li-user').value.trim().toLowerCase();
  const pass  = document.getElementById('li-pass').value;
  const remember = document.getElementById('li-remember')?.checked;
  const err   = document.getElementById('li-err');

  // ── Tabela de credenciais canônicas ─────────────────────────────────────────
  // Contém APENAS username + password para autenticação offline garantida.
  // timeId / regionalId / nome / id NUNCA sobrescrevem o que vier do DB.users
  // (Sheets é a fonte de verdade para dados estruturais).
  const CREDS = [
    {username:'gerente',   password:'gerente123', id:1,               role:'gerente',    nome:'Gerente Geral',     regionalId:null,         timeId:null,            color:'#7c3aed'},
    {username:'aldenir',   password:'@RThur20',   id:1002,            role:'regional',   nome:'Aldenir',           regionalId:1001,         timeId:null,            color:'#7c3aed', superAdmin:true},
    {username:'guilherme', password:'12345',       id:1777686429084,   role:'supervisor', nome:'Guilherme Queiroz', regionalId:1001,         timeId:1777686429083,   color:'#059669'},
    {username:'aline',     password:'12345',       id:1777691424503,   role:'supervisor', nome:'Aline Ysline',      regionalId:1001,         timeId:1777691424502,   color:'#059669'},
    {username:'kesse',     password:'12345',       id:1777691452228,   role:'supervisor', nome:'Kesse Jhones',      regionalId:1001,         timeId:1777691452227,   color:'#059669'},
    {username:'anderson',  password:'12345',       id:1777691488522,   role:'supervisor', nome:'Anderson Brito',    regionalId:1001,         timeId:1777691488521,   color:'#059669'},
    {username:'dougllas',  password:'12345',       id:1777691730218,   role:'regional',   nome:'Dougllas',          regionalId:1777691730216,timeId:null,            color:'#059669'},
    {username:'dougllas',  password:'12345',       id:1777691730219,   role:'supervisor', nome:'Dougllas Vidal',    regionalId:1777691730216,timeId:1777691730217,   color:'#059669'},
    {username:'pedro',     password:'123456',      id:1777691830006,   role:'regional',   nome:'Pedro Lavor',       regionalId:1777691830004,timeId:null,            color:'#d97706'},
    {username:'pedro',     password:'12345',       id:1777691830007,   role:'supervisor', nome:'Pedro Lavor',       regionalId:1777691830004,timeId:1777691830005,   color:'#059669'},
    {username:'daniel',    password:'12345',       id:1777692514656,   role:'gerente',    nome:'Daniel Fontes',     regionalId:null,         timeId:null,            color:'#7c3aed'},
    {username:'thiago',    password:'12345',       id:1777692561373,   role:'gerente',    nome:'Thiago Correia',    regionalId:null,         timeId:null,            color:'#7c3aed'},
    // ── Usuários criados via admin — apenas credenciais; dados reais vêm do Sheets ──
    {username:'amaury',    password:'12345'},
    {username:'michella',  password:'12345'},
    {username:'diogo',     password:'12345'},
    {username:'maykon',    password:'12345'},
    {username:'cleyton',   password:'12345'},
    {username:'alex',      password:'12345'},
  ];

  // ── Função auxiliar: mescla cred (seed) com DB.users priorizando Sheets ──
  // DB.users é sempre a fonte de verdade para id, timeId, regionalId, nome, role, color.
  // A tabela CREDS só fornece a senha quando o Sheets não a retorna.
  function _mergeWithDB(seedCred){
    if(!DB.users) return seedCred;
    // Busca por ID exato (usuários seed com ID canônico)
    let dbU = seedCred.id ? DB.users.find(u=>String(u.id)===String(seedCred.id)) : null;
    // Se não achou por ID (usuários admin sem ID fixo), busca por username
    if(!dbU) dbU = DB.users.find(u=>(u.username||'').toLowerCase()===seedCred.username);
    if(!dbU) return seedCred;
    // DB.users vence em tudo exceto senha (que o Sheets omite por segurança)
    return {...seedCred, ...dbU, password: seedCred.password};
  }

  let cred = null;

  // 1ª tentativa: tabela de credenciais canônicas (funciona offline)
  const seedMatch = CREDS.find(c=>c.username===uname && c.password===pass);
  if(seedMatch) cred = _mergeWithDB(seedMatch);

  // 2ª tentativa: DB.users com senha presente (criados via admin com Sheets online)
  if(!cred && DB.users){
    const pwCache = _loadPwCache();
    const dbU = DB.users.find(u=>{
      try{
        if((u.username||'').toLowerCase()!==uname) return false;
        const pw = u.password || pwCache[String(u.id)]?.p || _SEED_CREDS[uname];
        return pw===pass;
      }catch(e){ return false; }
    });
    if(dbU) cred = {...dbU, password: dbU.password||pass};
  }

  if(!cred){ err.classList.add('show'); document.getElementById('li-pass').value=''; return; }
  err.classList.remove('show');

  // Enriquece cred final com DB.users (garante dados mais recentes do Sheets)
  // Usa username como chave secundária — cobre casos em que o ID do seed difere do ID real
  let user = cred;
  if(DB.users){
    const dbUser = DB.users.find(u=>String(u.id)===String(cred.id))
                || DB.users.find(u=>(u.username||'').toLowerCase()===uname);
    if(dbUser) user = {...cred, ...dbUser, password:cred.password};
  }

  if(remember){
    localStorage.setItem('bi_remember',JSON.stringify({u:uname,p:pass}));
  } else {
    localStorage.removeItem('bi_remember');
  }
  setSession(user);
  document.getElementById('login-ov').classList.add('hidden');
  applySession();
  const navEl = document.querySelector('.ni.on') || document.querySelectorAll('.ni')[0];
  const loginBtn = document.querySelector('.login-btn');
  if(loginBtn){ loginBtn.textContent='Carregando…'; loginBtn.disabled=true; }
  cloudPull().then(ok=>{
    if(ok){
      // Atualiza currentUser com dados frescos do Sheets
      const freshUser = DB.users?.find(u=>u.id===currentUser.id)
                     || DB.users?.find(u=>(u.username||'').toLowerCase()===currentUser.username?.toLowerCase());
      if(freshUser){
        currentUser = {...user, ...freshUser, password:user.password};
        setSession(currentUser);
        applySession();
      }
    }
    // FIX: popula seletores ANTES de navegar para o dash
    // Garante que currentUser e DB estejam prontos antes de qualquer render
    populateMes();
    populateQESellers();
    // Usa requestAnimationFrame para garantir layout finalizado antes dos graficos
    requestAnimationFrame(()=>{
      goPage('dash', navEl);
      if(loginBtn){ loginBtn.textContent='Entrar'; loginBtn.disabled=false; }
    });
  }).catch(()=>{
    // Mesmo sem dados da nuvem, renderiza com DB local
    populateMes();
    populateQESellers();
    requestAnimationFrame(()=>{
      goPage('dash', navEl);
      if(loginBtn){ loginBtn.textContent='Entrar'; loginBtn.disabled=false; }
    });
  });
}

function doLogout(){
  clearSession();
  document.getElementById('login-ov').classList.remove('hidden');
  document.getElementById('li-user').value='';
  document.getElementById('li-pass').value='';
  document.getElementById('user-badge').style.display='none';
  const btnAldenir = document.getElementById('btn-criar-usuario');
  if(btnAldenir) btnAldenir.style.display='none';
  const btnVer = document.getElementById('btn-ver-usuarios');
  if(btnVer) btnVer.style.display='none';
}

function applySession(){
  if(!currentUser) return;
  const u=currentUser;
  const isSuperUser = u.superAdmin===true || u.username==='aldenir';
  const colorMap={gerente:'#7c3aed',regional:'#2563eb',supervisor:'#059669'};
  const color = isSuperUser ? '#7c3aed' : (u.color||colorMap[u.role]||'#2563eb');
  const label = u.nome||u.username;
  let roleLabel;
  if(isGerente(u) && u.role!=='gerente'){
    roleLabel = 'Super Admin';
  } else if(u.role==='supervisor'){
    const _tm=(DB.times||[]).find(t=>t.id===u.timeId||String(t.id)===String(u.timeId));
    roleLabel = 'Supervisor' + (_tm ? ` · ${_tm.nome}` : '');
  } else if(u.role==='regional'){
    const _rg=(DB.regionais||[]).find(r=>r.id===u.regionalId||String(r.id)===String(u.regionalId));
    roleLabel = 'Admin Regional' + (_rg ? ` · ${_rg.nome}` : '');
  } else {
    roleLabel = {gerente:'Gerente'}[u.role] || u.role;
  }

  // ── Topbar user badge ──
  const badge = document.getElementById('user-badge');
  const avatarEl = document.getElementById('ub-avatar');
  const nameEl   = document.getElementById('ub-name');
  const roleEl   = document.getElementById('ub-role');
  if(avatarEl){ avatarEl.style.background = isSuperUser ? 'linear-gradient(135deg,#7c3aed,#2563eb)' : color; avatarEl.textContent = label[0].toUpperCase(); }
  if(nameEl) nameEl.textContent = label;
  if(roleEl){
    if(isSuperUser){
      roleEl.innerHTML = `<span class="super-crown">⭐ SUPER</span>`;
    } else {
      roleEl.textContent = roleLabel;
    }
  }
  if(badge){
    if(isSuperUser) badge.classList.add('super-admin');
    else badge.classList.remove('super-admin');
    badge.style.display='flex';
  }

  // ── Navegação ──
  const navRegionais=document.getElementById('nav-regionais');
  if(navRegionais) navRegionais.style.display=isGerente(u)?'':'none';
  const navDb=document.getElementById('nav-db');
  if(navDb) navDb.style.display=(isGerente(u)||u?.superAdmin)?'':'none';

  // Botão "Criar Usuário" exclusivo para Aldenir
  const btnAldenir = document.getElementById('btn-criar-usuario');
  if(btnAldenir) btnAldenir.style.display = isSuperUser ? 'inline-flex' : 'none';

  // Botão "Usuários" para Aldenir e Gerente
  const btnVer = document.getElementById('btn-ver-usuarios');
  if(btnVer) btnVer.style.display = (isGerente(u)) ? 'inline-flex' : 'none';

  // Botão "Reset de Cache" para gerente e admin
  const btnReset = document.getElementById('btn-reset-cache');
  if(btnReset) btnReset.style.display = (isGerente(u)||isSuperUser) ? 'inline-flex' : 'none';

  // ── Escopo inicial ──
  if(isSuperUser){
    // Aldenir: view inicial sempre = CE06 - ALPHA, mas pode ver tudo
    const ce06 = _findCe06(DB, null);
    if(ce06){
      scopeFilter         = {regionalId: ce06.regionalId, timeId: ce06.id};
      lancarHubFilter     = ce06.id;        // Lançar → CE06 por padrão
      lancarRegionalFilter= ce06.regionalId;// Lançar → Regional do CE06
    } else {
      scopeFilter = {regionalId: null, timeId: null};
      lancarHubFilter = null; lancarRegionalFilter = null;
    }
  } else if(u.role==='regional' && !isGerente(u)){
    scopeFilter         = {regionalId: u.regionalId||null, timeId: null};
    lancarHubFilter     = null;
    lancarRegionalFilter= u.regionalId||null;
  } else if(u.role==='supervisor'){
    scopeFilter         = {regionalId: u.regionalId||null, timeId: u.timeId||null};
    lancarHubFilter     = u.timeId||null;
    lancarRegionalFilter= u.regionalId||null;
  } else {
    scopeFilter         = {regionalId: null, timeId: null};
    lancarHubFilter     = null;
    lancarRegionalFilter= null;
  }
  lancarSellerFilter = null;

  populateDashFilter();
}

// ══════════════════════════════════════════════════════════
//  OVERVIEW — Visão Geral por Regional
// ══════════════════════════════════════════════════════════
function onOvRegionalChange(){
  ovRegionalFilter = parseInt(document.getElementById('ov-regional-sel')?.value)||null;
  renderOverview();
}
function clearOvFilter(){
  ovRegionalFilter = null;
  const sel = document.getElementById('ov-regional-sel');
  if(sel) sel.value='';
  renderOverview();
}
