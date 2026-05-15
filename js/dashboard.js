// ══ DASHBOARD.JS ══

function renderDash(){
  // Garante que a barra de filtro esteja sempre visível no dashboard
  if(currentUser) populateDashFilter();

  const ymKey=currentYM, {y,m}=ymToYM(ymKey), t=today();
  const coAll=getDiasCorridos(y,m);

  // ── Fonte única: getMonthTimeStats centraliza todo o cálculo de dias úteis ──
  const { duTotal, duPass, duRest, desconto, duAll } = getMonthTimeStats(ymKey);
  const duBruto = duAll.length;
  const coTotal = Math.max(0, coAll.length - desconto);
  const coPass  = coAll.filter(d=>d<=t).length;

  // ── Popula equação visual na aba de dias ──
  const _eqEl = id => document.getElementById(id);
  if(_eqEl('eq-bruto'))    _eqEl('eq-bruto').textContent    = duBruto;
  if(_eqEl('eq-feriados')) _eqEl('eq-feriados').textContent = desconto;
  if(_eqEl('eq-uteis'))    _eqEl('eq-uteis').textContent    = duTotal;

  // Popula o campo de desconto com o valor atual (sem sobrescrever se o user está editando)
  const descontoInp = document.getElementById('cfg-desconto-dias');
  if(descontoInp && document.activeElement !== descontoInp){
    descontoInp.value = desconto > 0 ? desconto : '';
  }

  // Status da aba dias
  const statusEl = document.getElementById('dias-config-status');
  if(statusEl) statusEl.textContent = desconto > 0
    ? `✅ ${desconto} feriado(s) descontado(s) — ${duTotal} dias úteis reais`
    : '';


  const metaTotal=getScopedMeta(ymKey);
  const scopedSellers = getScopedSellers();
  const hc=scopedSellers.length;
  const sid=selectedSeller;

  // Meta exibida no KPI conforme seleção ativa
  let metaFilt, metaLabel;
  if(sid){
    // Vendedor selecionado → compromisso individual
    metaFilt  = getSellerMeta(ymKey, sid);
    const sn  = DB.sellers.find(s=>s.id===sid);
    metaLabel = `Compromisso: ${sn?.name||''}`;
  } else if(scopeFilter.timeId){
    // HUB filtrado → meta definida para o HUB
    metaFilt  = getHubMeta(ymKey, scopeFilter.timeId);
    const tn  = (DB.times||[]).find(t=>t.id===scopeFilter.timeId);
    metaLabel = `Meta HUB: ${tn?.nome||''}`;
  } else if(scopeFilter.regionalId){
    // Regional filtrada → soma das metas dos HUBs da regional
    const tids= (DB.times||[]).filter(t=>t.regionalId===scopeFilter.regionalId).map(t=>t.id);
    metaFilt  = tids.reduce((a,id)=>a+getHubMeta(ymKey,id),0);
    const rn  = (DB.regionais||[]).find(r=>r.id===scopeFilter.regionalId);
    metaLabel = `Meta Regional: ${rn?.nome||''}`;
  } else {
    // Sem filtro → soma de todas as metas dos HUBs
    metaFilt  = metaTotal;
    metaLabel = 'Soma das metas dos HUBs';
  }

  const realFilt = sid
    ? sellerTotal(ymKey, sid)
    : scopedSellers.reduce((a,s)=>a+sellerTotal(ymKey,s.id),0);
  const gap = Math.max(0, metaFilt-realFilt);
  const proj = duPass>0 ? realFilt/duPass*duTotal : 0;
  const realPct = metaFilt>0 ? realFilt/metaFilt : 0;
  const projPct = metaFilt>0 ? proj/metaFilt : 0;
  const fazerDia = duRest>0 ? (sid ? Math.ceil(gap/duRest) : Math.ceil(gap/duRest/hc)) : 0;

  // Banner de filtro
  const banner=document.getElementById('sel-banner');
  if(sid){
    const s=DB.sellers.find(x=>x.id===sid);
    banner.classList.add('show');
    document.getElementById('sel-banner-dot').style.background=s?.color||'#ccc';
    document.getElementById('sel-banner-txt').textContent=`Exibindo apenas: ${s?.name}`;
  } else { banner.classList.remove('show'); }

  // KPIs — com animação de contagem progressiva
  _kpiCount('k-meta', metaFilt);
  document.getElementById('k-meta-s').textContent=metaLabel;
  _kpiCount('k-real', realFilt);
  document.getElementById('k-rpf').style.width=Math.min(100,realPct*100).toFixed(1)+'%';
  document.getElementById('k-rs').textContent=(realPct*100).toFixed(1)+'% da meta atingido';
  _kpiCount('k-proj', Math.round(proj));
  document.getElementById('k-ppf').style.width=Math.min(100,projPct*100).toFixed(1)+'%';
  document.getElementById('k-ps').textContent=(projPct*100).toFixed(1)+'% projetado';
  _kpiCount('k-gap', gap);
  document.getElementById('k-gs').textContent=gap===0?'🎯 Meta atingida!':gap+' para bater a meta';

  // ── Ativação ──
  if(!DB.ativacaoManual) DB.ativacaoManual = {};
  // Lê por usuário: {ymKey: {userId: val}}
  const _atvUserId = String(currentUser?.id || 'default');
  const _atvYmObj  = DB.ativacaoManual[ymKey];
  // Suporte retrocompatível: se for número direto (formato legado), migra
  let atvManual = null;
  if(_atvYmObj !== undefined && _atvYmObj !== null){
    if(typeof _atvYmObj === 'object'){
      const v = _atvYmObj[_atvUserId];
      atvManual = (v !== undefined && v !== null) ? v : null;
    } else {
      // legado: era número direto → migra para novo formato
      const legacyVal = _atvYmObj;
      DB.ativacaoManual[ymKey] = {};
      DB.ativacaoManual[ymKey][_atvUserId] = legacyVal;
      atvManual = legacyVal;
    }
  }
  const _atvAuto  = sid ? totalAtivacao(ymKey,sid) : scopedSellers.reduce((a,s)=>a+totalAtivacao(ymKey,s.id),0);
  const atvFilt   = atvManual !== null ? atvManual : _atvAuto;
  const atvPct    = realFilt > 0 ? atvFilt / realFilt : 0;
  // Popula o input com o valor salvo (não sobrescreve se usuário está digitando)
  const atvInput = document.getElementById('k-atv-input');
  if(atvInput && document.activeElement !== atvInput){
    atvInput.value = atvManual !== null ? atvManual : '';
    atvInput.placeholder = _atvAuto > 0 ? _atvAuto : '0';
  }
  document.getElementById('k-atv-fill').style.width = Math.min(100, atvPct*100).toFixed(1)+'%';
  document.getElementById('k-atv-pct').textContent  = (atvPct*100).toFixed(1)+'%';
  document.getElementById('k-atv-s').textContent    = `${atvFilt} de ${realFilt} (${(atvPct*100).toFixed(1)}% de ativação)`;

  // Dias — elementos agora só existem na guia "Ajuste de Dias" (tab 2); null-safe
  const _setTxt = (id, val) => { const el=document.getElementById(id); if(el) el.textContent=val; };
  _setTxt('d-uteis',   duPass);
  _setTxt('d-uteis-v', `${duPass} executados`);
  _setTxt('d-uteis-s', `de ${duTotal} úteis no mês`);
  _setTxt('d-corr',    coPass);
  _setTxt('d-corr-v',  `${coPass} executados`);
  _setTxt('d-corr-s',  `de ${coTotal} corridos (seg–sex)`);
  _setTxt('d-rest',    duRest);
  _setTxt('d-rest-v',  `${duRest} dias restantes`);
  _setTxt('d-fd',      fazerDia);
  _setTxt('tbl-per',   `${MESES[m]} ${y}`);
  _setTxt('line-lbl',  sid ? (DB.sellers.find(s=>s.id===sid)?.name||'') : 'Toda equipe');

  // Tab 2 — resumo de dias (espelho enriquecido)
  const _el = id => document.getElementById(id);
  if(_el('d-uteis2'))    _el('d-uteis2').textContent    = duPass;
  if(_el('d-uteis-v2'))  _el('d-uteis-v2').textContent  = `${duPass} dia(s) passado(s)`;
  if(_el('d-uteis-s2'))  _el('d-uteis-s2').textContent  = `de ${duTotal} úteis reais no mês`;
  if(_el('d-rest2'))     _el('d-rest2').textContent     = duRest;
  if(_el('d-rest-v2'))   _el('d-rest-v2').textContent   = `${duRest} dia(s) restante(s)`;
  if(_el('d-fd2'))       _el('d-fd2').textContent       = fazerDia;
  if(_el('d-total2'))    _el('d-total2').textContent    = duTotal;
  if(_el('d-total-v2'))  _el('d-total-v2').textContent  = `${duBruto} calendário − ${desconto} feriado(s)`;
  if(_el('d-feriados-s2')) _el('d-feriados-s2').textContent = desconto ? `${desconto} feriado(s) descontado(s)` : 'sem feriados';
  if(_el('dias-resumo-mes')) _el('dias-resumo-mes').textContent = `${MESES[m]} ${y}`;

  // TABLE — sempre mostra todos os vendedores, mas linha selecionada fica destacada
  const stats=scopedSellers.map(s=>{
    const r=sellerTotal(ymKey,s.id);
    const meta=getSellerMeta(ymKey,s.id);
    const pct=meta>0?r/meta:0;
    const sp=duPass>0?r/duPass*duTotal:0;
    const sg=Math.max(0,meta-r);
    return {...s,meta,real:r,pct,proj:sp,gap:sg,pat:getPatente(r,meta)};
  }).sort((a,b)=>b.real-a.real);

  let tb='';
  const maxReal = stats.length>0 ? Math.max(1,stats[0].real) : 1;
  stats.forEach((s,idx)=>{
    const rank=idx+1;
    const pc=(s.pct*100).toFixed(1)+'%';
    const isSel=selectedSeller===s.id;
    const pctCls=s.pct>=1?'bg-green':s.pct>=0.6?'bg-yellow':'bg-red';
    const gapCls=s.gap===0?'gap-ok':'gap-neg';
    const gapTxt=s.gap===0?'✓ Meta':'-'+s.gap;
    const relPct=Math.min(100,(maxReal>0?s.real/maxReal:0)*100).toFixed(1);
    const podiumCls=rank===1?'rank-gold':rank===2?'rank-silver':rank===3?'rank-bronze':'';
    const hub=(DB.times||[]).find(t=>t.id===s.timeId);
    const hubNome=hub?hub.nome:'';
    const clr=s.color||'#2563eb';
    // Badge
    const badgeIco=rank===1?'🥇':rank===2?'🥈':rank===3?'🥉':'';
    const badgeCls=rank===1?'rank-badge-gold':rank===2?'rank-badge-silver':rank===3?'rank-badge-bronze':'rank-badge-plain';
    const rankBadge=`<span class="rank-badge ${badgeCls}" title="Posição ${rank}">${badgeIco||rank}</span>`;
    // Avatar
    const avatarEl=s.photo
      ?`<img src="${s.photo}" class="rank-avatar" style="border-color:${clr}" alt="${s.name}">`
      :`<div class="rank-avatar rank-avatar-init" style="background:${clr}22;border-color:${clr};color:${clr}">${s.name.charAt(0)}</div>`;
    tb+=`<tr class="seller-row rank-row ${podiumCls}${isSel?' selected':''}" onclick="selectSeller(${s.id})" title="Clique para filtrar gráficos">
      <td style="padding:8px 10px 8px 8px">
        <div style="display:flex;align-items:center;gap:7px">
          ${rankBadge}
          ${avatarEl}
          <div style="min-width:0;flex:1">
            <div class="rank-name" style="border-left:3px solid ${clr};padding-left:8px">${s.name}</div>
            ${hubNome?`<div class="rank-hub" style="padding-left:8px">${hubNome}</div>`:''}
            <div class="rank-rel-bar" style="margin-left:8px"><div class="rank-rel-fill" style="width:${relPct}%;background:${clr}"></div></div>
          </div>
        </div>
      </td>
      <td class="mono fw7">${s.meta}</td>
      <td class="mono fw7 fg-g">${s.real}</td>
      <td><div class="pct-badge-wrap"><span class="pct-badge ${pctCls}">${pc}</span><div class="pct-slim-bar"><div class="pct-slim-fill ${pctCls}" style="width:${Math.min(100,s.pct*100).toFixed(1)}%"></div></div></div></td>
      <td><span class="gap-badge ${gapCls}">${gapTxt}</span></td>
      <td class="mono fg-o">${s.proj.toFixed(0)}</td>
    </tr>`;
  });
  // Totais respeitam o filtro de vendedor ativo
  const filtStats = sid ? stats.filter(s=>s.id===sid) : stats;
  const tR  = filtStats.reduce((a,s)=>a+s.real,0);
  const tC  = filtStats.reduce((a,s)=>a+s.meta,0);
  const tG  = Math.max(0, tC-tR);
  const tP  = tC>0 ? tR/tC : 0;
  const tPr = duPass>0 ? tR/duPass*duTotal : 0;
  const tPctCls=tP>=1?'bg-green':tP>=0.6?'bg-yellow':'bg-red';
  const tGapCls=tG===0?'gap-ok':'gap-neg';
  tb+=`<tr class="tr-tot"><td>${sid?'TOTAL SELEÇÃO':'TOTAL EQUIPE'}</td><td class="mono" title="Soma dos compromissos">${tC}</td><td class="mono">${tR}</td>
    <td><div class="pct-badge-wrap"><span class="pct-badge ${tPctCls}">${(tP*100).toFixed(1)}%</span><div class="pct-slim-bar"><div class="pct-slim-fill ${tPctCls}" style="width:${Math.min(100,tP*100).toFixed(1)}%"></div></div></div></td>
    <td><span class="gap-badge ${tGapCls}">${tG===0?'✓ Meta':'-'+tG}</span></td>
    <td class="mono">${tPr.toFixed(0)}</td>
  </tr>`;
  document.getElementById('main-tb').innerHTML=tb;

  // DONUT
  document.getElementById('donut-p').textContent=(realPct*100).toFixed(1)+'%';
  document.getElementById('leg-r').textContent=realFilt;
  document.getElementById('leg-g').textContent=gap;
  buildDonut(realFilt,gap);

  // GAP LIST — respeita filtro de vendedor selecionado
  const gapStats = sid ? [...stats].filter(s=>s.id===sid) : [...stats];
  let gHtml='';
  gapStats.sort((a,b)=>a.gap-b.gap).forEach((s,i)=>{
    const p=s.meta>0?s.real/s.meta:0;
    const hl=selectedSeller===s.id?'background:#eff6ff;':'';
    const pCls=p>=1?'bg-green':p>=0.6?'bg-yellow':'bg-red';
    const gCls=s.gap===0?'gap-ok':'gap-neg';
    gHtml+=`<div class="gsi" style="${hl}cursor:pointer" onclick="selectSeller(${s.id})">
      <div class="gsr">${i+1}</div>
      <span class="seller-name-inner" style="--seller-color:${s.color||'#2563eb'};flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${s.name}</span>
      <div class="pct-badge-wrap" style="flex-shrink:0;min-width:52px">
        <span class="pct-badge ${pCls}" style="font-size:11px;padding:2px 7px">${(p*100).toFixed(0)}%</span>
        <div class="pct-slim-bar"><div class="pct-slim-fill ${pCls}" style="width:${Math.min(100,p*100).toFixed(1)}%"></div></div>
      </div>
      <span class="gap-badge ${gCls}" style="flex-shrink:0;font-size:11px;padding:2px 7px">${s.gap===0?'✓':'-'+s.gap}</span>
    </div>`;
  });
  document.getElementById('gap-l').innerHTML=gHtml;

  // CHARTS
  buildBar(stats, sid, duPass, duTotal);
  buildLine(ymKey, y, m, sid);
  // MAPA SEMANAL — disponível para todos os usuários
  renderMapaSemanal(ymKey, scopedSellers, 'dash-mapa-semanal');
  // RANKING DO DIA
  renderRankingDia();
  renderPSVIfActive();
}

