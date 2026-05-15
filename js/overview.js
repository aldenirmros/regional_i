// ══ OVERVIEW.JS ══

function renderOverview(){
  const ymKey=currentYM, {y,m}=ymToYM(ymKey), t=today();
  // ── Fonte única: getMonthTimeStats — idêntico ao Dashboard e PSV ──
  const { duTotal, duPass } = getMonthTimeStats(ymKey);
  const u       = currentUser;

  document.getElementById('ov-period').textContent=`${MESES[m]} ${y}`;
  // Carrega valores do card TPV Médio
  loadTpvMedioCard();

  // ── Barra de filtro: só gerente/aldenir vê o select ──
  const filterBar   = document.getElementById('ov-filter-bar');
  const scopeBadge  = document.getElementById('ov-scope-badge');
  const scopeTag    = document.getElementById('ov-scope-tag');

  if(isGerente(u)){
    // Popula select de regionais
    const sel = document.getElementById('ov-regional-sel');
    if(sel){
      const prev = ovRegionalFilter;
      sel.innerHTML=`<option value="">🏠 Todas as Regionais (${(DB.regionais||[]).length})</option>`
        +(DB.regionais||[]).map(r=>`<option value="${r.id}"${r.id===prev?' selected':''}>${r.nome}</option>`).join('');
      if(prev) sel.value=prev;
    }
    if(filterBar) filterBar.style.display='flex';
    if(scopeBadge) scopeBadge.style.display='none';

    // Info do filtro ativo
    const infoEl = document.getElementById('ov-filter-info');
    if(infoEl){
      if(ovRegionalFilter){
        const rg=(DB.regionais||[]).find(r=>r.id===ovRegionalFilter);
        const c=rg?.color||'var(--blue)';
        infoEl.innerHTML=`<span class="dash-filter-tag" style="background:${c}18;color:${c};border-color:${c}44">🏠 ${rg?.nome||'Regional'}</span>`;
      } else {
        infoEl.innerHTML='';
      }
    }
  } else {
    if(filterBar) filterBar.style.display='none';
    // Badge mostrando a regional/hub do usuário
    if(scopeBadge && scopeTag){
      let label='', color='var(--blue)';
      if(u?.role==='regional'){
        const rg=(DB.regionais||[]).find(r=>r.id===u.regionalId);
        label=`🏠 ${rg?.nome||'Minha Regional'}`;
        color=rg?.color||'var(--blue)';
      } else if(u?.role==='supervisor'){
        const tm=(DB.times||[]).find(t=>t.id===u.timeId);
        const rg=(DB.regionais||[]).find(r=>r.id===tm?.regionalId);
        label=`🏢 ${tm?.nome||'Meu HUB'}${rg?' — '+rg.nome:''}`;
        color=rg?.color||'var(--blue)';
      }
      scopeTag.textContent=label;
      scopeTag.style.cssText=`font-size:12px;font-weight:600;padding:6px 12px;border-radius:8px;display:inline-flex;align-items:center;gap:6px;background:${color}18;color:${color};border:1px solid ${color}44`;
      scopeBadge.style.display=label?'':'none';
    }
  }

  // ── Determina quais regionais e times exibir ──
  let regionaisVisiveis, timesVisiveis;
  if(isGerente(u)){
    if(ovRegionalFilter){
      regionaisVisiveis = (DB.regionais||[]).filter(r=>r.id===ovRegionalFilter);
      timesVisiveis     = (DB.times||[]).filter(t=>t.regionalId===ovRegionalFilter);
    } else {
      regionaisVisiveis = DB.regionais||[];
      timesVisiveis     = DB.times||[];
    }
  } else if(u?.role==='regional'){
    regionaisVisiveis = (DB.regionais||[]).filter(r=>r.id===u.regionalId);
    timesVisiveis     = (DB.times||[]).filter(t=>t.regionalId===u.regionalId);
  } else {
    // Supervisor: só vê o próprio time
    regionaisVisiveis = (DB.regionais||[]).filter(r=>{
      const tm=(DB.times||[]).find(t=>t.id===u.timeId);
      return tm&&r.id===tm.regionalId;
    });
    timesVisiveis = (DB.times||[]).filter(t=>t.id===u.timeId);
  }

  // Calcula stats por time
  function timeStats(tm){
    const allSellers = DB.sellers.filter(s=>s.timeId===tm.id);
    const sellers    = allSellers.filter(s=>!s.inativo); // apenas vendedores ativos
    const real  = sellers.reduce((a,s)=>a+sellerTotal(ymKey,s.id),0);
    const hubM  = getHubMeta(ymKey, tm.id);
    const meta  = hubM || sellers.reduce((a,s)=>a+getSellerMeta(ymKey,s.id),0);
    const pct   = meta>0?real/meta:0;
    const gap   = Math.max(0,meta-real);
    const proj  = duPass>0?real/duPass*duTotal:0;
    const atvM  = (()=>{ const o=(DB.ativacaoManualOv||{})[ymKey]; const uid=String(currentUser?.id||'default'); return (o && typeof o==='object') ? (o[uid]??null) : null; })();
    const atv   = atvM!=null ? atvM : sellers.reduce((a,s)=>a+totalAtivacao(ymKey,s.id),0);
    const atvP  = real>0?atv/real:0;
    return {sellers:sellers.length,real,meta,pct,gap,proj,atv,atvP};
  }

  // KPIs totais — baseados nos times VISÍVEIS (respeitam ovRegionalFilter)
  const visibleTids = new Set(timesVisiveis.map(t=>t.id));
  const allScopedSellers = DB.sellers.filter(s=>visibleTids.has(s.timeId)&&!s.inativo);
  const tReal = allScopedSellers.reduce((a,s)=>a+sellerTotal(ymKey,s.id),0);
  const tMeta = timesVisiveis.reduce((a,t)=>a+getHubMeta(ymKey,t.id),0)||
                allScopedSellers.reduce((a,s)=>a+getSellerMeta(ymKey,s.id),0);
  const _ovAtvRaw = (DB.ativacaoManualOv||{})[ymKey];
  const _ovUid    = String(currentUser?.id || 'default');
  const tAtvM = (_ovAtvRaw && typeof _ovAtvRaw==='object') ? (_ovAtvRaw[_ovUid]??null) : null;
  const tAtv  = tAtvM!=null ? tAtvM : allScopedSellers.reduce((a,s)=>a+totalAtivacao(ymKey,s.id),0);
  const tGap  = Math.max(0,tMeta-tReal);
  const tPct  = tMeta>0?tReal/tMeta:0;
  const tAtvP = tReal>0?tAtv/tReal:0;
  const tProj = duPass>0 ? Math.round(tReal/duPass*duTotal) : 0;

  _kpiCount('ov-real', tReal);
  document.getElementById('ov-real-s').textContent=`${(tPct*100).toFixed(1)}% da meta`;
  _kpiCount('ov-meta', tMeta);
  document.getElementById('ov-meta-s').textContent=`${regionaisVisiveis.length} regional(is) · ${timesVisiveis.length} HUB(s)`;
  document.getElementById('ov-atv-s').textContent=tReal>0?`${(tAtvP*100).toFixed(1)}% do realizado`:'—';
  // Input manual ativação
  const ovAtvInput = document.getElementById('ov-atv-input');
  if(ovAtvInput && document.activeElement !== ovAtvInput){
    ovAtvInput.value = tAtvM !== null ? tAtvM : '';
    const autoAtv = allScopedSellers.reduce((a,s)=>a+totalAtivacao(ymKey,s.id),0);
    ovAtvInput.placeholder = String(autoAtv); // mostra o auto-calculado como placeholder
  }
  const ovAtvFill = document.getElementById('ov-atv-fill');
  const ovAtvPct  = document.getElementById('ov-atv-pct');
  if(ovAtvFill) ovAtvFill.style.width = Math.min(100, tAtvP*100).toFixed(1)+'%';
  if(ovAtvPct)  ovAtvPct.textContent  = (tAtvP*100).toFixed(1)+'%';
  _kpiCount('ov-gap', tGap);

  // ── Projeção ──
  const projPct = tMeta > 0 ? Math.min(100, tProj / tMeta * 100) : 0;
  const projColor = projPct >= 100 ? '#059669' : projPct >= 80 ? '#d97706' : '#dc2626';
  const ovProjEl  = document.getElementById('ov-proj');
  const ovProjPf  = document.getElementById('ov-proj-pf');
  const ovProjS   = document.getElementById('ov-proj-s');
  if(ovProjEl){ _kpiCount('ov-proj', tProj); ovProjEl.style.color = projColor; }
  if(ovProjPf) ovProjPf.style.width = projPct.toFixed(1) + '%';
  if(ovProjS)  ovProjS.textContent  = `${projPct.toFixed(1)}% da meta`;

  // ── Donut chart Visão % ──
  const metaPct = tMeta>0 ? Math.min(100, tPct*100) : 0;
  const gapPct  = Math.max(0, 100 - metaPct);
  const atvPct  = tReal>0 ? (tAtvP*100) : 0;
  document.getElementById('ov-chart-pct').textContent = metaPct.toFixed(1)+'%';
  document.getElementById('ov-pct-meta').textContent  = metaPct.toFixed(1)+'%';
  document.getElementById('ov-pct-gap').textContent   = gapPct.toFixed(1)+'%';
  document.getElementById('ov-pct-atv').textContent   = atvPct.toFixed(1)+'%';
  // Cor dinâmica: verde ≥100%, laranja ≥60%, vermelho <60%
  const metaColor = metaPct>=100?'#059669':metaPct>=60?'#d97706':'#dc2626';
  document.getElementById('ov-chart-pct').style.color = metaColor;
  const ctx = document.getElementById('ov-donut-chart')?.getContext('2d');
  if(ctx){
    if(window._ovChart){ window._ovChart.destroy(); window._ovChart=null; }
    window._ovChart = new Chart(ctx, {
      type:'doughnut',
      data:{
        datasets:[{
          data: tMeta>0 ? [metaPct, gapPct] : [1,0],
          backgroundColor: tMeta>0 ? [metaColor,'#fca5a5'] : ['#e2e8f0','#e2e8f0'],
          borderWidth:0, hoverOffset:0
        }]
      },
      options:{
        cutout:'70%',
        plugins:{legend:{display:false},tooltip:{enabled:false}},
        animation:{duration:600,easing:'easeInOutQuart'}
      }
    });
  }

  // Tabela: agrupa times por regional
  let tb='';
  let rgCount=0;

  regionaisVisiveis.forEach(rg=>{
    const rgTimes = timesVisiveis.filter(t=>t.regionalId===rg.id);
    if(!rgTimes.length) return;
    rgCount++;

    // Linha de cabeçalho da regional
    const rgSellers = DB.sellers.filter(s=>rgTimes.map(t=>t.id).includes(s.timeId)&&!s.inativo);
    const rgReal    = rgSellers.reduce((a,s)=>a+sellerTotal(ymKey,s.id),0);
    const rgHubM    = rgTimes.reduce((a,t)=>a+getHubMeta(ymKey,t.id),0);
    const rgMeta    = rgHubM || rgSellers.reduce((a,s)=>a+getSellerMeta(ymKey,s.id),0);
    const rgPct     = rgMeta>0?rgReal/rgMeta:0;
    const rgGap     = Math.max(0,rgMeta-rgReal);
    const pcColor   = rgPct>=1?'var(--green)':rgPct>=0.6?'var(--orange)':'var(--red)';
    tb+=`<tr style="background:${rg.color}12;border-left:3px solid ${rg.color}">
      <td colspan="2" style="font-weight:800;font-size:11px;color:${rg.color};padding-left:8px">
        <div style="display:flex;align-items:center;gap:5px">
          <div style="width:7px;height:7px;border-radius:50%;background:${rg.color};flex-shrink:0"></div>
          <span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${rg.nome}</span>
        </div>
      </td>
      <td class="mono fw7" style="text-align:center">${rgSellers.length}</td>
      <td class="mono fw7 fg-g" style="text-align:center">${rgReal}</td>
      <td class="mono" style="text-align:center">${rgMeta}</td>
      <td><div class="pw"><div class="pt"><div class="pf ${rgPct>=1?'pg':rgPct>=0.6?'py':'pr'}" style="width:${Math.min(100,rgPct*100).toFixed(1)}%"></div></div>
          <span class="pp" style="color:${pcColor}">${(rgPct*100).toFixed(1)}%</span></div></td>
      <td style="text-align:center"><span class="gb ${rgGap===0?'gz':'gn'}">${rgGap===0?'✓':'-'+rgGap}</span></td>
      <td colspan="11" style="color:var(--tl);font-size:9.5px">${rgTimes.length} HUB(s)</td>
    </tr>`;

    // Linhas dos times
    rgTimes.forEach(tm=>{
      const st = timeStats(tm);
      const pc = st.pct>=1?'var(--green)':st.pct>=0.6?'var(--orange)':'var(--red)';
      const sup = DB.users?.find(u=>u.role==='supervisor'&&u.timeId===tm.id);
      const canEditM = currentUser?.role==='regional' || isGerente();
      // M0/M1/M2 — input inline, salva com Enter ou ao sair do campo
      const mData = (DB.mValues||{})[ymKey]?.[tm.id] || {};

      // ── CNPJ (%) ──
      const cnpjV = mData['CNPJ'];
      const cnpjCls = cnpjV==null?'m-empty':cnpjV<30?'m-red':cnpjV<=50?'m-yellow':'m-green';
      const cnpjCell = canEditM
        ? `<td class="m-cell" style="background:rgba(100,116,139,.06)"><div style="display:flex;align-items:center;gap:2px"><input type="number" min="0" max="999" step="0.1" class="m-inline-inp ${cnpjCls}" value="${cnpjV!=null?cnpjV:''}" placeholder="—" title="CNPJ" onkeydown="if(event.key==='Enter'){event.preventDefault();saveMPctInline(this,${tm.id},'CNPJ','${ymKey}');this.blur();}if(event.key==='Escape')this.blur();" onblur="saveMPctInline(this,${tm.id},'CNPJ','${ymKey}')"><span style="font-size:9px;color:var(--tl);font-weight:600">%</span></div></td>`
        : `<td class="m-cell" style="background:rgba(100,116,139,.06)"><span class="m-val ${cnpjCls}">${cnpjV!=null?cnpjV+'%':'—'}</span></td>`;

      // ── Ativação manual por HUB ──
      const atvV = mData['atv'];
      const atvCell = canEditM
        ? `<td class="mono fw7" style="color:var(--teal);text-align:center"><input type="number" min="0" class="m-inline-inp" style="width:52px;color:var(--teal);border-color:rgba(13,148,136,.3);background:rgba(13,148,136,.06);text-align:center" value="${atvV!=null?atvV:''}" placeholder="—" title="Ativações" onkeydown="if(event.key==='Enter'){event.preventDefault();saveMInline(this,${tm.id},'atv','${ymKey}');this.blur();}if(event.key==='Escape')this.blur();" onblur="saveMInline(this,${tm.id},'atv','${ymKey}')"></td>`
        : `<td class="mono fw7" style="color:var(--teal);text-align:center">${atvV!=null?atvV:st.atv}</td>`;
      // % Ativ based on manual or auto
      const atvDisplay = atvV!=null ? atvV : st.atv;
      const atvPDisplay = st.real>0 ? (atvDisplay/st.real*100).toFixed(1)+'%' : '—';
      const mCells = (()=>{
        // color per group: M0/PM0=blue, M1/PM1=green, M2/PM2=orange
        const grpBgs = ['rgba(37,99,235,.06)','rgba(5,150,105,.06)','rgba(217,119,6,.06)'];
        const scoreCells = ['M0','M1','M2'].map((mk,mi)=>{
          const grpBg = grpBgs[mi];
          const v = mData[mk];
          let cls='m-empty';
          if(v!=null){ cls = v<30?'m-red': v<=50?'m-yellow': 'm-green'; }
          return canEditM
            ? `<td class="m-cell" style="background:${grpBg}"><div style="display:flex;align-items:center;gap:2px"><input type="number" min="0" max="999" step="0.1" class="m-inline-inp ${cls}" value="${v!=null?v:''}" placeholder="—" title="${mk}" onkeydown="if(event.key==='Enter'){event.preventDefault();saveMPctInline(this,${tm.id},'${mk}','${ymKey}');this.blur();}if(event.key==='Escape')this.blur();" onblur="saveMPctInline(this,${tm.id},'${mk}','${ymKey}')"><span style="font-size:9px;color:var(--tl);font-weight:600">%</span></div></td>`
            : `<td class="m-cell" style="background:${grpBg}"><span class="m-val ${cls}">${v!=null?v+'%':'—'}</span></td>`;
        });
        const pctCells = ['M0','M1','M2'].map((mk,mi)=>{
          const grpBg = grpBgs[mi];
          const pk = 'P'+mk;
          const pv = mData[pk];
          const pcls = pv==null?'m-empty':pv<30?'m-red':pv<=50?'m-yellow':'m-green';
          return canEditM
            ? `<td class="m-cell" style="background:${grpBg}"><div style="display:flex;align-items:center;gap:2px"><input type="number" min="0" max="999" step="0.1" class="m-inline-inp ${pcls}" value="${pv!=null?pv:''}" placeholder="—" title="Parcelado ${mk}" onkeydown="if(event.key==='Enter'){event.preventDefault();saveMPctInline(this,${tm.id},'${pk}','${ymKey}');this.blur();}if(event.key==='Escape')this.blur();" onblur="saveMPctInline(this,${tm.id},'${pk}','${ymKey}')"><span style="font-size:9px;color:var(--tl);font-weight:600">%</span></div></td>`
            : `<td class="m-cell" style="background:${grpBg}"><span class="m-val ${pcls}">${pv!=null?pv+'%':'—'}</span></td>`;
        });
        return [...scoreCells, ...pctCells].join('');
      })();
      // ── Badge helpers (inline) ──
      const _bCls = (v,lo,hi) => v==null?'bg-gray':v>=hi?'bg-green':v>=lo?'bg-orange':'bg-red';
      const _pctBadge = (val, lo, hi) => {
        if(val==null) return `<span class="ov-badge-pill bg-gray">—</span>`;
        const cls = _bCls(val,lo,hi);
        return `<span class="ov-badge-pill ${cls}">${val.toFixed(1)}%</span>`;
      };

      // % Meta badge + slim bar
      const metaPctVal = st.meta>0 ? st.pct*100 : null;
      const metaCls    = metaPctVal==null?'bg-gray':metaPctVal>=100?'bg-green':metaPctVal>=80?'bg-orange':'bg-red';
      const metaBarW   = metaPctVal!=null?Math.min(100,metaPctVal).toFixed(1):0;
      const metaBadge  = `<div class="ov-badge">
        <span class="ov-badge-pill ${metaCls}">${metaPctVal!=null?metaPctVal.toFixed(1)+'%':'—'}</span>
        <div class="ov-badge-bar"><div class="ov-badge-bar-fill ${metaCls}" style="width:${metaBarW}%"></div></div>
      </div>`;

      // % Atv badge
      const atvPctVal  = st.real>0 ? (atvDisplay/st.real*100) : null;
      const atvBadge   = _pctBadge(atvPctVal, 60, 80);

      // % Proj badge
      const projPctVal = st.meta>0 ? (st.proj/st.meta*100) : null;
      const projBadge  = _pctBadge(projPctVal, 80, 100);

      const hubColor = tm.color||rg.color;
      tb+=`<tr>
        <td></td>
        <td class="hub-name-cell">
          <div class="hub-name-inner" style="--hub-color:${hubColor}">
            <div class="hub-title">${tm.nome}</div>
            ${sup?`<div class="hub-sup">${sup.nome||sup.username}</div>`:''}
          </div>
        </td>
        <td class="mono fw7" style="text-align:center">${st.sellers}</td>
        <td class="mono fw7 fg-g" style="text-align:center">${st.real}</td>
        <td class="mono" style="text-align:center">${st.meta}</td>
        <td style="text-align:center">${metaBadge}</td>
        <td style="text-align:center"><span class="gb ${st.gap===0?'gz':'gn'}">${st.gap===0?'✓':'-'+st.gap}</span></td>
        ${atvCell}
        <td style="text-align:center">${atvBadge}</td>
        <td class="mono" style="color:var(--purple);font-weight:700;text-align:center">${Math.round(st.proj)}</td>
        <td style="text-align:center">${projBadge}</td>
        ${cnpjCell}
        ${mCells}
      </tr>`;
    });
  });

  if(!rgCount) tb=`<tr><td colspan="18" style="text-align:center;padding:28px;color:var(--tl)">Nenhuma regional / time no escopo</td></tr>`;

  // Linha de total geral — M0/M1/M2 editáveis manualmente (chave especial: timeId=0)
  const totMv = (DB.mValues||{})[ymKey]?.['total']||{};
  const canEditM = currentUser?.role==='regional' || isGerente();

  // CNPJ total
  const totCnpjV = totMv['CNPJ'];
  const totCnpjCls = totCnpjV==null?'m-empty':totCnpjV<30?'m-red':totCnpjV<=50?'m-yellow':'m-green';
  const totCnpjCell = canEditM
    ? `<td class="m-cell" style="background:rgba(100,116,139,.06)"><div style="display:flex;align-items:center;gap:2px"><input type="number" min="0" max="999" step="0.1" class="m-inline-inp ${totCnpjCls}" value="${totCnpjV!=null?totCnpjV:''}" placeholder="—" title="CNPJ Total" onkeydown="if(event.key==='Enter'){event.preventDefault();saveMPctInline(this,'total','CNPJ','${ymKey}');this.blur();}if(event.key==='Escape')this.blur();" onblur="saveMPctInline(this,'total','CNPJ','${ymKey}')"><span style="font-size:9px;color:var(--tl);font-weight:600">%</span></div></td>`
    : `<td class="m-cell" style="background:rgba(100,116,139,.06)"><span class="m-val ${totCnpjCls}">${totCnpjV!=null?totCnpjV+'%':'—'}</span></td>`;

  const totMCells = (()=>{
    const grpBgs = ['rgba(37,99,235,.06)','rgba(5,150,105,.06)','rgba(217,119,6,.06)'];
    const scoreCells = ['M0','M1','M2'].map((mk,mi)=>{
      const grpBg = grpBgs[mi];
      const v = totMv[mk];
      let cls = v==null?'m-empty':v<30?'m-red':v<=50?'m-yellow':'m-green';
      return canEditM
        ? `<td class="m-cell" style="background:${grpBg}"><div style="display:flex;align-items:center;gap:2px"><input type="number" min="0" max="999" step="0.1" class="m-inline-inp ${cls}" value="${v!=null?v:''}" placeholder="—" title="${mk} Total" onkeydown="if(event.key==='Enter'){event.preventDefault();saveMPctInline(this,'total','${mk}','${ymKey}');this.blur();}if(event.key==='Escape')this.blur();" onblur="saveMPctInline(this,'total','${mk}','${ymKey}')"><span style="font-size:9px;color:var(--tl);font-weight:600">%</span></div></td>`
        : `<td class="m-cell" style="background:${grpBg}"><span class="m-val ${cls}">${v!=null?v+'%':'—'}</span></td>`;
    });
    const pctCells = ['M0','M1','M2'].map((mk,mi)=>{
      const grpBg = grpBgs[mi];
      const pk = 'P'+mk;
      const pv = totMv[pk];
      const pcls = pv==null?'m-empty':pv<30?'m-red':pv<=50?'m-yellow':'m-green';
      return canEditM
        ? `<td class="m-cell" style="background:${grpBg}"><div style="display:flex;align-items:center;gap:2px"><input type="number" min="0" max="999" step="0.1" class="m-inline-inp ${pcls}" value="${pv!=null?pv:''}" placeholder="—" title="Parcelado ${mk} Total" onkeydown="if(event.key==='Enter'){event.preventDefault();saveMPctInline(this,'total','${pk}','${ymKey}');this.blur();}if(event.key==='Escape')this.blur();" onblur="saveMPctInline(this,'total','${pk}','${ymKey}')"><span style="font-size:9px;color:var(--tl);font-weight:600">%</span></div></td>`
        : `<td class="m-cell" style="background:${grpBg}"><span class="m-val ${pcls}">${pv!=null?pv+'%':'—'}</span></td>`;
    });
    return [...scoreCells, ...pctCells].join('');
  })();

  // ── Total badges ──
  const _totBadge = (val, lo, hi) => {
    if(val==null) return `<span class="ov-badge-pill bg-gray">—</span>`;
    const cls = val>=hi?'bg-green':val>=lo?'bg-orange':'bg-red';
    return `<span class="ov-badge-pill ${cls}">${val.toFixed(1)}%</span>`;
  };
  const tMetaPctVal = tMeta>0 ? tPct*100 : null;
  const tMetaCls    = tMetaPctVal==null?'bg-gray':tMetaPctVal>=100?'bg-green':tMetaPctVal>=80?'bg-orange':'bg-red';
  const tMetaBarW   = tMetaPctVal!=null?Math.min(100,tMetaPctVal).toFixed(1):0;
  const tMetaBadge  = `<div class="ov-badge">
    <span class="ov-badge-pill ${tMetaCls}">${tMetaPctVal!=null?tMetaPctVal.toFixed(1)+'%':'—'}</span>
    <div class="ov-badge-bar"><div class="ov-badge-bar-fill ${tMetaCls}" style="width:${tMetaBarW}%"></div></div>
  </div>`;
  const tAtvBadge  = _totBadge(tReal>0?(tAtvP*100):null, 60, 80);
  const tProjPctVal = tMeta>0 ? (tProj/tMeta*100) : null;
  const tProjBadge = _totBadge(tProjPctVal, 80, 100);

  tb+=`<tr class="tr-tot">
    <td colspan="3">TOTAL GERAL</td>
    <td class="mono" style="text-align:center">${tReal}</td>
    <td class="mono" style="text-align:center">${tMeta}</td>
    <td style="text-align:center">${tMetaBadge}</td>
    <td style="text-align:center"><span class="gb ${tGap===0?'gz':'gn'}">${tGap===0?'✓':'-'+tGap}</span></td>
    <td class="mono" style="color:var(--teal);text-align:center">${tAtv}</td>
    <td style="text-align:center">${tAtvBadge}</td>
    <td class="mono" style="color:var(--purple);font-weight:800;text-align:center">${tProj}</td>
    <td style="text-align:center">${tProjBadge}</td>
    ${totCnpjCell}
    ${totMCells}
  </tr>`;

  document.getElementById('ov-tb').innerHTML=tb;
}

