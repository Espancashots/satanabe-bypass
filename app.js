const SUPABASE_URL = 'https://nefqzfddxyhswhluslsk.supabase.co';
const PUBLISHABLE_KEY = 'sb_publishable_ZVgYxkCJATt02CJs3GBkoA_VibY79aG';
const ADMIN_API = `${SUPABASE_URL}/functions/v1/admin-api`;

const $ = (id) => document.getElementById(id);
let session = JSON.parse(localStorage.getItem('3105_admin_session') || 'null');
let licenses = [];

function saveSession(next){ session = next; if(next) localStorage.setItem('3105_admin_session', JSON.stringify(next)); else localStorage.removeItem('3105_admin_session'); }
function show(id, yes=true){ $(id).classList.toggle('hidden', !yes); }
function msg(id, value, ok=false){ const el=$(id); el.textContent=value||''; el.style.color=ok?'#78e5b2':'#ff9aa4'; }

async function auth(path, body){
  const res = await fetch(`${SUPABASE_URL}/auth/v1/${path}`, {method:'POST',headers:{'Content-Type':'application/json',apikey:PUBLISHABLE_KEY},body:JSON.stringify(body)});
  const data = await res.json().catch(()=>({}));
  if(!res.ok) throw new Error(data.msg || data.message || data.error_description || 'Falha de autenticação');
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
  if(!session?.access_token) throw new Error('Sessão expirada');
  const res = await fetch(ADMIN_API,{method:'POST',headers:{'Content-Type':'application/json',apikey:PUBLISHABLE_KEY,Authorization:`Bearer ${session.access_token}`},body:JSON.stringify(payload)});
  if(res.status===401 && retry && await refreshSession()) return api(payload,false);
  const data = await res.json().catch(()=>({}));
  if(!res.ok) { const e = new Error(data.error || 'Falha no servidor'); e.status=res.status; throw e; }
  return data;
}

async function enterDashboard(){
  show('authView',false); show('logoutBtn',true);
  try{
    await api({action:'me'});
    show('bootstrapView',false); show('dashboard',true);
    await Promise.all([loadOverview(),loadLicenses(),loadAccess()]);
  }catch(e){
    if(e.status===403){ show('bootstrapView',true); show('dashboard',false); }
    else { saveSession(null); show('authView',true); show('logoutBtn',false); msg('authMsg','Faça login novamente.'); }
  }
}

async function loadOverview(){
  const d=await api({action:'overview'});
  $('mTotal').textContent=d.total_licenses; $('mActive').textContent=d.active_licenses; $('mDevices').textContent=d.devices; $('mValidations').textContent=d.validations;
}
async function loadAccess(){
  const d=await api({action:'app_access_get'}); $('appEnabled').checked=!!d.value?.enabled; $('appMessage').value=d.value?.message||'';
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
    return `<article class="license">
      <div class="license-top"><div><div class="license-key">${escapeHtml(x.license_key)}</div><div class="license-meta"><span>Expira: ${formatDate(x.expires_at)}</span><span>Aparelhos: ${deviceCount}/${x.max_devices}</span>${x.note?`<span>${escapeHtml(x.note)}</span>`:''}</div></div><span class="badge ${x.status}">${x.status==='active'?'ATIVA':'REVOGADA'}</span></div>
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
function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));}

$('loginBtn').onclick=async()=>{ try{ msg('authMsg',''); const d=await auth('token?grant_type=password',{email:$('email').value.trim(),password:$('password').value}); saveSession(d); await enterDashboard(); }catch(e){msg('authMsg',e.message)} };
$('signupBtn').onclick=async()=>{ try{ msg('authMsg',''); const d=await auth('signup',{email:$('email').value.trim(),password:$('password').value}); if(d.access_token){saveSession(d);await enterDashboard()}else msg('authMsg','Conta criada. Confirme o e-mail e depois entre.',true); }catch(e){msg('authMsg',e.message)} };
$('logoutBtn').onclick=()=>{saveSession(null);location.reload()};
$('bootstrapBtn').onclick=async()=>{try{await api({action:'bootstrap',code:$('bootstrapCode').value.trim()});msg('bootstrapMsg','Administrador ativado.',true);await enterDashboard()}catch(e){msg('bootstrapMsg',e.message)}};
$('refreshBtn').onclick=async()=>{await Promise.all([loadOverview(),loadLicenses(),loadAccess()])};
$('search').oninput=renderLicenses;
$('saveAccessBtn').onclick=async()=>{try{await api({action:'app_access_set',enabled:$('appEnabled').checked,message:$('appMessage').value});msg('accessMsg','Salvo.',true)}catch(e){msg('accessMsg',e.message)}};
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

(async()=>{ if(session?.access_token) await enterDashboard(); })();
