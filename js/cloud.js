// ══ CLOUD.JS ══

function saveDB() {
  // ── 1. Marca timestamp da última alteração local ──
  DB._savedAt = Date.now();
  // ── 2. Atualiza cache de senhas (separado do DB principal) ──
  _updatePwCache(DB.users);
  // ── 3. Salva localmente de forma síncrona (zero latência para o usuário) ──
  try { localStorage.setItem('bi_v5', JSON.stringify(DB)); } catch(e){}
  flashSaved();
  // ── 3. Agenda sync com nuvem — debounce 350ms para batching de edições rápidas ──
  clearTimeout(saveDB._t);
  saveDB._t = setTimeout(_syncEnqueue, 350);
}

// ═══════════════════════════════════════════════════════════════════════════
//  MOTOR DE SINCRONIZAÇÃO — Pull-Merge-Push com retry automático
//  Garante que NUNCA dados de outros usuários sejam perdidos em uso simultâneo.
//  Fluxo por operação de save:
//    1. GET estado atual do Google Sheets
//    2. Merge profundo: cloud + local → resultado sem perdas
//    3. POST resultado mesclado de volta ao Sheets
//    4. Atualiza localStorage com o estado mesclado
// ═══════════════════════════════════════════════════════════════════════════

let _syncQueue   = false; // há um sync agendado/em curso?
let _syncRunning = false; // sync está executando agora?

async function _syncEnqueue() {
  _syncQueue = true;
  if (_syncRunning) return; // já está executando — vai rodar de novo ao terminar
  await _runSync();
}

async function _runSync() {
  if (_syncRunning) return;
  _syncRunning = true;
  _syncQueue   = false;

  const cfg = getCfg();
  if (!cfg.gsUrl) { setCloudUI('off', 'Sem nuvem'); _syncRunning = false; return; }

  const MAX_TRIES = 4;
  let lastErr = null;

  for (let t = 1; t <= MAX_TRIES; t++) {
    try {
      setCloudUI('sync', t > 1 ? `Salvando… (tent. ${t})` : 'Salvando…');

      // ── PASSO 1: Busca snapshot atual da nuvem ──────────────────────────
      let cloudRec = null;
      try {
        // Timestamp na URL: impede que browsers/CDN/proxies retornem cache antigo
        const res = await fetch(cfg.gsUrl + '?action=get&_t=' + Date.now(), {
          cache  : 'no-store',
          signal : AbortSignal.timeout ? AbortSignal.timeout(12000) : undefined
        });
        if (res.ok) {
          const raw = await res.json().catch(()=>null);
          // Converte tabelas do Sheets → DB interno para merge
          cloudRec = raw ? tablesToDB(raw) : null;
          // Normaliza campos ausentes que causam problemas em browsers antigos
          if (cloudRec) {
            if (!cloudRec.sellers  || !Array.isArray(cloudRec.sellers))  cloudRec.sellers  = [];
            if (!cloudRec.vendas   || typeof cloudRec.vendas   !== 'object') cloudRec.vendas   = {};
            if (!cloudRec.times    || !Array.isArray(cloudRec.times))    cloudRec.times    = [];
            if (!cloudRec.regionais|| !Array.isArray(cloudRec.regionais))cloudRec.regionais= [];
            if (!cloudRec.users    || !Array.isArray(cloudRec.users))    cloudRec.users    = [];
            ['diasConfig','sellerMetas','hubMetas','mValues',
             'ativacaoManual','ativacaoManualOv','deletedVendaIds'].forEach(k=>{
               if (!cloudRec[k] || typeof cloudRec[k] !== 'object' || Array.isArray(cloudRec[k]))
                 cloudRec[k] = {};
            });
            if(!cloudRec.deleted||typeof cloudRec.deleted!=='object'||Array.isArray(cloudRec.deleted))
              cloudRec.deleted={userIds:[],sellerIds:[],timeIds:[],regionalIds:[]};
            ['userIds','sellerIds','timeIds','regionalIds'].forEach(k=>{
              if(!Array.isArray(cloudRec.deleted[k])) cloudRec.deleted[k]=[];
            });
          }
        }
      } catch(e) {
        console.warn('[sync] GET falhou:', e.message);
        cloudRec = null;
      }

      // ── PASSO 2: Merge profundo local → cloud ───────────────────────────
      const toSend = cloudRec ? _deepMerge(cloudRec, DB) : JSON.parse(JSON.stringify(DB));

      // ── PASSO 3: POST com confirmação de resposta ────────────────────────
      // Tombstones de entidades (sellers/times/regionais/users) NÃO são gravados
      // no Sheets — são usados apenas localmente para filtrar o merge desta sessão.
      // Se forem persistidos no Sheets, acumulam e deletam dados adicionados
      // manualmente na planilha por outros usuários / pelo administrador.
      const toPush = JSON.parse(JSON.stringify(toSend));
      toPush.deleted = {userIds:[], sellerIds:[], timeIds:[], regionalIds:[]};

      // Serializa para envio — texto puro (não URL-encoded) para evitar
      // triplicar o tamanho do payload e corrupção em e.parameter do GAS
      const jsonBody = JSON.stringify(dbToTables(toPush));

      let postOk = false;
      try {
        const ctrl = new AbortController();
        const tid  = setTimeout(()=>ctrl.abort(), 25000);
        const postRes = await fetch(cfg.gsUrl, {
          method : 'POST',
          headers: {'Content-Type': 'text/plain;charset=UTF-8'},
          body   : jsonBody,
          signal : ctrl.signal
        });
        clearTimeout(tid);
        if(postRes.ok){
          const json = await postRes.json().catch(()=>null);
          if(json && !json.error){ postOk = true; }
          else if(json && json.error){ throw new Error('GAS: ' + json.error); }
          else { postOk = true; }
        } else {
          throw new Error('POST HTTP ' + postRes.status);
        }
      } catch(fetchErr) {
        // Fallback: sendBeacon com Blob text/plain
        if(typeof navigator.sendBeacon === 'function'){
          const blob = new Blob([jsonBody], {type:'text/plain;charset=UTF-8'});
          navigator.sendBeacon(cfg.gsUrl, blob);
          postOk = true;
          console.warn('[sync] cors falhou, usou sendBeacon:', fetchErr.message);
        } else {
          throw fetchErr;
        }
      }

      // ── PASSO 4: Atualiza localStorage com estado mesclado ──────────────
      if (cloudRec) {
        DB = toSend;
        // Limpa tombstones de entidades localmente após push confirmado
        // (já aplicados no merge; não precisam persistir)
        if(DB.deleted) DB.deleted = {userIds:[],sellerIds:[],timeIds:[],regionalIds:[]};
        try { localStorage.setItem('bi_v5', JSON.stringify(DB)); } catch(e){}
      }

      setCloudUI('ok', 'Nuvem ✓');
      syncLog('Sincronizado — ' + new Date().toLocaleTimeString('pt-BR'));

      // Se havia outro sync pendente durante este, executa agora
      if (_syncQueue) { _syncRunning = false; await _runSync(); return; }
      _syncRunning = false;
      return; // ✅ SUCESSO

    } catch(err) {
      lastErr = err;
      console.warn(`[sync] tentativa ${t}/${MAX_TRIES} falhou:`, err.message);
      if (t < MAX_TRIES) {
        // Backoff: 1s → 2s → 4s
        await new Promise(r => setTimeout(r, 1000 * Math.pow(2, t - 1)));
      }
    }
  }

  // Todas as tentativas falharam — dados seguros no localStorage, avisa usuário
  setCloudUI('err', 'Sem conexão');
  syncLog('⚠️ Falha ao sincronizar. Dado salvo localmente — será reenviado ao reconectar.');
  console.error('[sync] todas as tentativas falharam:', lastErr?.message);

  // Agenda reenvio automático em 45s
  setTimeout(_syncEnqueue, 45000);
  _syncRunning = false;
}

