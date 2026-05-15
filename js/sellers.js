// ══ SELLERS.JS ══

function renderSellers(){
  const ymKey=currentYM, {y,m}=ymToYM(ymKey);
  const u = currentUser;
  const scopedSel = getScopedSellers();

  // Barra de filtro Regional/HUB
  const sfBar=document.getElementById('sellers-filter-bar');
  const sfRg=document.getElementById('sf-regional');
  const sfTm=document.getElementById('sf-time');
  if(sfBar){
    if(u?.role==='supervisor'){ sfBar.style.display='none'; }
    else {
      sfBar.style.display='flex';
      // Regional
      if(sfRg){
        if(u?.role==='regional'&&!isGerente(u)){
          const myRg=(DB.regionais||[]).find(r=>r.id===u.regionalId);
          sfRg.innerHTML=myRg?`<option value="${myRg.id}">${myRg.nome}`:''; sfRg.value=u.regionalId||''; sfRg.style.display='none';
        } else {
          sfRg.style.display='';
          const prev=sfRg.value;
          sfRg.innerHTML='<option value="">🏠 Todas as Regionais</option>'+(DB.regionais||[]).map(r=>`<option value="${r.id}"${r.id==prev?' selected':''}>${r.nome}</option>`).join('');
        }
      }
      // HUB
      if(sfTm){
        const rgId=u?.role==='regional'&&!isGerente(u)?u.regionalId:(parseInt(sfRg?.value)||null);
        const times=rgId?(DB.times||[]).filter(t=>t.regionalId===rgId):(DB.times||[]);
        const prevT=sfTm.value;
        sfTm.innerHTML='<option value="">🏢 Todos os HUBs</option>'+times.map(t=>`<option value="${t.id}"${t.id==prevT?' selected':''}>${t.nome}</option>`).join('');
      }
    }
  }

  // Scope filtrado
  const sfRgId=parseInt(sfRg?.value)||null;
  const sfTmId=parseInt(sfTm?.value)||null;
  const banner = document.getElementById('scope-banner-sellers');
  const lbl    = document.getElementById('scope-label');
  if(u?.role==='supervisor'){
    const t=(DB.times||[]).find(x=>x.id===u.timeId);
    if(banner){ banner.style.display='flex'; lbl.textContent=`HUB: ${t?.nome||'—'}`; }
    // Supervisor pode cadastrar vendedores — mostra o form mas oculta abas de times/usuários
    const fw=document.getElementById('seller-form-wrap');
    if(fw) fw.style.display='';
    const tbt=document.getElementById('tab-btn-times');
    const tbu=document.getElementById('tab-btn-users');
    if(tbt) tbt.style.display='none';
    if(tbu) tbu.style.display='none';
  } else if(u?.role==='regional'){
    const rg=(DB.regionais||[]).find(x=>x.id===u.regionalId);
    if(banner){ banner.style.display='flex'; lbl.textContent=`Regional: ${rg?.nome||'—'}`; }
  } else {
    if(banner) banner.style.display='none';
  }

  // Popula select de Time
  const vtEl=document.getElementById('v-time');
  if(vtEl){
    if(u?.role==='supervisor' && u.timeId){
      // Supervisor: mostra apenas o próprio HUB, desabilitado (timeId é forçado no código)
      const supT=(DB.times||[]).filter(t=>t.id===u.timeId);
      vtEl.innerHTML=supT.map(t=>`<option value="${t.id}" selected>${t.nome}</option>`).join('');
      vtEl.value=String(u.timeId);
      vtEl.disabled=true; // travado — addSeller() usa u.timeId diretamente
    } else {
      const ts=u?.role==='regional'&&!isGerente(u)?(DB.times||[]).filter(t=>t.regionalId===u.regionalId):(DB.times||[]);
      vtEl.innerHTML=`<option value="">— Sem time —</option>`
        +ts.map(t=>`<option value="${t.id}">${t.nome}</option>`).join('');
    }
  }
  // Popula select Regional no form de time
  const trgEl=document.getElementById('time-regional');
  if(trgEl){
    trgEl.innerHTML=(DB.regionais||[]).map(r=>`<option value="${r.id}">${r.nome}</option>`).join('');
  }

  // Vendedores
  document.getElementById('v-cnt').textContent=scopedSel.length;
  // Atualiza display de meta total
  const metaTotalEl=document.getElementById('meta-total-display');
  if(metaTotalEl) metaTotalEl.textContent=getScopedMeta(ymKey);

  let scopedAll = getScopedSellers(true); // inclui inativos
  // Aplica filtro da barra de sellers
  if(sfTmId) scopedAll=scopedAll.filter(s=>s.timeId===sfTmId);
  else if(sfRgId){ const tids=(DB.times||[]).filter(t=>t.regionalId===sfRgId).map(t=>t.id); scopedAll=scopedAll.filter(s=>tids.includes(s.timeId)); }
  let lh='', lhInativo='';
  [...scopedAll].sort((a,b)=>a.name.localeCompare(b.name)).forEach(s=>{
    const tot=sellerTotal(ymKey,s.id);
    const metaMes=(DB.sellerMetas[ymKey]||{})[s.id]??s.meta;
    const t=(DB.times||[]).find(x=>x.id===s.timeId);
    const inativo=!!s.inativo;
    const card=`<div class="seller-item${inativo?' inativo':''}">
      ${s.photo
        ? `<div class="seller-ic" style="background:${s.color};overflow:hidden;padding:0"><img src="${s.photo}" style="width:100%;height:100%;object-fit:cover"></div>`
        : `<div class="seller-ic" style="background:${s.color}">${s.name[0]}</div>`
      }
      <div style="flex:1">
        <div class="seller-nm">${s.name}${inativo?'<span class="inativo-badge">INATIVO</span>':''}</div>
        <div class="seller-meta-txt">${t?`HUB: ${t.nome} · `:''}${s.cpf||'—'} · Realizado: ${tot}</div>
        ${!inativo?`<div class="seller-meta-edit">
          <span style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--tl)">Compromisso individual ${MESES[m]}:</span>
          <input type="number" id="smeta-${s.id}" value="${metaMes}" min="1">
          <button class="save-meta-btn" onclick="saveSellerMeta(${s.id})">Salvar</button>
        </div>`:''}
      </div>
      <div style="display:flex;flex-direction:column;gap:5px;align-items:flex-end">
        <button class="btn-sm" onclick="openEditSellerModal(${s.id})" style="background:var(--blue-g);color:var(--blue);border:1px solid rgba(37,99,235,.2);border-radius:6px;padding:4px 9px;font-size:11px;font-weight:600;cursor:pointer;font-family:var(--font)">✏️ Editar</button>
        <button class="btn-sm" onclick="openTransferModal(${s.id})" style="background:rgba(124,58,237,.08);color:#7c3aed;border:1px solid rgba(124,58,237,.2);border-radius:6px;padding:4px 9px;font-size:11px;font-weight:600;cursor:pointer;font-family:var(--font)">🔄 Transferir</button>
        ${inativo
          ? `<button class="btn-ativar" onclick="toggleSellerInativo(${s.id},false)">↩ Reativar</button>
             <button class="del-seller" onclick="delSellerPermanent(${s.id})">Excluir</button>`
          : `<button class="btn-inativo" onclick="toggleSellerInativo(${s.id},true)">Inativar</button>
             <button class="del-seller" onclick="delSeller(${s.id})">Remover</button>`
        }
      </div>
    </div>`;
    if(inativo) lhInativo+=card; else lh+=card;
  });
  const allHtml=(lh||'')+(lhInativo?`<div style="margin-top:12px;padding-top:12px;border-top:1px dashed var(--border)"><div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:var(--tl);margin-bottom:8px">Inativos</div>${lhInativo}</div>`:'');
  document.getElementById('v-list').innerHTML=allHtml||'<div style="color:var(--tl);text-align:center;padding:20px">Nenhum HC</div>';

  // Seção: Histórico de Transferidos (vendedores que saíram deste hub)
  const viewTid = sfTmId || (u?.role==='supervisor'?u.timeId:null);
  let lhTrans='';
  if(viewTid){
    DB.sellers.forEach(s=>{
      if(s.timeId===viewTid) return; // ainda está aqui
      const lastTransferOut = [...(s.transfers||[])].reverse().find(tr=>tr.fromTimeId===viewTid);
      if(!lastTransferOut) return;
      const tot=sellerTotalBefore(ymKey, s.id, lastTransferOut.date);
      const toTm=(DB.times||[]).find(t=>t.id===lastTransferOut.toTimeId);
      lhTrans+=`<div class="seller-item" style="opacity:.75">
        ${s.photo?`<div class="seller-ic" style="background:${s.color};overflow:hidden;padding:0"><img src="${s.photo}" style="width:100%;height:100%;object-fit:cover"></div>`:`<div class="seller-ic" style="background:${s.color}">${s.name[0]}</div>`}
        <div style="flex:1">
          <div class="seller-nm">${s.name}<span class="inativo-badge" style="background:rgba(124,58,237,.1);color:#7c3aed;border-color:rgba(124,58,237,.2)">TRANSFERIDO</span></div>
          <div class="seller-meta-txt">Saiu em ${lastTransferOut.date.split('-').reverse().join('/')} → ${toTm?.nome||'outro HUB'} · Vendas antes da transferência: <strong>${tot}</strong></div>
        </div>
      </div>`;
    });
  }
  if(lhTrans){
    document.getElementById('v-list').innerHTML+=(allHtml?'':'')+'<div style="margin-top:14px;padding-top:12px;border-top:1px dashed rgba(124,58,237,.3)"><div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:#7c3aed;margin-bottom:8px">📦 Histórico — Transferidos</div>'+lhTrans+'</div>';
  }

  renderTimesList();
  renderUserList();

  const utEl=document.getElementById('um-time');
  const urgEl=document.getElementById('um-regional');
  if(utEl){
    const ts=u?.role==='regional'?(DB.times||[]).filter(t=>t.regionalId===u.regionalId):(DB.times||[]);
    utEl.innerHTML=`<option value="">— Selecione —</option>`+ts.map(t=>`<option value="${t.id}">${t.nome}</option>`).join('');
  }
  if(urgEl) urgEl.innerHTML=`<option value="">— Selecione —</option>`+(DB.regionais||[]).map(r=>`<option value="${r.id}">${r.nome}</option>`).join('');
}