// ══════════════════════════════════════════════════════════
//  M0 / M1 / M2 — Indicadores por HUB
// ══════════════════════════════════════════════════════════
let _mCtx = null; // {timeId, key, ymKey}

function openMPopup(evt, timeId, key, ymKey){
  evt.stopPropagation();
  const pop = document.getElementById('m-popup');
  const inp = document.getElementById('m-popup-input');
  const lbl = document.getElementById('m-popup-lbl');
  const tm  = (DB.times||[]).find(t=>t.id===timeId);

  lbl.textContent = `${key} — ${tm?.nome||'HUB'}`;
  const cur = (DB.mValues||{})[ymKey]?.[timeId]?.[key];
  inp.value = cur!=null ? cur : '';
  inp.placeholder = '0';

  // Posiciona perto do elemento clicado
  const rect = evt.currentTarget.getBoundingClientRect();
  pop.style.top  = (rect.bottom + window.scrollY + 4) + 'px';
  pop.style.left = Math.min(rect.left + window.scrollX, window.innerWidth - 150) + 'px';
  pop.classList.add('show');
  inp.focus();
  inp.select();

  _mCtx = {timeId, key, ymKey};
}

function closeMPopup(){
  document.getElementById('m-popup')?.classList.remove('show');
  _mCtx = null;
}