// ── Merge profundo: cloud + local → sem perdas ──────────────────────────────
// Regras:
//   vendas   → union por id (todos os lançamentos de todos os usuários)
//   sellers  → union por id, _ts mais recente vence
//   times / regionais / users → union por id, _ts mais recente vence
//   dicts aninhados (metas, diasConfig…) → local vence; se cloud for mais
//     recente (_savedAt), cloud vence para evitar sobrescrever dados mais novos
function _deepMerge(cloud, local) {
  const r = JSON.parse(JSON.stringify(cloud)); // cópia do cloud como base

  // ── Timestamp de conflito: se cloud foi salvo DEPOIS do local, cloud vence ──
  // Evita que dispositivo com cache antigo sobrescreva dados mais recentes
  const cloudSavedAt = cloud._savedAt || 0;
  const localSavedAt = local._savedAt || 0;
  const cloudIsNewer = cloudSavedAt > localSavedAt;

  // ── vendas: union por id em todos os meses ──
  const lv = local.vendas || {};
  Object.keys(lv).forEach(k => {
    if (!r.vendas[k]) r.vendas[k] = [];
    const ids = new Set(r.vendas[k].map(v => String(v.id)));
    const extras = (lv[k]||[]).filter(v => !ids.has(String(v.id)));
    if (extras.length) {
      r.vendas[k] = [...r.vendas[k], ...extras]
        .sort((a,b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
    }
  });
  // também traz chaves que só existem na nuvem (outros meses)
  Object.keys(r.vendas||{}).forEach(k => {
    if (!local.vendas?.[k]) return; // ok, cloud já tem
  });

  // ── deletedVendaIds: union de tombstones (cloud + local) — exclusões persistem na nuvem ──
  if(!r.deletedVendaIds) r.deletedVendaIds = {};
  const _ldel = local.deletedVendaIds || {};
  Object.keys(_ldel).forEach(k => {
    if(!r.deletedVendaIds[k]) r.deletedVendaIds[k] = [];
    const _dset = new Set(r.deletedVendaIds[k].map(String));
    (_ldel[k]||[]).forEach(id => { if(!_dset.has(String(id))) r.deletedVendaIds[k].push(String(id)); });
  });
  // Aplica tombstones: remove do resultado final qualquer venda marcada como excluída
  Object.keys(r.vendas||{}).forEach(k => {
    const _delIds = new Set((r.deletedVendaIds[k]||[]).map(String));
    if(_delIds.size) r.vendas[k] = r.vendas[k].filter(v => !_delIds.has(String(v.id)));
  });

  // ── mergeArr: local vence em empate (para sellers — local pode ter novos não enviados) ──
  function mergeArr(cloudArr, localArr) {
    const map = new Map((cloudArr||[]).map(x => [String(x.id), x]));
    (localArr||[]).forEach(loc => {
      const key = String(loc.id);
      const cl  = map.get(key);
      if (!cl || (loc._ts||0) >= (cl._ts||0)) map.set(key, loc);
    });
    return [...map.values()];
  }
  // ── mergeArrCloudWins: nuvem vence (para users/times/regionais — admin gerencia na nuvem) ──
  function mergeArrCloudWins(cloudArr, localArr) {
    const map = new Map((cloudArr||[]).map(x => [String(x.id), x]));
    (localArr||[]).forEach(loc => {
      const key = String(loc.id);
      const cl  = map.get(key);
      // Local só vence se for ESTRITAMENTE mais recente que o cloud
      if (!cl || (loc._ts||0) > (cl._ts||0)) map.set(key, loc);
    });
    return [...map.values()];
  }

  r.sellers   = mergeArr(r.sellers,       local.sellers);
  r.times     = mergeArrCloudWins(r.times,     local.times);
  r.regionais = mergeArrCloudWins(r.regionais, local.regionais);
  r.users     = mergeArrCloudWins(r.users,     local.users);

  // ── DB.deleted: union de tombstones (cloud + local) ─────────────────────
  if(!r.deleted||typeof r.deleted!=='object') r.deleted={userIds:[],sellerIds:[],timeIds:[],regionalIds:[]};
  const _ld = local.deleted||{};
  ['userIds','sellerIds','timeIds','regionalIds'].forEach(k=>{
    if(!Array.isArray(r.deleted[k])) r.deleted[k]=[];
    const _s = new Set(r.deleted[k].map(String));
    (Array.isArray(_ld[k])?_ld[k]:[]).forEach(id=>{ if(!_s.has(String(id))) r.deleted[k].push(String(id)); });
  });
  // Aplica tombstones — IDs canônicos protegidos nunca são removidos
  const _dSel = new Set(r.deleted.sellerIds.map(String));
  const _dTim = new Set([...r.deleted.timeIds.map(String)].filter(id=>!_PROTECTED_TIME_IDS.has(id)));
  const _dReg = new Set([...r.deleted.regionalIds.map(String)].filter(id=>!_PROTECTED_REG_IDS.has(id)));
  const _dUsr = new Set([...r.deleted.userIds.map(String)].filter(id=>!_PROTECTED_USR_IDS.has(id)));
  if(_dSel.size) r.sellers   = r.sellers.filter(x=>!_dSel.has(String(x.id)));
  if(_dTim.size) r.times     = r.times.filter(x=>!_dTim.has(String(x.id)));
  if(_dReg.size) r.regionais = r.regionais.filter(x=>!_dReg.has(String(x.id)));
  if(_dUsr.size) r.users     = r.users.filter(x=>!_dUsr.has(String(x.id)));
  // Limpa IDs canônicos dos arrays deleted
  r.deleted.timeIds     = r.deleted.timeIds.filter(id=>!_PROTECTED_TIME_IDS.has(String(id)));
  r.deleted.regionalIds = r.deleted.regionalIds.filter(id=>!_PROTECTED_REG_IDS.has(String(id)));
  r.deleted.userIds     = r.deleted.userIds.filter(id=>!_PROTECTED_USR_IDS.has(String(id)));
  // Garante entidades canônicas após tombstone
  migrateToDefaultRegional(r);
  normalizeVendaDates(r);
  deduplicateDB(r);

  // ── nextId: máximo garantido ──
  const maxSellerId = Math.max(0, ...r.sellers.map(s=>Number(s.id)||0));
  r.nextId = Math.max(r.nextId||0, local.nextId||0, maxSellerId + 1);

  // ── dicts aninhados: estratégia baseada em timestamp ──
  // Se cloud é mais recente, cloud vence para evitar sobrescrever dados mais novos.
  // Se local é mais recente (ou igual), local vence (mantém alterações não enviadas).
  function mergeDict(cld, loc) {
    if (!loc) return cld;
    const out = JSON.parse(JSON.stringify(cld||{}));
    Object.keys(loc||{}).forEach(k1 => {
      const v = loc[k1];
      if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
        if (!out[k1]) out[k1] = {};
        Object.keys(v).forEach(k2 => { out[k1][k2] = v[k2]; });
      } else if (v != null) {
        out[k1] = v;
      }
    });
    return out;
  }
  // mergeDictCloudWins: cloud vence quando cloud é mais recente
  function mergeDictCloudWins(cld, loc) {
    if(cloudIsNewer) return mergeDict(loc, cld); // inverte: cloud sobrescreve local
    return mergeDict(cld, loc);
  }

  r.hubMetas          = mergeDictCloudWins(r.hubMetas,          local.hubMetas);
  r.sellerMetas       = mergeDictCloudWins(r.sellerMetas,        local.sellerMetas);
  r.mValues           = mergeDictCloudWins(r.mValues,            local.mValues);

  // ── ativacaoManual: merge de 3 níveis {ymKey: {userId: val}} — union de usuários ──
  // Garante que os dados de diferentes usuários sejam somados, não substituídos
  {
    function mergeAtivacao3Level(cld, loc) {
      const out = JSON.parse(JSON.stringify(cld||{}));
      Object.keys(loc||{}).forEach(ymKey => {
        const locEntry = loc[ymKey];
        if(locEntry != null && typeof locEntry === 'object' && !Array.isArray(locEntry)){
          if(!out[ymKey] || typeof out[ymKey] !== 'object') out[ymKey] = {};
          // Itera pelos userIds do local e mescla
          Object.keys(locEntry).forEach(uid => {
            if(cloudIsNewer){
              // Cloud vence: só usa local se cloud não tiver o userId
              if(out[ymKey][uid] === undefined) out[ymKey][uid] = locEntry[uid];
            } else {
              // Local vence: sobrescreve o userId do usuário logado
              out[ymKey][uid] = locEntry[uid];
            }
          });
        } else if(locEntry != null) {
          // Legado: era número direto → mantém se cloud não tiver
          if(out[ymKey] === undefined) out[ymKey] = locEntry;
        }
      });
      return out;
    }
    r.ativacaoManual   = mergeAtivacao3Level(r.ativacaoManual,   local.ativacaoManual);
    r.ativacaoManualOv = mergeAtivacao3Level(r.ativacaoManualOv, local.ativacaoManualOv);
  }

  if (local.psvData && Object.keys(local.psvData).length)
    r.psvData         = mergeDictCloudWins(r.psvData,            local.psvData);

  // ── diasConfig: merge por chave completa (ymKey ou u{id}_ymKey) — local vence em totalFeriados ──
  {
    const cld = r.diasConfig     || {};
    const loc = local.diasConfig || {};
    const merged = JSON.parse(JSON.stringify(cld));
    Object.keys(loc).forEach(fullKey => {
      if (!merged[fullKey]) merged[fullKey] = {};
      const cldCfg = cld[fullKey] || {};
      const locCfg = loc[fullKey] || {};
      // total / passed: local vence (ou cloud se cloudIsNewer)
      if(!cloudIsNewer){
        if(locCfg.total  != null) merged[fullKey].total  = locCfg.total;
        if(locCfg.passed != null) merged[fullKey].passed = locCfg.passed;
      } else {
        if(merged[fullKey].total  == null && locCfg.total  != null) merged[fullKey].total  = locCfg.total;
        if(merged[fullKey].passed == null && locCfg.passed != null) merged[fullKey].passed = locCfg.passed;
      }
      // totalFeriados: local sempre vence (é uma entrada do usuário local, individual por usuário)
      if(locCfg.totalFeriados != null) merged[fullKey].totalFeriados = locCfg.totalFeriados;
    });
    r.diasConfig = merged;
  }

  // ── Preserva _savedAt: usa o mais recente entre cloud e local ──
  r._savedAt = Math.max(cloudSavedAt, localSavedAt);

  // ── psvPlano: union por (userId + ymKey + indicador), local vence em empate ──
  {
    const map = new Map();
    (r.psvPlano||[]).forEach(row => {
      const k = `${String(row.userId)}|${String(row.ymKey||'')}|${String(row.indicador||'')}`;
      map.set(k, row);
    });
    (local.psvPlano||[]).forEach(row => {
      const k = `${String(row.userId)}|${String(row.ymKey||'')}|${String(row.indicador||'')}`;
      map.set(k, row);
    });
    r.psvPlano = [...map.values()];
  }

  // ── psvTpv: union por (userId + ymKey + hubId + mk), local vence ──
  {
    const map = new Map();
    (r.psvTpv||[]).forEach(row => { map.set(`${String(row.userId||'')}|${String(row.ymKey)}|${String(row.hubId)}|${String(row.mk)}`, row); });
    (local.psvTpv||[]).forEach(row => { map.set(`${String(row.userId||'')}|${String(row.ymKey)}|${String(row.hubId)}|${String(row.mk)}`, row); });
    r.psvTpv = [...map.values()];
  }

  // ── psvDp: union por (userId + ymKey + hubId + tipo + safra), local vence ──
  {
    const map = new Map();
    (r.psvDp||[]).forEach(row => { map.set(`${String(row.userId||'')}|${String(row.ymKey)}|${String(row.hubId)}|${String(row.tipo)}|${String(row.safra)}`, row); });
    (local.psvDp||[]).forEach(row => { map.set(`${String(row.userId||'')}|${String(row.ymKey)}|${String(row.hubId)}|${String(row.tipo)}|${String(row.safra)}`, row); });
    r.psvDp = [...map.values()];
  }

  return r;
}

// Mantém cloudPush como alias para compatibilidade com chamadas existentes no código
async function cloudPush() { await _syncEnqueue(); }

// cloudSyncVendas: motor unificado (pull-merge-push) garante que vendas
// de TODOS os usuários sejam preservadas. Substitui o pull-before-push manual.
async function cloudSyncVendas(){
  try{ localStorage.setItem('bi_v5', JSON.stringify(DB)); }catch(e){}
  await _syncEnqueue();
}




// ══════════════════════════════════════════════════════════
//  CONVERSÃO DB ↔ TABELAS DO SHEETS
//  Cada entidade é uma aba separada no Google Sheets.
//  Sem mais JSON blob em célula única.
// ══════════════════════════════════════════════════════════

/**
 * Converte o objeto DB interno para um conjunto de tabelas
 * (arrays de objetos) prontas para escrever no Google Sheets.
 */
function dbToTables(db) {
  // ── sellers ──
  const sellers = (db.sellers || []).map(s => ({...s}));

  // ── vendas: achata {ymKey: [{...}]} → [{mes, ...}] ──
  const vendas = [];
  Object.keys(db.vendas || {}).forEach(mes => {
    (db.vendas[mes] || []).forEach(v => vendas.push({ mes, ...v }));
  });

  // ── users ──
  const users = (db.users || []).map(u => ({...u}));

  // ── times ──
  const times = (db.times || []).map(t => ({...t}));

  // ── regionais ──
  const regionais = (db.regionais || []).map(r => ({...r}));

  // ── sellerMetas: achata {ymKey: {sellerId: meta}} ──
  const sellerMetas = [];
  Object.keys(db.sellerMetas || {}).forEach(ymKey => {
    Object.keys(db.sellerMetas[ymKey] || {}).forEach(sellerId => {
      sellerMetas.push({ ymKey, sellerId, meta: db.sellerMetas[ymKey][sellerId] });
    });
  });

  // ── hubMetas: achata {ymKey: {timeId: meta}} ──
  const hubMetas = [];
  Object.keys(db.hubMetas || {}).forEach(ymKey => {
    Object.keys(db.hubMetas[ymKey] || {}).forEach(timeId => {
      hubMetas.push({ ymKey, timeId, meta: db.hubMetas[ymKey][timeId] });
    });
  });

  // ── mValues: achata {ymKey: {timeId: {M0,M1,M2}}} ──
  const mValues = [];
  Object.keys(db.mValues || {}).forEach(ymKey => {
    Object.keys(db.mValues[ymKey] || {}).forEach(timeId => {
      const mks = db.mValues[ymKey][timeId] || {};
      Object.keys(mks).forEach(mk => {
        mValues.push({ ymKey, timeId, mk, val: mks[mk] });
      });
    });
  });

  // ── diasConfig: achata {key: {total,passed,totalFeriados}} → com coluna userId separada ──
  // A chave pode ser 'YYYYMM' (global/gerente) ou 'u{userId}_{YYYYMM}' (individual)
  const diasConfig = [];
  Object.keys(db.diasConfig || {}).forEach(fullKey => {
    const cfg = db.diasConfig[fullKey] || {};
    // Decompõe a chave: 'u1002_202605' → userId='1002', ymKey='202605'
    //                   '202605'       → userId='',     ymKey='202605'
    let userId = '', ymKey = fullKey;
    const m = fullKey.match(/^u(\d+)_(\d{6})$/);
    if (m) { userId = m[1]; ymKey = m[2]; }
    if (cfg.total  != null) diasConfig.push({ ymKey, userId, chave: 'total',        val: cfg.total });
    if (cfg.passed != null) diasConfig.push({ ymKey, userId, chave: 'passed',       val: cfg.passed });
    if (cfg.totalFeriados != null && cfg.totalFeriados > 0)
      diasConfig.push({ ymKey, userId, chave: 'totalFeriados', val: cfg.totalFeriados });
  });

  // ── ativacaoManual: achata {ymKey: {sellerId: val}} ──
  const ativacaoManual = [];
  Object.keys(db.ativacaoManual || {}).forEach(ymKey => {
    Object.keys(db.ativacaoManual[ymKey] || {}).forEach(sellerId => {
      ativacaoManual.push({ ymKey, sellerId, val: db.ativacaoManual[ymKey][sellerId] });
    });
  });

  // ── ativacaoManualOv: achata {ymKey: {userId: val}} ──
  const ativacaoManualOv = [];
  Object.keys(db.ativacaoManualOv || {}).forEach(ymKey => {
    const entry = db.ativacaoManualOv[ymKey];
    if (entry == null) return;
    // Suporte ao formato legado (número direto) e novo ({userId: val})
    if (typeof entry === 'object') {
      Object.keys(entry).forEach(userId => {
        const v = entry[userId];
        if (v != null) ativacaoManualOv.push({ ymKey, userId, val: v });
      });
    } else {
      ativacaoManualOv.push({ ymKey, userId: 'default', val: entry });
    }
  });

  // ── deletedVendaIds: achata {mes: [id,...]} ──
  const deletedVendaIds = [];
  Object.keys(db.deletedVendaIds || {}).forEach(mes => {
    (db.deletedVendaIds[mes] || []).forEach(id => {
      deletedVendaIds.push({ mes, id: String(id) });
    });
  });

  // ── deleted entities ──
  const deleted = [];
  const d = db.deleted || {};
  (d.sellerIds   || []).forEach(id => deleted.push({ tipo: 'seller',   id: String(id) }));
  (d.timeIds     || []).forEach(id => deleted.push({ tipo: 'time',     id: String(id) }));
  (d.regionalIds || []).forEach(id => deleted.push({ tipo: 'regional', id: String(id) }));
  (d.userIds     || []).forEach(id => deleted.push({ tipo: 'user',     id: String(id) }));

  // ── config (nextId + _savedAt para controle de versão) ──
  const config = [
    { chave: 'nextId',   val: db.nextId  || 0 },
    { chave: '_savedAt', val: db._savedAt || 0 }
  ];

  // ── psv_plano_acao: {userId, ymKey, indicador, problema, causa, acoes, periodo, resultado} ──
  const psvPlanoAcao = (db.psvPlano || []).map(r => ({...r}));

  // ── psv_tpv: {userId, ymKey, hubId, mk, valor_real, valor_proj} — inclui userId para isolamento ──
  const psvTpv = (db.psvTpv || []).map(r => ({...r}));

  // ── psv_detrator_promotor: {ymKey, hubId, tipo, safra, vendedorId, nome_manual, valor} ──
  const psvDp = (db.psvDp || []).map(r => ({...r}));

  return {
    sellers, vendas, users, times, regionais,
    sellerMetas, hubMetas, mValues, diasConfig,
    ativacaoManual, ativacaoManualOv,
    deletedVendaIds, deleted, config,
    psv_plano_acao: psvPlanoAcao,
    psv_tpv: psvTpv,
    psv_detrator_promotor: psvDp
  };
}

/**
 * Converte as tabelas do Sheets (arrays de objetos) de volta para
 * o objeto DB interno usado pela aplicação.
 */
function tablesToDB(tables) {
  if (!tables || typeof tables !== 'object') return null;

  const db = {};

  // ── sellers ──
  db.sellers = (tables.sellers || []).map(s => {
    const o = {...s};
    if (o.id != null) o.id = isNaN(Number(o.id)) ? o.id : Number(o.id);
    if (o.timeId != null && o.timeId !== '') o.timeId = Number(o.timeId) || o.timeId;
    else o.timeId = null;
    if (o.inativo === 'true' || o.inativo === true) o.inativo = true;
    else o.inativo = false;
    // Normaliza activeFrom: Sheets pode retornar Date ou ISO string
    if (o.activeFrom instanceof Date) {
      const d = o.activeFrom;
      o.activeFrom = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    } else if (typeof o.activeFrom === 'string' && o.activeFrom.length > 10) {
      o.activeFrom = o.activeFrom.slice(0, 10);
    }
    return o;
  });

  // ── vendas: agrupa por mes → {mes: [{...}]} ──
  db.vendas = {};
  (tables.vendas || []).forEach(row => {
    const { mes, ...v } = {...row};
    if (!mes) return;
    const mesKey = String(mes);
    if (!db.vendas[mesKey]) db.vendas[mesKey] = [];
    // Preserva ID como string (evita perda de precisão em IDs com decimal)
    if (v.id != null) v.id = String(v.id);
    if (v.sellerId != null) v.sellerId = isNaN(Number(v.sellerId)) ? v.sellerId : Number(v.sellerId);
    if (v.qty != null) v.qty = Number(v.qty);
    // Normaliza date: Sheets pode devolver "2026-01-05T00:00:00.000Z" em vez de "2026-01-05"
    if (v.date && typeof v.date === 'string' && v.date.length > 10) {
      v.date = v.date.slice(0, 10); // extrai apenas YYYY-MM-DD
    }
    if (v.date instanceof Date) {
      const d = v.date;
      v.date = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    }
    db.vendas[mesKey].push(v);
  });

  // ── users ──
  db.users = (tables.users || []).map(u => {
    const o = {...u};
    if (o.id != null) o.id = Number(o.id) || o.id;
    if (o.timeId != null && o.timeId !== '') o.timeId = Number(o.timeId) || null;
    else o.timeId = null;
    if (o.regionalId != null && o.regionalId !== '') o.regionalId = Number(o.regionalId) || null;
    else o.regionalId = null;
    return o;
  });

  // ── times ──
  db.times = (tables.times || []).map(t => {
    const o = {...t};
    if (o.id != null) o.id = Number(o.id) || o.id;
    if (o.regionalId != null && o.regionalId !== '') o.regionalId = Number(o.regionalId) || null;
    else o.regionalId = null;
    return o;
  });

  // ── regionais ──
  db.regionais = (tables.regionais || []).map(r => {
    const o = {...r};
    if (o.id != null) o.id = Number(o.id) || o.id;
    return o;
  });

  // ── sellerMetas: reconstrói {ymKey: {sellerId: meta}} ──
  db.sellerMetas = {};
  (tables.sellerMetas || []).forEach(({ ymKey, sellerId, meta }) => {
    if (!ymKey) return;
    if (!db.sellerMetas[ymKey]) db.sellerMetas[ymKey] = {};
    db.sellerMetas[ymKey][sellerId] = Number(meta);
  });

  // ── hubMetas: reconstrói {ymKey: {timeId: meta}} ──
  db.hubMetas = {};
  (tables.hubMetas || []).forEach(({ ymKey, timeId, meta }) => {
    if (!ymKey) return;
    if (!db.hubMetas[ymKey]) db.hubMetas[ymKey] = {};
    db.hubMetas[ymKey][timeId] = Number(meta);
  });

  // ── mValues: reconstrói {ymKey: {timeId: {mk: val}}} ──
  db.mValues = {};
  (tables.mValues || []).forEach(({ ymKey, timeId, mk, val }) => {
    if (!ymKey || !timeId || !mk) return;
    if (!db.mValues[ymKey]) db.mValues[ymKey] = {};
    if (!db.mValues[ymKey][timeId]) db.mValues[ymKey][timeId] = {};
    db.mValues[ymKey][timeId][mk] = Number(val);
  });

  // ── diasConfig: reconstrói {fullKey: {total, passed, totalFeriados}} ──
  // fullKey = 'u{userId}_{ymKey}' se userId presente, ou 'ymKey' se global
  db.diasConfig = {};
  (tables.diasConfig || []).forEach(({ ymKey, userId, chave, val }) => {
    if (!ymKey || !chave) return;
    // Reconstrói a chave composta
    const fullKey = (userId && String(userId).trim()) ? `u${userId}_${ymKey}` : ymKey;
    if (!db.diasConfig[fullKey]) db.diasConfig[fullKey] = {};
    if (chave === 'totalFeriados') {
      const n = Number(val);
      db.diasConfig[fullKey].totalFeriados = (!isNaN(n) && n > 0) ? n : null;
    } else if (chave === 'feriados') {
      // Retrocompatibilidade: ignora formato antigo de datas (não mais usado)
    } else {
      db.diasConfig[fullKey][chave] = Number(val);
    }
  });

  // ── ativacaoManual: reconstrói {ymKey: {sellerId: val}} ──
  db.ativacaoManual = {};
  (tables.ativacaoManual || []).forEach(({ ymKey, sellerId, val }) => {
    if (!ymKey) return;
    if (!db.ativacaoManual[ymKey]) db.ativacaoManual[ymKey] = {};
    db.ativacaoManual[ymKey][sellerId] = Number(val);
  });

  // ── ativacaoManualOv: reconstrói {ymKey: {userId: val}} ──
  db.ativacaoManualOv = {};
  (tables.ativacaoManualOv || []).forEach(({ ymKey, userId, val }) => {
    if (!ymKey) return;
    const uid = String(userId || 'default');
    if (typeof db.ativacaoManualOv[ymKey] !== 'object' || db.ativacaoManualOv[ymKey] === null)
      db.ativacaoManualOv[ymKey] = {};
    db.ativacaoManualOv[ymKey][uid] = Number(val);
  });

  // ── deletedVendaIds: reconstrói {mes: [id,...]} ──
  db.deletedVendaIds = {};
  (tables.deletedVendaIds || []).forEach(({ mes, id }) => {
    if (!mes || !id) return;
    if (!db.deletedVendaIds[mes]) db.deletedVendaIds[mes] = [];
    db.deletedVendaIds[mes].push(String(id));
  });

  // ── deleted entities ──
  db.deleted = { userIds: [], sellerIds: [], timeIds: [], regionalIds: [] };
  (tables.deleted || []).forEach(({ tipo, id }) => {
    if (!tipo || !id) return;
    if (tipo === 'seller')   db.deleted.sellerIds.push(String(id));
    if (tipo === 'time')     db.deleted.timeIds.push(String(id));
    if (tipo === 'regional') db.deleted.regionalIds.push(String(id));
    if (tipo === 'user')     db.deleted.userIds.push(String(id));
  });

  // ── config ──
  db.nextId = 0; db._savedAt = 0;
  (tables.config || []).forEach(({ chave, val }) => {
    if (chave === 'nextId')   db.nextId   = Number(val) || 0;
    if (chave === '_savedAt') db._savedAt = Number(val) || 0;
  });

  // ── psvData: legado — mantido em memória para não quebrar referências antigas,
  //    mas não é mais serializado nem usado para salvar dados do PSV ──
  db.psvData = {};

  // ── psv_plano_acao ──
  // Força userId e ymKey como string (Sheets pode devolver como número)
  db.psvPlano = (tables.psv_plano_acao || []).map(r => ({
    userId   : String(r.userId   || ''),
    ymKey    : String(r.ymKey    || ''),
    indicador: String(r.indicador|| ''),
    problema : String(r.problema || ''),
    causa    : String(r.causa    || ''),
    acoes    : String(r.acoes    || ''),
    periodo  : String(r.periodo  || ''),
    resultado: String(r.resultado|| ''),
  })).filter(r => r.userId && r.ymKey);

  // ── psv_tpv ──
  // Força userId, ymKey, hubId, mk como string; valores como número
  db.psvTpv = (tables.psv_tpv || []).map(r => ({
    userId    : String(r.userId || ''),
    ymKey     : String(r.ymKey  || ''),
    hubId     : String(r.hubId  || ''),
    mk        : String(r.mk     || ''),
    valor_real: (r.valor_real != null && r.valor_real !== '') ? Number(r.valor_real) || null : null,
    valor_proj: (r.valor_proj != null && r.valor_proj !== '') ? Number(r.valor_proj) || null : null,
  })).filter(r => r.ymKey && r.hubId && r.mk);

  // ── psv_detrator_promotor ──
  // Força userId, ymKey, hubId, tipo, safra como string
  db.psvDp = (tables.psv_detrator_promotor || []).map(r => ({
    userId     : String(r.userId       || 'default'),
    ymKey      : String(r.ymKey        || ''),
    hubId      : String(r.hubId        || ''),
    tipo       : String(r.tipo         || ''),
    safra      : String(r.safra        || ''),
    vendedorId : (r.vendedorId != null && r.vendedorId !== '') ? (Number(r.vendedorId) || String(r.vendedorId)) : null,
    nome_manual: String(r.nome_manual  || ''),
    valor      : (r.valor != null && r.valor !== '') ? String(r.valor) : null,
    photo      : r.photo ? String(r.photo) : '',
  })).filter(r => r.ymKey && r.hubId);

  return db;
}

// ── cloudPull: busca SEMPRE o banco mais recente do Google Sheets ─────────
// Regra: nuvem é a fonte da verdade. Só conserva vendas locais pendentes.
async function cloudPull(mergeLocal = false){
  if(window._blockPull && Date.now()-window._blockPull < 300000) return false;
  const cfg = getCfg();
  if(!cfg.gsUrl) return false;
  setCloudUI('sync','Carregando…');
  try{
    // Timestamp garante URL única: nenhum browser, CDN ou proxy reutiliza cache
    const url = cfg.gsUrl + '?action=get&_t=' + Date.now();
    const res = await fetch(url, {
      cache : 'no-store',
      signal: (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function')
              ? AbortSignal.timeout(15000) : undefined
    });
    if(!res.ok) throw new Error('HTTP ' + res.status);

    let data;
    try{ data = await res.json(); }
    catch(e){ throw new Error('Resposta inválida do Apps Script. Reimplante o Web App.'); }

    // Erro explícito do GAS (ex: planilha não encontrada, permissão negada)
    if(data && data.error){
      throw new Error('GAS: ' + data.error);
    }

    // Converte tabelas do Sheets → DB interno
    const rec = tablesToDB(data);
    if(!rec) throw new Error('Resposta inválida do Apps Script. Reimplante o Web App.');

    // Valida que o GAS retornou ao menos uma tabela com dados
    // (previne sobrescrita do DB local quando planilha estiver vazia ou GAS com erro)
    const hasSellers = Array.isArray(rec?.sellers) && rec.sellers.length > 0;
    const hasVendas  = rec?.vendas && Object.keys(rec.vendas).length > 0;
    const hasTimes   = Array.isArray(rec?.times) && rec.times.length > 0;
    const hasConfig  = rec?.nextId > 0 || rec?._savedAt > 0;
    if(!hasSellers && !hasVendas && !hasTimes && !hasConfig){
      // Planilha vazia ou nova: não sobrescreve DB local, retorna false
      setCloudUI('ok','Nuvem ✓ (planilha vazia)');
      console.warn('[cloudPull] Planilha retornou dados vazios — DB local preservado');
      return false;
    }

    // Normaliza campos ausentes
    if(!rec.sellers   || !Array.isArray(rec.sellers))   rec.sellers   = [];
    if(!rec.vendas    || typeof rec.vendas!=='object')   rec.vendas    = {};
    if(!rec.times     || !Array.isArray(rec.times))     rec.times     = [];
    if(!rec.regionais || !Array.isArray(rec.regionais)) rec.regionais = [];
    if(!rec.users     || !Array.isArray(rec.users))     rec.users     = [];
    ['diasConfig','sellerMetas','hubMetas','mValues','ativacaoManual','ativacaoManualOv','deletedVendaIds']
      .forEach(k=>{ if(!rec[k]||typeof rec[k]!=='object'||Array.isArray(rec[k])) rec[k]={}; });
    if(!rec.deleted||typeof rec.deleted!=='object'||Array.isArray(rec.deleted))
      rec.deleted={userIds:[],sellerIds:[],timeIds:[],regionalIds:[]};
    ['userIds','sellerIds','timeIds','regionalIds'].forEach(k=>{
      if(!Array.isArray(rec.deleted[k])) rec.deleted[k]=[];
    });
    // Garante arrays das tabelas PSV
    if(!Array.isArray(rec.psvPlano)) rec.psvPlano = [];
    if(!Array.isArray(rec.psvTpv))   rec.psvTpv   = [];
    if(!Array.isArray(rec.psvDp))    rec.psvDp    = [];

    // Normaliza roles
    rec.users = rec.users.map(u=>({
      ...u,
      role     : u.role==='admin'?'gerente': u.role==='user'?'supervisor': u.role||'supervisor',
      nome     : u.nome||u.displayName||u.username,
      regionalId: u.regionalId!=null ? Number(u.regionalId)||u.regionalId : null,
      timeId   : u.timeId!=null ? Number(u.timeId)||u.timeId : null,
      color    : u.color||(u.role==='gerente'?'#7c3aed':'#2563eb')
    }));
    // Normaliza times e regionais — garante que nome nunca seja undefined
    rec.times = (rec.times||[]).map(t=>({
      ...t,
      nome     : t.nome || t.name || '',
      id       : t.id!=null ? (Number(t.id)||t.id) : t.id,
      regionalId: t.regionalId!=null ? Number(t.regionalId)||t.regionalId : null,
      color    : t.color || '#2563eb'
    }));
    rec.regionais = (rec.regionais||[]).map(r=>({
      ...r,
      nome  : r.nome || r.name || '',
      id    : r.id!=null ? (Number(r.id)||r.id) : r.id,
      color : r.color || '#2563eb'
    }));
    if(!rec.users.find(u=>u.role==='gerente'))
      rec.users.unshift({id:1,username:'gerente',password:'gerente123',
                         role:'gerente',nome:'Gerente Geral',
                         regionalId:null,timeId:null,color:'#7c3aed'});

    normalizeVendaDates(rec); // normaliza datas brutas antes de qualquer merge

    // ── Nuvem é a verdade absoluta ─────────────────────────────────────────
    // Vendas pendentes locais (lançadas e ainda não confirmadas na nuvem)
    // são re-adicionadas para evitar perda durante o ciclo save→pull.
    const pendVendas = {};
    Object.keys(DB.vendas||{}).forEach(mes=>{
      const cloudIds = new Set((rec.vendas[mes]||[]).map(v=>String(v.id)));
      const pend = (DB.vendas[mes]||[]).filter(v=>!cloudIds.has(String(v.id)));
      if(pend.length) pendVendas[mes] = pend;
    });
    Object.keys(pendVendas).forEach(mes=>{
      if(!rec.vendas[mes]) rec.vendas[mes] = [];
      rec.vendas[mes] = [...rec.vendas[mes], ...pendVendas[mes]]
        .sort((a,b)=>a.date<b.date?-1:a.date>b.date?1:0);
    });
    rec.nextId = Math.max(rec.nextId||0, DB.nextId||0);

    // ── Merge tombstones locais → nuvem: exclusões offline persistem após pull ──
    // vendas
    if(!rec.deletedVendaIds) rec.deletedVendaIds = {};
    const _pullDelLocal = DB.deletedVendaIds || {};
    Object.keys(_pullDelLocal).forEach(k => {
      if(!rec.deletedVendaIds[k]) rec.deletedVendaIds[k] = [];
      const _pds = new Set(rec.deletedVendaIds[k].map(String));
      (_pullDelLocal[k]||[]).forEach(id => { if(!_pds.has(String(id))) rec.deletedVendaIds[k].push(String(id)); });
    });
    Object.keys(rec.vendas||{}).forEach(k => {
      const _pdIds = new Set((rec.deletedVendaIds[k]||[]).map(String));
      if(_pdIds.size) rec.vendas[k] = rec.vendas[k].filter(v => !_pdIds.has(String(v.id)));
    });
    // entidades (users, sellers, times, regionais)
    if(!rec.deleted||typeof rec.deleted!=='object') rec.deleted={userIds:[],sellerIds:[],timeIds:[],regionalIds:[]};
    const _ld2 = DB.deleted||{};
    ['userIds','sellerIds','timeIds','regionalIds'].forEach(k=>{
      if(!Array.isArray(rec.deleted[k])) rec.deleted[k]=[];
      const _s2 = new Set(rec.deleted[k].map(String));
      (Array.isArray(_ld2[k])?_ld2[k]:[]).forEach(id=>{ if(!_s2.has(String(id))) rec.deleted[k].push(String(id)); });
    });
    // Tombstone: filtra entidades deletadas, nunca remove IDs canônicos protegidos
    const _pSel = new Set(rec.deleted.sellerIds.map(String));
    const _pTim = new Set([...rec.deleted.timeIds.map(String)].filter(id=>!_PROTECTED_TIME_IDS.has(id)));
    const _pReg = new Set([...rec.deleted.regionalIds.map(String)].filter(id=>!_PROTECTED_REG_IDS.has(id)));
    const _pUsr = new Set([...rec.deleted.userIds.map(String)].filter(id=>!_PROTECTED_USR_IDS.has(id)));
    if(_pSel.size) rec.sellers   = (rec.sellers||[]).filter(x=>!_pSel.has(String(x.id)));
    if(_pTim.size) rec.times     = (rec.times||[]).filter(x=>!_pTim.has(String(x.id)));
    if(_pReg.size) rec.regionais = (rec.regionais||[]).filter(x=>!_pReg.has(String(x.id)));
    if(_pUsr.size) rec.users     = (rec.users||[]).filter(x=>!_pUsr.has(String(x.id)));

    // Limpa IDs canônicos dos arrays deleted (não poluir sincronizações futuras)
    rec.deleted.timeIds     = rec.deleted.timeIds.filter(id=>!_PROTECTED_TIME_IDS.has(String(id)));
    rec.deleted.regionalIds = rec.deleted.regionalIds.filter(id=>!_PROTECTED_REG_IDS.has(String(id)));
    rec.deleted.userIds     = rec.deleted.userIds.filter(id=>!_PROTECTED_USR_IDS.has(String(id)));

    // Garante entidades canônicas APÓS tombstone (nunca ficam ausentes)
    migrateToDefaultRegional(rec);
    deduplicateDB(rec);

    // ── CRÍTICO: preserva alterações locais não sincronizadas ──
    // Quando chamado em polling de fundo (mergeLocal=true), faz merge em vez de
    // substituir. Isso evita que feriados/metas adicionados localmente (ainda
    // aguardando o debounce de 350ms do saveDB) sejam sobrescritos pela nuvem.
    // ── FIX CRÍTICO: preserva senhas usando o cache persistente + seed base ─
    {
      const pwCache = _loadPwCache();
      // Adiciona/atualiza cache com senhas do DB em memória e do seed base
      if(Array.isArray(DB.users)) DB.users.filter(u=>u.id&&u.password).forEach(u=>{ pwCache[String(u.id)]={p:u.password,un:u.username}; });
      Object.entries(_SEED_CREDS).forEach(([un,pw])=>{
        const u = rec.users.find(x=>x.username===un);
        if(u && !pwCache[String(u.id)]) pwCache[String(u.id)]={p:pw,un};
      });
      Object.entries(_SEED_CREDS_BY_ID).forEach(([id,pw])=>{ if(!pwCache[id]) pwCache[id]={p:pw}; });
      rec.users = rec.users.map(u=>{
        const pw = u.password || pwCache[String(u.id)]?.p || _SEED_CREDS_BY_ID[String(u.id)] || _SEED_CREDS[u.username?.toLowerCase()];
        return pw ? {...u, password:pw} : u;
      });
      _savePwCache(pwCache);
    }

    if(mergeLocal && DB._savedAt && DB._savedAt > (rec._savedAt || 0)){
      // Local tem alterações mais recentes que a nuvem: mescla preservando local
      DB = _deepMerge(rec, DB);
    } else {
      DB = rec;
    }
    try{ localStorage.setItem('bi_v5', JSON.stringify(DB)); }catch(e){}
    setCloudUI('ok','Nuvem ✓');
    syncLog('Sincronizado — ' + new Date().toLocaleTimeString('pt-BR'));
    return true;

  } catch(err){
    setCloudUI('err','Erro ao carregar');
    syncLog('Erro: ' + err.message);
    console.error('[cloudPull]', err);
    return false;
  }
}


async function connectCloud(){
  const gsUrl = document.getElementById('m-gsurl').value.trim();
  const warn  = document.getElementById('cloud-warn');
  if(!gsUrl || !gsUrl.startsWith('https://')){ warn.style.display='block'; warn.textContent='⚠️ Informe a URL do Apps Script (começa com https://).'; return; }
  warn.style.display='none';
  const cfg = getCfg();
  cfg.gsUrl = gsUrl;
  setCfg(cfg);
  syncLog('Conectando ao Google Sheets…');
  const ok = await cloudPull();
  if(ok){ renderAll(); toast('☁️ Dados carregados do Google Sheets!'); return; }
  // Se não há dados ainda, empurra o banco local
  await cloudPush();
  toast('☁️ Google Sheets configurado com sucesso!');
}

// Conecta ao banco pela URL do Apps Script colada na tela de login (celular sem cache)
async function applyLoginGsUrl(){
  const url = (document.getElementById('login-bin-input')?.value||'').trim();
  if(!url || !url.startsWith('https://')){ return; }
  const c = getCfg(); c.gsUrl=url; setCfg(c);
  setCloudUI('sync','Conectando…');
  const ok = await cloudPull();
  if(ok){
    populateMes(); populateQESellers();
    document.getElementById('login-sync-warn').style.display='none';
    toast('✅ Banco conectado com sucesso!');
  } else {
    toast('❌ URL inválida ou sem acesso','⚠️');
    const c2=getCfg(); delete c2.gsUrl; setCfg(c2);
  }
}

function disconnectCloud(){
  setCfg({});
  document.getElementById('m-gsurl').value='';
  setCloudUI('off','Sem nuvem');
  syncLog('Sincronização desativada.');
  toast('Nuvem desconectada','ℹ️');
}

// ── Troca de abas no modal ────────────────────────────────────────────────
function cmTab(tab) {
  ['config','backup','export'].forEach(t => {
    const btn  = document.getElementById('cm-tab-' + t);
    const pane = document.getElementById('cm-pane-' + t);
    const active = t === tab;
    if(btn)  { btn.style.borderBottomColor = active ? 'var(--blue)' : 'transparent'; btn.style.color = active ? 'var(--blue)' : 'var(--tl)'; }
    if(pane) pane.style.display = active ? '' : 'none';
  });
  if(tab === 'backup') gsLoadBackupList();
  if(tab === 'export') _fillExpMes();
}

function openCloudModal(){
  const cfg = getCfg();
  document.getElementById('m-gsurl').value = cfg.gsUrl || '';
  document.getElementById('cloud-warn').style.display = 'none';
  const panel = document.getElementById('cloud-bin-panel');
  const disp  = document.getElementById('cloud-bin-display');
  if(cfg.gsUrl){ panel.style.display=''; disp.textContent=cfg.gsUrl; }
  else { panel.style.display='none'; }
  cmTab('config');
  document.getElementById('cloud-modal').classList.add('show');
}
function closeCloudModal(){ document.getElementById('cloud-modal').classList.remove('show'); }

// ── Preenche o select de meses na aba Exportar ────────────────────────────
function _fillExpMes(){
  const sel = document.getElementById('exp-mes');
  if(!sel) return;
  const meses = Object.keys(DB.vendas||{}).sort().reverse();
  sel.innerHTML = '<option value="">Todos os meses</option>' +
    meses.map(m=>`<option value="${m}">${m}</option>`).join('');
}

// ═══════════════════════════════════════════════════════════════════════════
//  BACKUP — funções que se comunicam com o Apps Script
// ═══════════════════════════════════════════════════════════════════════════

async function gsCreateBackup(){
  const cfg = getCfg();
  if(!cfg.gsUrl){ toast('Configure a URL do Apps Script primeiro','⚠️'); return; }
  const label = (document.getElementById('bk-label')?.value||'').trim()
              || 'manual_' + new Date().toLocaleDateString('pt-BR').replace(/\//g,'-');
  const btn = document.querySelector('[onclick="gsCreateBackup()"]');
  if(btn){ btn.disabled=true; btn.textContent='Salvando…'; }
  try{
    const params = new URLSearchParams();
    params.append('action', 'backup');
    params.append('data',   JSON.stringify(dbToTables(DB)));
    params.append('label',  label);
    await fetch(cfg.gsUrl, { method:'POST', body:params });
    toast('✅ Backup "' + label + '" criado!');
    if(document.getElementById('bk-label')) document.getElementById('bk-label').value = '';
    await gsLoadBackupList();
  } catch(e){ toast('❌ Erro ao criar backup: ' + e.message,'⚠️'); }
  finally{ if(btn){ btn.disabled=false; btn.textContent='Criar Backup'; } }
}

async function gsLoadBackupList(){
  const cfg = getCfg();
  const el  = document.getElementById('bk-list');
  if(!el) return;
  if(!cfg.gsUrl){
    el.innerHTML = '<div style="padding:20px;text-align:center;color:var(--tl);font-size:12px;">Configure a URL do Apps Script primeiro.</div>';
    return;
  }
  el.innerHTML = '<div style="padding:20px;text-align:center;color:var(--tl);font-size:12px;">🔄 Carregando…</div>';
  try{
    const url = cfg.gsUrl + '?action=listBackups&_t=' + Date.now();
    const res = await fetch(url, { cache:'no-store' });
    const data = await res.json();
    const list = data.backups || [];
    if(!list.length){
      el.innerHTML = '<div style="padding:20px;text-align:center;color:var(--tl);font-size:12px;">Nenhum backup encontrado.<br>Crie o primeiro backup acima.</div>';
      return;
    }
    el.innerHTML = list.map(b => `
      <div style="display:flex;align-items:center;gap:10px;padding:10px 14px;border-bottom:1px solid var(--border);">
        <div style="flex:1;min-width:0;">
          <div style="font-size:12px;font-weight:700;color:var(--td);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${b.label}</div>
          <div style="font-size:10.5px;color:var(--tl);margin-top:2px;">${b.date} · ${b.size}</div>
        </div>
        <button onclick="gsRestoreBackup('${b.id}','${b.label.replace(/'/g,"\\'")}')" style="background:var(--green);color:#fff;border:none;border-radius:6px;padding:5px 11px;font-family:var(--font);font-size:11px;font-weight:700;cursor:pointer;white-space:nowrap;">↺ Restaurar</button>
        <button onclick="gsDeleteBackup('${b.id}',this)" style="background:transparent;border:1px solid var(--border);border-radius:6px;padding:5px 8px;font-family:var(--font);font-size:11px;color:var(--tl);cursor:pointer;">🗑</button>
      </div>`).join('');
  } catch(e){
    el.innerHTML = `<div style="padding:20px;text-align:center;color:var(--red);font-size:12px;">❌ Erro: ${e.message}</div>`;
  }
}

async function gsRestoreBackup(id, label){
  if(!confirm(`Restaurar o backup "${label}"?\n\nO banco atual será substituído por este backup.\nUm backup automático do estado atual será feito antes.`)) return;
  const cfg = getCfg();
  if(!cfg.gsUrl){ toast('Configure a URL do Apps Script primeiro','⚠️'); return; }
  toast('⏳ Restaurando backup…');
  try{
    // 1. Busca os dados do backup
    const url = cfg.gsUrl + '?action=getBackup&id=' + encodeURIComponent(id) + '&_t=' + Date.now();
    const res = await fetch(url, { cache:'no-store' });
    const data = await res.json();
    if(data.error) throw new Error(data.error);
    if(!data.tables && !data.sellers) throw new Error('Backup sem dados');

    // 2. Aplica localmente (backup retorna tabelas)
    const restored = data.tables ? tablesToDB(data.tables) : tablesToDB(data);
    if(!restored) throw new Error('Formato de backup inválido');
    DB = restored;
    try{ localStorage.setItem('bi_v5', JSON.stringify(DB)); }catch(e){}

    // 3. Salva na nuvem (usa o mecanismo normal de save que faz pull+merge+push)
    await cloudPush();

    // 4. Atualiza a tela
    _refreshCurrentUserFromDB();
    populateMes(); populateQESellers(); renderAll();
    toast('✅ Banco restaurado para "' + label + '"!');
    closeCloudModal();
  } catch(e){
    toast('❌ Erro ao restaurar: ' + e.message,'⚠️');
  }
}

async function gsDeleteBackup(id, btn){
  if(!confirm('Excluir este backup permanentemente?')) return;
  const cfg = getCfg();
  if(!cfg.gsUrl) return;
  if(btn){ btn.disabled=true; btn.textContent='…'; }
  try{
    const params = new URLSearchParams();
    params.append('action', 'deleteBackup');
    params.append('id', id);
    await fetch(cfg.gsUrl, { method:'POST', body:params });
    toast('🗑️ Backup excluído.');
    await gsLoadBackupList();
  } catch(e){
    toast('❌ Erro: ' + e.message,'⚠️');
    if(btn){ btn.disabled=false; btn.textContent='🗑'; }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  EXPORTAÇÃO
// ═══════════════════════════════════════════════════════════════════════════

async function gsExportJson(){
  const cfg = getCfg();
  if(!cfg.gsUrl){ toast('Configure a URL do Apps Script primeiro','⚠️'); return; }
  toast('⏳ Baixando JSON da nuvem…');
  try{
    const url = cfg.gsUrl + '?action=exportJson&_t=' + Date.now();
    const res = await fetch(url, { cache:'no-store' });
    const txt = await res.text();
    // Cria download
    const blob = new Blob([txt], { type:'application/json' });
    const a    = document.createElement('a');
    a.href     = URL.createObjectURL(blob);
    a.download = 'bi_vendas_nuvem_' + fmtD(today()) + '.json';
    a.click();
    URL.revokeObjectURL(a.href);
    toast('✅ JSON da nuvem baixado!');
  } catch(e){
    toast('❌ Erro: ' + e.message,'⚠️');
  }
}

async function gsExportCsv(){
  const cfg = getCfg();
  if(!cfg.gsUrl){ toast('Configure a URL do Apps Script primeiro','⚠️'); return; }
  const mes = document.getElementById('exp-mes')?.value || '';
  toast('⏳ Gerando CSV…');
  try{
    const url = cfg.gsUrl + '?action=exportCsv' + (mes?'&mes='+encodeURIComponent(mes):'') + '&_t=' + Date.now();
    const res = await fetch(url, { cache:'no-store' });
    const txt = await res.text();
    const blob = new Blob([txt], { type:'text/csv;charset=utf-8;' });
    const a    = document.createElement('a');
    a.href     = URL.createObjectURL(blob);
    a.download = 'bi_vendas_' + (mes||'todos') + '_' + fmtD(today()) + '.csv';
    a.click();
    URL.revokeObjectURL(a.href);
    toast('✅ CSV exportado!');
  } catch(e){
    toast('❌ Erro: ' + e.message,'⚠️');
  }
}
function copyGsUrl(){
  const url = getCfg().gsUrl||document.getElementById('m-gsurl')?.value||'';
  if(!url){ toast('Nenhuma URL disponível','⚠️'); return; }
  if(navigator.clipboard?.writeText){
    navigator.clipboard.writeText(url).then(()=>toast('📋 URL copiada!'));
  } else {
    const ta=document.createElement('textarea');ta.value=url;ta.style.position='fixed';ta.style.opacity='0';
    document.body.appendChild(ta);ta.focus();ta.select();
    try{document.execCommand('copy');toast('📋 URL copiada!');}catch(e){toast('Copie manualmente: '+url);}
    document.body.removeChild(ta);
  }
}

// ══════════════════════════════════════════════════════════
//  BACKUP
// ══════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════════════════
//  MODAL BACKUP / RESTAURAÇÃO
// ═══════════════════════════════════════════════════════════════════════════

let _bkFileData = null; // JSON do arquivo selecionado

function openBkModal(){
  _bkFileData = null;
  document.getElementById('bk-preview').style.display  = 'none';
  document.getElementById('bk-progress').style.display = 'none';
  document.getElementById('bk-drop').style.display     = '';
  document.getElementById('bk-file').value             = '';
  const cfg = getCfg();
  const stxt = document.getElementById('bk-status-txt');
  const sbox = document.getElementById('bk-status');
  if(cfg.gsUrl){
    stxt.textContent = 'Conectado: ' + cfg.gsUrl.replace('https://script.google.com/macros/s/','…/').replace('/exec','');
    sbox.style.background='#f0fdf4'; sbox.style.borderColor='#86efac'; sbox.style.color='#166534';
  } else {
    stxt.textContent = '⚠️ Sem URL configurada — só exportação local disponível.';
    sbox.style.background='#fefce8'; sbox.style.borderColor='#fde047'; sbox.style.color='#854d0e';
  }
  document.getElementById('bk-modal').classList.add('show');
}
function closeBkModal(){ document.getElementById('bk-modal').classList.remove('show'); }

// ── Exportar do Google Sheets ─────────────────────────────────────────────
async function bkExportCloud(){
  const cfg = getCfg();
  if(!cfg.gsUrl){ toast('Configure a URL do Apps Script primeiro','⚠️'); return; }
  const btn = document.getElementById('bk-exp-cloud-btn');
  if(btn){ btn.disabled=true; btn.innerHTML='⏳ Baixando da nuvem…'; }
  try{
    const url = cfg.gsUrl + '?action=get&_t=' + Date.now();
    const res = await fetch(url, { cache:'no-store' });
    if(!res.ok) throw new Error('HTTP ' + res.status);
    const txt = await res.text();
    // Valida que é JSON válido com estrutura correta
    const d = JSON.parse(txt);
    if(!d.sellers && !d.vendas) throw new Error('Resposta inválida do servidor');
    // Baixa
    const nome = 'backup_GS_' + new Date().toISOString().slice(0,16).replace('T','_').replace(/:/g,'-') + '.json';
    _bkDownload(JSON.stringify(d, null, 2), nome, 'application/json');
    toast('✅ Backup do Google Sheets baixado: ' + nome);
  } catch(e){
    toast('❌ Erro ao exportar: ' + e.message,'⚠️');
  } finally {
    if(btn){ btn.disabled=false; btn.innerHTML='<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> Baixar Backup do Google Sheets (.json)'; }
  }
}

// ── Exportar cópia local ──────────────────────────────────────────────────
function exportBk(){
  const nome = 'backup_local_' + new Date().toISOString().slice(0,16).replace('T','_').replace(/:/g,'-') + '.json';
  _bkDownload(JSON.stringify(DB, null, 2), nome, 'application/json');
  toast('✅ Cópia local baixada: ' + nome);
}

function _bkDownload(content, filename, mime){
  const blob = new Blob([content], { type: mime });
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(()=>URL.revokeObjectURL(url), 1000);
}

// ── Drag & Drop ───────────────────────────────────────────────────────────
function bkHandleDrop(e){
  e.preventDefault();
  const drop = document.getElementById('bk-drop');
  drop.style.borderColor = 'var(--border)';
  drop.style.background  = '';
  const file = e.dataTransfer?.files?.[0];
  if(file) _bkReadFile(file);
}
function bkHandleFile(e){ const f = e.target.files?.[0]; if(f) _bkReadFile(f); }

function _bkReadFile(file){
  if(!file.name.endsWith('.json') && file.type !== 'application/json'){
    toast('⚠️ Selecione um arquivo .json','⚠️'); return;
  }
  const reader = new FileReader();
  reader.onload = ev => {
    try{
      const d = JSON.parse(ev.target.result);
      // Validação básica
      if(!d || typeof d !== 'object') throw new Error('Arquivo não é um objeto JSON');
      if(!d.sellers && !d.vendas)     throw new Error('Arquivo não parece ser um backup deste sistema');
      _bkFileData = d;
      // Mostra preview
      const sellers = (d.sellers||[]).length;
      const meses   = Object.keys(d.vendas||{}).length;
      const vendas  = Object.values(d.vendas||{}).reduce((s,v)=>s+(v?.length||0),0);
      document.getElementById('bk-fname').textContent = file.name;
      document.getElementById('bk-finfo').textContent =
        sellers + ' HC · ' + meses + ' meses · ' + vendas + ' lançamentos · ' +
        (file.size > 1024*1024 ? (file.size/1024/1024).toFixed(1)+'MB' : Math.round(file.size/1024)+'KB');
      document.getElementById('bk-drop').style.display    = 'none';
      document.getElementById('bk-preview').style.display = '';
    } catch(e){
      toast('❌ ' + e.message,'⚠️');
    }
  };
  reader.readAsText(file);
}

function bkClearFile(){
  _bkFileData = null;
  document.getElementById('bk-file').value             = '';
  document.getElementById('bk-preview').style.display  = 'none';
  document.getElementById('bk-drop').style.display     = '';
}

// ── Restaurar ─────────────────────────────────────────────────────────────
async function bkDoRestore(){
  if(!_bkFileData){ toast('Nenhum arquivo selecionado','⚠️'); return; }
  const d = _bkFileData;
  const sellers = (d.sellers||[]).length;
  const vendas  = Object.values(d.vendas||{}).reduce((s,v)=>s+(v?.length||0),0);

  if(!confirm(
    '⚠️ CONFIRMAR RESTAURAÇÃO\n\n' +
    'Este backup contém:\n' +
    '  • ' + sellers + ' HC\n' +
    '  • ' + vendas  + ' lançamentos\n\n' +
    'O banco de dados atual será SUBSTITUÍDO por este backup.\n\n' +
    'Deseja continuar?'
  )) return;

  const btn = document.getElementById('bk-restore-btn');
  const prog = document.getElementById('bk-progress');
  const prevTxt = document.getElementById('bk-progress-txt');

  document.getElementById('bk-preview').style.display = 'none';
  prog.style.display = '';

  const step = t => { if(prevTxt) prevTxt.textContent = t; };

  try{
    step('Validando dados…');
    await new Promise(r=>setTimeout(r,300));

    // 1. Aplica localmente
    step('Aplicando dados localmente…');
    DB = JSON.parse(JSON.stringify(d)); // cópia limpa
    try{ localStorage.setItem('bi_v5', JSON.stringify(DB)); }catch(e){}
    await new Promise(r=>setTimeout(r,300));

    // 2. Envia para o Google Sheets e confirma
    const cfg = getCfg();
    if(cfg.gsUrl){
      step('Enviando para o Google Sheets…');
      const params = new URLSearchParams();
      params.append('data', JSON.stringify(DB));
      const postRes = await fetch(cfg.gsUrl, { method:'POST', body:params });
      if(!postRes.ok) throw new Error('Servidor retornou HTTP ' + postRes.status);
      const result = await postRes.json().catch(()=>null);
      if(result && result.error) throw new Error('GAS: ' + result.error);

      // 3. Confirma com pull
      step('Confirmando sincronização…');
      await cloudPull();
    }

    // 4. Atualiza UI
    step('Atualizando interface…');
    _refreshCurrentUserFromDB();
    populateMes(); populateQESellers(); renderAll();

    prog.style.display = 'none';
    toast('✅ Banco restaurado com sucesso!');
    closeBkModal();
  } catch(e){
    prog.style.display = 'none';
    document.getElementById('bk-preview').style.display = '';
    toast('❌ Erro ao restaurar: ' + e.message,'⚠️');
  }
}

// Mantém compatibilidade com o input antigo da sidebar
function importBk(e){
  const file = e?.target?.files?.[0];
  if(!file) return;
  openBkModal();
  setTimeout(()=>_bkReadFile(file), 300);
  e.target.value = '';
}

// ══════════════════════════════════════════════════════════
//  RENDER ALL
// ══════════════════════════════════════════════════════════
function renderAll(){
  const p=document.querySelector('.page.active');
  if(!p) return;
  const id=p.id.replace('page-','');
  if(id==='dash')           renderDash();
  else if(id==='lancar')    renderLancar();
  else if(id==='sellers')   renderSellers();
  else if(id==='regionais') renderRegionais();
  else if(id==='db')        renderDB();
  else if(id==='overview')  renderOverview();
  else if(id==='psv')       setTimeout(renderPSV, 0); // defer para garantir que o DOM do mês já atualizou
}

// ══════════════════════════════════════════════════════════
//  AUTH — Login / Logout / Session
// ══════════════════════════════════════════════════════════
function getSession(){ try{ return JSON.parse(sessionStorage.getItem('bi_sess')||'null'); }catch(e){return null;} }
function setSession(u){ sessionStorage.setItem('bi_sess',JSON.stringify(u)); currentUser=u; }

// Atualiza currentUser com a versão mais recente do banco (pós-cloudPull)
// Preserva a senha da sessão que não é armazenada no DB por segurança
function _refreshCurrentUserFromDB(){
  if(!currentUser) return;
  // Busca por ID primeiro; se não achar (usuários admin cujo ID pode diferir), usa username
  const fresh = DB.users?.find(u=>u.id===currentUser.id)
             || DB.users?.find(u=>(u.username||'').toLowerCase()===(currentUser.username||'').toLowerCase());
  if(!fresh) return;
  // Mantém a senha salva em sessão (Sheets não devolve campo password)
  const savedPass = currentUser.password;
  // Detecta se o escopo mudou (timeId ou regionalId alterados pelo admin)
  const scopeChanged = fresh.timeId !== currentUser.timeId
                    || fresh.regionalId !== currentUser.regionalId
                    || fresh.role !== currentUser.role;
  currentUser = {...fresh, password: savedPass||fresh.password};
  setSession(currentUser);
  if(scopeChanged){
    applySession(); // re-aplica o escopo correto
    console.log('[auth] escopo do usuário atualizado da nuvem:', fresh.username);
  }
}
function clearSession(){ sessionStorage.removeItem('bi_sess'); currentUser=null; }
