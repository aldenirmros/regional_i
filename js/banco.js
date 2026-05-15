// ══ BANCO.JS ══

function renderDB(){
  _dbPopulateFilters();
  _dbPopulateMonthSelect();
  renderDbSellers();
  renderDbVendas();
  renderDbHubs();
  renderDbRegionais();
  renderDbUsers();
}

function _dbGetFilters(){
  const rgId = parseInt(document.getElementById('dbf-regional')?.value)||null;
  const hubId = parseInt(document.getElementById('dbf-hub')?.value)||null;
  return {rgId, hubId};
}

function _dbPopulateFilters(){
  const rgSel=document.getElementById('dbf-regional');
  const hubSel=document.getElementById('dbf-hub');
  if(!rgSel||!hubSel) return;
  const prevRg=rgSel.value, prevHub=hubSel.value;
  rgSel.innerHTML='<option value="">🏠 Todas as Regionais</option>'
    +(DB.regionais||[]).map(r=>`<option value="${r.id}"${String(r.id)===prevRg?' selected':''}>${r.nome}</option>`).join('');
  const rgId=parseInt(rgSel.value)||null;
  const hubs=rgId?(DB.times||[]).filter(t=>t.regionalId===rgId):(DB.times||[]);
  hubSel.innerHTML='<option value="">🏢 Todos os HUBs</option>'
    +hubs.map(t=>`<option value="${t.id}"${String(t.id)===prevHub?' selected':''}>${t.nome}</option>`).join('');
}

function onDbFilterChange(){
  const rgSel=document.getElementById('dbf-regional');
  const hubSel=document.getElementById('dbf-hub');
  if(rgSel&&hubSel){
    const rgId=parseInt(rgSel.value)||null;
    const hubs=rgId?(DB.times||[]).filter(t=>t.regionalId===rgId):(DB.times||[]);
    const prev=hubSel.value;
    hubSel.innerHTML='<option value="">🏢 Todos os HUBs</option>'
      +hubs.map(t=>`<option value="${t.id}"${String(t.id)===prev?' selected':''}>${t.nome}</option>`).join('');
  }
  renderDbSellers(); renderDbHubs(); renderDbVendas();
}

function clearDbFilters(){
  const r=document.getElementById('dbf-regional');
  const h=document.getElementById('dbf-hub');
  if(r) r.value='';
  if(h){ _dbPopulateFilters(); h.value=''; }
  renderDbSellers(); renderDbHubs(); renderDbVendas();
}

function renderDbSellers(){
  const tbody=document.getElementById('db-sellers-body'); if(!tbody) return;
  const {rgId,hubId}=_dbGetFilters();
  let sellers=[...DB.sellers||[]];
  if(hubId) sellers=sellers.filter(s=>s.timeId==hubId);
  else if(rgId){ const tids=(DB.times||[]).filter(t=>t.regionalId==rgId).map(t=>t.id); sellers=sellers.filter(s=>tids.includes(s.timeId)); }
  sellers.sort((a,b)=>(a.name||'').localeCompare(b.name||''));
  const cnt=document.getElementById('db-sellers-count');
  if(cnt) cnt.textContent=`${sellers.filter(s=>!s.inativo).length} ativo(s) · ${sellers.length} total`;
  if(!sellers.length){ tbody.innerHTML=`<tr><td colspan="9" class="db-empty">Nenhum HC encontrado</td></tr>`; return; }
  tbody.innerHTML=sellers.map(s=>{
    const t=(DB.times||[]).find(x=>x.id==s.timeId);
    const rg=(DB.regionais||[]).find(r=>r.id==t?.regionalId);
    const adm=s.admDate||'-';
    const statusCl=s.inativo?'background:rgba(220,38,38,.1);color:#dc2626':'background:rgba(5,150,105,.1);color:#059669';
    const statusTx=s.inativo?'Inativo':'Ativo';
    return `<tr>
      <td style="font-size:10px;color:var(--tl);white-space:nowrap">${s.id}</td>
      <td><span class="db-dot" style="background:${s.color||'#2563eb'}"></span><strong>${s.name||'-'}</strong></td>
      <td style="font-size:11px">${s.cpf||'-'}</td>
      <td>${s.meta||'-'}</td>
      <td>${t?`<span class="db-dot" style="background:${t.color||'#2563eb'}"></span>${t.nome}`:'-'}</td>
      <td>${rg?rg.nome:'-'}</td>
      <td style="font-size:11px;white-space:nowrap">${adm}</td>
      <td><span class="db-badge" style="${statusCl}">${statusTx}</span></td>
      <td class="db-actions">
        <button class="db-btn db-btn-edit" onclick="openEditSellerModal(${s.id})">✏️ Editar</button>
        <button class="db-btn db-btn-del" onclick="delSeller(${s.id})">🗑</button>
      </td>
    </tr>`;
  }).join('');
}

function _dbPopulateMonthSelect(){
  const sel=document.getElementById('db-vendas-month'); if(!sel) return;
  const months=Object.keys(DB.vendas||{}).sort().reverse();
  const prev=sel.value||currentYM;
  if(!months.includes(prev)&&months.length) months.unshift(prev);
  sel.innerHTML=months.length
    ? months.map(m=>`<option value="${m}"${m===prev?' selected':''}>${m.slice(0,4)}-${m.slice(4)}</option>`).join('')
    : `<option value="${currentYM}">${currentYM.slice(0,4)}-${currentYM.slice(4)}</option>`;
}

function renderDbVendas(){
  const tbody=document.getElementById('db-vendas-body'); if(!tbody) return;
  const ym=(document.getElementById('db-vendas-month')?.value)||currentYM;
  const {rgId,hubId}=_dbGetFilters();
  let vendas=[...(DB.vendas?.[ym]||[])];
  if(hubId||rgId){
    const tids=hubId?[Number(hubId)]:(DB.times||[]).filter(t=>t.regionalId==rgId).map(t=>t.id);
    const sids=new Set((DB.sellers||[]).filter(s=>tids.includes(s.timeId)).map(s=>s.id));
    vendas=vendas.filter(v=>sids.has(v.sellerId));
  }
  vendas.sort((a,b)=>a.date<b.date?-1:a.date>b.date?1:0);
  const cnt=document.getElementById('db-vendas-count');
  if(cnt) cnt.textContent=`${vendas.length} registro(s) · ${vendas.reduce((a,v)=>a+(Number(v.qty)||1),0)} unidade(s)`;
  if(!vendas.length){ tbody.innerHTML=`<tr><td colspan="7" class="db-empty">Nenhuma venda neste mês</td></tr>`; return; }
  tbody.innerHTML=vendas.map(v=>{
    const s=(DB.sellers||[]).find(x=>x.id==v.sellerId);
    const t=(DB.times||[]).find(x=>x.id==s?.timeId);
    const rg=(DB.regionais||[]).find(r=>r.id==t?.regionalId);
    const sNm=s?`<span class="db-dot" style="background:${s.color||'#2563eb'}"></span>${s.name}`
               :`<span style="color:var(--tl);font-size:11px">ID ${v.sellerId}</span>`;
    return `<tr>
      <td style="white-space:nowrap"><strong>${v.date||'-'}</strong></td>
      <td>${sNm}</td>
      <td>${t?t.nome:'-'}</td>
      <td>${rg?rg.nome:'-'}</td>
      <td><strong>${v.qty||1}</strong></td>
      <td style="font-size:11px">${v.type||v.produto||'-'}</td>
      <td class="db-actions">
        <button class="db-btn db-btn-del" onclick="dbDelVenda('${ym}',${JSON.stringify(String(v.id))})">🗑</button>
      </td>
    </tr>`;
  }).join('');
}

