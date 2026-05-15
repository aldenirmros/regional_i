// ══ PSV.JS ══

function renderPSV(){
  if(!document.getElementById('page-psv')?.classList.contains('active')) return;
  // Cancela render anterior pendente (evita duplicação quando online dispara cloudPull + onMesChange juntos)
  clearTimeout(renderPSV._t);
  renderPSV._t = setTimeout(_doRenderPSV, 30);
}
function _doRenderPSV(){
  if(!document.getElementById('page-psv')?.classList.contains('active')) return;
  const ymKey = currentYM;
  const {y,m} = ymToYM(ymKey);

  // ── Passo 1: reconstrói os dropdowns ANTES de ler os valores ──
  // Isso garante que os options existam e o value selecionado esteja correto.
  _renderPSVFilter();

  // ── Passo 2: lê os filtros PSV (após reconstrução dos dropdowns) ──
  const psvRgId = parseInt(document.getElementById('psv-df-regional')?.value)||null;
  const psvTmId = parseInt(document.getElementById('psv-df-time')?.value)||null;
  const u = currentUser;

  // ── Passo 3: constrói sellers independentemente do scopeFilter do Dashboard ──
  // Parte do conjunto completo de sellers (respeitando inativação por mês),
  // depois aplica as restrições hierárquicas do usuário logado + filtro PSV.
  const {y: cy, m: cm} = ymToYM(currentYM);
  let baseSellers = DB.sellers.filter(s=>{
    if(!s.inativo) return true;
    if(s.desligamento){
      const [dy,dm]=s.desligamento.split('-').map(Number);
      if(cy < dy || (cy===dy && cm <= dm-1)) return true;
    }
    return false;
  });

  // Aplica restrição hierárquica do role do usuário
  if(u.role==='supervisor'){
    baseSellers = baseSellers.filter(s=>s.timeId===u.timeId);
  } else if(u.role==='regional' && !isGerente(u)){
    const tids=(DB.times||[]).filter(t=>t.regionalId===u.regionalId).map(t=>t.id);
    baseSellers = baseSellers.filter(s=>tids.includes(s.timeId));
  }
  // Gerentes/super admin: baseSellers é toda a empresa (sem restrição de role)

  // Aplica filtro de HUB/Regional selecionado na PSV
  let sellers = baseSellers;
  if(psvTmId){
    sellers = baseSellers.filter(s=>s.timeId===psvTmId);
  } else if(psvRgId){
    const tids=(DB.times||[]).filter(t=>t.regionalId===psvRgId).map(t=>t.id);
    sellers = baseSellers.filter(s=>tids.includes(s.timeId));
  }

  const el = document.getElementById('psv-sub');
  if(el) el.textContent = `${MESES[m]} ${y} · ${sellers.length} HC`;
  _renderHCGrid(sellers);
  _renderPSVKpis(ymKey, y, m, sellers);
  _renderPSVCharts(ymKey,y,m,sellers);
  _renderPhotosRow(sellers);
  _renderPSVSellerChart(ymKey,sellers);
  // MAPA SEMANAL — disponível para todos os usuários
  renderMapaSemanal(ymKey, sellers, 'psv-mapa-semanal');
  _renderDPGrid();
  psvLoadPlan();
  _renderPlanTable();
  setTimeout(_restoreDpFields, 0);
}
// Auto-atualiza PSV se a página estiver aberta
function renderPSVIfActive(){ if(document.getElementById('page-psv')?.classList.contains('active')) renderPSV(); }

