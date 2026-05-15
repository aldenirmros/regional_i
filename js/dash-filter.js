// ══ DASH-FILTER.JS ══

function populateDashFilter(){
  const u = currentUser;
  if(!u) return; // nenhum usuário logado
  const df=document.getElementById('dash-gerente-filter');
  if(!df) return;
  df.style.display='flex';

  // Restaura filtro travado do localStorage (se houver)
  _loadPersistedScopeFilter();

  const rgSel=document.getElementById('df-regional');
  const tmSel=document.getElementById('df-time');
  const clearBtn=document.querySelector('#dash-gerente-filter .btn-sm-g');

  if(u.role==='supervisor'){
    // Supervisor: mostra só o info do HUB, sem selects nem botão limpar
    if(rgSel) rgSel.style.display='none';
    if(tmSel) tmSel.style.display='none';
    if(clearBtn) clearBtn.style.display='none';
    updateDashFilterInfo();
    _updateLockUI();
    return;
  }

  // Reexibe caso tenha ficado oculto de sessão anterior
  if(tmSel) tmSel.style.display='';
  if(clearBtn) clearBtn.style.display='';

  if(rgSel){
    if(u.role==='regional' && !isGerente(u)){
      const myRg = (DB.regionais||[]).find(r=>r.id===u.regionalId);
      rgSel.innerHTML = myRg ? `<option value="${myRg.id}">${myRg.nome}</option>` : '';
      rgSel.value = u.regionalId||'';
      rgSel.style.display='none';
      if(!scopeFilter.regionalId) scopeFilter.regionalId = u.regionalId||null;
    } else {
      rgSel.style.display='';
      const prev = scopeFilter.regionalId || rgSel.value;
      rgSel.innerHTML=`<option value="">🏠 Todas as Regionais (${(DB.regionais||[]).length})</option>`
        +(DB.regionais||[]).map(r=>`<option value="${r.id}"${r.id==prev?' selected':''}>${r.nome}</option>`).join('');
      if(scopeFilter.regionalId) rgSel.value = scopeFilter.regionalId;
    }
  }
  populateDashFilterTimes();
  if(tmSel && scopeFilter.timeId) tmSel.value = scopeFilter.timeId;
  updateDashFilterInfo();
  _updateLockUI();
}

function populateDashFilterTimes(){
  const u = currentUser;
  const rgId = u?.role==='regional' && !isGerente(u)
    ? (u.regionalId||null)  // regional: sempre usa a regional dele
    : (parseInt(document.getElementById('df-regional')?.value)||null);
  const tmSel= document.getElementById('df-time');
  if(!tmSel) return;
  const times= rgId
    ? (DB.times||[]).filter(t=>t.regionalId===rgId)
    : (DB.times||[]);
  const prev = scopeFilter.timeId || parseInt(tmSel.value)||null;
  const label= rgId ? `🏢 Todos os HUBs (${times.length})` : `🏢 Todos os HUBs`;
  tmSel.innerHTML=`<option value="">${label}</option>`
    +times.map(t=>{
      const rg=rgId?null:(DB.regionais||[]).find(r=>r.id===t.regionalId);
      const lbl=rg?`${t.nome} — ${rg.nome}`:t.nome;
      return `<option value="${t.id}"${t.id==prev?' selected':''}>${lbl}</option>`;
    }).join('');
  if(scopeFilter.timeId) tmSel.value = scopeFilter.timeId;
}

function onDashFilterRegional(){
  const rgId=parseInt(document.getElementById('df-regional')?.value)||null;
  scopeFilter={regionalId:rgId, timeId:null};
  _persistScopeFilter();
  populateDashFilterTimes();
  updateDashFilterInfo();
  selectedSeller=null;
  renderDash();
}

function onDashFilterTime(){
  const tmId=parseInt(document.getElementById('df-time')?.value)||null;
  const u=currentUser;
  // Para regional: mantém sempre o regionalId dele; para gerente: usa o select
  const rgId = u?.role==='regional' && !isGerente(u)
    ? (u.regionalId||null)
    : (parseInt(document.getElementById('df-regional')?.value)||null);
  scopeFilter={regionalId:rgId, timeId:tmId};
  _persistScopeFilter();
  updateDashFilterInfo();
  selectedSeller=null;
  renderDash();
}

function clearDashFilter(){
  const u=currentUser;
  // Para regional: limpar = voltar a ver todos os HUBs da regional dele
  const defRgId = (u?.role==='regional' && !isGerente(u)) ? (u.regionalId||null) : null;
  scopeFilter={regionalId:defRgId, timeId:null};
  _persistScopeFilter();
  const rgSel=document.getElementById('df-regional');
  const tmSel=document.getElementById('df-time');
  if(rgSel && isGerente()) rgSel.value='';
  if(tmSel) tmSel.value='';
  updateDashFilterInfo();
  selectedSeller=null;
  renderDash();
}