function saveMValue(){
  if(!_mCtx) return;
  const {timeId, key, ymKey} = _mCtx;
  const v = document.getElementById('m-popup-input').value.trim();
  const n = v==='' ? null : parseInt(v);
  if(!DB.mValues) DB.mValues={};
  if(!DB.mValues[ymKey]) DB.mValues[ymKey]={};
  if(!DB.mValues[ymKey][timeId]) DB.mValues[ymKey][timeId]={};
  if(n===null) delete DB.mValues[ymKey][timeId][key];
  else DB.mValues[ymKey][timeId][key] = n;
  saveDB();
  closeMPopup();
  renderOverview();
  toast(`${key} atualizado: ${n!=null?n:'—'}`);
}

function saveMInline(input, timeId, key, ymKey){
  const v = input.value.trim();
  const n = v==='' ? null : parseInt(v);
  if(!DB.mValues) DB.mValues={};
  if(!DB.mValues[ymKey]) DB.mValues[ymKey]={};
  if(!DB.mValues[ymKey][timeId]) DB.mValues[ymKey][timeId]={};
  if(n===null) delete DB.mValues[ymKey][timeId][key];
  else DB.mValues[ymKey][timeId][key] = n;
  input.className = 'm-inline-inp ' + (n==null?'m-empty':n<26?'m-red':n<=29?'m-yellow':'m-green');
  saveDB();
  if(document.getElementById('page-psv')?.classList.contains('active')) renderPSV();
}

// Salva campos de porcentagem (CNPJ, Parcelado M0/M1/M2)
// Usa parseFloat e lógica de cores baseada em % (≥100 verde, ≥60 amarelo, <60 vermelho)
function saveMPctInline(input, timeId, key, ymKey){
  const v = input.value.trim();
  const n = v==='' ? null : parseFloat(v);
  if(!DB.mValues) DB.mValues={};
  if(!DB.mValues[ymKey]) DB.mValues[ymKey]={};
  if(!DB.mValues[ymKey][timeId]) DB.mValues[ymKey][timeId]={};
  if(n===null) delete DB.mValues[ymKey][timeId][key];
  else DB.mValues[ymKey][timeId][key] = n;
  input.className = 'm-inline-inp ' + (n==null?'m-empty':n<30?'m-red':n<=50?'m-yellow':'m-green');
  saveDB();
  if(document.getElementById('page-psv')?.classList.contains('active')) renderPSV();
}

// ══ TPV MÉDIO — card na ov-kpi-row ══
// Formata valor como R$ 0.000,00 enquanto o usuário digita
function _maskBRL(v) {
  let s = v.replace(/\D/g, '');
  if (!s) return '';
  const n = parseInt(s, 10);
  return 'R$ ' + (n / 100).toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2});
}

// Dispara a cada keyup para aplicar máscara em tempo real
function tpvMedioMask(el) {
  const raw = el.value.replace(/\D/g,'');
  el.value = raw ? _maskBRL(raw) : '';
}

// Converte "R$ 1.234,56" → 1234.56
function _parseBRL(s) {
  if (!s) return null;
  const cleaned = s.replace(/[R$\s.]/g,'').replace(',','.');
  const n = parseFloat(cleaned);
  return isNaN(n) ? null : n;
}

// Salva no DB.mValues usando a chave "tpv_stats_<userId>" + subchave (ex: "tpv_real_M1")
function saveTpvMedio(input, key) {
  // Aplica máscara ao sair (onblur)
  const raw = input.value.replace(/\D/g,'');
  input.value = raw ? _maskBRL(raw) : '';
  _applyTpvColor(input, input.value);

  const ymKey = String(currentYM);
  const val   = _parseBRL(input.value);
  const uid   = String(currentUser?.id || 'default');
  const grpId = 'tpv_stats_' + uid;

  if (!DB.mValues) DB.mValues = {};
  if (!DB.mValues[ymKey]) DB.mValues[ymKey] = {};
  if (!DB.mValues[ymKey][grpId]) DB.mValues[ymKey][grpId] = {};

  if (val === null) delete DB.mValues[ymKey][grpId][key];
  else              DB.mValues[ymKey][grpId][key] = val;

  saveDB();
}