function renderDbHubs(){
  const tbody=document.getElementById('db-hubs-body'); if(!tbody) return;
  const {rgId}=_dbGetFilters();
  let hubs=[...DB.times||[]];
  if(rgId) hubs=hubs.filter(t=>t.regionalId==rgId);
  const cntEl=document.getElementById('db-hubs-count');
  if(cntEl) cntEl.textContent=`${hubs.length} HUB(s)`;
  if(!hubs.length){ tbody.innerHTML=`<tr><td colspan="7" class="db-empty">Nenhum HUB encontrado</td></tr>`; return; }
  const ymKey=currentYM;
  tbody.innerHTML=hubs.map(t=>{
    const rg=(DB.regionais||[]).find(r=>r.id==t.regionalId);
    const cnt=(DB.sellers||[]).filter(s=>s.timeId==t.id&&!s.inativo).length;
    const meta=getHubMeta(ymKey,t.id)||'-';
    return `<tr>
      <td style="font-size:10px;color:var(--tl);white-space:nowrap">${t.id}</td>
      <td><span class="db-dot" style="background:${t.color||'#2563eb'}"></span><strong>${t.nome||'-'}</strong></td>
      <td>${rg?rg.nome:'-'}</td>
      <td><span style="display:inline-block;width:16px;height:16px;border-radius:3px;background:${t.color||'#2563eb'};vertical-align:middle"></span></td>
      <td>${cnt}</td>
      <td>${meta}</td>
      <td class="db-actions">
        <button class="db-btn db-btn-edit" onclick="openHubEditById(${t.id})">✏️ Editar</button>
        <button class="db-btn db-btn-del" onclick="delTime(${t.id})">🗑</button>
      </td>
    </tr>`;
  }).join('');
}

function renderDbRegionais(){
  const tbody=document.getElementById('db-regionais-body'); if(!tbody) return;
  const regs=DB.regionais||[];
  if(!regs.length){ tbody.innerHTML=`<tr><td colspan="6" class="db-empty">Nenhuma regional</td></tr>`; return; }
  tbody.innerHTML=regs.map(rg=>{
    const hubCount=(DB.times||[]).filter(t=>t.regionalId==rg.id).length;
    const tids=(DB.times||[]).filter(t=>t.regionalId==rg.id).map(t=>t.id);
    const sellCount=(DB.sellers||[]).filter(s=>tids.includes(s.timeId)&&!s.inativo).length;
    return `<tr>
      <td style="font-size:10px;color:var(--tl);white-space:nowrap">${rg.id}</td>
      <td><span class="db-dot" style="background:${rg.color||'#2563eb'}"></span><strong>${rg.nome||'-'}</strong></td>
      <td><span style="display:inline-block;width:16px;height:16px;border-radius:3px;background:${rg.color||'#2563eb'};vertical-align:middle"></span></td>
      <td>${hubCount}</td>
      <td>${sellCount}</td>
      <td class="db-actions">
        <button class="db-btn db-btn-del" onclick="delRegional(${rg.id})">🗑 Remover</button>
      </td>
    </tr>`;
  }).join('');
}

function renderDbUsers(){
  const tbody=document.getElementById('db-users-body'); if(!tbody) return;
  const {rgId,hubId}=_dbGetFilters();
  let users=[...DB.users||[]];
  if(hubId) users=users.filter(u=>u.timeId==hubId);
  else if(rgId) users=users.filter(u=>u.regionalId==rgId||((DB.times||[]).find(t=>t.id==u.timeId)?.regionalId==rgId));
  const cntEl=document.getElementById('db-users-count');
  if(cntEl) cntEl.textContent=`${users.length} usuário(s)`;
  if(!users.length){ tbody.innerHTML=`<tr><td colspan="7" class="db-empty">Nenhum usuário encontrado</td></tr>`; return; }
  const rLabel={gerente:'Gerente',regional:'Admin Regional',supervisor:'Supervisor'};
  const rBg={gerente:'rgba(124,58,237,.12)',regional:'rgba(37,99,235,.1)',supervisor:'rgba(5,150,105,.1)'};
  const rClr={gerente:'#7c3aed',regional:'var(--blue)',supervisor:'#059669'};
  tbody.innerHTML=users.map(u=>{
    const rg=(DB.regionais||[]).find(r=>r.id==u.regionalId);
    const t=(DB.times||[]).find(x=>x.id==u.timeId);
    const rl=u.role||'supervisor';
    const isSelf=currentUser?.id===u.id;
    return `<tr>
      <td style="font-size:10px;color:var(--tl)">${u.id}</td>
      <td><span class="db-dot" style="background:${u.color||'#2563eb'}"></span><strong>${u.nome||u.username}</strong></td>
      <td style="font-family:monospace;font-size:12px">@${u.username}</td>
      <td><span class="db-badge" style="background:${rBg[rl]};color:${rClr[rl]}">${rLabel[rl]||rl}</span></td>
      <td>${rg?rg.nome:'-'}</td>
      <td>${t?t.nome:'-'}</td>
      <td class="db-actions">
        ${!isSelf?`<button class="db-btn db-btn-edit" onclick="openEditUserModal(${u.id})">✏️ Editar</button>`:''}
        ${!isSelf?`<button class="db-btn db-btn-del" onclick="deleteUser(${u.id})">🗑</button>`:'<span style="font-size:10px;color:var(--tl)">você</span>'}
      </td>
    </tr>`;
  }).join('');
}

