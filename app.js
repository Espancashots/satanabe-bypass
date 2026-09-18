const SUPABASE_URL = 'https://nefqzfddxyhswhluslsk.supabase.co';
const PUBLISHABLE_KEY = 'sb_publishable_ZVgYxkCJATt02CJs3GBkoA_VibY79aG';
const ADMIN_API = `${SUPABASE_URL}/functions/v1/admin-api`;

const $ = (id) => document.getElementById(id);
let session = JSON.parse(localStorage.getItem('3105_admin_session') || 'null');
let licenses = [];
let patches = [];
let editingPatchID = null;
let activePanel = 'overview';

function saveSession(next){ session = next; if(next) localStorage.setItem('3105_admin_session', JSON.stringify(next)); else localStorage.removeItem('3105_admin_session'); }
function show(id, yes=true){ $(id).classList.toggle('hidden', !yes); }
function msg(id, value, ok=false){ const el=$(id); el.textContent=value||''; el.style.color=ok?'#78e5b2':'#ff9aa4'; }
function escapeHtml(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));}
function humanError(value){
  const map={
    invalid_credentials:'Key/aparelho inválido.', unauthorized:'Sessão expirada.', forbidden:'Conta sem acesso administrativo.',
    missing_patch_fields:'Preencha nome, app alvo, caminho e URL.', invalid_file_url:'A URL do patch é inválida.',
    patch_not_found:'Patch não encontrado.', bootstrap_already_claimed:'O administrador inicial já foi definido.',
    invalid_bootstrap_code:'Código de ativação inválido.'
  };
  return map[value]||value||'Falha no servidor';
}

async function auth(path, body){
  const res = await fetch(`${SUPABASE_URL}/auth/v1/${path}`, {method:'POST',headers:{'Content-Type':'application/json',apikey:PUBLISHABLE_KEY},body:JSON.stringify(body)});
  const data = await res.json().catch(()=>({}));
  if(!res.ok) throw new Error(data.msg || data.message || data.error_description || data.error || 'Falha de autenticação');
  return data;
}

async function refreshSession(){
  if(!session?.refresh_token) return false;
  try{
    const data = await auth('token?grant_type=refresh_token',{refresh_token:session.refresh_token});
    saveSession(data); return true;
  }catch{ saveSession(null); return false; }
}

async function api(payload, retry=true){
  if(!session?.access_token) throw Object.assign(new Error('Sessão expirada'),{status:401});
  const res = await fetch(ADMIN_API,{method:'POST',headers:{'Content-Type':'application/json',apikey:PUBLISHABLE_KEY,Authorization:`Bearer ${session.access_token}`},body:JSON.stringify(payload)});
  if(res.status===401 && retry && await refreshSession()) return api(payload,false);
  const data = await res.json().catch(()=>({}));
  if(!res.ok) { const e = new Error(humanError(data.detail||data.error||`Erro ${res.status}`)); e.status=res.status; e.code=data.error; throw e; }
  return data;
}

function setPanel(name){
  activePanel=name;
  document.querySelectorAll('.panel').forEach(x=>x.classList.add('hidden'));
  $(`${name}Panel`).classList.remove('hidden');
  document.querySelectorAll('.tab').forEach(x=>x.classList.toggle('active',x.dataset.panel===name));
  if(name==='overview') loadOverview().catch(e=>alert(e.message));
  if(name==='keys') loadLicenses().catch(e=>alert(e.message));
  if(name==='patches') loadPatches().catch(e=>alert(e.message));
}

async function enterDashboard(){
  show('authView',false); show('logoutBtn',true); show('globalRefreshBtn',true);
  try{
    await api({action:'me'});
    show('bootstrapView',false); show('dashboard',true);
    await Promise.all([loadOverview(),loadLicenses(),loadAccess(),loadPatches()]);
    setPanel(activePanel);
  }catch(e){
    if(e.status===403){ show('bootstrapView',true); show('dashboard',false); show('globalRefreshBtn',false); }
    else { saveSession(null); show('authView',true); show('logoutBtn',false); show('globalRefreshBtn',false); msg('authMsg','Faça login novamente.'); }
  }
}

