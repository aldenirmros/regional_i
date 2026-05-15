// ══ GLOBALS.JS ══


// ══════════════════════════════════════════════════════════
//  CONSTANTS
// ══════════════════════════════════════════════════════════
const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const DSEM  = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
const COLORS = ['#2563eb','#059669','#7c3aed','#d97706','#dc2626','#0891b2','#db2777'];

// Aldenir e qualquer usuário com superAdmin=true têm os mesmos poderes do gerente
function isGerente(u){ u=u||currentUser; return u?.role==='gerente'||u?.superAdmin===true; }

// ══════════════════════════════════════════════════════════
//  STATE  — persiste em localStorage
// ══════════════════════════════════════════════════════════

// Reset de cache: limpa bi_v5 corrompido, preserva URL da nuvem (bi_v5_cfg)
(function _resetCache(){
  const RESET_KEY = 'bi_reset_v4';
  if(!localStorage.getItem(RESET_KEY)){
    localStorage.removeItem('bi_v5');
    localStorage.setItem(RESET_KEY,'1');
  }
})();

// Hubs e regionais de referência (adicionados se ausentes no banco)
const _CANONICAL_REGIONAIS = [
  {id:1001,          nome:'Regional I',  color:'#2563eb'},
  {id:1777691730216, nome:'Regional CE', color:'#059669'},
  {id:1777691830004, nome:'Regional PI', color:'#d97706'},
];
const _CANONICAL_HUBS = [
  {id:2001,          nome:'ALPHA', regionalId:1001,           color:'#2563eb'},
  {id:1777686429083, nome:'BRAVO', regionalId:1001,           color:'#059669'},
  {id:1777691424502, nome:'CE05',  regionalId:1001,           color:'#db2777'},
  {id:1777691452227, nome:'CE08',  regionalId:1001,           color:'#d97706'},
  {id:1777691488521, nome:'CE09',  regionalId:1001,           color:'#dc2626'},
  {id:1777691730217, nome:'CE02',  regionalId:1777691730216,  color:'#059669'},
  {id:1777691830005, nome:'PI02',  regionalId:1777691830004,  color:'#d97706'},
];
const _PROTECTED_TIME_IDS = new Set(_CANONICAL_HUBS.map(h=>String(h.id)));
const _PROTECTED_REG_IDS  = new Set(_CANONICAL_REGIONAIS.map(r=>String(r.id)));
const _PROTECTED_USR_IDS  = new Set(['1002']);

// Mapa de meses para normalização de datas — deve ficar antes de loadDB()
const _MONTHS_MAP = {Jan:'01',Feb:'02',Mar:'03',Apr:'04',May:'05',Jun:'06',
                     Jul:'07',Aug:'08',Sep:'09',Oct:'10',Nov:'11',Dec:'12'};

let DB = loadDB();

// ── Cache de senhas (sobrevive ao cloudPull) ─────────────────────────────────
// O GAS não retorna o campo "password" por segurança. Guardamos as senhas num
// localStorage separado ("bi_pwc") que nunca é sobrescrito pelo cloudPull.
// Isso garante que todos os usuários consigam logar em qualquer sessão.
const _pwcKey = 'bi_pwc';

// Credenciais base (espelham o seed) — fallback absoluto caso cache esteja vazio
// (necessário quando loadDB() retorna dados do localStorage sem senhas)
const _SEED_CREDS = {
  'aldenir':   '@RThur20',
  'guilherme': '12345',
  'aline':     '12345',
  'kesse':     '12345',
  'anderson':  '12345',
  'dougllas':  '12345',
  'pedro':     '12345',    // supervisor
  'daniel':    '12345',
  'thiago':    '12345',
  'gerente':   'gerente123',
  'amaury':    '12345',
  'michella':  '12345',
  'diogo':     '12345',
  'maykon':    '12345',
  'cleyton':   '12345',
  'alex':      '12345'
};
// pedro regional tem senha diferente — mapeado por id
const _SEED_CREDS_BY_ID = {
  '1777691830006': '123456'  // pedro regional
};

function _loadPwCache(){
  try{ return JSON.parse(localStorage.getItem(_pwcKey)||'{}'); }catch(e){ return {}; }
}
function _savePwCache(cache){ try{ localStorage.setItem(_pwcKey, JSON.stringify(cache)); }catch(e){} }
function _updatePwCache(users){
  if(!Array.isArray(users) || !users.length) return;
  const cache = _loadPwCache();
  let changed = false;
  users.forEach(u=>{ if(u.id && u.password){ cache[String(u.id)]={p:u.password,un:u.username}; changed=true; } });
  if(changed) _savePwCache(cache);
}
function _getPwFromCache(userId){
  return (_loadPwCache()[String(userId)]||{}).p;
}
// Resolve senha de um usuário: DB > cache > seed_by_id > seed_by_username
function _resolvePassword(u){
  if(u.password) return u.password;
  const fromCache = _getPwFromCache(u.id);
  if(fromCache) return fromCache;
  const byId = _SEED_CREDS_BY_ID[String(u.id)];
  if(byId) return byId;
  return _SEED_CREDS[u.username?.toLowerCase()] || null;
}

