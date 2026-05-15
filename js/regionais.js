// ══ REGIONAIS.JS ══

function renderRegionais(){
  const el=document.getElementById('rg-grid'); if(!el) return;
  const ymKey=currentYM;
  const regs=DB.regionais||[];
  if(!regs.length){
    el.innerHTML=`<div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--tl)">
      Nenhuma regional cadastrada. <a href="#" onclick="switchTab('rg-tab-criar',document.getElementById('rg-tab-btn-criar'))" style="color:var(--blue)">Criar primeira regional →</a>
    </div>`;
    return;
  }
  el.innerHTML=regs.map(rg=>{
    const times=(DB.times||[]).filter(t=>t.regionalId===rg.id);
    const tids=times.map(t=>t.id);
    const sellers=DB.sellers.filter(s=>tids.includes(s.timeId)&&!s.inativo);
    const real=sellers.reduce((a,s)=>a+sellerTotal(ymKey,s.id),0);
    // Meta: soma das metas dos HUBs (igual ao Dashboard) com fallback para meta individual
    const metaHub=times.reduce((a,t)=>a+getHubMeta(ymKey,t.id),0);
    const meta=metaHub>0?metaHub:sellers.reduce((a,s)=>a+getSellerMeta(ymKey,s.id),0);
    const adm=DB.users?.find(u=>u.role==='regional'&&u.regionalId===rg.id);
    const pct=meta>0?real/meta:0;
    const pcColor=pct>=1?'var(--green)':pct>=0.6?'var(--orange)':'var(--red)';
    return `<div class="rg-card">
      <div class="rg-card-top" style="background:${rg.color}"></div>
      <div class="rg-card-body">
        <div class="rg-card-nm" style="color:${rg.color}">${rg.nome}</div>
        <div class="rg-card-sub">${adm?`Admin: @${adm.username}`:' sem admin'} · ${times.length} HUB(s) · ${sellers.length} HC</div>
        <div class="rg-stats">
          <div class="rg-stat"><div class="rg-stat-val" style="color:var(--green)">${real}</div><div class="rg-stat-lbl">Realizado</div></div>
          <div class="rg-stat"><div class="rg-stat-val" style="color:var(--blue)">${meta}</div><div class="rg-stat-lbl">Meta</div></div>
          <div class="rg-stat"><div class="rg-stat-val" style="color:${pcColor}">${(pct*100).toFixed(0)}%</div><div class="rg-stat-lbl">Atingido</div></div>
          <div class="rg-stat"><div class="rg-stat-val">${times.length}</div><div class="rg-stat-lbl"> HUBs</div></div>
        </div>
        <div class="rg-actions">
          <button class="btn btn-g" style="font-size:11px;flex:1" onclick="goPage('sellers',document.getElementById('nav-sellers'))">Ver Times</button>
          <button class="del-seller" onclick="delRegional(${rg.id})">Remover</button>
        </div>
      </div>
    </div>`;
  }).join('');
}

// ══════════════════════════════════════════════════════════
//  BANCO DE DADOS — tabelas interativas
// ══════════════════════════════════════════════════════════