// ── Filtro PSV (mesmas regras do dashboard) ──
function _renderPSVFilter(){
  const u = currentUser;
  const bar = document.getElementById('psv-filter-bar');
  if(!bar) return;
  if(!canFilterDash(u)){ bar.style.display='none'; return; }
  bar.style.display='flex';
  const rgSel = document.getElementById('psv-df-regional');
  const tmSel = document.getElementById('psv-df-time');
  if(u.role==='supervisor'){ bar.style.display='none'; return; }

  // Preserva seleções atuais ANTES de reconstruir o HTML
  const prevRg = rgSel?.value || '';
  const prevTm = tmSel?.value || '';

  if(u.role==='regional'&&!isGerente(u)){
    if(rgSel){ const myRg=(DB.regionais||[]).find(r=>r.id===u.regionalId); rgSel.innerHTML=myRg?`<option value="${myRg.id}">${myRg.nome}</option>`:''; rgSel.value=u.regionalId||''; rgSel.style.display='none'; }
  } else {
    if(rgSel){
      rgSel.style.display='';
      rgSel.innerHTML=`<option value="">🏠 Todas as Regionais</option>`+(DB.regionais||[]).map(r=>`<option value="${r.id}">${r.nome}</option>`).join('');
      // Restaura explicitamente o valor selecionado
      if(prevRg) rgSel.value = prevRg;
    }
  }

  // HUBs: filtra pela regional selecionada (ou todos se nenhuma)
  const rgId = u.role==='regional'&&!isGerente(u) ? u.regionalId : (parseInt(rgSel?.value)||null);
  const times = rgId ? (DB.times||[]).filter(t=>t.regionalId===rgId) : (DB.times||[]);
  if(tmSel){
    tmSel.innerHTML=`<option value="">🏢 Todos os HUBs</option>`+times.map(t=>`<option value="${t.id}">${t.nome}</option>`).join('');
    // Restaura explicitamente o valor selecionado (só se ainda existir na lista)
    if(prevTm && times.some(t=>String(t.id)===prevTm)){
      tmSel.value = prevTm;
    }
  }
}