// Retorna a cor do TPV Médio conforme o valor
function _tpvColor(v) {
  if (v == null) return '';
  if (v < 8000)  return 'rgba(220,38,38,.12)';
  if (v < 18000) return 'rgba(217,119,6,.12)';
  return 'rgba(5,150,105,.12)';
}
function _tpvBorderColor(v) {
  if (v == null) return '';
  if (v < 8000)  return 'rgba(220,38,38,.4)';
  if (v < 18000) return 'rgba(217,119,6,.4)';
  return 'rgba(5,150,105,.4)';
}
function _tpvTextColor(v) {
  if (v == null) return 'var(--purple)';
  if (v < 8000)  return 'var(--red)';
  if (v < 18000) return 'var(--orange)';
  return 'var(--green)';
}

// Carrega os valores do TPV Médio nos inputs do card
function loadTpvMedioCard() {
  const ymKey = String(currentYM);
  const uid   = String(currentUser?.id || 'default');
  const grpId = 'tpv_stats_' + uid;
  const data  = (DB.mValues || {})[ymKey]?.[grpId] || {};
  const fields = ['tpv_real_M1','tpv_real_M2','tpv_real_M3',
                  'tpv_proj_M1','tpv_proj_M2','tpv_proj_M3'];
  const ids    = ['tpv-real-M1','tpv-real-M2','tpv-real-M3',
                  'tpv-proj-M1','tpv-proj-M2','tpv-proj-M3'];
  fields.forEach((f, i) => {
    const el = document.getElementById(ids[i]);
    if (!el) return;
    const v = data[f];
    el.value = (v != null) ? _maskBRL(String(Math.round(v * 100))) : '';
    // Aplica máscara de keyup dinamicamente
    el.oninput = () => { tpvMedioMask(el); _applyTpvColor(el, el.value); };
    // Aplica cor
    _applyTpvColor(el, el.value);
  });
}

function _applyTpvColor(el, rawVal) {
  const v = _parseBRL(rawVal);
  el.style.background = v != null ? _tpvColor(v) : '';
  el.style.borderColor = v != null ? _tpvBorderColor(v) : '';
  el.style.color = _tpvTextColor(v);
}

function _renderDPGrid(){
  const grid = document.getElementById('psv-dp-grid'); if(!grid) return;
  const cols = [
    {mk:'M0', mc:'#2563eb', border:'rgba(37,99,235,.2)'},
    {mk:'M1', mc:'#7c3aed', border:'rgba(124,58,237,.2)'},
    {mk:'M2', mc:'#d97706', border:'rgba(217,119,6,.2)'},
  ];

  // Vendedores disponíveis no escopo atual
  const scopedSellers = getScopedSellers(true).filter(s=>!s.inativo).sort((a,b)=>a.name.localeCompare(b.name));
  const sellerOpts = scopedSellers.map(s=>`<option value="${s.id}">${s.name}</option>`).join('');
  const selStyle = `width:100%;border:1.5px solid var(--border);border-radius:6px;padding:4px 8px;font-family:var(--font);font-size:11px;color:var(--tl);background:var(--bg);outline:none;cursor:pointer;margin-bottom:6px;box-sizing:border-box`;

  function photoSlot(type, mk, color){
    const ico = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>`;
    return `<div id="dp-photo-${type}-${mk}" onclick="dpUploadPhoto('${type}','${mk}')" title="Clique para trocar a foto"
      style="width:46px;height:46px;border-radius:50%;flex-shrink:0;cursor:pointer;border:2px dashed ${color};display:flex;align-items:center;justify-content:center;overflow:hidden;background:${color}11">${ico}</div>
      <input type="file" id="dp-file-${type}-${mk}" accept="image/*" style="display:none" onchange="dpSetPhoto(event,'${type}','${mk}')">`;
  }

  function slot(type, mk, label, color){
    return `
      <div style="margin-bottom:14px">
        <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:${color};margin-bottom:8px">${label}</div>
        <div style="display:flex;align-items:center;gap:10px">
          ${photoSlot(type, mk, color)}
          <div style="flex:1;min-width:0">
            <select id="dp-sel-${type}-${mk}" onchange="dpSelectSeller('${type}','${mk}',this.value)" style="${selStyle}">
              <option value="">🔍 Puxar do cadastro…</option>
              ${sellerOpts}
            </select>
            <input type="text" id="dp-name-${type}-${mk}" placeholder="Ou digitar nome manualmente"
              style="width:100%;border:1.5px solid var(--border);border-radius:6px;padding:5px 9px;font-family:var(--font);font-size:12px;color:var(--td);background:var(--bg);outline:none;margin-bottom:5px;box-sizing:border-box">
            <input type="text" inputmode="numeric" id="dp-val-${type}-${mk}" placeholder="R$ 0,00"
              style="width:100%;border:1.5px solid var(--border);border-radius:6px;padding:5px 9px;font-family:var(--mono);font-size:12px;font-weight:700;color:${color};background:var(--bg);outline:none;box-sizing:border-box">
          </div>
        </div>
      </div>`;
  }

  grid.innerHTML = cols.map((c,i)=>`
    <div style="padding:16px 14px;${i<2?'border-right:1px solid var(--border)':''}">
      <div style="font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.7px;color:${c.mc};margin-bottom:14px;display:flex;align-items:center;gap:6px">
        <div style="width:8px;height:8px;border-radius:50%;background:${c.mc}"></div>${c.mk}
      </div>
      ${slot('prom', c.mk, '👍 Promotor', '#059669')}
      ${slot('det',  c.mk, '👎 Detrator', '#dc2626')}
    </div>`).join('');
}

function fmtBRL(v){ if(!v) return ''; return Number(v).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}); }

// ── Auto-formata TPV enquanto digita (R$ 0.000,00) ──
function formatTpvInput(input){
  const digits = input.value.replace(/\D/g,'');
  if(!digits){ input.value=''; return; }
  const cents = parseInt(digits)||0;
  input.value = (cents/100).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
}

// ── TPV — DB.psvTpv (tabela: ymKey, hubId, mk, valor_real, valor_proj) ──────

// ─────────────────────────────────────────────────────────────────────────────
// _getPsvOwnerUserId()
//   Retorna o userId que deve ser usado para LEITURA dos dados PSV (plano,
//   TPV, DP) do HUB selecionado no filtro.
//
//   Regra:
//   • Supervisor → sempre o próprio userId (só vê/edita os seus dados).
//   • Gerente / Admin Regional / super admin com HUB selecionado no filtro
//     → busca o supervisor vinculado a esse HUB e retorna o userId dele.
//     Se não houver supervisor cadastrado para o HUB, cai de volta para o
//     próprio currentUser.id (evita tela em branco).
//   • Gerente / Admin Regional sem HUB selecionado → próprio userId.
// ─────────────────────────────────────────────────────────────────────────────
function _getPsvOwnerUserId(){
  const u = currentUser;
  if(!u) return 'default';
  // Supervisores sempre operam sobre si mesmos
  if(u.role === 'supervisor') return String(u.id);
  // Gerentes/regionais: verifica se há HUB selecionado no filtro
  const psvTmId = parseInt(document.getElementById('psv-df-time')?.value) || null;
  if(psvTmId){
    const sup = (DB.users || []).find(x => x.role === 'supervisor' && x.timeId === psvTmId);
    if(sup) return String(sup.id);
  }
  // Sem HUB selecionado → retorna próprio userId
  return String(u.id);
}

function _getHubIdForPsv(){
  const u = currentUser;
  const psvTmId = parseInt(document.getElementById('psv-df-time')?.value)||null;
  if(psvTmId) return String(psvTmId);
  if(u?.timeId) return String(u.timeId);
  // Gerente sem filtro: usa o primeiro HUB do escopo
  const sellers = getScopedSellers();
  const firstHub = sellers.find(s=>s.timeId)?.timeId;
  if(firstHub) return String(firstHub);
  // Último fallback: primeiro HUB da lista
  const firstTime = (DB.times||[])[0];
  return firstTime ? String(firstTime.id) : 'global';
}

function _getTpvRow(ymKey, hubId, mk){
  if(!DB.psvTpv) DB.psvTpv = [];
  // Leitura: usa o userId do supervisor dono do HUB (visão hierárquica)
  const uid = _getPsvOwnerUserId();
  return DB.psvTpv.find(r => String(r.userId||'')===uid && String(r.ymKey)===String(ymKey) && String(r.hubId)===String(hubId) && String(r.mk)===String(mk));
}

function _upsertTpvRow(ymKey, hubId, mk, field, value){
  if(!DB.psvTpv) DB.psvTpv = [];
  // Escrita: sempre usa o userId do usuário logado (isolamento de dados)
  const uid = String(currentUser?.id || 'default');
  let row = DB.psvTpv.find(r => String(r.userId||'')===uid && String(r.ymKey)===String(ymKey) && String(r.hubId)===String(hubId) && String(r.mk)===String(mk));
  if(!row){
    row = {userId: uid, ymKey: String(ymKey), hubId: String(hubId), mk: String(mk), valor_real:null, valor_proj:null};
    DB.psvTpv.push(row);
  }
  row[field] = value || null;
}

function savePsvTpv(input, mk, ymKey){
  formatTpvInput(input);
  const raw = input.value.replace(/\./g,'').replace(',','.');
  const v = parseFloat(raw)||0;
  const hubId = _getHubIdForPsv();
  _upsertTpvRow(ymKey, hubId, mk, 'valor_real', v||null);
  const c = !v?'var(--tl)':v<15000?'#dc2626':v<20000?'#d97706':'#059669';
  input.style.color = c;
  DB._savedAt = Date.now();
  try{ localStorage.setItem('bi_v5', JSON.stringify(DB)); }catch(e){}
  flashSaved();
  clearTimeout(saveDB._t);
  _syncEnqueue();
  toast('TPV médio real salvo ✓','💾');
}

function savePsvTpvProj(input, mk, ymKey){
  formatTpvInput(input);
  const raw = input.value.replace(/\./g,'').replace(',','.');
  const v = parseFloat(raw)||0;
  const hubId = _getHubIdForPsv();
  _upsertTpvRow(ymKey, hubId, mk, 'valor_proj', v||null);
  const c = !v?'var(--tl)':v<15000?'#dc2626':v<20000?'#d97706':'#059669';
  input.style.color = c;
  DB._savedAt = Date.now();
  try{ localStorage.setItem('bi_v5', JSON.stringify(DB)); }catch(e){}
  flashSaved();
  clearTimeout(saveDB._t);
  _syncEnqueue();
  toast('TPV projetado salvo ✓','💾');
}

// Detrator / Promotor — salvo em DB.psvData.dp[ymKey]
const _dpPhotos = (() => {
  try { return JSON.parse(localStorage.getItem('psv_dp_photos')||'{}'); } catch(e){ return {}; }
})();
function _saveDpPhotos(){ try{ localStorage.setItem('psv_dp_photos', JSON.stringify(_dpPhotos)); }catch(e){} }

function dpUploadPhoto(type, mk){
  document.getElementById(`dp-file-${type}-${mk}`)?.click();
}
function dpSetPhoto(e, type, mk){
  const f=e.target.files[0]; if(!f) return;
  const uid = String(currentUser?.id || 'default');
  const r=new FileReader();
  r.onload=ev=>{
    const photoKey = `${uid}_${type}_${mk}`;
    _dpPhotos[photoKey]=ev.target.result;
    _saveDpPhotos();
    const slot=document.getElementById(`dp-photo-${type}-${mk}`);
    if(slot){
      slot.innerHTML=`<img src="${ev.target.result}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`;
      slot.style.border=`2px solid ${type==='prom'?'#059669':'#dc2626'}`;
    }
  };
  r.readAsDataURL(f);
}