// ══ RANKING DO DIA ══
function renderRankingDia(){
  // Inicializa o input com a data de hoje se ainda não tiver valor
  const inp = document.getElementById('ranking-dia-input');
  if(!inp) return;
  if(!inp.value){
    const t = today();
    const yyyy = t.getFullYear();
    const mm   = String(t.getMonth()+1).padStart(2,'0');
    const dd   = String(t.getDate()).padStart(2,'0');
    inp.value  = `${yyyy}-${mm}-${dd}`;
  }
  const dateStr = inp.value; // YYYY-MM-DD
  const content = document.getElementById('ranking-dia-content');
  if(!content) return;

  // Escopo de vendedores (respeita filtros ativos)
  const scopedSellers = getScopedSellers();
  if(!scopedSellers.length){
    content.innerHTML = '<div class="ranking-dia-empty">Nenhum HC encontrado no escopo atual.</div>';
    return;
  }

  // Coleta vendas do dia selecionado em todos os ymKeys do DB
  const vendorMap = {}; // sellerId → qty

  // Percorre todos os meses disponíveis no DB.vendas para buscar pela data exata
  const allKeys = Object.keys(DB.vendas || {});
  allKeys.forEach(yk => {
    const vendas = DB.vendas[yk] || [];
    vendas.forEach(v => {
      if(v.date === dateStr){
        const sid = v.sellerId;
        vendorMap[sid] = (vendorMap[sid] || 0) + (Number(v.qty) || 0);
      }
    });
  });

  // Monta ranking apenas com vendedores do escopo
  const ranked = scopedSellers
    .map(s => ({ ...s, qty: vendorMap[s.id] || 0 }))
    .sort((a, b) => b.qty - a.qty);

  const totalDia = ranked.reduce((a, s) => a + s.qty, 0);
  const maxQty = ranked.length > 0 ? ranked[0].qty : 1;

  // Formata a data para exibição pt-BR
  const [y, mo, d] = dateStr.split('-');
  const dateLabel = `${d}/${mo}/${y}`;

  if(totalDia === 0){
    content.innerHTML = `<div class="ranking-dia-empty">Nenhuma venda registrada em <strong>${dateLabel}</strong> para os HC do escopo.</div>`;
    return;
  }

  const medalhas = ['🥇','🥈','🥉'];
  const posClasses = ['gold','silver','bronze'];

  let html = '<div class="ranking-dia-grid">';
  ranked.forEach((s, i) => {
    if(s.qty === 0 && i > 2) return; // opcional: oculta zeros abaixo do pódio
    const pct = maxQty > 0 ? (s.qty / maxQty * 100).toFixed(1) : 0;
    const initial = (s.name || '?').charAt(0).toUpperCase();
    const posLabel = i < 3 ? medalhas[i] : (i + 1);
    const posCls = i < 3 ? posClasses[i] : '';
    const avatarContent = s.photo
      ? `<img src="${s.photo}" alt="${s.name}" onerror="this.style.display='none';this.parentNode.textContent='${initial}'">`
      : initial;

    html += `
    <div class="rdi">
      <div class="rdi-pos ${posCls}">${posLabel}</div>
      <div class="rdi-avatar" style="background:${s.color||'#64748b'}">${avatarContent}</div>
      <div class="rdi-info">
        <div class="rdi-name">${s.name}</div>
        <div class="rdi-bar-wrap">
          <div class="rdi-bar"><div class="rdi-bar-fill" style="width:${s.qty > 0 ? pct : 0}%"></div></div>
        </div>
      </div>
      <div class="rdi-qty-col">
        <div class="rdi-qty">${s.qty}</div>
        <div class="rdi-qty-lbl">vendas</div>
      </div>
    </div>`;
  });
  html += '</div>';

  html += `<div class="ranking-dia-total">
    <span class="ranking-dia-total-lbl">Total do dia (${dateLabel})</span>
    <span class="ranking-dia-total-val">${totalDia} vendas</span>
  </div>`;

  content.innerHTML = html;
}