function renderTimesList(){
  const u=currentUser;
  const el=document.getElementById('times-list'); if(!el) return;
  const ymKey=currentYM, {y,m}=ymToYM(ymKey);
  const times=isGerente(u)?(DB.times||[]):(u?.role==='regional'?(DB.times||[]).filter(t=>t.regionalId===u.regionalId):(DB.times||[]).filter(t=>t.id===u?.timeId));
  if(!times.length){ el.innerHTML='<div style="color:var(--tl);text-align:center;padding:20px">Nenhum HUB cadastrado</div>'; return; }
  const canEdit = isGerente(u)||u?.role==='regional';
  const canDelete = isGerente(u); // Só gerente pode remover HUB
  el.innerHTML=times.map(t=>{
    const rg=(DB.regionais||[]).find(r=>r.id===t.regionalId);
    const cnt=DB.sellers.filter(s=>s.timeId===t.id&&!s.inativo).length;
    const sup=DB.users?.find(u=>u.role==='supervisor'&&u.timeId===t.id);
    const hubMeta=getHubMeta(ymKey,t.id);
    const real=DB.sellers.filter(s=>s.timeId===t.id&&!s.inativo).reduce((a,s)=>a+sellerTotal(ymKey,s.id),0);
    const isMySup = u?.role==='supervisor' && u.timeId===t.id;
    return `<div class="time-item" style="flex-direction:column;align-items:stretch;gap:8px">
      <div style="display:flex;align-items:center;gap:10px">
        <div class="time-ic" style="background:${t.color||'#2563eb'}">${(t.nome||'?')[0].toUpperCase()}</div>
        <div style="flex:1">
          <div class="time-nm">${t.nome||'HUB sem nome'}</div>
          <div class="time-sub">${rg?`Regional: ${rg.nome||'?'} · `:''}${cnt} HC · Realizado: ${real}${sup?` · Sup: @${sup.username}`:''}</div>
        </div>
        ${(canEdit||isMySup)?`<button class="btn btn-g" onclick="openHubEditById(${t.id})" style="font-size:11px;padding:4px 10px;border-color:rgba(37,99,235,.3);color:var(--blue)">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          Alterar
        </button>`:''}
        ${canDelete?`<button class="del-seller" onclick="delTime(${t.id})">Remover</button>`:''}
      </div>
      ${canEdit?`<div class="hub-meta-row">
        <label>Meta ${MESES[m]}:</label>
        <input type="number" id="hmeta-${t.id}" value="${hubMeta||''}" min="1" placeholder="0">
        <button class="save-meta-btn" onclick="saveHubMeta(${t.id})">Salvar</button>
        <span style="font-size:10.5px;color:var(--tl);margin-left:4px">${real}/${hubMeta||'?'} vendas</span>
      </div>`:''}
    </div>`;
  }).join('');
}