function _persistScopeFilter(){
  if(!_filterLocked) return;
  try{ localStorage.setItem('bi_scope_filter', JSON.stringify(scopeFilter)); }catch(e){}
}

function _loadPersistedScopeFilter(){
  if(!_filterLocked) return;
  try{
    const s = localStorage.getItem('bi_scope_filter');
    if(s){ const f=JSON.parse(s); if(f&&typeof f==='object'){ scopeFilter={regionalId:f.regionalId||null, timeId:f.timeId||null}; } }
  }catch(e){}
}

function updateDashFilterInfo(){
  const el=document.getElementById('df-info'); if(!el) return;
  const u=currentUser;
  const total=getScopedSellers().length;

  // Supervisor: mostra tag fixa do HUB dele
  if(u?.role==='supervisor'){
    const tm=(DB.times||[]).find(x=>x.id===u.timeId);
    const rg=(DB.regionais||[]).find(x=>x.id===tm?.regionalId);
    const c=rg?.color||'var(--blue)';
    el.innerHTML=`<span class="dash-filter-tag" style="background:${c}18;color:${c};border-color:${c}44">🏢 ${tm?.nome||'Meu HUB'}</span> <span style="font-size:10.5px">${total} HC</span>`;
    return;
  }

  if(scopeFilter.timeId){
    const t=(DB.times||[]).find(x=>x.id===scopeFilter.timeId);
    const rg=(DB.regionais||[]).find(x=>x.id===t?.regionalId);
    el.innerHTML=`<span class="dash-filter-tag" style="background:${rg?.color+'18'||'var(--blue-g)'};color:${rg?.color||'var(--blue)'};border-color:${rg?.color+'44'||'rgba(37,99,235,.2)'}">🏢 ${t?.nome||'Time'}</span> <span style="font-size:10.5px">${total} HC</span>`;
  } else if(scopeFilter.regionalId){
    const r=(DB.regionais||[]).find(x=>x.id===scopeFilter.regionalId);
    el.innerHTML=`<span class="dash-filter-tag" style="background:${r?.color+'18'||'var(--blue-g)'};color:${r?.color||'var(--blue)'};border-color:${r?.color+'44'||'rgba(37,99,235,.2)'}">🏠 ${r?.nome||'Regional'}</span> <span style="font-size:10.5px">${total} HC</span>`;
  } else {
    el.innerHTML=`<span style="font-size:11px;color:var(--tl)">Toda a equipe — ${total} HC</span>`;
  }
}

// ══════════════════════════════════════════════════════════
//  TRAVAR / DESTRAVAR FILTRO DO DASHBOARD
// ══════════════════════════════════════════════════════════
function toggleFilterLock(){
  _filterLocked = !_filterLocked;
  try{ localStorage.setItem('bi_filter_locked', _filterLocked ? '1' : '0'); }catch(e){}
  _updateLockUI();
  toast(_filterLocked ? '🔒 Filtro travado — não resetará ao trocar mês' : '🔓 Filtro destravado', _filterLocked ? '🔒' : '🔓');
}

function _updateLockUI(){
  const btn    = document.getElementById('btn-lock-filter');
  const lbl    = document.getElementById('lock-label');
  const icon   = document.getElementById('lock-icon');
  const bar    = document.getElementById('dash-gerente-filter');
  if(!btn) return;
  if(_filterLocked){
    btn.classList.add('locked');
    if(lbl) lbl.textContent = 'Travado';
    if(icon) icon.innerHTML = '<rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>';
    if(bar)  bar.classList.add('filter-locked');
  } else {
    btn.classList.remove('locked');
    if(lbl) lbl.textContent = 'Travar';
    if(icon) icon.innerHTML = '<rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/>';
    if(bar)  bar.classList.remove('filter-locked');
  }
}

// total realizado por vendedor no mês
function sellerTotal(ymKey, sid){
  // type='ativacao' é KPI manual/informativo — NÃO conta como conquista realizada
  const vs = getVendas(ymKey).filter(v=>v.sellerId===sid && v.type!=='ativacao');
  const s  = DB.sellers.find(x=>x.id===sid);
  if(s?.activeFrom){
    const {y,m}=ymToYM(ymKey);
    const af=new Date(s.activeFrom+'T00:00:00');
    if(af.getFullYear()===y && af.getMonth()===m) return vs.filter(v=>v.date>=s.activeFrom).reduce((a,v)=>a+v.qty,0);
    if(af > new Date(y,m+1,1)) return 0;
  }
  return vs.reduce((a,v)=>a+v.qty,0);
}
// Vendas antes de uma data (para histórico de hub antigo)
function sellerTotalBefore(ymKey, sid, beforeDate){
  return getVendas(ymKey).filter(v=>v.sellerId===sid && v.date<beforeDate).reduce((a,v)=>a+v.qty,0);
}
// total por todos
function totalRealizado(ymKey, sid=null){
  const vs = getVendas(ymKey);
  return (sid ? vs.filter(v=>v.sellerId===sid) : vs).reduce((a,v)=>a+v.qty,0);
}
// total por dia
function totalByDay(ymKey, ds, sid=null){
  const vs = getVendas(ymKey).filter(v=>v.date===ds);
  return (sid ? vs.filter(v=>v.sellerId===sid) : vs).reduce((a,v)=>a+v.qty,0);
}