function buildDonut(real,gap){
  const ctx=document.getElementById('ch-donut').getContext('2d');
  if(chartDonut) chartDonut.destroy();
  chartDonut=new Chart(ctx,{type:'doughnut',data:{datasets:[{data:[real,Math.max(0,gap)],backgroundColor:['#059669','#e2e8f0'],borderWidth:0,hoverOffset:6,borderRadius:4}]},
    options:{cutout:'72%',plugins:{legend:{display:false},tooltip:{
      backgroundColor:'rgba(15,23,42,0.9)',
      titleColor:'#e2e8f0',bodyColor:'#94a3b8',
      borderColor:'rgba(255,255,255,0.08)',borderWidth:1,
      cornerRadius:10,padding:10,
      callbacks:{label:c=>{const l=['Realizado','Restante'];return ` ${l[c.dataIndex]}: ${c.raw}`;}}
    }}
  ,animation:{animateRotate:true,duration:900}}});
}

function buildBar(stats, sid, duPass, duTotal){
  const ctx=document.getElementById('ch-bar').getContext('2d');
  if(chartBar) chartBar.destroy();
  const data = sid ? stats.filter(s=>s.id===sid) : stats;

  // Plugin: números em cima de cada barra
  const barNumberPlugin = {
    id:'barNumber',
    afterDatasetsDraw(chart){
      const {ctx} = chart;
      chart.data.datasets.forEach((_ds,di)=>{
        const meta = chart.getDatasetMeta(di);
        if(meta.hidden) return;
        meta.data.forEach((bar,i)=>{
          const val = chart.data.datasets[di].data[i];
          if(!val) return;
          ctx.save();
          ctx.fillStyle = '#475569';
          ctx.font = `700 10px "JetBrains Mono",monospace`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'bottom';
          ctx.fillText(val, bar.x, bar.y - 3);
          ctx.restore();
        });
      });
    }
  };

  chartBar=new Chart(ctx,{
    type:'bar',
    data:{
      labels:data.map(s=>s.name),
      datasets:[
        {label:'Realizado', data:data.map(s=>s.real),             backgroundColor:data.map(s=>s.color+'cc'),borderRadius:10,borderRadiusTopLeft:10,borderRadiusTopRight:10,barPercentage:.5},
        {label:'Projeção',  data:data.map(s=>+(s.proj.toFixed(0))),backgroundColor:data.map(s=>s.color+'44'),borderRadius:10,barPercentage:.5,borderWidth:1.5,borderColor:data.map(s=>s.color+'99')}
      ]
    },
    options:{
      responsive:true,maintainAspectRatio:false,
      layout:{padding:{top:18}},
      plugins:{
        legend:{labels:{font:{family:'Outfit',size:11},color:'#475569'},position:'top'},
        tooltip:{
          mode:'index',intersect:false,
          backgroundColor:'rgba(15,23,42,0.9)',
          titleColor:'#e2e8f0',bodyColor:'#94a3b8',
          borderColor:'rgba(255,255,255,0.08)',borderWidth:1,
          cornerRadius:10,padding:10
        },
        barNumber:{}
      },
      scales:{
        x:{grid:{display:false},ticks:{font:{family:'Outfit',size:11},color:'#94a3b8'}},
        y:{grid:{color:'#f1f5f9'},ticks:{font:{family:'JetBrains Mono',size:10},color:'#94a3b8'},beginAtZero:true}
      },
      animation:{duration:700}
    },
    plugins:[barNumberPlugin]
  });
}