function saveHubMeta(timeId){
  const u = currentUser;
  // Somente gerente e regional podem alterar meta do HUB
  if(u?.role==='supervisor'){ toast('Apenas Gerente ou Regional pode alterar a meta do HUB','⚠️'); return; }
  const el=document.getElementById('hmeta-'+timeId);
  if(!el) return;
  const v=parseInt(el.value)||0;
  // Regional só pode alterar metas de HUBs da própria regional
  if(u?.role==='regional' && !isGerente(u)){
    const t=(DB.times||[]).find(x=>x.id===timeId);
    if(!t || t.regionalId !== u.regionalId){ toast('HUB não pertence à sua Regional','⚠️'); return; }
  }
  if(!DB.hubMetas) DB.hubMetas={};
  if(!DB.hubMetas[currentYM]) DB.hubMetas[currentYM]={};
  DB.hubMetas[currentYM][timeId]=v;
  saveDB(); renderDash(); renderSellers();
  toast(`Meta do HUB atualizada: ${v}`);
}

function renderUserList(){
  const u=currentUser;
  const el=document.getElementById('um-list'); if(!el) return;
  let users=DB.users||[];
  if(u?.role==='regional'){
    const tids=(DB.times||[]).filter(t=>t.regionalId===u.regionalId).map(t=>t.id);
    users=users.filter(x=>x.role==='supervisor'&&tids.includes(x.timeId));
  } else if(!isGerente(u)){ users=[]; }
  if(!users.length){ el.innerHTML='<div style="color:var(--tl);text-align:center;padding:20px">Nenhum usuário</div>'; return; }
  const labels={gerente:'Gerente',regional:'Admin Regional',supervisor:'Supervisor'};
  const classes={gerente:'role-gerente',regional:'role-regional',supervisor:'role-supervisor'};
  const canEdit = isGerente(u) || u?.username==='aldenir';
  el.innerHTML=`<div class="card"><div style="padding:12px 14px">`+users.map(x=>{
    const isSelf=currentUser?.id===x.id;
    const rg=(DB.regionais||[]).find(r=>r.id===x.regionalId);
    const tm=(DB.times||[]).find(t=>t.id===x.timeId);
    return `<div class="um-user-item">
      <div class="um-avatar" style="background:${x.color||'#2563eb'}">${(x.nome||x.username)[0].toUpperCase()}</div>
      <div class="um-user-info">
        <div class="um-user-name">${x.nome||x.username}<span class="role-badge ${classes[x.role]||'role-supervisor'}">${labels[x.role]||x.role}</span></div>
        <div class="um-user-sub">@${x.username}${rg?` · ${rg.nome}`:''}${tm?` › ${tm.nome}`:''}</div>
      </div>
      <div style="display:flex;gap:6px;align-items:center">
        ${canEdit&&!isSelf?`<button class="btn-sm" style="background:var(--blue-g);color:var(--blue);border:1px solid rgba(37,99,235,.2);border-radius:6px;padding:4px 9px;font-size:11px;font-weight:600;cursor:pointer;font-family:var(--font)" onclick="openEditUserModal(${x.id})">✏️ Editar</button>`:''}
        ${canEdit&&!isSelf?`<button class="del-seller" onclick="deleteUser(${x.id})">Remover</button>`:''}
        ${isSelf?`<span style="font-size:10px;color:var(--tl)">você</span>`:''}
      </div>
    </div>`;
  }).join('')+`</div></div>`;
}