function _renderPSVKpis(ymKey, y, m, sellers){
  const row = document.getElementById('psv-top-row'); if(!row) return;
  const t = today();

  // ── Fonte única: getMonthTimeStats — idêntico ao Dashboard ──
  const { duTotal, duPass, duRest } = getMonthTimeStats(ymKey);

  const real  = sellers.reduce((a,s)=>a+sellerTotal(ymKey,s.id),0);

  // Meta — mesma lógica do dashboard
  const psvRgId  = parseInt(document.getElementById('psv-df-regional')?.value)||null;
  const psvTmId  = parseInt(document.getElementById('psv-df-time')?.value)||null;
  const u = currentUser;
  let meta;
  if(psvTmId){
    meta = getHubMeta(ymKey, psvTmId);
  } else if(psvRgId){
    const tids=(DB.times||[]).filter(t=>t.regionalId===psvRgId).map(t=>t.id);
    meta = tids.reduce((a,id)=>a+getHubMeta(ymKey,id),0);
  } else if(u?.role==='supervisor'){
    meta = getHubMeta(ymKey, u.timeId);
  } else if(u?.role==='regional' && !isGerente(u)){
    const tids=(DB.times||[]).filter(t=>t.regionalId===u.regionalId).map(t=>t.id);
    meta = tids.reduce((a,id)=>a+getHubMeta(ymKey,id),0);
  } else {
    const scopeTids = [...new Set(sellers.map(s=>s.timeId).filter(Boolean))];
    meta = scopeTids.reduce((a,id)=>a+getHubMeta(ymKey,id),0);
    if(!meta) meta = sellers.reduce((a,s)=>a+getSellerMeta(ymKey,s.id),0);
  }

  // Projeção: mesmo cálculo do dashboard
  const gap  = Math.max(0, meta - real);
  const proj = duPass > 0 ? Math.round(real / duPass * duTotal) : 0;
  // Lê ativação filtrada pelo userId logado (formato: {ymKey: {userId: val}})
  const _ovAtvUserId = String(currentUser?.id || 'default');
  const _ovAtvYmObj  = (DB.ativacaoManual||{})[ymKey];
  const _ovAtvManual = (_ovAtvYmObj != null && typeof _ovAtvYmObj === 'object')
    ? (_ovAtvYmObj[_ovAtvUserId] ?? null)
    : (typeof _ovAtvYmObj === 'number' ? _ovAtvYmObj : null); // retrocompatibilidade
  const atv  = _ovAtvManual !== null
    ? _ovAtvManual
    : sellers.reduce((a,s)=>a+totalAtivacao(ymKey,s.id),0);
  const pct  = meta > 0 ? Math.round(real / meta * 100) : 0;

  const mc={m0:0,m1:0,m2:0,full:0};
  sellers.forEach(s=>{ mc[sellerMaturity(s)]++; });

  // Percentuais de cada KPI
  const pctReal = pct; // real/meta*100 (já calculado)
  const pctGap  = meta > 0 ? Math.round(gap  / meta * 100) : 0;
  const pctProj = meta > 0 ? Math.round(proj / meta * 100) : 0;
  const pctAtv  = real > 0 ? (atv / real * 100).toFixed(1) : '0.0';

  const kpis = [
    {lbl:'Meta Total',val:meta,    color:'#2563eb', sub:'base do mês',                   subColor:'var(--tl)'},
    {lbl:'Realizado', val:real,    color:'#059669', sub:`${pctReal}% da meta`,             subColor:pctReal>=100?'#059669':pctReal>=80?'#d97706':'#dc2626'},
    {lbl:'GAP',       val:gap,     color:gap>0?'#dc2626':'#059669', sub:`${pctGap}% da meta`,subColor:gap>0?'#dc2626':'#059669'},
    {lbl:'Projeção',  val:proj,    color:'#7c3aed', sub:`${pctProj}% da meta`,             subColor:pctProj>=100?'#059669':pctProj>=80?'#d97706':'#dc2626'},
    {lbl:'% Meta',    val:pct+'%', color:pct>=100?'#059669':pct>=80?'#d97706':'#dc2626', sub:pct>=100?'✓ Meta atingida':pct>=80?'Quase lá':'Abaixo da meta', subColor:pct>=100?'#059669':pct>=80?'#d97706':'#dc2626'},
  ];

  const tidsNoScope = [...new Set(sellers.map(s=>s.timeId).filter(Boolean))];
  let safraM0 = tidsNoScope.reduce((a,tid)=>a+((DB.mValues||{})[ymKey]?.[tid]?.M0||0),0);
  let safraM1 = tidsNoScope.reduce((a,tid)=>a+((DB.mValues||{})[ymKey]?.[tid]?.M1||0),0);
  let safraM2 = tidsNoScope.reduce((a,tid)=>a+((DB.mValues||{})[ymKey]?.[tid]?.M2||0),0);

  const safraCols = [
    {k:'M0', v:safraM0, c:'#2563eb', bg:'rgba(37,99,235,.07)', border:'rgba(37,99,235,.2)'},
    {k:'M1', v:safraM1, c:'#7c3aed', bg:'rgba(124,58,237,.07)', border:'rgba(124,58,237,.2)'},
    {k:'M2', v:safraM2, c:'#d97706', bg:'rgba(217,119,6,.07)', border:'rgba(217,119,6,.2)'},
  ];

  // TPV: lê da nova tabela DB.psvTpv por hubId + userId do dono do HUB
  const hubId = String(_getHubIdForPsv());
  const _tpvUserId = _getPsvOwnerUserId(); // visão hierárquica: supervisor do HUB
  function getTpvVal(mk, field){
    const row = (DB.psvTpv||[]).find(r => String(r.userId||'')===_tpvUserId && String(r.ymKey)===String(ymKey) && String(r.hubId)===String(hubId) && String(r.mk)===String(mk));
    if(row && row[field] != null) return row[field];
    // Fallback legado: sem userId (registros antigos)
    const rowLegacy = (DB.psvTpv||[]).find(r => !r.userId && String(r.ymKey)===String(ymKey) && String(r.hubId)===String(hubId) && String(r.mk)===String(mk));
    if(rowLegacy && rowLegacy[field] != null) return rowLegacy[field];
    // Fallback legado para psvData
    if(field==='valor_real' && DB.psvData?.tpv?.[ymKey]?.[mk]) return DB.psvData.tpv[ymKey][mk];
    if(field==='valor_proj' && DB.psvData?.tpvProj?.[ymKey]?.[mk]) return DB.psvData.tpvProj[ymKey][mk];
    return null;
  }
  function tpvColor(v){ if(!v||v<15000) return '#dc2626'; if(v<20000) return '#d97706'; return '#059669'; }

  // ── Células KPI (5 células: Meta Total, Realizado, GAP, Projeção, % Meta) ──
  kpis.forEach((k, ki)=>{
    const d = document.createElement('div');
    // Reutiliza exatamente as mesmas classes .kc do Dashboard
    const accentClass = ['kc-b','kc-g','kc-r','kc-o','kc-g'][ki];
    d.className = `kc ${accentClass}`;
    d.style.cssText = 'min-width:0;display:flex;flex-direction:column;justify-content:space-between;';

    // Barra de progresso slim com glow (só para Realizado e Projeção)
    const showBar = ki === 1 || ki === 3;
    const barPct  = ki === 1 ? Math.min(100, pctReal)
                  : ki === 3 ? Math.min(100, pctProj)
                  : 0;
    const barFillCls = ki === 1 ? 'kc-pf' : 'kc-pf';

    const isNumeric = typeof k.val === 'number';
    const uid = `psv-kpi-val-${ki}`;

    d.innerHTML = `
      <div class="kc-bar"></div>
      <div class="kc-lbl">${k.lbl}</div>
      <div class="kc-val" id="${uid}" style="color:${k.color};font-size:28px">${k.val}</div>
      ${showBar ? `<div class="kc-prog"><div class="kc-pf" style="width:${barPct}%;background:${ki===1?'linear-gradient(90deg,var(--green),var(--green-l))':'linear-gradient(90deg,var(--orange),var(--orange-l))'}"></div></div>` : ''}
      <div class="kc-sub" style="color:${k.subColor}">${k.sub}</div>`;
    row.appendChild(d);

    // Anima apenas os valores numéricos
    if(isNumeric) _kpiCount(uid, k.val);
  });

  // ── Célula ATIVADO — espelha o card do Dashboard (input + barra + %) ──
  const _atvUserId2 = String(currentUser?.id || 'default');
  const _atvYmObj2  = (DB.ativacaoManual||{})[ymKey];
  let atvManual2 = null;
  if(_atvYmObj2 !== undefined && _atvYmObj2 !== null){
    atvManual2 = typeof _atvYmObj2 === 'object' ? (_atvYmObj2[_atvUserId2] ?? null) : _atvYmObj2;
  }
  const _atvAuto2 = sellers.reduce((a,s)=>a+totalAtivacao(ymKey,s.id),0);
  const atvVal2   = atvManual2 !== null ? atvManual2 : _atvAuto2;
  const atvFill2  = real > 0 ? Math.min(100, atvVal2 / real * 100).toFixed(1) : '0.0';
  const atvPctTxt2 = real > 0 ? (atvVal2 / real * 100).toFixed(1) : '0.0';

  const atvCd = document.createElement('div');
  atvCd.className = 'kc kc-t';
  atvCd.style.cssText = 'min-width:0;display:flex;flex-direction:column;justify-content:space-between;';
  atvCd.innerHTML = `
    <div class="kc-bar"></div>
    <div class="kc-lbl">Ativado</div>
    <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">
      <input type="number" id="psv-atv-input" min="0" placeholder="${_atvAuto2||0}"
        value="${atvManual2 !== null ? atvManual2 : ''}"
        style="width:72px;background:rgba(13,148,136,.08);border:2px solid rgba(13,148,136,.3);border-radius:8px;padding:4px 8px;font-family:var(--mono);font-size:20px;font-weight:800;color:var(--teal);outline:none;text-align:center;-moz-appearance:textfield;"
        oninput="previewPsvAtivacao()" onkeydown="if(event.key==='Enter'){savePsvAtivacao();this.blur();event.preventDefault()}">
      <button onclick="savePsvAtivacao()" class="atv-save-btn">✓</button>
    </div>
    <div class="atv-pct-row" style="margin-top:0">
      <div class="atv-bar"><div class="atv-fill" id="psv-atv-fill" style="width:${atvFill2}%"></div></div>
      <span id="psv-atv-pct" class="atv-lbl">${atvPctTxt2}%</span>
    </div>
    <div id="psv-atv-sub" class="kc-sub">${atvVal2} de ${real} (${atvPctTxt2}%)</div>`
  row.appendChild(atvCd);

  // ── Célula SAFRA ──
  const safraCd=document.createElement('div');
  safraCd.className = 'kc';
  safraCd.style.cssText='border-left:4px solid #78716c;padding:0;min-width:0;overflow:hidden;display:flex;flex-direction:column;';
  safraCd.innerHTML=`
    <div style="padding:7px 10px 5px;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:var(--tl);border-bottom:1px solid var(--border)">🌾 SAFRA</div>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;flex:1">
      ${safraCols.map(s=>`
        <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:8px 4px;background:${s.bg};border-right:1px solid ${s.border}">
          <div style="font-size:24px;font-weight:900;font-family:var(--mono);color:${s.c};line-height:1">${s.v||0}</div>
          <div style="font-size:9px;font-weight:800;letter-spacing:.8px;color:${s.c};margin-top:2px;opacity:.85">${s.k}</div>
        </div>`).join('')}
    </div>
    <div style="border-top:1px solid var(--border);background:var(--bg)">
      <div style="padding:3px 8px 2px;font-size:8.5px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--tl)">TPV médio real</div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr">
        ${safraCols.map(s=>{
          const cur=getTpvVal(s.k,'valor_real'); const c=tpvColor(cur);
          return `<div style="padding:3px 4px 4px;border-right:1px solid ${s.border};text-align:center">
            <div style="font-size:9px;color:var(--tl);font-weight:600;margin-bottom:1px">R$</div>
            <input type="text" inputmode="numeric" id="psv-tpv-${s.k}" value="${cur?fmtBRL(cur):''}" placeholder="0,00"
              style="width:100%;text-align:center;border:1px solid var(--border);border-radius:4px;padding:3px 1px;font-family:var(--mono);font-size:11px;font-weight:800;color:${c};background:var(--white);outline:none;"
              oninput="formatTpvInput(this);this.style.color='var(--tl)'"
              onkeydown="if(event.key==='Enter'){savePsvTpv(this,'${s.k}','${ymKey}');this.blur();event.preventDefault()}"
              onblur="savePsvTpv(this,'${s.k}','${ymKey}')">
          </div>`;
        }).join('')}
      </div>
    </div>
    <div style="border-top:1px solid var(--border);background:rgba(124,58,237,.04)">
      <div style="padding:3px 8px 2px;font-size:8.5px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#7c3aed">TPV projetado</div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr">
        ${safraCols.map(s=>{
          const cur=getTpvVal(s.k,'valor_proj'); const c=tpvColor(cur);
          return `<div style="padding:3px 4px 6px;border-right:1px solid ${s.border};text-align:center">
            <div style="font-size:9px;color:#7c3aed;font-weight:600;margin-bottom:1px">R$</div>
            <input type="text" inputmode="numeric" id="psv-tpvproj-${s.k}" value="${cur?fmtBRL(cur):''}" placeholder="0,00"
              style="width:100%;text-align:center;border:1px solid rgba(124,58,237,.3);border-radius:4px;padding:3px 1px;font-family:var(--mono);font-size:11px;font-weight:800;color:${c};background:var(--white);outline:none;"
              oninput="formatTpvInput(this);this.style.color='var(--tl)'"
              onkeydown="if(event.key==='Enter'){savePsvTpvProj(this,'${s.k}','${ymKey}');this.blur();event.preventDefault()}"
              onblur="savePsvTpvProj(this,'${s.k}','${ymKey}')">
          </div>`;
        }).join('')}
      </div>
    </div>`;
  row.appendChild(safraCd);
}