// ── Helpers compartilhados: gráfico de linha com bolinhas numeradas ──
let _lineParams = null; // guarda dados para o modal maximizado

function linePointColor(val, maxVal){
  if(val===null||val===undefined) return 'transparent';
  const t = maxVal>0 ? val/maxVal : 0;
  // vermelho #dc2626 → amarelo #eab308 → verde #16a34a
  const r0=[220,38,38], r1=[234,179,8], r2=[22,163,74];
  let r,g,b;
  if(t<=0.5){ const s=t*2; r=r0[0]+(r1[0]-r0[0])*s; g=r0[1]+(r1[1]-r0[1])*s; b=r0[2]+(r1[2]-r0[2])*s; }
  else       { const s=(t-.5)*2; r=r1[0]+(r2[0]-r1[0])*s; g=r1[1]+(r2[1]-r1[1])*s; b=r1[2]+(r2[2]-r1[2])*s; }
  return `rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)})`;
}

const numberLabelPlugin = {
  id:'numberLabel',
  beforeDraw(chart){
    // Sábados com fundo amarelo suave
    const{ctx,chartArea,scales}=chart;
    if(!chartArea) return;
    const labels=chart.data.labels||[];
    labels.forEach((lbl,i)=>{
      if(!lbl) return;
      const parts=lbl.split('/');
      if(parts.length<2) return;
      const d=parseInt(parts[0]),m=parseInt(parts[1]);
      const {y}=ymToYM(currentYM);
      const dt=new Date(y,m-1,d);
      if(dt.getDay()!==6) return;
      const meta0=chart.getDatasetMeta(0);
      if(!meta0?.data?.[i]) return;
      const x=meta0.data[i].x;
      const count=labels.length||1;
      const w=(scales?.x?.width||chartArea.width)/count;
      ctx.save();
      ctx.fillStyle='rgba(234,179,8,.13)';
      ctx.fillRect(x-w/2,chartArea.top,w,chartArea.height);
      ctx.restore();
    });
  },
  afterDatasetsDraw(chart){
    const {ctx} = chart;
    const meta  = chart.getDatasetMeta(0);
    const vals  = chart.data.datasets[0].data;
    const pClrs = chart.data.datasets[0].pointBackgroundColor;
    vals.forEach((val,i)=>{
      if(val===null||val===undefined) return;
      const pt = meta.data[i]; if(!pt) return;
      const c = Array.isArray(pClrs)?pClrs[i]:pClrs;
      ctx.save();
      ctx.shadowColor='rgba(0,0,0,.18)'; ctx.shadowBlur=4;
      ctx.beginPath(); ctx.arc(pt.x,pt.y,12,0,Math.PI*2);
      ctx.fillStyle=c; ctx.fill();
      ctx.shadowBlur=0;
      ctx.lineWidth=2; ctx.strokeStyle='#fff'; ctx.stroke();
      ctx.fillStyle='#fff';
      ctx.font=`700 ${val>=10?9:10.5}px "JetBrains Mono",monospace`;
      ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.fillText(val,pt.x,pt.y);
      ctx.restore();
    });
  }
};