function dbDelVenda(ym, vid){
  if(!confirm('Remover esta venda do banco?')) return;
  if(!DB.vendas?.[ym]) return;
  DB.vendas[ym]=DB.vendas[ym].filter(v=>String(v.id)!==String(vid));
  if(!DB.deletedVendaIds) DB.deletedVendaIds={};
  if(!DB.deletedVendaIds[ym]) DB.deletedVendaIds[ym]=[];
  DB.deletedVendaIds[ym].push(String(vid));
  saveDB(); cloudSyncVendas(); renderDbVendas();
  toast('Venda removida ✓');
}

async function dbSync(){
  const st=document.getElementById('db-sync-status');
  if(st) st.textContent='⏳ Sincronizando…';
  const ok=await cloudPull();
  renderAll();
  if(st) st.textContent=ok?'✓ Sincronizado '+new Date().toLocaleTimeString('pt-BR'):'✗ Erro — verifique a conexão';
}

function dbToggleAddForm(id){
  const el=document.getElementById(id); if(!el) return;
  const opening=!el.classList.contains('open');
  // fecha todos os outros
  document.querySelectorAll('.db-add-form').forEach(f=>f.classList.remove('open'));
  if(opening){
    el.classList.add('open');
    _dbFillAddSelects(id);
    setTimeout(()=>el.querySelector('.db-inp')?.focus(),80);
  }
}

function _dbFillAddSelects(formId){
  if(formId==='add-seller'){
    const sel=document.getElementById('dba-s-hub');
    if(sel) sel.innerHTML='<option value="">— Selecione —</option>'
      +(DB.times||[]).map(t=>{
        const rg=(DB.regionais||[]).find(r=>r.id==t.regionalId);
        return `<option value="${t.id}">${t.nome}${rg?' ('+rg.nome+')':''}`;
      }).join('');
    // data admissão default hoje
    const adm=document.getElementById('dba-s-adm');
    if(adm&&!adm.value) adm.value=fmtD(today());
  }
  if(formId==='add-hub'){
    const sel=document.getElementById('dba-h-regional');
    if(sel) sel.innerHTML='<option value="">— Selecione —</option>'
      +(DB.regionais||[]).map(r=>`<option value="${r.id}">${r.nome}</option>`).join('');
  }
  if(formId==='add-user'){
    const hSel=document.getElementById('dba-u-hub');
    if(hSel) hSel.innerHTML='<option value="">— Selecione —</option>'
      +(DB.times||[]).map(t=>{
        const rg=(DB.regionais||[]).find(r=>r.id==t.regionalId);
        return `<option value="${t.id}">${t.nome}${rg?' ('+rg.nome+')':''}`;
      }).join('');
    const rSel=document.getElementById('dba-u-regional');
    if(rSel) rSel.innerHTML='<option value="">— Selecione —</option>'
      +(DB.regionais||[]).map(r=>`<option value="${r.id}">${r.nome}</option>`).join('');
    dbOnAddUserRoleChange();
  }
}

function dbOnAddUserRoleChange(){
  const role=document.getElementById('dba-u-role')?.value||'supervisor';
  const hw=document.getElementById('dba-u-hub-wrap');
  const rw=document.getElementById('dba-u-reg-wrap');
  if(hw) hw.style.display=role==='supervisor'?'':'none';
  if(rw) rw.style.display=(role==='supervisor'||role==='regional')?'':'none';
}

function dbSaveSeller(){
  const nome=(document.getElementById('dba-s-nome')?.value||'').trim().toUpperCase();
  if(!nome){ toast('Informe o nome do HC','⚠️'); return; }
  const hubId=parseInt(document.getElementById('dba-s-hub')?.value)||null;
  if(!hubId){ toast('Selecione o HUB','⚠️'); return; }
  const cpf=(document.getElementById('dba-s-cpf')?.value||'').trim();
  const meta=parseInt(document.getElementById('dba-s-meta')?.value)||14;
  const admDate=document.getElementById('dba-s-adm')?.value||fmtD(today());
  const color=document.getElementById('dba-s-cor')?.value||'#2563eb';
  const newId=Date.now();
  DB.sellers.push({id:newId,name:nome,cpf,meta,color,timeId:hubId,admDate,_ts:newId});
  saveDB();
  // reset form
  ['dba-s-nome','dba-s-cpf','dba-s-meta'].forEach(i=>{const e=document.getElementById(i);if(e)e.value='';});
  document.getElementById('add-seller')?.classList.remove('open');
  renderDbSellers(); renderDash(); populateQESellers();
  toast(`✅ ${nome} adicionado!`);
  cloudSyncVendas();
}

function dbSaveHub(){
  const nome=(document.getElementById('dba-h-nome')?.value||'').trim();
  if(!nome){ toast('Informe o nome do HUB','⚠️'); return; }
  const regionalId=parseInt(document.getElementById('dba-h-regional')?.value)||null;
  if(!regionalId){ toast('Selecione a Regional','⚠️'); return; }
  const supUser=(document.getElementById('dba-h-sup-user')?.value||'').trim().toLowerCase();
  const supPass=(document.getElementById('dba-h-sup-pass')?.value||'');
  const supNome=(document.getElementById('dba-h-sup-nome')?.value||'').trim();
  if(!supUser||supPass.length<4){ toast('Informe usuário e senha (mín. 4 chars) do supervisor','⚠️'); return; }
  if(DB.users?.find(u=>u.username===supUser)){ toast(`Usuário @${supUser} já existe`,'⚠️'); return; }
  const color=document.getElementById('dba-h-cor')?.value||'#059669';
  const metaHub=parseInt(document.getElementById('dba-h-meta')?.value)||0;
  const timeId=Date.now();
  if(!DB.times) DB.times=[];
  DB.times.push({id:timeId,nome,color,regionalId});
  if(metaHub>0){
    if(!DB.hubMetas) DB.hubMetas={};
    if(!DB.hubMetas[currentYM]) DB.hubMetas[currentYM]={};
    DB.hubMetas[currentYM][timeId]=metaHub;
  }
  if(!DB.users) DB.users=[];
  const newSupUser={id:Date.now()+1,username:supUser,password:supPass,role:'supervisor',
    nome:supNome||supUser,timeId,regionalId,color:'#059669',_ts:Date.now()+2};
  DB.users.push(newSupUser);
  // ── Garante que a senha fica no cache local E no seed em memória ──
  _updatePwCache([newSupUser]);
  _SEED_CREDS[supUser]=supPass;
  saveDB();
  ['dba-h-nome','dba-h-sup-user','dba-h-sup-pass','dba-h-sup-nome'].forEach(i=>{const e=document.getElementById(i);if(e)e.value='';});
  document.getElementById('add-hub')?.classList.remove('open');
  renderDbHubs(); renderDbUsers(); _dbPopulateFilters(); renderSellers();
  toast(`✅ HUB "${nome}" criado!`);
  cloudSyncVendas();
}