// total ativações por mês/vendedor
function totalAtivacao(ymKey, sid=null){
  const vs = getVendas(ymKey).filter(v=>v.type==='ativacao');
  return (sid ? vs.filter(v=>v.sellerId===sid) : vs).reduce((a,v)=>a+v.qty,0);
}
function getPatente(r,m){
  if(!m)return'SEM'; const p=r/m;
  if(p>=1)return'OURO'; if(p>=0.8)return'PRATA'; if(p>=0.6)return'BRONZE'; return'SEM';
}
function patenteHTML(p){
  const mp={OURO:'🥇 Ouro',PRATA:'🥈 Prata',BRONZE:'🥉 Bronze',SEM:'— Sem'};
  const cp={OURO:'bp-o',PRATA:'bp-p',BRONZE:'bp-b',SEM:'bp-s'};
  return `<span class="bp ${cp[p]}">${mp[p]}</span>`;
}
function pcls(p){ return p>=1?'pg':p>=0.6?'py':'pr'; }
function ptcls(p){ return p>=1?'pg-t':p>=0.6?'py-t':'pr-t'; }

// ── Contador animado para KPIs ──
const _kpiTimers = {};
function _kpiCount(id, target){
  const el = document.getElementById(id);
  if(!el) return;
  const prev = parseInt(el.dataset.kpiVal) || 0;
  target = Math.round(target) || 0;
  el.dataset.kpiVal = target;
  // Se o valor não mudou, não anima
  if(prev === target){ el.textContent = target; return; }
  cancelAnimationFrame(_kpiTimers[id]);
  const start = Date.now();
  const dur = Math.min(900, 200 + Math.abs(target - prev) * 0.4);
  const ease = t => t < .5 ? 2*t*t : -1+(4-2*t)*t; // easeInOut
  function step(){
    const t = Math.min(1, (Date.now()-start)/dur);
    el.textContent = Math.round(prev + (target-prev)*ease(t));
    if(t < 1) _kpiTimers[id] = requestAnimationFrame(step);
    else el.textContent = target;
  }
  _kpiTimers[id] = requestAnimationFrame(step);
}

function toast(msg,ico='✅'){
  const el=document.getElementById('toast');
  document.getElementById('t-ico').textContent=ico;
  document.getElementById('t-msg').textContent=msg;
  el.classList.add('show');
  clearTimeout(el._t);
  el._t=setTimeout(()=>el.classList.remove('show'),2600);
}

// ══════════════════════════════════════════════════════════
//  MONTH SELECT
// ══════════════════════════════════════════════════════════
function populateMes(){
  const sel=document.getElementById('mes-sel'), opts=[];
  for(let y=2024;y<=2050;y++) for(let m=0;m<12;m++){
    const k=ym(y,m);
    opts.push(`<option value="${k}" ${k===currentYM?'selected':''}>${MESES[m]} ${y}</option>`);
  }
  sel.innerHTML=opts.join('');
}
// ── Comprime imagem para base64 pequeno (max 120px, qualidade 0.7) ──
function compressPhoto(file, maxPx=120, quality=0.7){
  return new Promise(resolve=>{
    const img=new Image(), r=new FileReader();
    r.onload=e=>{ img.src=e.target.result; };
    img.onload=()=>{
      const scale=Math.min(1, maxPx/Math.max(img.width,img.height));
      const c=document.createElement('canvas');
      c.width=Math.round(img.width*scale); c.height=Math.round(img.height*scale);
      c.getContext('2d').drawImage(img,0,0,c.width,c.height);
      resolve(c.toDataURL('image/jpeg',quality));
    };
    r.readAsDataURL(file);
  });
}

let _newSellerPhoto=null;
let _newUserPhoto=null;

async function previewSellerPhoto(e){
  const f=e.target.files[0]; if(!f) return;
  const data=await compressPhoto(f);
  _newSellerPhoto=data;
  const preview=document.getElementById('v-photo-preview');
  if(preview) preview.innerHTML=`<img src="${data}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`;
}
async function previewUserPhoto(e, prefix){
  const f=e.target.files[0]; if(!f) return;
  const data=await compressPhoto(f);
  _newUserPhoto=data;
  const preview=document.getElementById(`${prefix}-photo-preview`);
  if(preview) preview.innerHTML=`<img src="${data}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`;
}

