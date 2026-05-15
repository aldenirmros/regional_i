// ══ HUB-MODAL.JS ══

// ══ MODAL ALTERAR HUB ══
function openHubEditModal(){
  const modal = document.getElementById('hub-edit-modal');
  const sel   = document.getElementById('hub-edit-sel');
  const u     = currentUser;
  if(!u) return;
  // Monta lista de HUBs visíveis
  let times = DB.times || [];
  if(u.role==='supervisor')      times = times.filter(t=>t.id===u.timeId);
  else if(u.role==='regional' && !isGerente(u)) times = times.filter(t=>t.regionalId===u.regionalId);
  sel.innerHTML='<option value="">— Selecione —</option>'+times.map(t=>`<option value="${t.id}">${t.nome}</option>`).join('');
  // Se supervisor, pré-seleciona automaticamente
  if(u.role==='supervisor' && u.timeId){
    sel.value = u.timeId;
    onHubEditSelChange();
  } else {
    document.getElementById('hub-edit-fields').style.display='none';
  }
  modal.classList.add('show');
}
function closeHubEditModal(){
  document.getElementById('hub-edit-modal').classList.remove('show');
}
function onHubEditSelChange(){
  const tid = parseInt(document.getElementById('hub-edit-sel').value)||null;
  const fields = document.getElementById('hub-edit-fields');
  if(!tid){ fields.style.display='none'; return; }
  const t = (DB.times||[]).find(x=>x.id===tid);
  if(!t){ fields.style.display='none'; return; }
  document.getElementById('hub-edit-nome').value = t.nome || '';
  // Busca supervisor vinculado ao HUB
  const sup = (DB.users||[]).find(u=>u.role==='supervisor' && u.timeId===tid);
  document.getElementById('hub-edit-sup-nome').value = sup?.nome || '';
  fields.style.display='block';
  document.getElementById('hub-edit-warn').style.display='none';
}
function saveHubEdit(){
  const tid  = parseInt(document.getElementById('hub-edit-sel').value)||null;
  const nome = document.getElementById('hub-edit-nome').value.trim();
  const warn = document.getElementById('hub-edit-warn');
  if(!tid){ warn.textContent='⚠️ Selecione um HUB.'; warn.style.display='block'; return; }
  if(!nome){ warn.textContent='⚠️ O nome do HUB não pode ser vazio.'; warn.style.display='block'; return; }
  const t = (DB.times||[]).find(x=>x.id===tid);
  if(!t){ return; }
  t.nome = nome;
  const supNome = document.getElementById('hub-edit-sup-nome').value.trim();
  const sup = (DB.users||[]).find(u=>u.role==='supervisor' && u.timeId===tid);
  if(sup && supNome) sup.nome = supNome;
  saveDB();
  closeHubEditModal();
  renderPSV();
  toast('✅ HUB atualizado com sucesso!');
}

// ══ PLANO DE AÇÃO — SAVE / LOAD ══
// CORREÇÃO: salva em DB.psvData (sincronizado com a nuvem) em vez de
// apenas no localStorage (que era local ao dispositivo e nunca ia ao Sheets).
// ── _planKey: legado (compatibilidade com psvData) ──
function _planKey(){ return 'plan_'+(currentUser?.id||'default'); }

// ── Plano de Ação — DB.psvPlano (tabela no Sheets) ──────────────────────────
// Filtrado por userId + ymKey: cada usuário vê apenas o seu plano, por mês

function _writePlanToTable(){
  if(!DB.psvPlano) DB.psvPlano = [];
  // Escrita: sempre usa o userId do usuário logado (isolamento de dados)
  const uid = String(currentUser?.id || 'default');
  const ym  = String(currentYM);
  // Remove entradas antigas do usuário+mês (substitui com dados atuais)
  DB.psvPlano = DB.psvPlano.filter(r => !(String(r.userId)===uid && String(r.ymKey)===ym));
  _psvPlan.forEach((row, i) => {
    if(!row.indicador && !row.problema && !row.causa && !row.acoes) return; // ignora linhas vazias
    DB.psvPlano.push({
      userId   : uid,
      ymKey    : ym,
      indicador: String(row.indicador || `Item ${i+1}`),
      problema : String(row.problema  || ''),
      causa    : String(row.causa     || ''),
      acoes    : String(row.acoes     || ''),
      periodo  : String(row.periodo   || ''),
      resultado: String(row.resultado || ''),
    });
  });
}