function dbSaveUser(){
  const nome=(document.getElementById('dba-u-nome')?.value||'').trim();
  const username=(document.getElementById('dba-u-user')?.value||'').trim().toLowerCase();
  const password=(document.getElementById('dba-u-pass')?.value||'');
  const role=document.getElementById('dba-u-role')?.value||'supervisor';
  if(!nome){ toast('Informe o nome','⚠️'); return; }
  if(!username){ toast('Informe o usuário (login)','⚠️'); return; }
  if(password.length<4){ toast('Senha deve ter mín. 4 caracteres','⚠️'); return; }
  if(DB.users?.find(u=>u.username===username)){ toast(`Usuário @${username} já existe`,'⚠️'); return; }
  const timeId=parseInt(document.getElementById('dba-u-hub')?.value)||null;
  const regionalId=parseInt(document.getElementById('dba-u-regional')?.value)||null;
  if(role==='supervisor'&&!timeId){ toast('Selecione o HUB para o Supervisor','⚠️'); return; }
  const color=document.getElementById('dba-u-cor')?.value||'#2563eb';
  const newId=Date.now();
  if(!DB.users) DB.users=[];
  const newUser={id:newId,username,password,role,nome,timeId,regionalId,color,_ts:newId};
  DB.users.push(newUser);
  // ── Garante que a senha fica no cache local E no seed em memória ──
  _updatePwCache([newUser]);
  _SEED_CREDS[username]=password;
  saveDB();
  ['dba-u-nome','dba-u-user','dba-u-pass'].forEach(i=>{const e=document.getElementById(i);if(e)e.value='';});
  document.getElementById('add-user')?.classList.remove('open');
  renderDbUsers();
  toast(`✅ Usuário @${username} criado!`);
  cloudSyncVendas();
}

// ══════════════════════════════════════════════════════════
//  DIAS ÚTEIS MANUAL CONFIG
// ══════════════════════════════════════════════════════════
function saveDiasConfig(){
  const totalEl=document.getElementById('cfg-du-total');
  const passEl=document.getElementById('cfg-du-pass');
  const total=totalEl.value!==''?parseInt(totalEl.value):null;
  const passed=passEl.value!==''?parseInt(passEl.value):null;
  if(total!==null&&(isNaN(total)||total<1||total>31)){ toast('Total de dias inválido (1–31)','⚠️'); return; }
  if(passed!==null&&(isNaN(passed)||passed<0||passed>31)){ toast('Dias decorridos inválido (0–31)','⚠️'); return; }
  if(!DB.diasConfig) DB.diasConfig={};
  const _dk = getUserDiasKey(currentYM);
  const existing = DB.diasConfig[_dk] || {};
  DB.diasConfig[_dk]={...existing, total, passed};
  saveDB(); renderDash();
  toast(total!=null||passed!=null ? '⚙️ Dias ajustados manualmente!' : '🔄 Resetado para automático');
}

function resetDiasConfig(){
  if(!DB.diasConfig) DB.diasConfig={};
  const _dk = getUserDiasKey(currentYM);
  const existing = DB.diasConfig[_dk] || {};
  DB.diasConfig[_dk]={...existing, total:null, passed:null};
  const cfgTotalEl = document.getElementById('cfg-du-total');
  const cfgPassEl  = document.getElementById('cfg-du-pass');
  if(cfgTotalEl) cfgTotalEl.value='';
  if(cfgPassEl)  cfgPassEl.value='';
  saveDB(); renderDash();
  toast('🔄 Override de dias removido (automático com feriados)');
}

// ══════════════════════════════════════════════════════════
//  FERIADOS — Gestão de dias não úteis do mês
// ══════════════════════════════════════════════════════════
// ══════════════════════════════════════════════════════════
//  DESCONTO DE DIAS — substitui o sistema de feriados por data
// ══════════════════════════════════════════════════════════
function saveDescontoDias(val){
  const n = Math.max(0, parseInt(val)||0);
  if(!DB.diasConfig) DB.diasConfig={};
  const _dk = getUserDiasKey(currentYM);
  if(!DB.diasConfig[_dk]) DB.diasConfig[_dk]={total:null,passed:null};
  DB.diasConfig[_dk].totalFeriados = n > 0 ? n : null;
  // Garante que overrides manuais sejam nulos (modo automático)
  DB.diasConfig[_dk].total  = null;
  DB.diasConfig[_dk].passed = null;
  DB._savedAt = Date.now();
  try{ localStorage.setItem('bi_v5', JSON.stringify(DB)); }catch(e){}
  flashSaved();
  clearTimeout(saveDB._t);
  _syncEnqueue();
  renderDash();
  const info = document.getElementById('desconto-dias-info');
  if(info) info.textContent = n > 0
    ? `📅 ${n} feriado(s) será(ão) subtraído(s) do total automático do mês`
    : 'Digite o nº de feriados a subtrair do mês';
}

function resetDescontoDias(){
  if(!DB.diasConfig) DB.diasConfig={};
  const _dk = getUserDiasKey(currentYM);
  DB.diasConfig[_dk] = {total:null, passed:null, totalFeriados:null};
  const inp = document.getElementById('cfg-desconto-dias');
  if(inp) inp.value = '';
  const info = document.getElementById('desconto-dias-info');
  if(info) info.textContent = 'Digite o nº de feriados a subtrair do mês';
  DB._savedAt = Date.now();
  try{ localStorage.setItem('bi_v5', JSON.stringify(DB)); }catch(e){}
  flashSaved();
  clearTimeout(saveDB._t);
  _syncEnqueue();
  renderDash();
  toast('🔄 Feriados removidos — usando calendário automático puro');
}

function saveSellerMeta(sid){
  const el=document.getElementById('smeta-'+sid);
  if(!el) return;
  const v=parseInt(el.value);
  if(!v||v<1){ toast('Meta inválida','⚠️'); return; }
  if(!DB.sellerMetas) DB.sellerMetas={};
  if(!DB.sellerMetas[currentYM]) DB.sellerMetas[currentYM]={};
  DB.sellerMetas[currentYM][sid]=v;
  // Clear global meta override so per-seller metas are used
  delete DB.metas[currentYM];
  saveDB(); renderDash(); renderSellers();
  const s=DB.sellers.find(x=>x.id===sid);
  toast(`Compromisso de ${s?.name} → ${v} vendas`);
}