async function loadOverview(){
  const d=await api({action:'overview'});
  $('mTotal').textContent=d.total_licenses??0;
  $('mActive').textContent=d.active_licenses??0;
  $('mDevices').textContent=d.devices??0;
  $('mValidations').textContent=d.validations??0;
  $('mToday').textContent=d.expiring_today??0;
  $('mTomorrow').textContent=d.expiring_tomorrow??0;
  $('m3Days').textContent=d.expiring_3_days??0;
  $('mPatches').textContent=d.active_patches??0;
  $('mPatchesTotal').textContent=d.total_patches??0;
  $('mInactive').textContent=Math.max(0,(d.total_licenses??0)-(d.active_licenses??0));
}

async function loadAccess(){
  const d=await api({action:'app_access_get'});
  const enabled=!!d.value?.enabled;
  $('appEnabled').checked=enabled;
  $('appMessage').value=d.value?.message||'';
  const badge=$('appStatusBadge');
  badge.textContent=enabled?'ONLINE':'BLOQUEADO';
  badge.className=`status-pill ${enabled?'online':'offline'}`;
}

async function loadLicenses(){
  const d=await api({action:'list_licenses'}); licenses=d.licenses||[]; renderLicenses();
}
function formatDate(v){ try{return new Date(v).toLocaleString('pt-BR')}catch{return v} }
function renderLicenses(){
  const q=$('search').value.trim().toLowerCase();
  const list=licenses.filter(x=>!q || x.license_key.toLowerCase().includes(q) || (x.note||'').toLowerCase().includes(q));
  $('licenseList').innerHTML=list.map(x=>{
    const deviceCount=x.license_devices?.[0]?.count ?? 0;
    const expired=new Date(x.expires_at).getTime()<=Date.now();
    const effective=x.status==='active'&&!expired?'active':(expired?'expired':x.status);
    const label=effective==='active'?'ATIVA':effective==='expired'?'EXPIRADA':'REVOGADA';
    return `<article class="license">
      <div class="license-top"><div><div class="license-key">${escapeHtml(x.license_key)}</div><div class="license-meta"><span>Expira: ${formatDate(x.expires_at)}</span><span>Aparelhos: ${deviceCount}/${x.max_devices}</span>${x.note?`<span>${escapeHtml(x.note)}</span>`:''}</div></div><span class="badge ${effective}">${label}</span></div>
      <div class="actions">
        <button data-a="copy" data-id="${x.id}" class="secondary">Copiar</button>
        <button data-a="toggle" data-id="${x.id}" class="${x.status==='active'?'danger':'ok'}">${x.status==='active'?'Revogar':'Ativar'}</button>
        <button data-a="day" data-id="${x.id}" class="secondary">+1 dia</button>
        <button data-a="week" data-id="${x.id}" class="secondary">+7 dias</button>
        <button data-a="devices" data-id="${x.id}" class="secondary">Limite</button>
        <button data-a="reset" data-id="${x.id}" class="secondary">Reset aparelhos</button>
        <button data-a="delete" data-id="${x.id}" class="danger">Excluir</button>
      </div></article>`;
  }).join('') || '<p class="muted">Nenhuma key encontrada.</p>';
}

