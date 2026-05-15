// ══ SCOPE.JS ══

function getScopedSellers(includeInativo=false){
  const u = currentUser;
  if(!u) return [];
  const {y,m}=ymToYM(currentYM);
  // Vendedor inativo só some a partir do mês SEGUINTE à data de desligamento
  let sellers = DB.sellers.filter(s=>{
    if(includeInativo) return true;
    if(!s.inativo) return true;
    if(s.desligamento){
      const [dy,dm]=s.desligamento.split('-').map(Number);
      // Se o mês/ano atual é <= mês de desligamento, ainda aparece
      if(y < dy || (y===dy && m <= dm-1)) return true;
    }
    return false;
  });

  // Gerente com filtro manual ativo
  if(isGerente(u)){
    if(scopeFilter.timeId){
      sellers = sellers.filter(s=>s.timeId===scopeFilter.timeId);
    } else if(scopeFilter.regionalId){
      const tids=(DB.times||[]).filter(t=>t.regionalId===scopeFilter.regionalId).map(t=>t.id);
      sellers = sellers.filter(s=>tids.includes(s.timeId));
    }
    return sellers;
  }
  if(u.role==='regional'){
    // Restringe à regional do usuário
    const tids=(DB.times||[]).filter(t=>t.regionalId===u.regionalId).map(t=>t.id);
    sellers = sellers.filter(s=>tids.includes(s.timeId));
    // Filtro adicional por HUB se o usuário selecionou um
    if(scopeFilter.timeId && tids.includes(scopeFilter.timeId)){
      sellers = sellers.filter(s=>s.timeId===scopeFilter.timeId);
    }
    return sellers;
  }
  if(u.role==='supervisor'){
    return sellers.filter(s=>s.timeId===u.timeId);
  }
  return [];
}
function getScopedSids(){ return getScopedSellers().map(s=>s.id); }

// ── Filtro do Dashboard (Gerente e Admin Regional) ──
function canFilterDash(u){ u=u||currentUser; return isGerente(u)||u?.role==='regional'||u?.role==='supervisor'; }