function _renderHCGrid(sellers){
  // Renderiza o card HC — _renderPSVKpis vai completar os demais cells
  const row = document.getElementById('psv-top-row'); if(!row) return;
  row.innerHTML=''; // limpa tudo; será reconstruído aqui + em _renderPSVKpis

  const times  = (DB.times||[]).filter(t=>sellers.some(s=>s.timeId===t.id));
  const mC     = {m0:'#2563eb',m1:'#7c3aed',m2:'#d97706',full:'#059669'};

  // ── Card 1: HC ──
  let hcBody='';
  if(!times.length){
    hcBody='<div style="font-size:11px;color:var(--tl)">Nenhum HUB</div>';
  } else {
    times.forEach(t=>{
      const ts=sellers.filter(s=>s.timeId===t.id);
      const cnt={m0:0,m1:0,m2:0,full:0};
      ts.forEach(s=>cnt[sellerMaturity(s)]++);
      const rg=(DB.regionais||[]).find(r=>r.id===t.regionalId);
      const ac=rg?.color||'#2563eb';
      hcBody+=`<div style="margin-bottom:9px">
        <div style="font-size:11px;font-weight:800;color:${ac};display:flex;align-items:center;gap:4px;margin-bottom:6px">
          <div style="width:6px;height:6px;border-radius:50%;background:${ac};flex-shrink:0"></div>
          ${t.nome}
          <span style="font-size:17px;font-weight:900;font-family:var(--mono);color:${ac};margin-left:2px">${ts.length}</span>
          <span style="font-size:9px;color:var(--tl)">HC</span>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px">
          ${['m0','m1','m2','full'].map(k=>`
            <div style="display:flex;align-items:center;gap:5px;background:${mC[k]}12;border-radius:5px;padding:4px 7px;border:1px solid ${mC[k]}30">
              <span style="font-size:17px;font-weight:900;font-family:var(--mono);color:${mC[k]};line-height:1">${cnt[k]}</span>
              <span style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;color:${mC[k]};opacity:.85">${k}</span>
            </div>`).join('')}
        </div>
      </div>`;
    });
  }

  const hcEl=document.createElement('div');
  hcEl.className='kc kc-g';
  hcEl.style.cssText='padding:12px 14px;min-width:0;overflow:hidden;';
  hcEl.innerHTML=`<div class="kc-bar"></div><div class="kc-lbl" style="color:#059669;margin-bottom:8px">👥 HC por Safra</div>${hcBody}`;
  row.appendChild(hcEl);
}