// ══════════════════════════════════════════════════════════
//  EXCEL IMPORT
// ══════════════════════════════════════════════════════════
// ══════════════════════════════════════════════════════════
//  CHART MAXIMIZE
// ══════════════════════════════════════════════════════════
let _modalChart = null;
const CHART_META = {
  donut: { title:'Realizado vs Meta',    color:'var(--green)',  dot:'#059669' },
  line:  { title:'Vendas por Dia',       color:'var(--cyan)',   dot:'#0891b2' },
  bar:   { title:'Realizado vs Projeção',color:'var(--purple)', dot:'#7c3aed' }
};

function maximizeChart(type){
  const srcMap = { donut: chartDonut, line: chartLine, bar: chartBar };
  const src = srcMap[type];
  if(!src) return;

  const meta = CHART_META[type];
  document.getElementById('chart-modal-title').textContent = meta.title;
  document.getElementById('chart-modal-dot').style.background = meta.dot;
  document.getElementById('chart-modal').classList.add('show');

  if(_modalChart){ _modalChart.destroy(); _modalChart=null; }

  const canvas = document.getElementById('ch-modal');

  // Gráfico de linha: reconstrói com bolinhas numeradas e escala vermelho→verde
  if(type==='line'){
    const cfg = _lineParams
      ? makeLineConfig(_lineParams.labels, _lineParams.dataReal, _lineParams.pointColors)
      : JSON.parse(JSON.stringify(src.config));
    cfg.options.maintainAspectRatio = false;
    cfg.options.responsive = true;
    if(cfg.options.plugins) cfg.options.plugins.legend = {display:true};
    _modalChart = new Chart(canvas, cfg);
    return;
  }

  // Copia config do gráfico original (donut/bar)
  const origCfg = src.config;

  // Deep clone via JSON (remove funções, reapplica depois)
  const newCfg = {
    type: origCfg.type,
    data: JSON.parse(JSON.stringify(origCfg.data)),
    options: JSON.parse(JSON.stringify(origCfg.options||{}))
  };
  newCfg.options.maintainAspectRatio = false;
  newCfg.options.responsive = true;
  // Restaura callbacks de tooltip que se perdem no JSON
  if(type==='donut'){
    newCfg.options.plugins = newCfg.options.plugins||{};
    newCfg.options.plugins.legend = {display:true, position:'right', labels:{font:{size:13},color:'#475569'}};
    newCfg.options.plugins.tooltip = {callbacks:{label:c=>{const l=['Realizado','Restante'];return ` ${l[c.dataIndex]}: ${c.raw}`;}}};
  }
  _modalChart = new Chart(canvas, newCfg);
}

function closeChartModal(){
  document.getElementById('chart-modal').classList.remove('show');
  if(_modalChart){ _modalChart.destroy(); _modalChart=null; }
}

// Fecha modal com ESC
document.addEventListener('keydown', e=>{ if(e.key==='Escape') closeChartModal(); });

// ── Ativação manual ──
function saveAtivacao(){
  const el  = document.getElementById('k-atv-input');
  const val = el.value.trim();
  if(!DB.ativacaoManual) DB.ativacaoManual = {};
  const uid = String(currentUser?.id || 'default');
  // Garante que ymKey é sempre objeto {userId: val}
  if(typeof DB.ativacaoManual[currentYM] !== 'object' || DB.ativacaoManual[currentYM] === null){
    DB.ativacaoManual[currentYM] = {};
  }
  if(val === '' || val === null){
    delete DB.ativacaoManual[currentYM][uid];
    if(Object.keys(DB.ativacaoManual[currentYM]).length === 0){
      delete DB.ativacaoManual[currentYM];
    }
  } else {
    const n = parseInt(val);
    if(isNaN(n) || n < 0){ toast('Valor inválido','⚠️'); return; }
    DB.ativacaoManual[currentYM][uid] = n;
  }
  saveDB();
  renderDash();
  toast('Ativação salva ✓');
}

// ── Ativação manual na guia PSV (espelho do dashboard) ──
function savePsvAtivacao(){
  const el  = document.getElementById('psv-atv-input');
  if(!el) return;
  const val = el.value.trim();
  if(!DB.ativacaoManual) DB.ativacaoManual = {};
  const uid = String(currentUser?.id || 'default');
  if(typeof DB.ativacaoManual[currentYM] !== 'object' || DB.ativacaoManual[currentYM] === null){
    DB.ativacaoManual[currentYM] = {};
  }
  if(val === '' || val === null){
    delete DB.ativacaoManual[currentYM][uid];
    if(Object.keys(DB.ativacaoManual[currentYM]).length === 0) delete DB.ativacaoManual[currentYM];
  } else {
    const n = parseInt(val);
    if(isNaN(n) || n < 0){ toast('Valor inválido','⚠️'); return; }
    DB.ativacaoManual[currentYM][uid] = n;
  }
  saveDB();
  renderPSV();
  renderDash();
  toast('Ativação salva ✓');
}

function previewPsvAtivacao(){
  const el  = document.getElementById('psv-atv-input');
  const sub = document.getElementById('psv-atv-sub');
  if(!el) return;
  const matchDe = sub?.textContent.match(/de (\d+)/);
  const realFilt = matchDe ? parseInt(matchDe[1]) : 0;
  const n   = parseInt(el.value) || 0;
  const pct = realFilt > 0 ? n / realFilt : 0;
  const fill = document.getElementById('psv-atv-fill');
  const pctEl = document.getElementById('psv-atv-pct');
  if(fill) fill.style.width = Math.min(100, pct*100).toFixed(1)+'%';
  if(pctEl) pctEl.textContent = (pct*100).toFixed(1)+'%';
  if(sub) sub.textContent = `${n} de ${realFilt} (${(pct*100).toFixed(1)}% de ativação)`;
}

function previewAtivacao(){
  // Atualiza % em tempo real enquanto digita, sem salvar ainda
  const el      = document.getElementById('k-atv-input');
  const subText = document.getElementById('k-atv-s').textContent;
  // Extrai o realFilt do texto "X de Y (Z% de ativação)"
  const matchDe = subText.match(/de (\d+)/);
  const realFilt = matchDe ? parseInt(matchDe[1]) : 0;
  const n       = parseInt(el.value) || 0;
  const pct     = realFilt > 0 ? n / realFilt : 0;
  document.getElementById('k-atv-fill').style.width = Math.min(100, pct*100).toFixed(1)+'%';
  document.getElementById('k-atv-pct').textContent  = (pct*100).toFixed(1)+'%';
  document.getElementById('k-atv-s').textContent    = `${n} de ${realFilt} (${(pct*100).toFixed(1)}% de ativação)`;
}