function addSeller(){
  const name=document.getElementById('v-nome').value.trim().toUpperCase();
  if(!name){ toast('Informe o nome','⚠️'); return; }
  const meta=parseInt(document.getElementById('v-meta').value)||14;
  const color=document.getElementById('v-cor').value;
  const cpf=document.getElementById('v-cpf').value.trim();
  const admDate=document.getElementById('v-adm')?.value||fmtD(today());
  const photo = _newSellerPhoto||null;
  const u = currentUser;
  // Determina timeId de forma segura — supervisor usa sempre seu próprio HUB
  let timeId;
  if(u?.role==='supervisor'){
    if(!u.timeId){ toast('Seu usuário não está vinculado a nenhum HUB','⚠️'); return; }
    timeId = u.timeId; // força o HUB do supervisor, ignora o select
  } else if(u?.role==='regional' && !isGerente(u)){
    const timeIdRaw=document.getElementById('v-time')?.value;
    timeId=timeIdRaw?Number(timeIdRaw):null;
    const tids=(DB.times||[]).filter(t=>t.regionalId===u.regionalId).map(t=>t.id);
    if(timeId && !tids.includes(timeId)){ toast('HUB não pertence à sua Regional','⚠️'); return; }
  } else {
    const timeIdRaw=document.getElementById('v-time')?.value;
    timeId=timeIdRaw?Number(timeIdRaw):null;
  }
  // ID único baseado em timestamp — evita colisão em cadastros simultâneos
  const newId = Date.now();
  DB.nextId = newId + 1; // mantém nextId atualizado para compatibilidade
  DB.sellers.push({id:newId,name,cpf,meta,color,timeId,admDate,photo,_ts:newId});
  saveDB();
  document.getElementById('v-nome').value='';
  document.getElementById('v-cpf').value='';
  _newSellerPhoto=null;
  const prev=document.getElementById('v-photo-preview');
  if(prev) prev.innerHTML='<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--tl)" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>';
  renderSellers(); populateQESellers();
  toast(`${name} adicionado!`);
}

