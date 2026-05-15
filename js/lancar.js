// ══ LANCAR.JS ══

function addVenda(){
  const sid=parseInt(document.getElementById('qe-seller').value);
  const date=document.getElementById('qe-date').value;
  const qty=parseInt(document.getElementById('qe-qty').value)||1;
  const type=document.getElementById('qe-type').value;
  if(!sid||!date){ toast('Preencha todos os campos','⚠️'); return; }
  const d=new Date(date+'T12:00:00'), {y,m}=ymToYM(currentYM);
  const ymKey=ym(d.getFullYear(),d.getMonth());
  if(!DB.vendas[ymKey]) DB.vendas[ymKey]=[];
  DB.vendas[ymKey].push({id:Date.now(),sellerId:sid,date,qty,type,ts:new Date().toISOString()});
  localStorage.setItem('bi_v5', JSON.stringify(DB)); // salva local imediatamente
  flashSaved();
  renderLancar();
  renderDash();
  renderPSVIfActive();
  const s=DB.sellers.find(s=>s.id===sid);
  toast(`✅ ${qty} ${type}(s) registrada(s) — ${s?.name}`);
  document.getElementById('qe-qty').value=1;
  // Pull-before-push: busca vendas de outros usuários antes de enviar
  setTimeout(cloudSyncVendas, 200);
}