async function loadPatches(){
  const d=await api({action:'list_patches'}); patches=d.patches||[]; renderPatches();
}
function renderPatches(){
  const q=$('patchSearch').value.trim().toLowerCase();
  const list=patches.filter(x=>!q || [x.name,x.category,x.target_bundle,x.target_path].some(v=>String(v||'').toLowerCase().includes(q)));
  $('patchList').innerHTML=list.map(x=>`<article class="license patch-card">
    <div class="license-top">
      <div>
        <div class="license-key">${escapeHtml(x.name)}</div>
        <div class="license-meta">
          ${x.category?`<span>${escapeHtml(x.category)}</span>`:''}
          <span>${escapeHtml(x.target_bundle)}</span>
          <span>Ordem: ${Number(x.sort_order)||0}</span>
        </div>
      </div>
      <span class="badge ${x.enabled?'active':'revoked'}">${x.enabled?'ATIVO':'DESATIVADO'}</span>
    </div>
    ${x.description?`<p class="patch-desc">${escapeHtml(x.description)}</p>`:''}
    <div class="path-box"><small>Caminho</small><code>${escapeHtml(x.target_path)}</code></div>
    <div class="path-box"><small>Arquivo</small><code>${escapeHtml(x.file_url)}</code></div>
    <div class="actions">
      <button data-patch-a="toggle" data-id="${x.id}" class="${x.enabled?'danger':'ok'}">${x.enabled?'Desativar':'Ativar'}</button>
      <button data-patch-a="edit" data-id="${x.id}" class="secondary">Editar</button>
      <button data-patch-a="delete" data-id="${x.id}" class="danger">Excluir</button>
    </div>
  </article>`).join('') || '<p class="muted">Nenhum patch cadastrado.</p>';
}

function resetPatchForm(){
  editingPatchID=null;
  $('patchFormTitle').textContent='Novo patch';
  $('savePatchBtn').textContent='Criar patch';
  show('cancelPatchEditBtn',false);
  $('patchName').value=''; $('patchCategory').value=''; $('patchSort').value='0';
  $('patchBundle').value='com.dts.freefireth'; $('patchPath').value=''; $('patchUrl').value='';
  $('patchDescription').value=''; $('patchEnabled').checked=true; msg('patchMsg','');
}
function editPatch(x){
  editingPatchID=x.id;
  $('patchFormTitle').textContent='Editar patch';
  $('savePatchBtn').textContent='Salvar alterações';
  show('cancelPatchEditBtn',true);
  $('patchName').value=x.name||''; $('patchCategory').value=x.category||''; $('patchSort').value=x.sort_order??0;
  $('patchBundle').value=x.target_bundle||'com.dts.freefireth'; $('patchPath').value=x.target_path||''; $('patchUrl').value=x.file_url||'';
  $('patchDescription').value=x.description||''; $('patchEnabled').checked=!!x.enabled;
  window.scrollTo({top:0,behavior:'smooth'});
}

$('loginBtn').onclick=async()=>{
  try{
    msg('authMsg','');
    const email=$('email').value.trim(), password=$('password').value;
    if(!email||!password) throw new Error('Preencha e-mail e senha.');
    const d=await auth('token?grant_type=password',{email,password}); saveSession(d); await enterDashboard();
  }catch(e){msg('authMsg',e.message)}
};
$('signupBtn').onclick=async()=>{
  try{
    msg('authMsg','');
    const email=$('email').value.trim(), password=$('password').value;
    if(!email||!password) throw new Error('Preencha e-mail e senha antes de criar a conta.');
    const d=await auth('signup',{email,password});
    if(d.access_token){saveSession(d);await enterDashboard()}else msg('authMsg','Conta criada. Confirme o e-mail e depois entre.',true);
  }catch(e){msg('authMsg',e.message)}
};
$('logoutBtn').onclick=()=>{saveSession(null);location.reload()};
$('bootstrapBtn').onclick=async()=>{try{await api({action:'bootstrap',code:$('bootstrapCode').value.trim()});msg('bootstrapMsg','Administrador ativado.',true);await enterDashboard()}catch(e){msg('bootstrapMsg',e.message)}};

document.querySelectorAll('.tab').forEach(b=>b.onclick=()=>setPanel(b.dataset.panel));
$('globalRefreshBtn').onclick=async()=>{try{await Promise.all([loadOverview(),loadLicenses(),loadAccess(),loadPatches()])}catch(e){alert(e.message)}};
$('refreshBtn').onclick=async()=>{await Promise.all([loadOverview(),loadLicenses()])};
$('refreshPatchesBtn').onclick=async()=>{await Promise.all([loadOverview(),loadPatches()])};
$('search').oninput=renderLicenses;
$('patchSearch').oninput=renderPatches;