function delSeller(id){
  const s=DB.sellers.find(s=>s.id===id);
  if(!s) return;
  // Valida escopo
  const scopeIds = new Set(getScopedSellers(true).map(x=>x.id));
  if(!scopeIds.has(id)){ toast('Sem permissão para remover este HC','⚠️'); return; }
  if(confirm(`Inativar "${s.name}" em vez de excluir?\n\nInativar preserva todo o histórico de vendas.\nCancelar e clicar Excluir remove permanentemente.`)){
    toggleSellerInativo(id,true); return;
  }
}
function delSellerPermanent(id){
  const s=DB.sellers.find(s=>s.id===id);
  if(!s) return;
  // Valida escopo
  const scopeIds = new Set(getScopedSellers(true).map(x=>x.id));
  if(!scopeIds.has(id)){ toast('Sem permissão para excluir este HC','⚠️'); return; }
  if(!confirm(`⚠️ Excluir PERMANENTEMENTE "${s.name}"?\nO histórico de vendas será mantido, mas o HC não poderá ser restaurado.`)) return;
  if(!DB.deleted) DB.deleted={userIds:[],sellerIds:[],timeIds:[],regionalIds:[]};
  if(!DB.deleted.sellerIds.includes(String(id))) DB.deleted.sellerIds.push(String(id));
  DB.sellers=DB.sellers.filter(x=>x.id!==id);
  if(selectedSeller===id) selectedSeller=null;
  saveDB(); renderSellers(); renderDash(); populateQESellers();
  toast(`${s.name} excluído permanentemente`,'🗑️');
}
function onSellersFilterChange(){
  // Atualiza HUBs quando regional muda
  const u=currentUser;
  const sfRg=document.getElementById('sf-regional');
  const sfTm=document.getElementById('sf-time');
  if(sfRg&&sfTm){
    const rgId=u?.role==='regional'&&!isGerente(u)?u.regionalId:(parseInt(sfRg.value)||null);
    const times=rgId?(DB.times||[]).filter(t=>t.regionalId===rgId):(DB.times||[]);
    const prevT=sfTm.value;
    sfTm.innerHTML='<option value="">🏢 Todos os HUBs</option>'+times.map(t=>`<option value="${t.id}"${t.id==prevT?' selected':''}>${t.nome}</option>`).join('');
  }
  renderSellers();
}
function toggleSellerInativo(id, inativo){
  const s=DB.sellers.find(x=>x.id===id);
  if(!s) return;
  if(inativo){
    openInativarModal(id);
  } else {
    s.inativo=false; delete s.desligamento;
    saveDB(); renderSellers(); renderDash(); populateQESellers();
    toast(`${s.name} reativado ✓`);
  }
}
function openInativarModal(id){
  const s=DB.sellers.find(x=>x.id===id); if(!s) return;
  const modal=document.createElement('div');
  modal.id='inativar-modal';
  modal.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:500;display:flex;align-items:center;justify-content:center';
  modal.innerHTML=`<div style="background:var(--white);border-radius:var(--r);padding:24px 24px 20px;max-width:380px;width:90%;box-shadow:var(--sh2)">
    <div style="font-size:16px;font-weight:800;color:var(--td);margin-bottom:6px">Inativar ${s.name}</div>
    <div style="font-size:12px;color:var(--tl);margin-bottom:16px">Informe a data de desligamento. O HC só desaparecerá a partir do mês seguinte.</div>
    <label style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--tl);display:block;margin-bottom:5px">Data de Desligamento *</label>
    <input type="date" id="inativar-date" value="${fmtD(today())}" style="width:100%;border:1.5px solid var(--border);border-radius:var(--rs);padding:8px 12px;font-family:var(--font);font-size:13px;color:var(--td);background:var(--bg);outline:none;margin-bottom:16px;box-sizing:border-box">
    <div style="display:flex;gap:8px;justify-content:flex-end">
      <button onclick="document.getElementById('inativar-modal').remove()" style="background:var(--bg);border:1px solid var(--border);border-radius:var(--rs);padding:7px 16px;font-family:var(--font);font-size:12px;cursor:pointer">Cancelar</button>
      <button onclick="confirmInativar(${id})" style="background:#dc2626;color:#fff;border:none;border-radius:var(--rs);padding:7px 16px;font-family:var(--font);font-size:12px;font-weight:700;cursor:pointer">Confirmar Inativação</button>
    </div>
  </div>`;
  document.body.appendChild(modal);
}
function confirmInativar(id){
  const s=DB.sellers.find(x=>x.id===id); if(!s) return;
  const dt=document.getElementById('inativar-date')?.value;
  if(!dt){ toast('Informe a data','⚠️'); return; }
  s.inativo=true; s.desligamento=dt;
  saveDB(); renderSellers(); renderDash(); populateQESellers();
  document.getElementById('inativar-modal')?.remove();
  toast(`${s.name} inativado a partir de ${dt.split('-').reverse().join('/')}`);
}