// Garante que todos os usuários do seed estão em DB.users.
// Chamado no login para cobrir o caso em que cloudPull retornou lista vazia
// ou retornou usuários sem o campo "username" (coluna ausente no GAS).
function _ensureSeedUsersInDB(){
  if(!DB.users) DB.users = [];
  // Mapa dos usuários da seed para reconstrução mínima
  const _SEED_USERS = [
    {id:1,               username:'gerente',   password:'gerente123', role:'gerente',    nome:'Gerente Geral',    regionalId:null,        timeId:null,           color:'#7c3aed'},
    {id:1002,            username:'aldenir',   password:'@RThur20',   role:'regional',   nome:'Aldenir',          regionalId:1001,        timeId:null,           color:'#7c3aed', superAdmin:true},
    {id:1777686429084,   username:'guilherme', password:'12345',      role:'supervisor', nome:'Guilherme Queiroz',regionalId:1001,        timeId:1777686429083,  color:'#059669'},
    {id:1777691424503,   username:'aline',     password:'12345',      role:'supervisor', nome:'Aline Ysline',     regionalId:1001,        timeId:1777691424502,  color:'#059669'},
    {id:1777691452228,   username:'kesse',     password:'12345',      role:'supervisor', nome:'Kesse Jhones',     regionalId:1001,        timeId:1777691452227,  color:'#059669'},
    {id:1777691488522,   username:'anderson',  password:'12345',      role:'supervisor', nome:'Anderson Brito',   regionalId:1001,        timeId:1777691488521,  color:'#059669'},
    {id:1777691730218,   username:'dougllas',  password:'12345',      role:'regional',   nome:'Dougllas',         regionalId:1777691730216,timeId:null,          color:'#059669'},
    {id:1777691730219,   username:'dougllas',  password:'12345',      role:'supervisor', nome:'Dougllas Vidal',   regionalId:1777691730216,timeId:1777691730217, color:'#059669'},
    {id:1777691830006,   username:'pedro',     password:'123456',     role:'regional',   nome:'Pedro Lavor',      regionalId:1777691830004,timeId:null,          color:'#d97706'},
    {id:1777691830007,   username:'pedro',     password:'12345',      role:'supervisor', nome:'Pedro Lavor',      regionalId:1777691830004,timeId:1777691830005, color:'#059669'},
    {id:1777692514656,   username:'daniel',    password:'12345',      role:'gerente',    nome:'Daniel Fontes',    regionalId:null,        timeId:null,           color:'#7c3aed'},
    {id:1777692561373,   username:'thiago',    password:'12345',      role:'gerente',    nome:'Thiago Correia',   regionalId:null,        timeId:null,           color:'#7c3aed'},
  ];
  _SEED_USERS.forEach(su=>{
    // Verifica se o usuário já está em DB.users pelo ID OU tem username válido
    const existsById = DB.users.some(u=>String(u.id)===String(su.id));
    const existsByName = DB.users.some(u=>(u.username||'').toLowerCase()===su.username.toLowerCase() && u.role===su.role);
    if(!existsById && !existsByName){
      // Adiciona o usuário do seed (apenas se genuinamente ausente)
      DB.users.push({...su});
    } else {
      // Restaura campos críticos que podem ter sumido (username, password)
      const u = DB.users.find(x=>String(x.id)===String(su.id)) ||
                DB.users.find(x=>(x.username||'').toLowerCase()===su.username.toLowerCase() && x.role===su.role);
      if(u){
        if(!u.username) u.username = su.username;
        if(!u.password) u.password = su.password;
      }
    }
  });
}
// (mesmo que DB.users não tenha senhas, o seed garante o preenchimento)
{
  const cache = _loadPwCache();
  // 1. Preenche a partir das credenciais base do seed
  Object.entries(_SEED_CREDS).forEach(([un,pw])=>{ 
    const u = DB.users?.find(x=>x.username===un);
    if(u && !cache[String(u.id)]) { cache[String(u.id)]={p:pw,un}; }
  });
  Object.entries(_SEED_CREDS_BY_ID).forEach(([id,pw])=>{ if(!cache[id]) cache[id]={p:pw}; });
  // 2. Preenche a partir dos usuários do DB que já têm senha
  (DB.users||[]).filter(u=>u.id&&u.password).forEach(u=>{ cache[String(u.id)]={p:u.password,un:u.username}; });
  _savePwCache(cache);
}
migrateToDefaultRegional(DB);
deduplicateDB(DB);
normalizeVendaDates(DB);
let currentYM = nowYM();
let selectedSeller = null;
let currentUser  = null;
let scopeFilter  = {regionalId:null, timeId:null}; // filtro manual do gerente no dash
let _filterLocked = (()=>{ try{ return localStorage.getItem('bi_filter_locked')==='1'; }catch(e){ return false; } })(); // trava o filtro contra reset ao trocar mês
let ovRegionalFilter = null; // filtro da página visão geral (gerente)
let chartBar=null, chartDonut=null, chartLine=null;
let lancarSellerFilter  = null; // filtro de vendedor na página Lançar
let lancarHubFilter     = null; // filtro de HUB na página Lançar (gerente/regional)
let lancarRegionalFilter= null; // filtro de regional na página Lançar (gerente)