function _renderPSVCharts(ymKey,y,m,sellers){
  const t=today();
  // ── Fonte única: getMonthTimeStats — idêntico ao Dashboard e a _renderPSVKpis ──
  const { duTotal, duPass } = getMonthTimeStats(ymKey);

  const real=sellers.reduce((a,s)=>a+sellerTotal(ymKey,s.id),0);

  // Meta — mesma lógica do dashboard: metas dos HUBs filtrados
  const psvRgId = parseInt(document.getElementById('psv-df-regional')?.value)||null;
  const psvTmId = parseInt(document.getElementById('psv-df-time')?.value)||null;
  const u = currentUser;
  let meta;
  if(psvTmId){
    meta = getHubMeta(ymKey, psvTmId);
  } else if(psvRgId){
    const tids=(DB.times||[]).filter(t=>t.regionalId===psvRgId).map(t=>t.id);
    meta = tids.reduce((a,id)=>a+getHubMeta(ymKey,id),0);
  } else if(u?.role==='supervisor'){
    meta = getHubMeta(ymKey, u.timeId);
  } else if(u?.role==='regional' && !isGerente(u)){
    const tids=(DB.times||[]).filter(t=>t.regionalId===u.regionalId).map(t=>t.id);
    meta = tids.reduce((a,id)=>a+getHubMeta(ymKey,id),0);
  } else {
    const scopeTids=[...new Set(sellers.map(s=>s.timeId).filter(Boolean))];
    meta = scopeTids.reduce((a,id)=>a+getHubMeta(ymKey,id),0);
    if(!meta) meta = sellers.reduce((a,s)=>a+getSellerMeta(ymKey,s.id),0);
  }

  // Donut — espelho exato do dashboard: usa real e gap (max(0, meta-real))
  const gap   = Math.max(0, meta - real);
  const pct   = meta > 0 ? real / meta : 0;
  const donutFillColor = linePointColor(pct, 1);

  const psvDonutPlugin = {
    id:'psvDonutCenter',
    afterDraw(chart){
      const {ctx, chartArea:{top,bottom,left,right}} = chart;
      const cx=(left+right)/2, cy=(top+bottom)/2;
      ctx.save();
      ctx.font='800 26px "JetBrains Mono",monospace';
      ctx.fillStyle=donutFillColor;
      ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.fillText(meta>0 ? Math.round(pct*100)+'%' : '—', cx, cy-6);
      ctx.font='500 10px Outfit,sans-serif';
      ctx.fillStyle='#94a3b8';
      ctx.fillText('de meta', cx, cy+14);
      ctx.restore();
    }
  };

  if(_psvCharts.donut) _psvCharts.donut.destroy();
  const dctx=document.getElementById('psv-ch-donut')?.getContext('2d');
  if(dctx) _psvCharts.donut=new Chart(dctx,{
    type:'doughnut',
    data:{datasets:[{data:[real, gap], backgroundColor:[donutFillColor,'#e2e8f0'], borderWidth:0, hoverOffset:4}]},
    options:{cutout:'70%', responsive:true, maintainAspectRatio:false,
      plugins:{
        legend:{display:false},
        tooltip:{callbacks:{label:c=>{const l=['Realizado','Restante']; return ` ${l[c.dataIndex]}: ${c.raw}`;}}},
        psvDonutCenter:{}
      },
      animation:{animateRotate:true, duration:800}
    },
    plugins:[psvDonutPlugin]
  });

  // Line (vendas por dia) — Seg–Sáb, sábados cinza
  const diasLn=getDiasComSabado(y,m);
  const lb=diasLn.map(d=>`${d.getDate()}/${m+1}`);
  const dl=diasLn.map(d=>d>t?null:getVendas(ymKey).filter(v=>v.date===fmtD(d)&&sellers.some(s=>s.id===v.sellerId)).reduce((a,v)=>a+v.qty,0));
  const mx=Math.max(0,...dl.filter(v=>v!==null));
  const lColors=diasLn.map((d,i)=>d.getDay()===6?'#94a3b8':linePointColor(dl[i],mx));
  if(_psvCharts.line) _psvCharts.line.destroy();
  const lctx=document.getElementById('psv-ch-line')?.getContext('2d');
  if(lctx){
    _psvLineParams={labels:lb,data:dl,colors:lColors};
    _psvCharts.line=new Chart(lctx,makeLineConfig(lb,dl,lColors));
  }
}