// saveMeta removida — meta total agora é sempre a soma dos HUBs

// ══════════════════════════════════════════════════════════
//  HIERARCHY — Times
// ══════════════════════════════════════════════════════════
function addTime(){
  const nome     = document.getElementById('time-nome').value.trim();
  const color    = document.getElementById('time-cor').value;
  const metaHub  = parseInt(document.getElementById('time-meta')?.value)||0;
  const supUser  = document.getElementById('time-sup-user').value.trim().toLowerCase();
  const supPass  = document.getElementById('time-sup-pass').value;
  const supNome  = document.getElementById('time-sup-nome').value.trim();
  const u        = currentUser;

  if(!nome){ toast('Informe o nome do HUB','⚠️'); return; }
  if(!supUser||!supPass||supPass.length<4){ toast('Usuário/senha do supervisor inválidos','⚠️'); return; }
  if(DB.users?.find(x=>x.username===supUser)){ toast('Usuário já existe','⚠️'); return; }

  let regionalId = u.role==='regional' ? u.regionalId : parseInt(document.getElementById('time-regional')?.value)||null;

  if(!DB.times)    DB.times=[];
  if(!DB.hubMetas) DB.hubMetas={};
  const timeId = Date.now();
  DB.times.push({id:timeId, nome, color, regionalId});

  if(metaHub>0){
    if(!DB.hubMetas[currentYM]) DB.hubMetas[currentYM]={};
    DB.hubMetas[currentYM][timeId]=metaHub;
  }

  if(!DB.users) DB.users=[];
  const newSupTime={id:Date.now()+1, username:supUser, password:supPass, role:'supervisor',
    nome:supNome||supUser, timeId, regionalId, color:'#059669'};
  DB.users.push(newSupTime);
  // ── Garante que a senha fica no cache local E no seed em memória ──
  _updatePwCache([newSupTime]);
  _SEED_CREDS[supUser]=supPass;

  saveDB(); renderSellers();
  document.getElementById('time-nome').value='';
  document.getElementById('time-sup-user').value='';
  document.getElementById('time-sup-pass').value='';
  document.getElementById('time-sup-nome').value='';
  toast(`✅ HUB "${nome}" criado com supervisor @${supUser}!`);
}