// Salva tudo do DP no DB ao clicar em "Salvar"
function saveDpAll(){
  const ymKey  = String(currentYM);
  const hubId  = _getHubIdForPsv();  // já retorna string
  // Escrita: sempre usa o userId do usuário logado (isolamento de dados)
  const uid    = String(currentUser?.id || 'default');
  if(!DB.psvDp) DB.psvDp = [];
  // Remove linhas antigas deste userId+ymKey+hubId
  DB.psvDp = DB.psvDp.filter(r => !(String(r.userId||'default')===uid && String(r.ymKey)===ymKey && String(r.hubId)===hubId));
  ['M0','M1','M2'].forEach(mk=>{
    ['prom','det'].forEach(tipo=>{
      const nome_manual = document.getElementById(`dp-name-${tipo}-${mk}`)?.value||'';
      const valor       = document.getElementById(`dp-val-${tipo}-${mk}`)?.value||'';
      const vendedorId  = document.getElementById(`dp-sel-${tipo}-${mk}`)?.value||'';
      const photoKey    = `${uid}_${tipo}_${mk}`;
      const photo       = _dpPhotos[photoKey]||'';
      DB.psvDp.push({
        userId: uid, ymKey, hubId, tipo, safra: mk,
        vendedorId: vendedorId||null,
        nome_manual, valor: valor||null,
        photo
      });
    });
  });
  DB._savedAt = Date.now();
  try{ localStorage.setItem('bi_v5', JSON.stringify(DB)); }catch(e){}
  flashSaved();
  clearTimeout(saveDB._t);
  _syncEnqueue();
  const btn=document.getElementById('dp-save-btn');
  if(btn){ const old=btn.innerHTML; btn.innerHTML='✅ Salvo!'; setTimeout(()=>btn.innerHTML=old,1800); }
  toast('Detrator & Promotor salvo ✓','💾');
}

// Preenche automaticamente nome + foto ao selecionar vendedor do cadastro
function dpSelectSeller(type, mk, val){
  const ni  = document.getElementById(`dp-name-${type}-${mk}`);
  const slot= document.getElementById(`dp-photo-${type}-${mk}`);
  const color = type==='prom'?'#059669':'#dc2626';
  const uid   = String(currentUser?.id || 'default');
  const photoKey = `${uid}_${type}_${mk}`;

  if(!val){
    // Limpou a seleção — apaga nome e volta ao ícone padrão
    if(ni) ni.value='';
    if(slot){
      const ico=`<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>`;
      slot.innerHTML=ico; slot.style.cssText=`width:46px;height:46px;border-radius:50%;flex-shrink:0;cursor:pointer;border:2px dashed ${color};display:flex;align-items:center;justify-content:center;overflow:hidden;background:${color}11`;
      delete _dpPhotos[photoKey]; _saveDpPhotos();
    }
    return;
  }

  const sid = parseInt(val);
  const s   = DB.sellers.find(x=>x.id===sid);
  if(!s) return;

  // Preenche o nome
  if(ni) ni.value = s.name;

  // Preenche a foto
  if(slot){
    const photo = s.photo || null;
    if(photo){
      slot.innerHTML=`<img src="${photo}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`;
      slot.style.border=`2px solid ${color}`;
      _dpPhotos[photoKey]=photo;
      _saveDpPhotos();
    } else {
      // Sem foto: mostra inicial com cor do vendedor
      slot.innerHTML=`<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:${s.color||color}33;font-size:18px;font-weight:800;color:${s.color||color};font-family:var(--font)">${s.name[0]}</div>`;
      slot.style.border=`2px solid ${color}`;
      delete _dpPhotos[photoKey]; _saveDpPhotos();
    }
  }
}

function _restoreDpFields(){
  const ymKey = String(currentYM);
  const hubId = _getHubIdForPsv();  // já retorna string
  // Leitura: usa o userId do supervisor dono do HUB (visão hierárquica)
  const uid   = _getPsvOwnerUserId();
  // Lê da nova tabela filtrando por userId+ymKey+hubId; fallback para psvData legado
  const newRows = (DB.psvDp||[]).filter(r => String(r.userId||'default')===uid && String(r.ymKey)===ymKey && String(r.hubId)===hubId);
  const dpDb_legacy = (DB.psvData?.dp||{})[ymKey]||{};

  ['M0','M1','M2'].forEach(mk=>{
    ['prom','det'].forEach(tipo=>{
      const k       = `${tipo}_${mk}`;
      const photoKey= `${uid}_${tipo}_${mk}`;
      // Tenta nova tabela primeiro
      const row = newRows.find(r=>r.tipo===tipo && r.safra===mk);
      const d   = row
        ? { name: row.nome_manual, val: row.valor, sellerId: row.vendedorId, photo: row.photo }
        : (dpDb_legacy[k]||{});

      const ni   = document.getElementById(`dp-name-${tipo}-${mk}`);
      const vi   = document.getElementById(`dp-val-${tipo}-${mk}`);
      const sel  = document.getElementById(`dp-sel-${tipo}-${mk}`);
      const slot = document.getElementById(`dp-photo-${tipo}-${mk}`);
      const color= tipo==='prom'?'#059669':'#dc2626';

      if(ni) ni.value = d.name||'';
      if(vi){ vi.value = d.val||''; if(d.val) vi.style.color = color; }
      if(sel && d.sellerId) sel.value = d.sellerId;

      const photo = d.photo || _dpPhotos[photoKey] || null;
      if(photo && slot){
        slot.innerHTML=`<img src="${photo}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`;
        slot.style.border=`2px solid ${color}`;
        _dpPhotos[photoKey]=photo; _saveDpPhotos();
      } else if(d.name && !photo && slot){
        // Vendedor salvo mas sem foto — mostra inicial
        const sellerId = d.sellerId ? parseInt(d.sellerId) : null;
        const s = sellerId ? DB.sellers.find(x=>x.id===sellerId) : null;
        const sColor = s?.color||color;
        const inicial = (d.name||'?')[0].toUpperCase();
        slot.innerHTML=`<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:${sColor}33;font-size:18px;font-weight:800;color:${sColor};font-family:var(--font)">${inicial}</div>`;
        slot.style.border=`2px solid ${color}`;
      }
    });
  });
}

// Fecha popup ao clicar fora
document.addEventListener('click', e=>{
  if(!e.target.closest('#m-popup') && !e.target.closest('.m-val'))
    closeMPopup();
});
function openChangePwModal(){
  if(!currentUser){ toast('Faça login primeiro','⚠️'); return; }
  document.getElementById('chpw-user-label').textContent=`Usuário: @${currentUser.username}`;
  document.getElementById('chpw-old').value='';
  document.getElementById('chpw-new').value='';
  document.getElementById('chpw-confirm').value='';
  document.getElementById('chpw-warn').style.display='none';
  document.getElementById('chpw-modal').classList.add('show');
}
function closeChangePwModal(){ document.getElementById('chpw-modal').classList.remove('show'); }

function doChangePassword(){
  const oldPw  = document.getElementById('chpw-old').value;
  const newPw  = document.getElementById('chpw-new').value;
  const confPw = document.getElementById('chpw-confirm').value;
  const warn   = document.getElementById('chpw-warn');
  const showWarn = msg=>{ warn.style.display='block'; warn.textContent=msg; };

  if(!oldPw||!newPw||!confPw){ showWarn('⚠️ Preencha todos os campos.'); return; }
  const user = DB.users?.find(u=>u.id===currentUser.id);
  if(!user){ showWarn('⚠️ Usuário não encontrado.'); return; }
  // Valida senha antiga: tenta DB, cache e seed (usuários criados via admin podem não ter senha no DB)
  const resolvedOld = _resolvePassword(user) || currentUser.password;
  if(resolvedOld!==oldPw){ showWarn('⚠️ Senha atual incorreta.'); return; }
  if(newPw.length<4){ showWarn('⚠️ A nova senha precisa ter no mínimo 4 caracteres.'); return; }
  if(newPw!==confPw){ showWarn('⚠️ A confirmação não confere com a nova senha.'); return; }

  user.password=newPw;
  // Atualiza sessão, cache e seed em memória
  currentUser={...currentUser,password:newPw};
  setSession(currentUser);
  _updatePwCache([user]);
  _SEED_CREDS[user.username]=newPw;
  const rem=localStorage.getItem('bi_remember');
  if(rem){ try{ const r=JSON.parse(rem); if(r.u===user.username) localStorage.setItem('bi_remember',JSON.stringify({u:user.username,p:newPw})); }catch(e){} }
  saveDB();
  cloudSyncVendas();
  closeChangePwModal();
  toast('✅ Senha alterada com sucesso!');
}

// ══════════════════════════════════════════════════════════
//  LEMBRAR LOGIN
// ══════════════════════════════════════════════════════════
function loadRemembered(){
  try{
    const r=JSON.parse(localStorage.getItem('bi_remember')||'null');
    if(r?.u){
      document.getElementById('li-user').value=r.u;
      document.getElementById('li-pass').value=r.p||'';
      document.getElementById('li-remember').checked=true;
    }
  }catch(e){}
}

function deleteUser(id){
  const u=DB.users?.find(x=>x.id===id);
  if(!u||!confirm(`Remover login "@${u.username}"?`)) return;
  if(!DB.deleted) DB.deleted={userIds:[],sellerIds:[],timeIds:[],regionalIds:[]};
  if(!DB.deleted.userIds.includes(String(id))) DB.deleted.userIds.push(String(id));
  DB.users=DB.users.filter(x=>x.id!==id);
  saveDB(); renderUserList();
  toast(`Login @${u.username} removido`,'🗑️');
}

// ══════════════════════════════════════════════════════════
//  CALENDÁRIO
// ══════════════════════════════════════════════════════════
let calViewYM = null; // {y, m} do mês exibido no calendário

function toggleCalendar(){
  const dd = document.getElementById('cal-dropdown');
  const isOpen = dd.classList.contains('open');
  // Fecha qualquer outro dropdown aberto
  document.querySelectorAll('.cal-dropdown.open').forEach(el=>el.classList.remove('open'));
  if(!isOpen){
    if(!calViewYM){ const t=today(); calViewYM={y:t.getFullYear(),m:t.getMonth()}; }
    renderCalendar();
    dd.classList.add('open');
  }
}