function psvLoadPlan(){
  try{
    if(!DB.psvPlano) DB.psvPlano = [];
    // Leitura: usa o userId do supervisor dono do HUB (visão hierárquica)
    const uid = _getPsvOwnerUserId();
    const ym  = String(currentYM);
    // Usa String() em ambos os lados — Sheets pode devolver ymKey como número
    const rows = DB.psvPlano.filter(r => String(r.userId)===uid && String(r.ymKey)===ym);
    if(rows.length){
      _psvPlan = rows.map(r=>({
        indicador: String(r.indicador||''), problema: String(r.problema||''),
        causa: String(r.causa||''),         acoes: String(r.acoes||''),
        periodo: String(r.periodo||''),     resultado: String(r.resultado||''),
      }));
      return;
    }
    // Fallback legado: psvData blob → migra para tabela automaticamente
    // (só aplica se for o próprio usuário — não migra dados de terceiros)
    if(uid === String(currentUser?.id || 'default') && DB.psvData){
      const fromDB = DB.psvData[_planKey()];
      if(Array.isArray(fromDB) && fromDB.length){
        _psvPlan = fromDB;
        _writePlanToTable();
        saveDB();
        return;
      }
    }
    // Fallback: localStorage legado → migra automaticamente (apenas para o próprio usuário)
    if(uid === String(currentUser?.id || 'default')){
      const lsKey = 'psv_plan_'+(currentUser?.id||'default');
      const raw = localStorage.getItem(lsKey);
      if(raw){
        const d = JSON.parse(raw);
        if(Array.isArray(d) && d.length){
          _psvPlan = d;
          _writePlanToTable();
          saveDB();
          localStorage.removeItem(lsKey);
        }
      }
    }
    // Se nenhum dado encontrado, garante pelo menos uma linha em branco
    if(!_psvPlan.length) _psvPlan = [{indicador:'',problema:'',causa:'',acoes:'',periodo:'',resultado:''}];
  }catch(e){ console.error('psvLoadPlan error:', e); }
}

function psvSavePlan(){
  try{
    _writePlanToTable();
    DB._savedAt = Date.now();
    try{ localStorage.setItem('bi_v5', JSON.stringify(DB)); }catch(e){}
    flashSaved();
    clearTimeout(saveDB._t);
    _syncEnqueue();
    const badge = document.getElementById('plan-saved-badge');
    if(badge){
      badge.style.opacity = '1';
      clearTimeout(badge._t);
      badge._t = setTimeout(()=>{ badge.style.opacity='0'; }, 2200);
    }
  }catch(e){ toast('⚠️ Erro ao salvar plano.'); }
}

// ── Atalho de teclado: Ctrl+S / Cmd+S → Salvar ──
document.addEventListener('keydown', function(e){
  if((e.ctrlKey || e.metaKey) && e.key === 's'){
    e.preventDefault();
    if(currentUser) manualSave();
  }
});

// ── Detecta reconexão de rede → atualiza automaticamente ──
window.addEventListener('online', async function(){
  if(!currentUser) return;
  toast('🌐 Conexão restaurada — atualizando…');
  const refreshed = await cloudPull();
  if(refreshed){
    _refreshCurrentUserFromDB();
    populateMes(); populateQESellers(); renderAll();
    await _syncEnqueue(); // reenvia dados pendentes
  }
});
window.addEventListener('offline', function(){
  setCloudUI('err', 'Sem conexão');
  toast('⚠️ Sem internet. Dados salvos localmente.', '⚠️');
});