function renderLancar(){
  populateQESellers();
  setDefaultDate();
  const ymKey=currentYM, {y,m}=ymToYM(ymKey);
  document.getElementById('hist-period').textContent=`${MESES[m]} ${y}`;

  const u = currentUser;
  const allVs=[...getVendas(ymKey)].sort((a,b)=>(b.ts||b.date||'').localeCompare(a.ts||a.date||''));

  // ── Monta lista base de vendedores visíveis por patente ──
  // GERENTE (inclui aldenir/superAdmin): usa lancarHubFilter/lancarRegionalFilter DIRETAMENTE
  // para não ser bloqueado pelo scopeFilter global (CE06-ALFA para aldenir).
  // OUTROS ROLES: usa getScopedSellers que já respeita o escopo da patente.
  let baseSellers;
  if(isGerente(u)){
    // Todos os sellers, respeitando inativo por data
    baseSellers = DB.sellers.filter(s=>{
      if(!s.inativo) return true;
      if(s.desligamento){
        const [dy,dm]=s.desligamento.split('-').map(Number);
        if(y < dy || (y===dy && m <= dm-1)) return true;
      }
      return false;
    });
    // Aplica filtro de HUB da página lançar
    if(lancarHubFilter){
      baseSellers = baseSellers.filter(s=>s.timeId===lancarHubFilter);
    } else if(lancarRegionalFilter){
      const tids=(DB.times||[]).filter(t=>t.regionalId===lancarRegionalFilter).map(t=>t.id);
      baseSellers = baseSellers.filter(s=>tids.includes(s.timeId));
    }
  } else {
    // Regional / Supervisor: escopo já restrito por getScopedSellers
    baseSellers = getScopedSellers(true);
    if(lancarHubFilter) baseSellers = baseSellers.filter(s=>s.timeId===lancarHubFilter);
  }

  const baseIds = new Set(baseSellers.map(s=>s.id));

  // ── Filtro adicional por vendedor individual ──
  const sellerIds = lancarSellerFilter
    ? new Set([lancarSellerFilter])
    : baseIds;

  // ── Configura barra de filtro ──
  _renderLancarFilterBar(baseSellers);

  // ── Filtra vendas por escopo + filtro ativo ──
  const myTid = u?.role==='supervisor' ? u.timeId : (lancarHubFilter||null);
  let vs = allVs.filter(v => sellerIds.has(v.sellerId));

  // Para supervisor: respeita regra de activeFrom (transferências)
  if(u?.role==='supervisor'){
    vs = vs.filter(v=>{
      const s = DB.sellers.find(x=>x.id===v.sellerId);
      if(s?.activeFrom && s.timeId===myTid){
        const af = new Date(s.activeFrom+'T00:00:00');
        if(af >= new Date(y,m+1,1)) return false;
        if(af.getFullYear()===y && af.getMonth()===m) return v.date>=s.activeFrom;
      }
      return true;
    });
  }

  // ── Histórico de transferidos (só quando o HUB está fixo) ──
  let vsHistorico = [];
  const hubIdForHist = u?.role==='supervisor' ? u.timeId : lancarHubFilter;
  if(hubIdForHist && !lancarSellerFilter){
    (DB.sellers||[]).forEach(s=>{
      if(s.timeId===hubIdForHist) return;
      const lastOut = [...(s.transfers||[])].reverse().find(tr=>tr.fromTimeId===hubIdForHist);
      if(!lastOut) return;
      allVs.filter(v=>v.sellerId===s.id && v.date<lastOut.date)
           .forEach(v=>vsHistorico.push({...v, _transferDate:lastOut.date, _seller:s}));
    });
    vsHistorico.sort((a,b)=>(b.ts||b.date||'').localeCompare(a.ts||a.date||''));
  }

  // ── Contagem ──
  const total = vs.length + vsHistorico.length;
  document.getElementById('hist-count').textContent=`${vs.length} registro${vs.length!==1?'s':''}${vsHistorico.length?` + ${vsHistorico.length} hist.`:''}`;

  function buildRow(v, isHist=false){
    const s = isHist ? v._seller : DB.sellers.find(x=>x.id===v.sellerId);
    const d=new Date(v.date+'T12:00:00');
    const dow=DSEM[d.getDay()];
    return `<tr style="${isHist?'opacity:.72;background:rgba(124,58,237,.025)':''}">
      <td class="mono" style="color:var(--tm)">${v.date.split('-').reverse().join('/')}</td>
      <td style="color:var(--tl);font-size:11px">${dow}</td>
      <td><div class="sc"><div class="sd" style="background:${s?.color||'#ccc'}"></div>${s?.name||'—'}${isHist?'<span style="font-size:9px;background:rgba(124,58,237,.1);color:#7c3aed;border:1px solid rgba(124,58,237,.2);border-radius:4px;padding:1px 5px;margin-left:5px;font-weight:700">HIST</span>':''}</div></td>
      <td class="mono fw7 fg-g">${v.qty}</td>
      <td><span style="font-size:11px;background:${v.type==='conquista'?'rgba(5,150,105,.1)':'rgba(37,99,235,.1)'};color:${v.type==='conquista'?'var(--green)':'var(--blue)'};padding:2px 7px;border-radius:4px;font-weight:600">${v.type}</span></td>
      <td>${!isHist?`<button class="del-btn" onclick="delVenda('${v.id}','${ymKey}')" title="Excluir">✕</button>`:''}</td>
    </tr>`;
  }

  let html='';
  if(vs.length===0 && vsHistorico.length===0){
    html=`<tr><td colspan="6" style="text-align:center;padding:24px;color:var(--tl)">Nenhuma venda registrada${lancarSellerFilter?' para este HC':' neste mês'}</td></tr>`;
  } else {
    if(vs.length===0){
      html=`<tr><td colspan="6" style="text-align:center;padding:16px 24px;color:var(--tl)">Nenhuma venda da equipe atual neste mês</td></tr>`;
    } else {
      vs.forEach(v=>{ html+=buildRow(v); });
    }
    if(vsHistorico.length>0){
      html+=`<tr><td colspan="6" style="padding:6px 14px 4px;border-top:2px dashed rgba(124,58,237,.25)">
        <span style="font-size:9.5px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:#7c3aed">📦 Histórico — HC Transferidos</span>
      </td></tr>`;
      vsHistorico.forEach(v=>{ html+=buildRow(v, true); });
    }
  }
  document.getElementById('hist-tb').innerHTML=html;
}