// Fecha ao clicar fora
document.addEventListener('click', e=>{
  if(!e.target.closest('#cal-wrap')) {
    document.getElementById('cal-dropdown')?.classList.remove('open');
  }
});

function calNav(delta){
  if(!calViewYM){ const t=today(); calViewYM={y:t.getFullYear(),m:t.getMonth()}; }
  let {y,m} = calViewYM;
  m += delta;
  if(m < 0){ m=11; y--; }
  if(m > 11){ m=0; y++; }
  calViewYM = {y,m};
  renderCalendar();
}

function renderCalendar(){
  const {y,m} = calViewYM;
  const ymKey  = ym(y,m);
  const t      = today();
  const vendas = DB.vendas[ymKey] || [];

  // Filtra vendas pelo escopo do usuário
  const sids = getScopedSids();
  const scopedVendas = vendas.filter(v=>!sids.length || sids.includes(v.sellerId));

  // Mapa dia → total vendas
  const dayMap = {};
  scopedVendas.forEach(v=>{
    const d = parseInt((v.date||'').split('-')[2])||0;
    if(d) dayMap[d] = (dayMap[d]||0)+v.qty;
  });

  const totalMes = Object.values(dayMap).reduce((a,b)=>a+b,0);

  // Label do mês
  document.getElementById('cal-month-lbl').textContent = `${MESES[m]} ${y}`;
  document.getElementById('cal-total-label').textContent = `Total: ${totalMes} venda(s)`;

  // Atualiza label do botão se for mês atual
  const nowYMKey = nowYM();
  const btnLbl = document.getElementById('cal-btn-label');
  if(btnLbl) btnLbl.textContent = ymKey===nowYMKey ? 'Hoje' : MESES[m].slice(0,3);

  const grid = document.getElementById('cal-grid');
  const DAYS = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];

  let html = DAYS.map(d=>`<div class="cal-dow">${d}</div>`).join('');

  const firstDay = new Date(y,m,1).getDay(); // 0=dom
  const lastDay  = new Date(y,m+1,0).getDate();

  // Células vazias antes
  for(let i=0;i<firstDay;i++) html+=`<div class="cal-day cal-empty"></div>`;

  for(let d=1;d<=lastDay;d++){
    const date  = new Date(y,m,d);
    const dow   = date.getDay();
    const isWE  = dow===0||dow===6;
    const isTod = y===t.getFullYear()&&m===t.getMonth()&&d===t.getDate();
    const hasV  = dayMap[d]>0;
    let cls = 'cal-day';
    if(isWE) cls+=' cal-weekend';
    if(isTod) cls+=' cal-today';
    if(hasV && !isWE) cls+=' cal-has-vendas';
    const tip = hasV ? ` title="${dayMap[d]} venda(s)"` : '';
    html+=`<div class="${cls}"${tip}>${d}</div>`;
  }

  grid.innerHTML=html;
}

// Atualiza calendário quando mês do BI muda
function syncCalToBI(){
  const {y,m} = ymToYM(currentYM);
  calViewYM = {y,m};
  const dd = document.getElementById('cal-dropdown');
  if(dd?.classList.contains('open')) renderCalendar();
}

// ══════════════════════════════════════════════════════════
//  MODAL VER TODOS OS USUÁRIOS
// ══════════════════════════════════════════════════════════
function openVerUsuariosModal(){
  document.getElementById('vu-search').value='';
  renderVerUsuarios();
  document.getElementById('ver-usuarios-modal').classList.add('show');
}
function closeVerUsuariosModal(){
  document.getElementById('ver-usuarios-modal').classList.remove('show');
}
function renderVerUsuarios(){
  const q = document.getElementById('vu-search').value.trim().toLowerCase();
  const u = currentUser;
  const canEdit = isGerente(u);
  const labels  = {gerente:'Gerente',regional:'Admin Regional',supervisor:'Supervisor'};
  const colors  = {gerente:'#7c3aed',regional:'#2563eb',supervisor:'#059669'};

  let users = [...(DB.users||[])].sort((a,b)=>{
    const order={gerente:0,regional:1,supervisor:2};
    return (order[a.role]??3)-(order[b.role]??3)||(a.nome||a.username).localeCompare(b.nome||b.username);
  });

  if(q) users=users.filter(x=>(x.nome||'').toLowerCase().includes(q)||(x.username||'').toLowerCase().includes(q));

  document.getElementById('vu-subtitle').textContent=`${users.length} usuário(s) encontrado(s)`;

  if(!users.length){
    document.getElementById('vu-list').innerHTML='<div style="text-align:center;padding:28px;color:var(--tl)">Nenhum usuário encontrado</div>';
    return;
  }

  const roleColor={gerente:'#7c3aed',regional:'#2563eb',supervisor:'#059669'};
  const roleBg   ={gerente:'rgba(124,58,237,.1)',regional:'rgba(37,99,235,.1)',supervisor:'rgba(5,150,105,.1)'};

  document.getElementById('vu-list').innerHTML = users.map(x=>{
    const isSelf = u?.id===x.id;
    const rg=(DB.regionais||[]).find(r=>r.id===x.regionalId);
    const tm=(DB.times||[]).find(t=>t.id===x.timeId);
    const c = roleColor[x.role]||'#2563eb';
    const bg= roleBg[x.role]||'rgba(37,99,235,.1)';
    return `<div class="um-user-item" style="margin-bottom:7px">
      <div class="um-avatar" style="background:${x.color||c};width:36px;height:36px;font-size:13px">${(x.nome||x.username)[0].toUpperCase()}</div>
      <div class="um-user-info" style="flex:1">
        <div class="um-user-name" style="display:flex;align-items:center;gap:6px">
          ${x.nome||x.username}
          <span style="display:inline-flex;padding:2px 8px;border-radius:4px;font-size:10px;font-weight:700;background:${bg};color:${c};border:1px solid ${c}33">${labels[x.role]||x.role}</span>
          ${isSelf?'<span style="font-size:10px;color:var(--tl);font-weight:400">(você)</span>':''}
        </div>
        <div class="um-user-sub" style="margin-top:2px">
          @${x.username}${rg?` · 🏠 ${rg.nome}`:''}${tm?` · 🏢 ${tm.nome}`:''}
        </div>
      </div>
      ${canEdit&&!isSelf?`
        <div style="display:flex;gap:5px">
          <button style="background:var(--blue-g);color:var(--blue);border:1px solid rgba(37,99,235,.2);border-radius:6px;padding:4px 9px;font-size:11px;font-weight:600;cursor:pointer;font-family:var(--font)" onclick="closeVerUsuariosModal();openEditUserModal(${x.id})">✏️ Editar</button>
          <button class="del-seller" onclick="deleteUserFromModal(${x.id})">Remover</button>
        </div>`:''}
    </div>`;
  }).join('');
}
function deleteUserFromModal(id){
  deleteUser(id);
  renderVerUsuarios();
}

// ══════════════════════════════════════════════════════════
//  TRANSFERÊNCIA DE VENDEDOR ENTRE HUBS
// ══════════════════════════════════════════════════════════
let _transferSellerId = null;

function openTransferModal(id){
  const s = DB.sellers.find(x=>x.id===id); if(!s) return;
  _transferSellerId = id;
  document.getElementById('tr-subtitle').textContent = `${s.name} · HUB atual: ${(DB.times||[]).find(t=>t.id===s.timeId)?.nome||'—'}`;
  document.getElementById('tr-date').value = fmtD(today());
  document.getElementById('tr-warn').style.display='none';

  // HUBs disponíveis (todos menos o atual)
  const u = currentUser;
  const allTimes = isGerente(u) ? (DB.times||[]) : u?.role==='regional' ? (DB.times||[]).filter(t=>t.regionalId===u.regionalId) : (DB.times||[]);
  const trHub = document.getElementById('tr-hub');
  trHub.innerHTML = '<option value="">— Selecione o HUB destino —</option>'
    + allTimes.filter(t=>t.id!==s.timeId).map(t=>{
        const rg=(DB.regionais||[]).find(r=>r.id===t.regionalId);
        return `<option value="${t.id}">${t.nome}${rg?' — '+rg.nome:''}`;
      }).join('');

  document.getElementById('transfer-modal').classList.add('show');
}
function closeTransferModal(){
  document.getElementById('transfer-modal').classList.remove('show');
  _transferSellerId = null;
}
function confirmTransfer(){
  const s = DB.sellers.find(x=>x.id===_transferSellerId); if(!s) return;
  const date   = document.getElementById('tr-date').value;
  const toTimeId = parseInt(document.getElementById('tr-hub').value)||null;
  const warn   = document.getElementById('tr-warn');
  const show   = msg=>{ warn.style.display='block'; warn.textContent=msg; };

  if(!date){ show('⚠️ Informe a data da transferência.'); return; }
  if(!toTimeId){ show('⚠️ Selecione o HUB destino.'); return; }

  const fromTimeId = s.timeId;
  if(!s.transfers) s.transfers=[];
  s.transfers.push({fromTimeId, toTimeId, date});
  s.timeId    = toTimeId;
  s.activeFrom = date; // nova data de início no hub destino

  saveDB();
  closeTransferModal();
  renderSellers(); renderDash(); populateQESellers();

  const toTm = (DB.times||[]).find(t=>t.id===toTimeId);
  const frTm = (DB.times||[]).find(t=>t.id===fromTimeId);
  toast(`✅ ${s.name} transferido de ${frTm?.nome||'?'} → ${toTm?.nome||'?'} a partir de ${date.split('-').reverse().join('/')}`);
}

// ══════════════════════════════════════════════════════════
//  MODAL EDITAR VENDEDOR
// ══════════════════════════════════════════════════════════
let _editSellerId=null;
let _editSellerPhoto=null;