// ── Ativação manual na guia Visão Geral por Regional (chave própria, independente do dashboard) ──
function saveOvAtvManual(){
  const el  = document.getElementById('ov-atv-input');
  const v   = el?.value.trim();
  const n   = v===''?null:parseInt(v);
  const uid = String(currentUser?.id || 'default');
  if(!DB.ativacaoManualOv) DB.ativacaoManualOv = {};
  if(typeof DB.ativacaoManualOv[currentYM] !== 'object' || DB.ativacaoManualOv[currentYM] === null){
    DB.ativacaoManualOv[currentYM] = {};
  }
  if(n===null){
    delete DB.ativacaoManualOv[currentYM][uid];
    if(Object.keys(DB.ativacaoManualOv[currentYM]).length === 0) delete DB.ativacaoManualOv[currentYM];
  } else {
    DB.ativacaoManualOv[currentYM][uid] = n;
  }
  saveDB();
  renderOverview();
  toast('Ativação (overview) salva ✓');
}

// ── Helper: converte qualquer valor de célula de data em 'YYYY-MM-DD' ──
function parseCellDate(v){
  if(v==null || v==='') return '';
  // JS Date ou objeto com getFullYear (SheetJS cellDates:true)
  if(v && typeof v.getFullYear === 'function'){
    return `${v.getFullYear()}-${String(v.getMonth()+1).padStart(2,'0')}-${String(v.getDate()).padStart(2,'0')}`;
  }
  // Número = serial Excel
  if(typeof v === 'number' && v > 1000){
    try{
      const d = XLSX.SSF.parse_date_code(v);
      return `${d.y}-${String(d.m).padStart(2,'0')}-${String(d.d).padStart(2,'0')}`;
    } catch(e){ return ''; }
  }
  // String — tenta vários formatos
  const s = String(v).trim();
  if(/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;                    // YYYY-MM-DD
  const p = s.split(/[\/\-\.]/);
  if(p.length === 3){
    if(p[0].length === 4) return `${p[0]}-${p[1].padStart(2,'0')}-${p[2].padStart(2,'0')}`;
    return `${p[2]}-${p[1].padStart(2,'0')}-${p[0].padStart(2,'0')}`;  // DD/MM/YYYY
  }
  return '';
}

function importExcel(e){
  const file = e.target.files[0]; if(!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    try{
      const data = new Uint8Array(ev.target.result);
      // cellDates:true → datas viram objetos Date  |  raw lido depois com raw:true
      const wb = XLSX.read(data, {type:'array', cellDates:true});

      let ok = 0, skip = 0;

      // Restringe import ao escopo do usuário logado (supervisor → só seu HUB)
      const scopedSellersList = getScopedSellers(true); // inclui inativos do escopo
      const scopedNomeMap = new Map(scopedSellersList.map(s=>[s.name.trim().toUpperCase(), s]));

      wb.SheetNames.forEach(sheetName => {
        const ws = wb.Sheets[sheetName];
        if(!ws) return;

        // Lê com raw:true para preservar Date objects e números intactos
        const rows = XLSX.utils.sheet_to_json(ws, {header:1, raw:true, defval:null});
        if(!rows || rows.length < 2) return;

        const headerRow = rows[0];
        if(!headerRow || !headerRow.length) return;

        const firstCell = String(headerRow[0]||'').trim().toUpperCase();

        // ── FORMATO PIVÔ: coluna A = "VENDEDOR", demais colunas = datas ──
        if(firstCell === 'VENDEDOR'){
          // Tipo pela aba: qualquer coisa com "ativ" → ativacao, resto → conquista
          const snNorm = sheetName.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
          const tipo   = snNorm.includes('ativ') ? 'ativacao' : 'conquista';

          // Monta mapa de índice → dateStr para as colunas de data
          const colDates = {};
          for(let ci = 1; ci < headerRow.length; ci++){
            const ds = parseCellDate(headerRow[ci]);
            if(ds) colDates[ci] = ds;
          }

          if(!Object.keys(colDates).length){
            console.warn(`[import] Aba "${sheetName}": nenhuma data reconhecida no cabeçalho`, headerRow.slice(1,5));
            return;
          }

          // Processa cada linha de vendedor
          for(let ri = 1; ri < rows.length; ri++){
            const row = rows[ri];
            if(!row || !row[0]) continue;
            const nomeRaw = String(row[0]).trim().toUpperCase();
            if(!nomeRaw) continue;

            // Busca vendedor SOMENTE dentro do escopo do usuário logado
            const seller = scopedNomeMap.get(nomeRaw);
            if(!seller){ skip++; continue; }

            for(const ci in colDates){
              const qty = parseInt(row[ci]) || 0;
              if(qty <= 0) continue;
              const dateStr = colDates[ci];
              const d = new Date(dateStr + 'T12:00:00');
              if(isNaN(d.getTime())) continue;
              const ymKey = ym(d.getFullYear(), d.getMonth());
              if(!DB.vendas[ymKey]) DB.vendas[ymKey] = [];
              // Deduplicação: não importa se já existe venda com mesmo sellerId+date+tipo+qty
              const already = DB.vendas[ymKey].some(v=>v.sellerId===seller.id&&v.date===dateStr&&v.type===tipo&&v.qty===qty);
              if(already){ skip++; continue; }
              DB.vendas[ymKey].push({
                id: Date.now() + Math.random(),
                sellerId: seller.id,
                date: dateStr,
                qty,
                type: tipo,
                ts: new Date().toISOString()
              });
              ok++;
            }
          }

        // ── FORMATO LONG: colunas Vendedor | Data | Quantidade | Tipo ──
        } else {
          const longRows = XLSX.utils.sheet_to_json(ws, {defval:''});
          longRows.forEach(row => {
            const get = keys => {
              for(const k of keys){
                const key = Object.keys(row).find(x => x.trim().toLowerCase() === k.toLowerCase());
                if(key && row[key] !== '' && row[key] != null) return String(row[key]).trim();
              }
              return '';
            };
            const nomeRaw = get(['vendedor','nome','seller','name']);
            const dataRaw = get(['data','date','dt']);
            const qtyRaw  = get(['quantidade','qty','qtd','vendas','q']);
            const tipoRaw = get(['tipo','type','t']);
            if(!nomeRaw || !dataRaw){ skip++; return; }
            // Busca vendedor SOMENTE dentro do escopo do usuário logado
            const seller = scopedNomeMap.get(nomeRaw.toUpperCase());
            if(!seller){ skip++; return; }
            const dateStr = parseCellDate(isNaN(dataRaw) ? dataRaw : Number(dataRaw));
            if(!dateStr || isNaN(new Date(dateStr+'T12:00:00').getTime())){ skip++; return; }
            const qty  = parseInt(qtyRaw) || 1;
            const tipo = tipoRaw.toLowerCase().includes('ativ') ? 'ativacao' : 'conquista';
            const d    = new Date(dateStr + 'T12:00:00');
            const ymKey = ym(d.getFullYear(), d.getMonth());
            if(!DB.vendas[ymKey]) DB.vendas[ymKey] = [];
            // Deduplicação: evita importar a mesma venda duas vezes
            const already = DB.vendas[ymKey].some(v=>v.sellerId===seller.id&&v.date===dateStr&&v.type===tipo&&v.qty===qty);
            if(already){ skip++; return; }
            DB.vendas[ymKey].push({
              id: Date.now()+Math.random(), sellerId:seller.id,
              date:dateStr, qty, type:tipo, ts:new Date().toISOString()
            });
            ok++;
          });
        }
      });

      saveDB();
      // Bloqueia cloudPull por 5min para não sobrescrever os dados recém-importados
      window._blockPull = Date.now();
      window._importPending = true; // flag: há dados importados aguardando push
      // Cancela o debounce e empurra para a nuvem imediatamente
      clearTimeout(saveDB._t);
      // Pull-before-push: garante que as vendas de outros usuários são preservadas
      cloudSyncVendas().finally(() => {
        // Mantém o block ativo por mais 30s após o push (GAS pode demorar)
        window._blockPull = Date.now() - 270000; // reinicia: ainda bloqueia por ~30s
        window._importPending = false;
      });
      renderLancar(); renderDash();
      if(ok > 0){
        toast(`✅ ${ok} registro(s) importado(s)${skip?` · ${skip} ignorado(s)`:''}`);
      } else {
        toast(`⚠️ Nenhum registro importado${skip?` · ${skip} linha(s) com erro`:''}. Verifique o arquivo.`,'⚠️');
        console.warn('[import] skip=', skip, '— certifique que os nomes dos vendedores batem exatamente.');
      }
    } catch(err){
      console.error('[import error]', err);
      toast('❌ Erro ao ler o arquivo: ' + err.message, '❌');
    }
    e.target.value='';
  };
  reader.readAsArrayBuffer(file);
}

function openModeloExcelModal(){
  // Preenche meses
  const mesSel=document.getElementById('modelo-mes-sel');
  mesSel.innerHTML=MESES.map((n,i)=>`<option value="${i}">${n}</option>`).join('');
  mesSel.value=today().getMonth();
  // Preenche anos
  const anoSel=document.getElementById('modelo-ano-sel');
  const anoAtual=today().getFullYear();
  anoSel.innerHTML='';
  for(let y=2024;y<=2030;y++) anoSel.innerHTML+=`<option value="${y}"${y===anoAtual?' selected':''}>${y}</option>`;
  // Info de escopo — funciona para todos os papéis
  const sellers=getScopedSellers();
  const u=currentUser;
  let desc='';
  if(isGerente(u))             desc=`Todos os HC (${sellers.length})`;
  else if(u?.role==='regional'){ const rg=(DB.regionais||[]).find(r=>r.id===u.regionalId); desc=`Regional: ${rg?.nome||'—'} · ${sellers.length} HC`; }
  else if(u?.role==='supervisor'){ const tm=(DB.times||[]).find(t=>t.id===u.timeId); desc=`HUB: ${tm?.nome||'—'} · ${sellers.length} HC`; }
  else desc=`${sellers.length} HC`;
  document.getElementById('modelo-scope-txt').textContent=desc;
  document.getElementById('modelo-excel-modal').classList.add('show');
}
function closeModeloExcelModal(){ document.getElementById('modelo-excel-modal').classList.remove('show'); }

function downloadModeloExcel(){
  const mesSel=document.getElementById('modelo-mes-sel');
  const anoSel=document.getElementById('modelo-ano-sel');
  // Usa seletores do modal se disponíveis, senão mês/ano atual
  const m=mesSel ? parseInt(mesSel.value) : today().getMonth();
  const y=anoSel ? parseInt(anoSel.value)  : today().getFullYear();
  // getScopedSellers funciona para TODOS os papéis automaticamente
  const sellers=getScopedSellers();
  const nomes=sellers.map(s=>s.name);
  if(!nomes.length){ toast('Nenhum HC no seu escopo','⚠️'); return; }
  const dias=getDiasUteis(y,m);
  function makeSheet(){
    const header=['VENDEDOR',...dias];
    const wsData=[header];
    nomes.forEach(nome=>wsData.push([nome,...dias.map(()=>0)]));
    const ws=XLSX.utils.aoa_to_sheet(wsData,{cellDates:true});
    dias.forEach((d,i)=>{
      const cellRef=XLSX.utils.encode_cell({r:0,c:i+1});
      if(ws[cellRef]){ ws[cellRef].t='d'; ws[cellRef].v=d; ws[cellRef].z='dd/mm/yyyy'; }
    });
    ws['!cols']=[{wch:16},...dias.map(()=>({wch:13}))];
    ws['!freeze']={xSplit:1,ySplit:1};
    return ws;
  }
  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,makeSheet(),'Conquistas');
  XLSX.utils.book_append_sheet(wb,makeSheet(),'Ativações');
  XLSX.writeFile(wb,`modelo_vendas_${MESES[m]}_${y}.xlsx`);
  closeModeloExcelModal();
  toast(`📥 Modelo ${MESES[m]} ${y} — ${nomes.length} HC!`);
}