function makeLineConfig(labels, dataReal, pointColors){
  // Build gradient fill for area below line
  const gradientFill = (context) => {
    const chart = context.chart;
    const {ctx: c, chartArea} = chart;
    if(!chartArea) return 'rgba(148,163,184,.06)';
    const gradient = c.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
    gradient.addColorStop(0, 'rgba(37,99,235,.18)');
    gradient.addColorStop(0.5, 'rgba(37,99,235,.06)');
    gradient.addColorStop(1, 'rgba(37,99,235,0)');
    return gradient;
  };
  return {
    type:'line',
    data:{ labels, datasets:[{
      label:'Vendas', data:dataReal,
      borderColor:'#3b82f6', backgroundColor:gradientFill,
      borderWidth:2, pointRadius:12, pointHoverRadius:14,
      pointBackgroundColor:pointColors, pointBorderColor:'#fff', pointBorderWidth:2,
      tension:0.35, fill:true, spanGaps:false
    }]},
    options:{
      responsive:true, maintainAspectRatio:false,
      plugins:{
        legend:{display:false},
        tooltip:{
          callbacks:{label:c=>`Vendas: ${c.raw??'—'}`},
          backgroundColor:'rgba(15,23,42,0.9)',
          titleColor:'#e2e8f0',bodyColor:'#94a3b8',
          borderColor:'rgba(255,255,255,0.08)',borderWidth:1,
          cornerRadius:10,padding:10
        },
        numberLabel:{}
      },
      scales:{
        x:{grid:{display:false},ticks:{autoSkip:false,maxRotation:45,minRotation:0,font:{family:'Outfit',size:9},color:'#94a3b8'}},
        y:{grid:{color:'#f1f5f9'},ticks:{font:{family:'JetBrains Mono',size:10},color:'#94a3b8'},beginAtZero:true}
      },
      animation:{duration:800}
    },
    plugins:[numberLabelPlugin]
  };
}