function delTime(id){
  const t=(DB.times||[]).find(x=>x.id===id);
  if(!t||!confirm(`Remover HUB "${t.nome}"? HC vinculados ficam sem time.`)) return;
  if(!DB.deleted) DB.deleted={userIds:[],sellerIds:[],timeIds:[],regionalIds:[]};
  if(!DB.deleted.timeIds.includes(String(id))) DB.deleted.timeIds.push(String(id));
  // registra supervisores deste HUB como deletados
  (DB.users||[]).filter(x=>x.role==='supervisor'&&x.timeId===id).forEach(x=>{
    if(!DB.deleted.userIds.includes(String(x.id))) DB.deleted.userIds.push(String(x.id));
  });
  DB.times=(DB.times||[]).filter(x=>x.id!==id);
  DB.sellers.forEach(s=>{ if(s.timeId===id) s.timeId=null; });
  DB.users=(DB.users||[]).filter(x=>!(x.role==='supervisor'&&x.timeId===id));
  saveDB(); renderSellers();
  toast(`HUB "${t.nome}" removido`,'🗑️');
}

// ══════════════════════════════════════════════════════════
//  HIERARCHY — Regionais
// ══════════════════════════════════════════════════════════
function addRegional(){
  const nome     = document.getElementById('rg-nome').value.trim();
  const color    = document.getElementById('rg-cor').value;
  const admUser  = document.getElementById('rg-admin-user').value.trim().toLowerCase();
  const admPass  = document.getElementById('rg-admin-pass').value;
  const admNome  = document.getElementById('rg-admin-nome').value.trim();
  const timeNome = document.getElementById('rg-time-nome').value.trim();
  const supUser  = document.getElementById('rg-sup-user').value.trim().toLowerCase();
  const supPass  = document.getElementById('rg-sup-pass').value;
  const supNome  = document.getElementById('rg-sup-nome').value.trim();

  if(!nome){ toast('Informe o nome da regional','⚠️'); return; }
  if(!admUser||!admPass||admPass.length<4){ toast('Usuário/senha do admin inválidos','⚠️'); return; }
  if(!timeNome){ toast('Informe o nome do primeiro time','⚠️'); return; }
  if(!supUser||!supPass||supPass.length<4){ toast('Usuário/senha do supervisor inválidos','⚠️'); return; }
  if(DB.users?.find(x=>x.username===admUser)){ toast(`Usuário @${admUser} já existe`,'⚠️'); return; }
  if(DB.users?.find(x=>x.username===supUser)){ toast(`Usuário @${supUser} já existe`,'⚠️'); return; }

  if(!DB.regionais) DB.regionais=[];
  if(!DB.times)     DB.times=[];
  if(!DB.users)     DB.users=[];

  const rgId  = Date.now();
  const tmId  = Date.now()+1;
  const admId = Date.now()+2;
  const supId = Date.now()+3;

  DB.regionais.push({id:rgId, nome, color});
  DB.times.push({id:tmId, nome:timeNome, regionalId:rgId, color});
  const newAdmUser={id:admId, username:admUser, password:admPass, role:'regional',  nome:admNome||admUser, regionalId:rgId, timeId:null, color};
  const newSupUser2={id:supId, username:supUser, password:supPass, role:'supervisor', nome:supNome||supUser, regionalId:rgId, timeId:tmId,  color:'#059669'};
  DB.users.push(newAdmUser);
  DB.users.push(newSupUser2);
  // ── Garante que as senhas ficam no cache local E no seed em memória ──
  _updatePwCache([newAdmUser, newSupUser2]);
  _SEED_CREDS[admUser]=admPass;
  _SEED_CREDS[supUser]=supPass;

  saveDB(); renderRegionais(); populateDashFilter();

  // Limpa form
  ['rg-nome','rg-admin-user','rg-admin-pass','rg-admin-nome','rg-time-nome','rg-sup-user','rg-sup-pass','rg-sup-nome']
    .forEach(id=>{ const el=document.getElementById(id); if(el) el.value=''; });

  toast(`✅ Regional "${nome}" criada com time "${timeNome}", admin @${admUser} e supervisor @${supUser}!`);
  switchTab('rg-tab-lista', document.getElementById('rg-tab-btn-lista'));
}