// ══════════════════════════════════════════════════════════
//  CLOUD SYNC — JSONbin.io v3
// ══════════════════════════════════════════════════════════
const CLOUD_LS   = 'bi_cloud_v2';
// URL do Google Apps Script gravada diretamente no HTML — mesmo banco em TODOS os dispositivos
// Substitua pela URL do seu Web App depois de implantar o Apps Script
const HARDCODED_GS_URL = 'https://script.google.com/macros/s/AKfycbw_-thwnuht8D4MWAQG9hSH_TXk1mE9nO7Z7cn1_tuE2TWnxkPCrwN3LQerwagWFRAn/exec';

function getCfg(){
  try{
    const c = JSON.parse(localStorage.getItem(CLOUD_LS)||'{}');
    const hurl = (HARDCODED_GS_URL||'').trim();
    if(hurl){ c.gsUrl = hurl; }
    return c;
  } catch(e){
    // localStorage indisponível (iOS modo privado, Samsung Browser, etc.)
    const hurl = (HARDCODED_GS_URL||'').trim();
    return hurl ? { gsUrl: hurl } : {};
  }
}

// Gera e baixa o HTML com a URL do Apps Script já embutida
async function exportHtmlWithGsUrl(){
  const gsUrl = getCfg().gsUrl || '';
  if(!gsUrl){ toast('Configure a URL do Apps Script primeiro','⚠️'); return; }
  try{
    const res  = await fetch(window.location.href);
    let   html = await res.text();
    html = html.replace(/const HARDCODED_GS_URL = '[^']*';/, `const HARDCODED_GS_URL = 'https://script.google.com/macros/s/AKfycbw_-thwnuht8D4MWAQG9hSH_TXk1mE9nO7Z7cn1_tuE2TWnxkPCrwN3LQerwagWFRAn/exec';`);
    const blob = new Blob([html],{type:'text/html'});
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href=url; a.download='BI_Vendas_GSheets.html'; a.click();
    URL.revokeObjectURL(url);
    toast('✅ HTML baixado com URL embutida!');
  } catch(e){
    toast('Para embutir a URL, edite manualmente a linha HARDCODED_GS_URL no HTML.','⚠️');
    prompt('Substitua a linha HARDCODED_GS_URL no HTML por:', `const HARDCODED_GS_URL = 'https://script.google.com/macros/s/AKfycbw_-thwnuht8D4MWAQG9hSH_TXk1mE9nO7Z7cn1_tuE2TWnxkPCrwN3LQerwagWFRAn/exec';`);
  }
}
function setCfg(c){ localStorage.setItem(CLOUD_LS, JSON.stringify(c)); }