function _renderPhotosRow(sellers){
  const row=document.getElementById('psv-photos-row'); if(!row) return;
  // Cada slot ocupa espaço proporcional igual — alinha com as colunas do gráfico
  const w = sellers.length > 0 ? `calc(${100/sellers.length}% - 4px)` : 'auto';
  row.innerHTML=sellers.map(s=>{
    const ph=_psvPhotos[s.id] || s.photo;
    const img=ph
      ? `<img src="${ph}" class="photo-avatar" style="border-color:${s.color||'#2563eb'}">`
      : `<div class="photo-badge" style="background:${s.color||'#2563eb'}">${s.name[0]}</div>`;
    return `<div class="photo-slot" style="flex:1;min-width:0;align-items:center;padding-bottom:8px" onclick="document.getElementById('psv-photo-${s.id}').click()" title="Clique para adicionar foto">
      <input type="file" id="psv-photo-${s.id}" accept="image/*" onchange="psvUploadPhoto(event,${s.id})">
      <div class="photo-name" style="font-size:10px;font-weight:700;color:var(--tl);text-align:center;margin-bottom:5px;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${s.name}</div>
      ${img}
    </div>`;
  }).join('');
}
function psvUploadPhoto(e,sid){
  const f=e.target.files[0]; if(!f) return;
  compressPhoto(f,120,0.72).then(data=>{
    _psvPhotos[sid]=data;
    _savePhotos();
    // Salva também no banco de dados do vendedor
    const s=DB.sellers.find(x=>x.id===sid);
    if(s){ s.photo=data; saveDB(); }
    _renderPhotosRow(getScopedSellers());
  });
}

