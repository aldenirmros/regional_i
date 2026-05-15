// ══ HUB-INLINE.JS ══

// ══ HUB INLINE EDIT (via lista HUBs Cadastrados) ══
let _hubIeTargetId = null;

function openHubEditById(timeId){
  const t = (DB.times||[]).find(x=>x.id===timeId);
  if(!t) return;
  _hubIeTargetId = timeId;
  document.getElementById('hub-ie-subtitle').textContent = `Editando: ${t.nome}`;
  document.getElementById('hub-ie-nome').value = t.nome || '';
  const sup = (DB.users||[]).find(u=>u.role==='supervisor'&&u.timeId===timeId);
  document.getElementById('hub-ie-sup-nome').value = sup?.nome || '';
  const warn = document.getElementById('hub-ie-warn');
  warn.style.display='none'; warn.textContent='';
  document.getElementById('hub-inline-edit-modal').classList.add('show');
}

function closeHubInlineEditModal(){
  document.getElementById('hub-inline-edit-modal').classList.remove('show');
  _hubIeTargetId = null;
}

function saveHubInlineEdit(){
  const tid   = _hubIeTargetId;
  const nome  = document.getElementById('hub-ie-nome').value.trim();
  const warn  = document.getElementById('hub-ie-warn');
  if(!tid){ warn.textContent='⚠️ HUB não identificado.'; warn.style.display='block'; return; }
  if(!nome){ warn.textContent='⚠️ O nome do HUB não pode ser vazio.'; warn.style.display='block'; return; }
  const t = (DB.times||[]).find(x=>x.id===tid);
  if(!t) return;
  t.nome = nome;
  const supNome = document.getElementById('hub-ie-sup-nome').value.trim();
  const sup = (DB.users||[]).find(u=>u.role==='supervisor'&&u.timeId===tid);
  if(sup && supNome) sup.nome = supNome;
  saveDB();
  closeHubInlineEditModal();
  renderTimesList();
  renderPSV();
  toast('✅ HUB atualizado com sucesso!');
}