function setCloudUI(state, txt){
  // cloud-dot e cloud-txt (cloud pill no topbar)
  const dot   = document.getElementById('cloud-dot');
  const label = document.getElementById('cloud-txt');
  if(dot)   dot.className   = 'cloud-dot ' + state;
  if(label) label.textContent = txt;

  // sync-status-bar (pill de status)
  const bar  = document.getElementById('sync-status-bar');
  const stxt = document.getElementById('sync-status-txt');
  if(bar){
    bar.className = '';
    bar.classList.add(state === 'ok' ? 'ok' : state === 'sync' ? 'sync' : 'err');
  }
  if(stxt){
    stxt.textContent = state==='ok' ? 'Sincronizado'
                     : state==='sync' ? 'Salvando…'
                     : state==='off'  ? 'Sem nuvem'
                     : 'Sem conexão';
  }
}

// ── Atualizar manualmente ──
// ══════════════════════════════════════════════════════════
//  RESET DE CACHE — limpa localStorage e força cloudPull
// ══════════════════════════════════════════════════════════
async function resetCache(){
  if(!confirm(
    '⚠️ Reset de Cache\n\n' +
    'Isso vai:\n' +
    '1. Limpar o banco de dados local (cache)\n' +
    '2. Forçar uma recarga completa da nuvem\n\n' +
    'Use isso quando os dados estiverem desatualizados\n' +
    'ou se uma venda deletada continuar voltando.\n\n' +
    'Continuar?'
  )) return;

  const btn = document.getElementById('btn-reset-cache');
  if(btn){ btn.classList.add('loading'); }
  toast('🔄 Limpando cache…');

  try {
    // 1. Para qualquer sync em curso
    _syncRunning = false;
    clearTimeout(saveDB._t);

    // 2. Limpa localStorage completamente (preserva o cache de senhas!)
    const savedPwCache = localStorage.getItem(_pwcKey); // guarda senhas
    try{ localStorage.removeItem('bi_v5'); }catch(e){}
    try{ localStorage.removeItem('bi_scope_filter'); }catch(e){}
    if(savedPwCache) try{ localStorage.setItem(_pwcKey, savedPwCache); }catch(e){} // restaura

    // 3. Reseta DB para esqueleto vazio (sem seed)
    DB = {
      sellers:[], vendas:{}, times:[], regionais:[], users:[],
      diasConfig:{}, sellerMetas:{}, hubMetas:{}, mValues:{},
      ativacaoManual:{}, ativacaoManualOv:{}, psvData:{},
      psvPlano:[], psvTpv:[], psvDp:[],
      deletedVendaIds:{},
      deleted:{userIds:[],sellerIds:[],timeIds:[],regionalIds:[]},
      nextId:1, _savedAt:0
    };
    // 4. Força cloudPull com nova requisição (sem cache)
    window._blockPull = null; // libera qualquer bloqueio de pull
    const ok = await cloudPull();

    if(ok){
      _refreshCurrentUserFromDB();
      populateMes();
      populateQESellers();
      renderAll();
      renderPSVIfActive();
      // Re-aplica filtros de escopo para o usuário atual
      if(currentUser) applySession();
      toast('✅ Cache resetado! Dados recarregados da nuvem.');
    } else {
      toast('⚠️ Cache limpo, mas sem conexão com a nuvem. Reconecte para recarregar.','⚠️');
    }
  } catch(e){
    toast('❌ Erro no reset: ' + e.message,'⚠️');
  } finally {
    if(btn){ btn.classList.remove('loading'); }
  }
}

async function manualRefresh(){
  const btn = document.getElementById('btn-global-refresh');
  const ico = document.getElementById('refresh-icon');
  if(btn) btn.disabled = true;
  if(ico) ico.style.animation = 'spin .7s linear';
  try {
    const ok = await cloudPull();
    if(ok){
      _refreshCurrentUserFromDB();
      populateMes(); populateQESellers(); renderAll(); renderPSVIfActive();
      toast('✅ Dados atualizados!');
    } else {
      toast('⚠️ Sem conexão com a nuvem.','⚠️');
    }
  } catch(e){
    toast('❌ Erro: ' + e.message,'⚠️');
  } finally {
    if(btn) btn.disabled = false;
    if(ico) setTimeout(()=>{ ico.style.animation = ''; }, 750);
  }
}

// ── Salvar manualmente ──
async function manualSave(){
  const btn = document.getElementById('btn-global-save');
  if(btn) btn.disabled = true;
  try {
    DB._savedAt = Date.now();
    try{ localStorage.setItem('bi_v5', JSON.stringify(DB)); }catch(e){}
    flashSaved();
    clearTimeout(saveDB._t);
    await _syncEnqueue();
    toast('💾 Salvo e sincronizado!');
  } catch(e){
    toast('❌ Erro ao salvar: ' + e.message,'⚠️');
  } finally {
    if(btn) btn.disabled = false;
  }
}
function syncLog(msg){
  const el=document.getElementById('sync-log');
  if(el) el.textContent = new Date().toLocaleTimeString('pt-BR')+' — '+msg;
}