function buildLine(ymKey,y,m,sid){
  const ctx=document.getElementById('ch-line').getContext('2d');
  if(chartLine) chartLine.destroy();
  const dias=getDiasComSabado(y,m), t=today();
  const labels=dias.map(d=>`${d.getDate()}/${m+1}`);
  const scopedIds=getScopedSellers().map(s=>s.id);
  const vendas=getVendas(ymKey);
  const dataReal=dias.map(d=>{
    if(d>t) return null;
    const ds=fmtD(d);
    const vs=vendas.filter(v=>v.date===ds);
    return (sid ? vs.filter(v=>v.sellerId===sid) : vs.filter(v=>scopedIds.includes(v.sellerId)))
      .reduce((a,v)=>a+v.qty,0);
  });
  const maxVal=Math.max(0,...dataReal.filter(v=>v!==null));
  const pointColors=dias.map((d,i)=>d.getDay()===6?'#94a3b8':linePointColor(dataReal[i],maxVal));
  _lineParams={labels,dataReal,pointColors};
  chartLine=new Chart(ctx,makeLineConfig(labels,dataReal,pointColors));
}

// ══════════════════════════════════════════════════════════
//  LANÇAR VENDAS
// ══════════════════════════════════════════════════════════
function populateQESellers(){
  const sel=document.getElementById('qe-seller');
  const sellers=getScopedSellers();
  sel.innerHTML=sellers.map(s=>`<option value="${s.id}">${s.name}</option>`).join('');
}
function setDefaultDate(){
  document.getElementById('qe-date').value=fmtD(today());
}