function delRegional(id){
  const rg=(DB.regionais||[]).find(x=>x.id===id);
  if(!rg||!confirm(`Remover regional "${rg.nome}"?\nTimes e usuários vinculados também serão removidos.`)) return;
  if(!DB.deleted) DB.deleted={userIds:[],sellerIds:[],timeIds:[],regionalIds:[]};
  if(!DB.deleted.regionalIds.includes(String(id))) DB.deleted.regionalIds.push(String(id));
  const tids=(DB.times||[]).filter(t=>t.regionalId===id).map(t=>t.id);
  // registra HUBs e usuários desta regional como deletados
  tids.forEach(tid=>{ if(!DB.deleted.timeIds.includes(String(tid))) DB.deleted.timeIds.push(String(tid)); });
  (DB.users||[]).filter(u=>u.regionalId===id).forEach(u=>{
    if(!DB.deleted.userIds.includes(String(u.id))) DB.deleted.userIds.push(String(u.id));
  });
  DB.times=(DB.times||[]).filter(t=>t.regionalId!==id);
  DB.sellers.forEach(s=>{ if(tids.includes(s.timeId)) s.timeId=null; });
  DB.users=(DB.users||[]).filter(u=>u.regionalId!==id);
  DB.regionais=(DB.regionais||[]).filter(x=>x.id!==id);
  saveDB(); renderRegionais(); populateDashFilter();
  toast(`Regional "${rg.nome}" removida`,'🗑️');
}