function navMes(dir){
  const sel=document.getElementById('mes-sel');
  const opts=[...sel.options];
  const idx=opts.findIndex(o=>o.value===sel.value);
  const next=idx+dir;
  if(next>=0&&next<opts.length){ sel.value=opts[next].value; onMesChange(); }
}
function onMesChange(){
  currentYM=document.getElementById('mes-sel').value;
  selectedSeller=null;
  ovRegionalFilter=null;
  lancarSellerFilter=null;
  // Reseta plano PSV ao trocar mês — cada mês tem seu próprio plano
  _psvPlan = [];
  // Se o filtro está travado: mantém scopeFilter intacto ao trocar mês
  if(_filterLocked){
    syncCalToBI();
    renderAll();
    return;
  }
  // Para Aldenir/superAdmin: restaura view padrão CE06-ALPHA ao trocar mês
  if(currentUser?.username==='aldenir'||currentUser?.superAdmin){
    const ce06 = _findCe06(DB, null);
    lancarHubFilter      = ce06?.id         || null;
    lancarRegionalFilter = ce06?.regionalId || null;
    if(ce06) scopeFilter = {regionalId: ce06.regionalId, timeId: ce06.id};
  } else {
    lancarHubFilter      = null;
    lancarRegionalFilter = null;
  }
  syncCalToBI();
  renderAll();
}

function goPage(name, el){
  const u=currentUser;
  // Access control
  if(name==='regionais' && !isGerente()) return;
  if(name==='sellers'   && u?.role==='supervisor'){
    // Supervisors can see sellers page but in read-only view
  }
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.ni').forEach(n=>n.classList.remove('on'));
  document.getElementById('page-'+name)?.classList.add('active');
  if(el) el.classList.add('on');
  const lb={dash:'Dashboard — Visão Geral',lancar:'Lançar Vendas',sellers:'HC / HUBs',regionais:'Gestão de Regionais',db:'Banco de Dados',overview:'Visão Geral por Regional',psv:'PSV — Apresentação de Resultados'};
  const tbSub=document.getElementById('tb-sub'); if(tbSub) tbSub.textContent=lb[name]||'';
  if(name==='dash'){
    // FIX: se DB ainda não tem vendas (DB vazio / antes do cloudPull terminar),
    // aguarda o pull antes de renderizar para evitar dash em branco
    const _hasData = currentUser && (DB.sellers?.length > 0);
    const _renderDashSafe = () => {
      renderDash();
      requestAnimationFrame(()=>requestAnimationFrame(()=>{
        if(typeof chartDonut!=='undefined'&&chartDonut){try{chartDonut.resize();}catch(e){}}
        if(typeof chartBar  !=='undefined'&&chartBar  ){try{chartBar.resize();  }catch(e){}}
        if(typeof chartLine !=='undefined'&&chartLine ){try{chartLine.resize(); }catch(e){}}
      }));
    };
    if(!_hasData && typeof cloudPull === 'function'){
      // Mostra estado de carregando temporariamente
      const dashPage = document.getElementById('page-dash');
      if(dashPage && !dashPage.querySelector('._dash-loading')){
        const _ld = document.createElement('div');
        _ld.className = '_dash-loading';
        _ld.style.cssText = 'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:14px;color:var(--tl);z-index:5;background:var(--bg)';
        _ld.textContent = 'Carregando dados...';
        dashPage.style.position = 'relative';
        dashPage.appendChild(_ld);
        cloudPull().then(()=>{
          populateMes(); populateQESellers();
          _ld.remove();
          _renderDashSafe();
        }).catch(()=>{ _ld.remove(); _renderDashSafe(); });
      } else {
        _renderDashSafe();
      }
    } else {
      _renderDashSafe();
    }
  }
  if(name==='lancar')    renderLancar();
  if(name==='sellers')   renderSellers();
  if(name==='regionais') renderRegionais();
  if(name==='db')        { renderDB(); const cfg=getCfg(); if(cfg?.gsUrl||HARDCODED_GS_URL) dbSync(); }
  if(name==='overview')  renderOverview();
  if(name==='psv')       setTimeout(renderPSV,50);
}

// ══════════════════════════════════════════════════════════
//  SELLER FILTER (click no dash)
// ══════════════════════════════════════════════════════════
function selectSeller(sid){
  selectedSeller = (selectedSeller===sid) ? null : sid;
  renderDash();
}
function clearSellerFilter(){
  selectedSeller=null;
  renderDash();
}

// ══════════════════════════════════════════════════════════
//  DASHBOARD
// ══════════════════════════════════════════════════════════