// ── Monta / atualiza a barra de filtro da página Lançar ──
function _renderLancarFilterBar(baseSellers){
  const u = currentUser;
  const bar = document.getElementById('lancar-filter-bar');
  if(!bar) return;

  const rgSel  = document.getElementById('lf-regional');
  const hubSel = document.getElementById('lf-hub');
  const selSel = document.getElementById('lf-seller');
  const clrBtn = document.getElementById('lf-clear-btn');
  const info   = document.getElementById('lf-info');

  bar.style.display='flex';

  // ── Mostra Regional só para gerente (inclui aldenir) ──
  if(isGerente(u) && rgSel){
    rgSel.style.display='';
    const prev = String(lancarRegionalFilter||'');
    rgSel.innerHTML='<option value="">🏠 Todas as Regionais</option>'
      +(DB.regionais||[]).map(r=>`<option value="${r.id}"${String(r.id)===prev?' selected':''}>${r.nome}</option>`).join('');
    if(lancarRegionalFilter) rgSel.value=String(lancarRegionalFilter);
  } else if(rgSel){
    rgSel.style.display='none';
  }

  // ── HUBs disponíveis baseados no filtro de regional ──
  let hubsDisponiveis;
  if(isGerente(u)){
    hubsDisponiveis = lancarRegionalFilter
      ? (DB.times||[]).filter(t=>t.regionalId===lancarRegionalFilter)
      : (DB.times||[]);
  } else if(u?.role==='regional'){
    hubsDisponiveis = (DB.times||[]).filter(t=>t.regionalId===u.regionalId);
  } else {
    hubsDisponiveis = [];
  }

  // ── Mostra HUB para gerente e regional com mais de 1 HUB ──
  if(hubSel){
    if(hubsDisponiveis.length > 1){
      hubSel.style.display='';
      const prev = String(lancarHubFilter||'');
      hubSel.innerHTML='<option value="">🏢 Todos os HUBs</option>'
        +hubsDisponiveis.map(t=>`<option value="${t.id}"${String(t.id)===prev?' selected':''}>${t.nome}</option>`).join('');
      if(lancarHubFilter) hubSel.value=String(lancarHubFilter);
    } else {
      hubSel.style.display='none';
    }
  }

  // ── Vendedores do escopo atual (ativos) ──
  if(selSel){
    const prev = String(lancarSellerFilter||'');
    const sellers = baseSellers.filter(s=>!s.inativo).sort((a,b)=>a.name.localeCompare(b.name));
    selSel.innerHTML='<option value="">👤 Todos ('+sellers.length+')</option>'
      +sellers.map(s=>`<option value="${s.id}"${String(s.id)===prev?' selected':''}>${s.name}</option>`).join('');
    if(lancarSellerFilter) selSel.value=String(lancarSellerFilter);
  }

  // ── Botão limpar ──
  const hasFilter = !!(lancarSellerFilter || lancarHubFilter || lancarRegionalFilter);
  if(clrBtn) clrBtn.style.display = hasFilter ? '' : 'none';

  // ── Info contextual ──
  if(info){
    const parts = [];
    if(lancarRegionalFilter){
      const rg=(DB.regionais||[]).find(r=>r.id===lancarRegionalFilter);
      if(rg) parts.push(rg.nome);
    } else if(u?.role==='regional' && !isGerente(u)){
      const rg=(DB.regionais||[]).find(r=>r.id===u.regionalId);
      if(rg) parts.push(rg.nome);
    }
    if(lancarHubFilter){
      const tm=(DB.times||[]).find(t=>t.id===lancarHubFilter);
      if(tm) parts.push(tm.nome);
    } else if(u?.role==='supervisor'){
      const tm=(DB.times||[]).find(t=>t.id===u.timeId);
      if(tm) parts.push(tm.nome);
    }
    if(lancarSellerFilter){
      const s=DB.sellers.find(x=>x.id===lancarSellerFilter);
      if(s) parts.push(s.name);
    }
    info.textContent = parts.length ? parts.join(' › ') : '';
  }
}