function openEditSellerModal(id){
  const s=DB.sellers.find(x=>x.id===id); if(!s) return;
  _editSellerId=id; _editSellerPhoto=null;
  document.getElementById('es-nome').value=s.name||'';
  document.getElementById('es-cpf').value=s.cpf||'';
  document.getElementById('es-adm').value=s.admDate||'';
  document.getElementById('es-cor').value=s.color||'#2563eb';
  document.getElementById('es-warn').style.display='none';

  // HUB select — supervisor vê só o seu
  const u=currentUser;
  const esTm=document.getElementById('es-time');
  const esHubWrap=document.getElementById('es-hub-wrap');
  if(u?.role==='supervisor'){
    const tm=(DB.times||[]).find(t=>t.id===u.timeId);
    esTm.innerHTML=`<option value="${u.timeId}">${tm?.nome||'Meu HUB'}</option>`;
    esTm.value=u.timeId; esHubWrap.style.display='none';
  } else {
    esHubWrap.style.display='';
    const ts=u?.role==='regional'?(DB.times||[]).filter(t=>t.regionalId===u.regionalId):(DB.times||[]);
    esTm.innerHTML='<option value="">— Sem HUB —</option>'+ts.map(t=>`<option value="${t.id}"${t.id===s.timeId?' selected':''}>${t.nome}</option>`).join('');
  }

  // Foto
  const prev=document.getElementById('es-photo-preview');
  if(prev) prev.innerHTML=s.photo
    ?`<img src="${s.photo}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`
    :`<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--tl)" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>`;

  document.getElementById('edit-seller-modal').classList.add('show');
  setTimeout(()=>document.getElementById('es-nome').focus(),80);
}
function closeEditSellerModal(){
  document.getElementById('edit-seller-modal').classList.remove('show');
  _editSellerId=null; _editSellerPhoto=null;
}
async function previewEditSellerPhoto(e){
  const f=e.target.files[0]; if(!f) return;
  const data=await compressPhoto(f);
  _editSellerPhoto=data;
  const prev=document.getElementById('es-photo-preview');
  if(prev) prev.innerHTML=`<img src="${data}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`;
}
function saveEditSeller(){
  const s=DB.sellers.find(x=>x.id===_editSellerId); if(!s) return;
  const nome=document.getElementById('es-nome').value.trim().toUpperCase();
  const warn=document.getElementById('es-warn');
  if(!nome){ warn.style.display='block'; warn.textContent='⚠️ Informe o nome.'; return; }
  s.name=nome;
  s.cpf=document.getElementById('es-cpf').value.trim();
  const adm=document.getElementById('es-adm').value;
  if(adm) s.admDate=adm;
  const u=currentUser;
  if(u?.role!=='supervisor'){
    const tmId=parseInt(document.getElementById('es-time').value)||null;
    s.timeId=tmId;
  }
  s.color=document.getElementById('es-cor').value||s.color;
  if(_editSellerPhoto) s.photo=_editSellerPhoto;
  saveDB(); renderSellers(); renderDash(); populateQESellers();
  closeEditSellerModal();
  toast(`✅ ${nome} atualizado!`);
}

// ══════════════════════════════════════════════════════════
//  MODAL EDITAR USUÁRIO (GERENTE / ALDENIR)
// ══════════════════════════════════════════════════════════
let _editUserId = null;

function openEditUserModal(id){
  const x = DB.users?.find(u=>u.id===id);
  if(!x){ toast('Usuário não encontrado','⚠️'); return; }
  _editUserId = id;

  document.getElementById('eu-subtitle').textContent = `@${x.username}`;
  document.getElementById('eu-nome').value     = x.nome||x.username;
  document.getElementById('eu-password').value = '';
  document.getElementById('eu-role').value     = x.role||'supervisor';
  document.getElementById('eu-warn').style.display='none';
  _newUserPhoto = null;
  // Mostra foto existente
  const euPrev=document.getElementById('eu-photo-preview');
  if(euPrev){
    euPrev.innerHTML = x.photo
      ? `<img src="${x.photo}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`
      : `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--tl)" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>`;
  }

  // Preenche selects
  const tmSel = document.getElementById('eu-time');
  tmSel.innerHTML='<option value="">— Selecione o HUB —</option>'
    +(DB.times||[]).map(t=>{
      const rg=(DB.regionais||[]).find(r=>r.id===t.regionalId);
      return `<option value="${t.id}"${t.id===x.timeId?' selected':''}>${t.nome}${rg?' — '+rg.nome:''}</option>`;
    }).join('');

  const rgSel = document.getElementById('eu-regional');
  rgSel.innerHTML='<option value="">— Selecione a Regional —</option>'
    +(DB.regionais||[]).map(r=>`<option value="${r.id}"${r.id===x.regionalId?' selected':''}>${r.nome}</option>`).join('');

  onEuRoleChange();
  document.getElementById('edit-user-modal').classList.add('show');
  setTimeout(()=>document.getElementById('eu-nome').focus(),80);
}

function closeEditUserModal(){
  document.getElementById('edit-user-modal').classList.remove('show');
  _editUserId = null;
}

function onEuRoleChange(){
  const role = document.getElementById('eu-role').value;
  document.getElementById('eu-hub-wrap').style.display      = role==='supervisor'?'':'none';
  document.getElementById('eu-regional-wrap').style.display = (role==='supervisor'||role==='regional')?'':'none';
}

function saveEditUser(){
  if(!_editUserId) return;
  const x = DB.users?.find(u=>u.id===_editUserId);
  if(!x){ toast('Usuário não encontrado','⚠️'); return; }

  const nome       = document.getElementById('eu-nome').value.trim();
  const password   = document.getElementById('eu-password').value;
  const role       = document.getElementById('eu-role').value;
  const timeId     = parseInt(document.getElementById('eu-time').value)||null;
  const regionalId = parseInt(document.getElementById('eu-regional').value)||null;
  const warn       = document.getElementById('eu-warn');
  const showWarn   = msg=>{ warn.style.display='block'; warn.textContent=msg; };

  if(role==='supervisor'&&!timeId){ showWarn('⚠️ Selecione o HUB para o Supervisor.'); return; }
  if(role==='regional'&&!regionalId){ showWarn('⚠️ Selecione a Regional para o Admin Regional.'); return; }

  const colorMap={gerente:'#7c3aed',regional:'#2563eb',supervisor:'#059669'};

  x.nome       = nome||x.username;
  x.role       = role;
  x.timeId     = role==='supervisor' ? timeId     : null;
  x.regionalId = (role==='supervisor'||role==='regional') ? regionalId : null;
  x.color      = colorMap[role]||x.color;
  if(password && password.length>=4) x.password = password;
  if(_newUserPhoto) x.photo = _newUserPhoto;

  saveDB();
  closeEditUserModal();
  renderUserList();
  // Atualiza modal de listagem se estiver aberto
  if(document.getElementById('ver-usuarios-modal')?.classList.contains('show')) renderVerUsuarios();
  toast(`✅ Usuário @${x.username} atualizado para ${({gerente:'Gerente',regional:'Admin Regional',supervisor:'Supervisor'}[role]||role)}!`);
}

// ══════════════════════════════════════════════════════════
//  MODAL CRIAR USUÁRIO (ALDENIR)
// ══════════════════════════════════════════════════════════
function openAldenirUserModal(){
  const tmSel = document.getElementById('au-time');
  tmSel.innerHTML='<option value="">— Selecione o HUB —</option>'
    +(DB.times||[]).map(t=>{
      const rg=(DB.regionais||[]).find(r=>r.id===t.regionalId);
      return `<option value="${t.id}">${t.nome}${rg?' — '+rg.nome:''}</option>`;
    }).join('');
  const rgSel = document.getElementById('au-regional-au');
  rgSel.innerHTML='<option value="">— Selecione a Regional —</option>'
    +(DB.regionais||[]).map(r=>`<option value="${r.id}">${r.nome}</option>`).join('');
  document.getElementById('au-username').value='';
  document.getElementById('au-password').value='';
  document.getElementById('au-nome').value='';
  document.getElementById('au-role').value='gerente';
  document.getElementById('au-warn').style.display='none';
  _newUserPhoto=null;
  const auPrev=document.getElementById('au-photo-preview');
  if(auPrev) auPrev.innerHTML='<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--tl)" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>';
  onAuRoleChange();
  document.getElementById('aldenir-user-modal').classList.add('show');
  setTimeout(()=>document.getElementById('au-username').focus(),80);
}
function closeAldenirUserModal(){
  document.getElementById('aldenir-user-modal').classList.remove('show');
}
function onAuRoleChange(){
  const role = document.getElementById('au-role').value;
  document.getElementById('au-hub-wrap').style.display      = role==='supervisor'?'':'none';
  document.getElementById('au-regional-wrap').style.display = role==='supervisor'?'':'none';
}
function saveAldenirUser(){
  const username   = document.getElementById('au-username').value.trim().toLowerCase();
  const password   = document.getElementById('au-password').value;
  const nome       = document.getElementById('au-nome').value.trim();
  const role       = document.getElementById('au-role').value;
  const timeId     = parseInt(document.getElementById('au-time').value)||null;
  const regionalId = parseInt(document.getElementById('au-regional-au').value)||null;
  const warn       = document.getElementById('au-warn');
  const showWarn   = msg=>{ warn.style.display='block'; warn.textContent=msg; };
  if(!username){ showWarn('⚠️ Informe o nome de usuário.'); return; }
  if(!password||password.length<4){ showWarn('⚠️ A senha precisa ter no mínimo 4 caracteres.'); return; }
  if(role==='supervisor'&&!timeId){ showWarn('⚠️ Selecione o HUB para o Supervisor.'); return; }
  if(!DB.users) DB.users=[];
  if(DB.users.find(u=>(u.username||'').toLowerCase()===username)){ showWarn('⚠️ Já existe um usuário com este nome.'); return; }
  const colorMap={gerente:'#7c3aed',supervisor:'#059669'};
  const newAuUser={
    id:Date.now(), username, password, role,
    nome:nome||username,
    photo: _newUserPhoto||null,
    regionalId: role==='supervisor'?regionalId:null,
    timeId:     role==='supervisor'?timeId:null,
    color: colorMap[role]||'#2563eb'
  };
  DB.users.push(newAuUser);
  _newUserPhoto=null;
  // ── Garante que a senha fica no cache local E no seed em memória ──
  _updatePwCache([newAuUser]);
  _SEED_CREDS[username]=password;
  saveDB();
  closeAldenirUserModal();
  renderUserList();
  toast(`✅ Usuário @${username} criado como ${role==='gerente'?'Gerente':'Supervisor'}!`);
  cloudSyncVendas();
}

populateMes();
populateQESellers();
setDefaultDate();
loadRemembered();
// M-popup Enter key
document.getElementById('m-popup-input').addEventListener('keydown', e=>{
  if(e.key==='Enter') saveMValue();
  if(e.key==='Escape') closeMPopup();
}); // preenche login se "lembrar" estava ativo