function _renderPSVSellerChart(ymKey,sellers){
  // ── Fonte única: getMonthTimeStats — idêntico ao Dashboard e a _renderPSVKpis ──
  const { duTotal, duPass } = getMonthTimeStats(ymKey);
  const vendas = sellers.map(s=>sellerTotal(ymKey,s.id));
  const compr  = sellers.map(s=>getSellerMeta(ymKey,s.id));
  const proj   = sellers.map(s=>duPass>0 ? Math.round(sellerTotal(ymKey,s.id)/duPass*duTotal) : 0);

  if(_psvCharts.sellers) _psvCharts.sellers.destroy();
  const ctx=document.getElementById('psv-ch-sellers')?.getContext('2d'); if(!ctx) return;

  // Plugin: números sem sobreposição quando valores iguais
  const numPlugin={
    id:'sellersNum',
    afterDatasetsDraw(chart){
      const{ctx}=chart;
      // Para cada posição X, rastreia os Y usados para detectar colisão
      const usedY = {};

      function drawLabel(x, y, val, color){
        if(val==null||val===0) return;
        const key = Math.round(x);
        if(!usedY[key]) usedY[key]=[];
        // Se y já está ocupado (±14px), empurra para cima
        let finalY = y;
        usedY[key].forEach(uy=>{ if(Math.abs(finalY-uy)<14) finalY=Math.min(finalY,uy)-14; });
        usedY[key].push(finalY);
        ctx.save();
        ctx.fillStyle=color;
        ctx.font='700 10px "JetBrains Mono",monospace';
        ctx.textAlign='center'; ctx.textBaseline='bottom';
        ctx.fillText(val, x, finalY);
        ctx.restore();
      }

      // Barras (dataset 0)
      chart.getDatasetMeta(0).data.forEach((b,i)=>{
        drawLabel(b.x, b.y-4, vendas[i], '#334155');
      });
      // Compromisso (dataset 1)
      chart.getDatasetMeta(1).data.forEach((pt,i)=>{
        drawLabel(pt.x, pt.y-7, compr[i], '#f97316');
      });
      // Projeção (dataset 2)
      chart.getDatasetMeta(2).data.forEach((pt,i)=>{
        drawLabel(pt.x, pt.y-7, proj[i]||null, '#7c3aed');
      });
    }
  };

  _psvSellersParams={labels:sellers.map(s=>s.name),vendas,compr,proj,colors:sellers.map(s=>s.color||'#2563eb')};
  _psvCharts.sellers=new Chart(ctx,{
    type:'bar',
    data:{
      labels:sellers.map(s=>s.name),
      datasets:[
        {type:'bar',  label:'Vendas',      data:vendas, backgroundColor:sellers.map(s=>(s.color||'#2563eb')+'cc'), borderRadius:6, barPercentage:.55, yAxisID:'y'},
        {type:'line', label:'Compromisso', data:compr,  borderColor:'#f97316', backgroundColor:'rgba(249,115,22,.08)', borderWidth:2.5, pointRadius:6, pointBackgroundColor:'#f97316', pointBorderColor:'#fff', pointBorderWidth:2, tension:0.3, fill:false, yAxisID:'y'},
        {type:'line', label:'Projeção',    data:proj,   borderColor:'#7c3aed', backgroundColor:'rgba(124,58,237,.06)', borderWidth:2, borderDash:[5,4], pointRadius:6, pointBackgroundColor:'#7c3aed', pointBorderColor:'#fff', pointBorderWidth:2, tension:0.3, fill:false, yAxisID:'y'}
      ]
    },
    options:{
      responsive:true, maintainAspectRatio:false,
      layout:{padding:{top:24}},
      plugins:{
        legend:{labels:{font:{family:'Outfit',size:11},color:'#475569'},position:'bottom'},
        tooltip:{mode:'index',intersect:false},
        sellersNum:{}
      },
      scales:{
        x:{grid:{display:false},ticks:{font:{family:'Outfit',size:10},color:'#94a3b8'}}  ,
        y:{grid:{color:'#f1f5f9'},ticks:{font:{family:'JetBrains Mono',size:10},color:'#94a3b8'},beginAtZero:true}
      }
    },
    plugins:[numPlugin]
  });
}