function onLancarRegionalChange(){
  lancarRegionalFilter = parseInt(document.getElementById('lf-regional')?.value)||null;
  lancarHubFilter      = null;
  lancarSellerFilter   = null;
  const hubSel = document.getElementById('lf-hub');
  const selSel = document.getElementById('lf-seller');
  if(hubSel) hubSel.value='';
  if(selSel) selSel.value='';
  renderLancar();
}

function onLancarHubChange(){
  lancarHubFilter    = parseInt(document.getElementById('lf-hub')?.value)||null;
  lancarSellerFilter = null;
  const selSel = document.getElementById('lf-seller');
  if(selSel) selSel.value='';
  renderLancar();
}

function onLancarSellerChange(){
  lancarSellerFilter = parseInt(document.getElementById('lf-seller')?.value)||null;
  renderLancar();
}

function clearLancarFilter(){
  const u = currentUser;
  lancarSellerFilter   = null;
  lancarHubFilter      = null;
  lancarRegionalFilter = null;
  const rgSel  = document.getElementById('lf-regional');
  const hubSel = document.getElementById('lf-hub');
  const selSel = document.getElementById('lf-seller');
  if(rgSel)  rgSel.value='';
  if(hubSel) hubSel.value='';
  if(selSel) selSel.value='';
  renderLancar();
}

function delVenda(id,ymKey){
  const venda = (DB.vendas[ymKey]||[]).find(v=>String(v.id)===String(id));
  if(venda){
    const scopeIds = new Set(getScopedSellers(true).map(s=>s.id));
    if(!scopeIds.has(venda.sellerId)){ toast('Sem permissão para excluir este registro','⚠️'); return; }
  }
  if(!DB.deletedVendaIds) DB.deletedVendaIds = {};
  if(!DB.deletedVendaIds[ymKey]) DB.deletedVendaIds[ymKey] = [];
  if(!DB.deletedVendaIds[ymKey].includes(String(id))) DB.deletedVendaIds[ymKey].push(String(id));
  DB.vendas[ymKey]=(DB.vendas[ymKey]||[]).filter(v=>String(v.id)!==String(id));
  saveDB(); renderLancar(); renderDash();
  toast('Registro excluído','🗑️');
}

function clearMonthHistory(){
  if(!confirm(`Apagar TODOS os lançamentos de ${MESES[ymToYM(currentYM).m]}?\nEsta ação não pode ser desfeita.`)) return;
  const scopeIds = new Set(getScopedSellers(true).map(s=>s.id));
  const existing = DB.vendas[currentYM] || [];
  if(!DB.deletedVendaIds) DB.deletedVendaIds = {};
  if(!DB.deletedVendaIds[currentYM]) DB.deletedVendaIds[currentYM] = [];
  existing.filter(v => scopeIds.has(v.sellerId)).forEach(v => {
    const sid = String(v.id);
    if(!DB.deletedVendaIds[currentYM].includes(sid)) DB.deletedVendaIds[currentYM].push(sid);
  });
  // Mantém vendas fora do escopo do usuário (outros HUBs/regionais)
  DB.vendas[currentYM] = existing.filter(v => !scopeIds.has(v.sellerId));
  saveDB(); renderLancar(); renderDash();
  toast('Histórico do mês limpo','🗑️');
}

// ══════════════════════════════════════════════════════════
//  SELLERS PAGE
// ══════════════════════════════════════════════════════════
function switchTab(paneId, btn){
  const wrap = btn?.closest('.tabs');
  if(wrap) wrap.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('on'));
  const page = btn?.closest('.page') || document.body;
  // deactivate all panes at same level
  const prefix = paneId.substring(0, paneId.lastIndexOf('-'));
  page.querySelectorAll('.tab-pane').forEach(p=>{
    if(p.id && p.id.startsWith(prefix)) p.classList.remove('on');
  });
  if(btn) btn.classList.add('on');
  const pane = document.getElementById(paneId);
  if(pane) pane.classList.add('on');
}