$('saveAccessBtn').onclick=async()=>{try{await api({action:'app_access_set',enabled:$('appEnabled').checked,message:$('appMessage').value});msg('accessMsg','Salvo.',true);await Promise.all([loadAccess(),loadOverview()])}catch(e){msg('accessMsg',e.message)}};
$('createBtn').onclick=async()=>{try{msg('createMsg','');const d=await api({action:'create_license',duration_seconds:Number($('duration').value),max_devices:Number($('maxDevices').value),quantity:Number($('quantity').value),note:$('note').value});$('createdKeys').value=(d.created||[]).map(x=>x.license_key).join('\n');msg('createMsg',`${d.created?.length||0} key(s) criada(s).`,true);await Promise.all([loadOverview(),loadLicenses()])}catch(e){msg('createMsg',e.message)}};

$('licenseList').onclick=async(e)=>{
  const b=e.target.closest('button[data-a]'); if(!b)return; const x=licenses.find(v=>v.id===b.dataset.id); if(!x)return;
  try{
    if(b.dataset.a==='copy') return navigator.clipboard.writeText(x.license_key);
    if(b.dataset.a==='toggle') await api({action:'set_status',license_id:x.id,enabled:x.status!=='active'});
    if(b.dataset.a==='day') await api({action:'extend_license',license_id:x.id,seconds:86400});
    if(b.dataset.a==='week') await api({action:'extend_license',license_id:x.id,seconds:604800});
    if(b.dataset.a==='devices'){const n=Number(prompt('Novo limite de aparelhos (1-20):',x.max_devices));if(!Number.isInteger(n)||n<1||n>20)return;await api({action:'set_max_devices',license_id:x.id,max_devices:n});}
    if(b.dataset.a==='reset'){if(!confirm('Resetar os aparelhos desta key?'))return;await api({action:'reset_devices',license_id:x.id});}
    if(b.dataset.a==='delete'){if(!confirm('Excluir esta key definitivamente?'))return;await api({action:'delete_license',license_id:x.id});}
    await Promise.all([loadOverview(),loadLicenses()]);
  }catch(err){alert(err.message)}
};

$('savePatchBtn').onclick=async()=>{
  try{
    msg('patchMsg','');
    const payload={
      name:$('patchName').value,
      category:$('patchCategory').value,
      sort_order:Number($('patchSort').value)||0,
      target_bundle:$('patchBundle').value,
      target_path:$('patchPath').value,
      file_url:$('patchUrl').value,
      description:$('patchDescription').value,
      enabled:$('patchEnabled').checked,
    };
    if(editingPatchID) await api({action:'update_patch',patch_id:editingPatchID,...payload});
    else await api({action:'create_patch',...payload});
    msg('patchMsg',editingPatchID?'Patch atualizado.':'Patch criado.',true);
    resetPatchForm();
    await Promise.all([loadOverview(),loadPatches()]);
  }catch(e){msg('patchMsg',e.message)}
};
$('cancelPatchEditBtn').onclick=resetPatchForm;
$('patchList').onclick=async(e)=>{
  const b=e.target.closest('button[data-patch-a]'); if(!b)return; const x=patches.find(v=>v.id===b.dataset.id); if(!x)return;
  try{
    if(b.dataset.patchA==='edit') return editPatch(x);
    if(b.dataset.patchA==='toggle') await api({action:'update_patch',patch_id:x.id,enabled:!x.enabled});
    if(b.dataset.patchA==='delete'){if(!confirm(`Excluir o patch “${x.name}”?`))return;await api({action:'delete_patch',patch_id:x.id}); if(editingPatchID===x.id)resetPatchForm();}
    await Promise.all([loadOverview(),loadPatches()]);
  }catch(err){alert(err.message)}
};

(async()=>{ if(session?.access_token) await enterDashboard(); })();