(async () => {
  const setMsg     = t => { const e=document.getElementById('loading-msg');     if(e) e.textContent=t; };
  const hideLoading= ()=> { const e=document.getElementById('loading-ov');      if(e) e.style.display='none'; };
  const showRetry  = ()=> { const e=document.getElementById('loading-retry');   if(e) e.style.display=''; };

  // ── PASSO 1: Sincroniza com a nuvem ANTES de mostrar o login ─────────────
  setMsg('Conectando ao Google Sheets…');
  let ok = false;
  for(let t=1; t<=5; t++){
    setMsg(t===1 ? 'Carregando banco de dados…' : `Tentando novamente… (${t}/5)`);
    ok = await cloudPull();
    if(ok) break;
    if(t < 5) await new Promise(r=>setTimeout(r, t * 1500));
  }

  if(!ok){
    // Fallback local apenas como último recurso
    setMsg('⚠️ Sem conexão. Usando cache local…');
    showRetry();
    try{
      const s = localStorage.getItem('bi_v5');
      if(s){ const d=JSON.parse(s); if(d?.sellers){ DB=d; migrateToDefaultRegional(DB); } }
    }catch(e){}
    await new Promise(r=>setTimeout(r, 1200));
  }

  populateMes();
  populateQESellers();

  // ── PASSO 2: Sessão → login ou dashboard ─────────────────────────────────
  // Garante todos os usuários do seed em DB.users antes de qualquer verificação
  _ensureSeedUsersInDB();
  const sess   = getSession();
  const dbUser = sess ? DB.users?.find(u=>u.id===sess.id) : null;
  hideLoading();

  if(sess && dbUser){
    // Restaura senha do cache persistente se o DB não tiver (cloudPull removeu)
    const cachedPw = _getPwFromCache(dbUser.id);
    currentUser = { ...dbUser,
      password: dbUser.password || sess.password || cachedPw || undefined
    };
    if(currentUser.password) _updatePwCache([currentUser]); // garante cache atualizado
    setSession(currentUser);
    document.getElementById('login-ov').classList.add('hidden');
    applySession();
    // FIX: sincroniza com a nuvem ANTES de renderizar o dash
    // Garante que DB esteja populado e currentUser correto antes de qualquer render
    {
      const navEl = document.querySelectorAll('.ni')[0];
      const _doRender = () => {
        populateMes();
        populateQESellers();
        requestAnimationFrame(() => goPage('dash', navEl));
      };
      cloudPull().then(ok => {
        if(ok){
          // Atualiza currentUser com dados frescos do Sheets
          const sess = getSession();
          const freshUser = sess && (DB.users?.find(u=>u.id===sess.id)
                         || DB.users?.find(u=>(u.username||'').toLowerCase()===(sess.username||'').toLowerCase()));
          if(freshUser){
            currentUser = {...sess, ...freshUser, password: sess.password || freshUser.password};
            setSession(currentUser);
            applySession();
          }
        }
        _doRender();
      }).catch(() => _doRender());
    }
  } else {
    document.getElementById('login-ov').classList.remove('hidden');
    if(!getCfg().gsUrl)
      document.getElementById('login-sync-warn').style.display='block';
  }

  // ── PASSO 3: Motor de atualização em tempo real ───────────────────────────
  // Cobre todos os dispositivos: iOS Safari, Android Chrome, Firefox, Edge, Samsung Browser

  async function _pull(){
    if(!currentUser || _syncRunning) return;
    // mergeLocal=true: preserva alterações locais (ex: feriado recém-adicionado)
    // que ainda não foram sincronizadas com a nuvem (debounce de 350ms pendente)
    const r = await cloudPull(true);
    if(r){ _refreshCurrentUserFromDB(); populateMes(); populateQESellers(); renderAll(); renderPSVIfActive(); }
  }

  // a) Polling 15s — ativo somente quando a aba está visível
  setInterval(()=>{ if(!document.hidden) _pull(); }, 15000);

  // b) visibilitychange — Chrome, Firefox, Edge, Samsung Browser
  document.addEventListener('visibilitychange', ()=>{ if(!document.hidden) _pull(); });

  // c) pageshow — iOS Safari (BFCache): único evento confiável ao voltar para a aba no iOS
  window.addEventListener('pageshow', e=>{ if(e.persisted) _pull(); });

  // d) focus — desktop ao voltar para a janela do browser
  window.addEventListener('focus', ()=>_pull());

  // e) online — reconectou à internet (Wi-Fi voltou, dados móveis ligados)
  window.addEventListener('online', ()=>{ toast('🌐 Conexão restaurada — sincronizando…'); _pull(); saveDB(); });

  // f) offline — avisa e mantém dados locais seguros
  window.addEventListener('offline', ()=>{ setCloudUI('err','Sem conexão'); toast('⚠️ Sem internet. Dados salvos localmente.','⚠️'); });

  // g) pagehide + beforeunload — sendBeacon: garante POST mesmo ao fechar o app no mobile
  function _beacon(){
    const cfg=getCfg();
    if(!cfg.gsUrl || typeof navigator.sendBeacon !== 'function') return;
    try{ const p=new URLSearchParams(); p.append('data',JSON.stringify(DB)); navigator.sendBeacon(cfg.gsUrl, p); }catch(e){}
  }
  window.addEventListener('pagehide',     _beacon);
  window.addEventListener('beforeunload', _beacon);

  // h) storage — sincroniza múltiplas abas do mesmo browser instantaneamente
  window.addEventListener('storage', e=>{
    if(e.key==='bi_v5' && e.newValue && currentUser){
      try{ const d=JSON.parse(e.newValue); if(d?.sellers){ DB=d; renderAll(); } }catch(x){}
    }
  });

  // i) Ctrl+S / Cmd+S → salvar
  document.addEventListener('keydown', e=>{
    if((e.ctrlKey||e.metaKey) && e.key==='s'){ e.preventDefault(); if(currentUser) manualSave(); }
  });
})();

// ══════════════════════════════════════════════════════════
//  PSV — Apresentação de Resultados
// ══════════════════════════════════════════════════════════
let _psvCharts = {};

// Raw params stored for PSV maximize
let _psvLineParams = null;
let _psvSellersParams = null;

function psvMaximize(type, title){
  const ov=document.getElementById('psv-maximize-ov');
  const content=document.getElementById('psv-max-content');
  const titleEl=document.getElementById('psv-max-title');
  if(!ov||!content) return;
  titleEl.innerHTML=title;
  ov.style.display='flex';

  content.innerHTML=`<div style="width:100%;height:calc(100vh - 110px)"><canvas id="psv-max-canvas"></canvas></div>`;
  setTimeout(()=>{
    const ctx=document.getElementById('psv-max-canvas')?.getContext('2d');
    if(!ctx) return;

    if(type==='donut'){
      const real=_psvCharts.donut?.data?.datasets?.[0]?.data?.[0]??0;
      const gap =_psvCharts.donut?.data?.datasets?.[0]?.data?.[1]??0;
      const fill=_psvCharts.donut?.data?.datasets?.[0]?.backgroundColor?.[0]??'#059669';
      const pct = (real+gap)>0 ? Math.round(real/(real+gap)*100) : 0;
      const plug={id:'maxDonutCenter',afterDraw(chart){
        const{ctx,chartArea:{top,bottom,left,right}}=chart;
        const cx=(left+right)/2,cy=(top+bottom)/2;
        ctx.save();ctx.font='800 40px "JetBrains Mono",monospace';ctx.fillStyle=fill;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(pct+'%',cx,cy-12);ctx.font='500 16px Outfit,sans-serif';ctx.fillStyle='#94a3b8';ctx.fillText('de meta',cx,cy+22);ctx.restore();
      }};
      new Chart(ctx,{type:'doughnut',data:{datasets:[{data:[real,gap],backgroundColor:[fill,'#e2e8f0'],borderWidth:0}]},options:{cutout:'70%',responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>{const l=['Realizado','Restante'];return ` ${l[c.dataIndex]}: ${c.raw}`;}}}},animation:{animateRotate:true}},plugins:[plug]});
    }
    else if(type==='line' && _psvLineParams){
      const {labels,data,colors}=_psvLineParams;
      new Chart(ctx, makeLineConfig(labels, data, colors));
    }
    else if(type==='sellers' && _psvSellersParams){
      const{labels,vendas,compr,proj,colors}=_psvSellersParams;
      const bp={id:'bp_max',afterDatasetsDraw(chart){const{ctx}=chart;const usedY={};function dl(x,y,v,c){if(!v)return;const k=Math.round(x);if(!usedY[k])usedY[k]=[];let fy=y;usedY[k].forEach(uy=>{if(Math.abs(fy-uy)<14)fy=Math.min(fy,uy)-14;});usedY[k].push(fy);ctx.save();ctx.fillStyle=c;ctx.font='700 11px "JetBrains Mono",monospace';ctx.textAlign='center';ctx.textBaseline='bottom';ctx.fillText(v,x,fy);ctx.restore();}chart.getDatasetMeta(0).data.forEach((b,i)=>dl(b.x,b.y-4,vendas[i],'#334155'));chart.getDatasetMeta(1).data.forEach((pt,i)=>dl(pt.x,pt.y-7,compr[i],'#f97316'));chart.getDatasetMeta(2).data.forEach((pt,i)=>dl(pt.x,pt.y-7,proj[i],'#7c3aed'));}};
      new Chart(ctx,{type:'bar',data:{labels,datasets:[{type:'bar',label:'Vendas',data:vendas,backgroundColor:colors.map(c=>c+'cc'),borderRadius:6,barPercentage:.55,yAxisID:'y'},{type:'line',label:'Compromisso',data:compr,borderColor:'#f97316',backgroundColor:'rgba(249,115,22,.08)',borderWidth:2.5,pointRadius:6,pointBackgroundColor:'#f97316',pointBorderColor:'#fff',pointBorderWidth:2,tension:0.3,fill:false,yAxisID:'y'},{type:'line',label:'Projeção',data:proj,borderColor:'#7c3aed',backgroundColor:'rgba(124,58,237,.06)',borderWidth:2,borderDash:[5,4],pointRadius:6,pointBackgroundColor:'#7c3aed',pointBorderColor:'#fff',pointBorderWidth:2,tension:0.3,fill:false,yAxisID:'y'}]},options:{responsive:true,maintainAspectRatio:false,layout:{padding:{top:28}},plugins:{legend:{labels:{font:{family:'Outfit',size:12},color:'#475569'},position:'bottom'},tooltip:{mode:'index',intersect:false},bp_max:{}},scales:{x:{grid:{display:false},ticks:{font:{family:'Outfit',size:11},color:'#94a3b8'}},y:{grid:{color:'#f1f5f9'},ticks:{font:{family:'JetBrains Mono',size:11},color:'#94a3b8'},beginAtZero:true}}},plugins:[bp]});
    }
  },50);
}
function closePsvMaximize(){
  const ov=document.getElementById('psv-maximize-ov');
  if(ov) ov.style.display='none';
  const c=document.getElementById('psv-max-canvas');
  if(c) Chart.getChart(c)?.destroy();
}
// Fotos dos vendedores — persistidas em localStorage (separado do banco JSON)
const _psvPhotos = (() => {
  try { return JSON.parse(localStorage.getItem('psv_photos')||'{}'); } catch(e){ return {}; }
})();
function _savePhotos(){ try{ localStorage.setItem('psv_photos', JSON.stringify(_psvPhotos)); }catch(e){} }

function sellerMaturity(s){
  if(!s.admDate) return 'full';
  const adm  = new Date(s.admDate+'T00:00:00');
  const now  = today();
  const days = Math.floor((now - adm) / 86400000);
  if(days < 0)  return 'full';
  if(days <= 30) return 'm0';
  if(days <= 60) return 'm1';
  if(days <= 90) return 'm2';
  return 'full';
}