let _psvPlan=[];
function _autoResizeAll(){
  document.querySelectorAll('.ptd-input').forEach(ta=>{
    ta.style.height='auto';
    ta.style.height=ta.scrollHeight+'px';
  });
}
function _renderPlanTable(){
  const tbody=document.getElementById('psv-plan-body'); if(!tbody) return;
  if(!_psvPlan.length) _psvPlan=[{indicador:'',problema:'',causa:'',acoes:'',periodo:'',resultado:''}];
  const cols=['indicador','problema','causa','acoes','periodo','resultado'];
  tbody.innerHTML=_psvPlan.map((row,i)=>`<tr>${cols.map(c=>`<td class="ptd"><textarea class="ptd-input" rows="1" oninput="psvPlanUpdate(${i},'${c}',this.value);this.style.height='auto';this.style.height=this.scrollHeight+'px'">${row[c]||''}</textarea></td>`).join('')}<td class="ptd" style="vertical-align:middle;text-align:center"><button onclick="psvDelRow(${i})" style="background:none;border:none;color:var(--red);font-size:16px;cursor:pointer;line-height:1;padding:2px 4px">✕</button></td></tr>`).join('');
  // Auto-resize after render
  setTimeout(_autoResizeAll, 0);
}
function psvPlanUpdate(i,col,val){ if(_psvPlan[i]) _psvPlan[i][col]=val; }
function psvAddRow(){ _psvPlan.push({indicador:'',problema:'',causa:'',acoes:'',periodo:'',resultado:''}); _renderPlanTable(); }
function psvDelRow(i){ _psvPlan.splice(i,1); if(!_psvPlan.length) _psvPlan=[{indicador:'',problema:'',causa:'',acoes:'',periodo:'',resultado:''}]; _renderPlanTable(); }
