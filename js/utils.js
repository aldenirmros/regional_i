// ══ UTILS.JS ══

function flashSaved() {
  const el = document.getElementById('saved-badge');
  el.classList.add('show');
  clearTimeout(el._t);
  el._t = setTimeout(()=>el.classList.remove('show'), 2000);
}

// ══════════════════════════════════════════════════════════
//  HELPERS
// ══════════════════════════════════════════════════════════
function ym(y,m){ return `${y}${String(m+1).padStart(2,'0')}`; }
function fmtD(d){ return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
function today(){ return new Date(); }
function nowYM(){ const t=today(); return ym(t.getFullYear(),t.getMonth()); }
function ymToYM(k){ return {y:parseInt(k.slice(0,4)), m:parseInt(k.slice(4))-1}; }

// Dias úteis = Seg–Sex
// Chave do diasConfig: gerente usa a chave global; demais usuários usam chave pessoal
// Isso permite que cada supervisor/regional preencha seus próprios dias úteis e feriados
function getUserDiasKey(ymKey){
  const u = currentUser;
  if(!u || isGerente(u)) return ymKey; // gerente: chave global (retrocompatível)
  return `u${u.id}_${ymKey}`;           // outros: chave pessoal
}

// ── Fonte única de verdade para dias úteis do mês ──────────────────────────
// Retorna { duTotal, duPass, duRest } aplicando desconto de feriados
// de forma idêntica no Dashboard e na página PSV.
function getMonthTimeStats(ymKey){
  const {y, m} = ymToYM(ymKey);
  const t       = today();
  const duAll   = getDiasUteis(y, m);

  // Configuração salva pelo usuário (feriados / override manual de total/passed)
  const cfg      = DB.diasConfig?.[getUserDiasKey(ymKey)] || DB.diasConfig?.[ymKey] || {};
  const desconto = Math.max(0, parseInt(cfg.totalFeriados) || 0);

  // duTotal: usa override manual se existir; senão calendário − feriados
  const duTotal  = cfg.total != null
    ? cfg.total
    : Math.max(0, duAll.length - desconto);

  // duPass: usa override manual se existir; senão contagem proporcional
  let duPass;
  if (cfg.passed != null) {
    duPass = cfg.passed;
  } else {
    const duPassedRaw        = duAll.filter(d => d <= t).length;
    const duPassFeriadosProp = duAll.length > 0
      ? Math.round(desconto * duPassedRaw / duAll.length)
      : 0;
    duPass = Math.max(0, duPassedRaw - duPassFeriadosProp);
  }

  const duRest = Math.max(0, duTotal - duPass);
  return { duTotal, duPass, duRest, desconto, duAll };
}

function getDiasUteis(y,m){
  const d=new Date(y,m,1),r=[];
  while(d.getMonth()===m){ const dw=d.getDay(); if(dw>=1&&dw<=5)r.push(new Date(d)); d.setDate(d.getDate()+1); }
  return r;
}
// Converte Date → 'YYYY-MM-DD' (helper global usado em vários lugares)
function _d2sGlobal(d){ const dd=new Date(d); return dd.getFullYear()+'-'+String(dd.getMonth()+1).padStart(2,'0')+'-'+String(dd.getDate()).padStart(2,'0'); }
// Dias corridos = TODOS os dias do mês (não só úteis)
// Necessário para a planilha ter uma linha por dia e para gráficos de progressão
function getDiasCorridos(y,m){
  const d=new Date(y,m,1),r=[];
  while(d.getMonth()===m){ r.push(new Date(d)); d.setDate(d.getDate()+1); }
  return r;
}
// Dias com sábado = Seg–Sáb (para gráfico de linha)
function getDiasComSabado(y,m){
  const d=new Date(y,m,1),r=[];
  while(d.getMonth()===m){ const dw=d.getDay(); if(dw>=1&&dw<=6)r.push(new Date(d)); d.setDate(d.getDate()+1); }
  return r;
}
function getAllDias(y,m){
  const d=new Date(y,m,1),r=[];
  while(d.getMonth()===m){ r.push(new Date(d)); d.setDate(d.getDate()+1); }
  return r;
}

// Semanas do mês: cada semana = array de dateStrings Seg→Sáb
function getSemanasDoMes(y,m){
  const fim=new Date(y,m+1,0);
  const semanas=[], cur=new Date(y,m,1);
  let semAtual=[];
  while(cur<=fim){
    const dw=cur.getDay();
    if(dw>=1&&dw<=6){
      semAtual.push(fmtD(cur));
      if(dw===6){ semanas.push(semAtual); semAtual=[]; }
    }
    cur.setDate(cur.getDate()+1);
  }
  if(semAtual.length) semanas.push(semAtual);
  return semanas;
}

// Renderiza o mapa semanal em qualquer containerId
// Funciona para TODOS os papéis: gerente, regional, supervisor
function renderMapaSemanal(ymKey, sellers, containerId){
  const el=document.getElementById(containerId);
  if(!el) return;
  if(!sellers||!sellers.length){ el.innerHTML=''; return; }
  const {y,m}=ymToYM(ymKey);
  const semanas=getSemanasDoMes(y,m);
  if(!semanas.length){ el.innerHTML=''; return; }
  const vendas=getVendas(ymKey);
  const todayStr=fmtD(today());

  // [vendedor][semana] = total
  const dados=sellers.map(s=>semanas.map(sem=>
    vendas.filter(v=>v.sellerId===s.id&&sem.includes(v.date)).reduce((a,v)=>a+v.qty,0)
  ));
  const maxVal=Math.max(1,...dados.flat());

  // Heatmap verde: opacidade proporcional ao volume; texto verde-escuro para contraste
  function bgCell(v){
    if(!v) return '';
    const p=Math.min(1,v/maxVal);
    const alpha=(0.08+p*0.42).toFixed(2);
    return `background:rgba(37,99,235,${alpha})`;
  }
  function fgCell(v){ return v ? 'color:#1e3a8a' : ''; }

  const semAtualIdx=semanas.findIndex(sem=>sem.includes(todayStr));
  const wLabels=semanas.map((sem,i)=>{
    const f=ds=>ds.slice(8,10)+'/'+ds.slice(5,7);
    return `Sem ${i+1}<small>${f(sem[0])}–${f(sem[sem.length-1])}</small>`;
  });
  const totSem=semanas.map((_,si)=>dados.reduce((a,d)=>a+d[si],0));
  const totGeral=totSem.reduce((a,v)=>a+v,0);

  // Largura mínima: coluna vendedor + semanas + total
  const minW=150+semanas.length*110+100;

  let html=`
    <div class="card-head" style="flex-wrap:wrap;gap:8px">
      <div class="card-title"><div class="ctd" style="background:var(--green)"></div>📅 Mapa Semanal — ${MESES[m]} ${y}</div>
      <span style="font-size:10.5px;color:var(--tl)">${sellers.length} HC · ${semanas.length} semana(s)</span>
    </div>
    <div style="overflow-x:auto;-webkit-overflow-scrolling:touch;padding-bottom:6px">
      <table class="dt" style="min-width:${minW}px;border-collapse:separate;border-spacing:0">
        <thead><tr>
          <th style="min-width:150px;position:sticky;left:0;z-index:2;background:#f8fafc">HC</th>
          ${wLabels.map((l,i)=>`<th class="mapa-week-th${i===semAtualIdx?' mapa-sem-atual':''}">${l}</th>`).join('')}
          <th class="mapa-week-th mapa-total-col" style="min-width:90px">Total</th>
        </tr></thead>
        <tbody>`;

  sellers.forEach((s,si)=>{
    const tot=dados[si].reduce((a,v)=>a+v,0);
    html+=`<tr>
      <td style="padding-left:0;position:sticky;left:0;z-index:1;background:var(--white)">
        <span class="seller-name-inner" style="--seller-color:${s.color||'#2563eb'}">${s.name}</span>
      </td>
      ${dados[si].map((v,wi)=>`<td class="mapa-cell ${v===0?'mapa-cell-zero':''}${wi===semAtualIdx?' mapa-sem-atual':''}" style="${bgCell(v)};${fgCell(v)}">${v||'—'}</td>`).join('')}
      <td class="mapa-cell mapa-total-col" style="${tot?'color:#1e293b':''}">${tot||'—'}</td>
    </tr>`;
  });

  html+=`<tr class="tr-tot">
    <td style="position:sticky;left:0;z-index:1;background:rgba(15,23,42,.045);padding-left:14px">TOTAL EQUIPE</td>
    ${totSem.map((v,i)=>`<td class="mapa-cell${i===semAtualIdx?' mapa-sem-atual':''}">${v}</td>`).join('')}
    <td class="mapa-cell">${totGeral}</td>
  </tr></tbody></table></div>`;

  el.innerHTML=html;
}
function getMeta(ymKey){
  // Meta total = soma das metas definidas manualmente nos HUBs
  if(DB.times?.length){
    const soma=(DB.times||[]).reduce((a,t)=>a+getHubMeta(ymKey,t.id),0);
    return soma; // retorna 0 se nenhum HUB tem meta definida (sem fallback para vendedores)
  }
  return 0;
}
function getSellerMeta(ymKey, sid){
  return (DB.sellerMetas[ymKey]||{})[sid] ?? (DB.sellers.find(s=>s.id===sid)?.meta || 0);
}
function getHubMeta(ymKey, timeId){
  const hm=(DB.hubMetas||{})[ymKey]?.[timeId];
  return hm!=null ? hm : 0;
}
function getScopedMeta(ymKey){ return getMeta(ymKey); }
function getVendas(ymKey){ return DB.vendas[ymKey] || []; }

// ── SCOPE: filtra sellers pelo papel do usuário logado ──