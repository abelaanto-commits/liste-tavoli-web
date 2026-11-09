import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.10';

const URL='https://cyjuwuipfazjtkvaibpx.supabase.co';
const KEY='sb_publishable_EJdMDREvMl5kDbMoUjW2Iw_axkQ-h6G';
const supabase=createClient(URL,KEY,{auth:{autoRefreshToken:true,persistSession:true}});
const root=document.getElementById('app'),toastEl=document.getElementById('toast');
const isInviteLanding=/(?:[?#&]type=(invite|recovery|signup|magiclink))/.test(window.location.href);
const s={session:null,me:null,events:[],users:[],assignments:[],tables:[],guests:[],attendance:[],exports:[],eventId:null,page:'dashboard',search:'',tableSearch:'',filterOwner:'all',modal:null,expanded:new Set(),channel:null,poll:null};
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const norm=x=>String(x??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('it').replace(/\s+/g,' ').trim();
const dtime=x=>x?new Date(x).toLocaleString('it-IT',{timeZone:'Europe/Rome',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}):'—';
const current=()=>s.events.find(e=>e.id===s.eventId),admin=()=>s.me?.role==='admin',staff=()=>s.me?.role==='addetto';
const canEdit=()=>admin()|| (s.me?.role==='capogruppo' && current()?.status==='open'&& Date.now()<Date.parse(current()?.deadline));
let toastTimer;
const notice=(message,error=false)=>{clearTimeout(toastTimer);toastEl.textContent=message;toastEl.className='visible'+(error?' error':'');toastTimer=setTimeout(()=>{toastEl.className=''},error?18000:6000)};
const check=(result)=>{if(result?.error)throw new Error(result.error.message);return result?.data};
const icon={dashboard:'◫',tables:'▤',events:'▦',users:'♙',checkins:'✓',exports:'▣',profile:'◯'};
const label={dashboard:'Dashboard',tables:'Liste tavoli',events:'Eventi',users:'Utenti',checkins:'Ingressi',exports:'PDF',profile:'Profilo'};
const routes=()=>admin()?['dashboard','events','users','tables','checkins','exports','profile']:staff()?['checkins','profile']:['dashboard','tables','profile'];
const byId=id=>document.getElementById(id);
function status(e){if(!e)return ''; if(e.status==='draft')return '<span class="badge warn">Bozza</span>'; if(e.status==='closed'||new Date(e.deadline).getTime()<=Date.now())return '<span class="badge danger">Liste chiuse</span>';return '<span class="badge ok">Liste aperte</span>'}
function ntable(t){return s.guests.filter(g=>g.table_id===t.id).length}
function entries(t){return s.guests.filter(g=>g.table_id===t.id).sort((a,b)=>`${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`,'it',{sensitivity:'base'}))}
function ownerName(id){return s.users.find(x=>x.id===id)?.full_name|| (id===s.me?.id?s.me.full_name:'Capogruppo')}
function eventTables(){return s.tables.filter(t=>t.event_id===s.eventId)}
function clearPoll(){if(s.poll){clearInterval(s.poll);s.poll=null;}if(s.channel){supabase.removeChannel(s.channel);s.channel=null;}}
async function start(){try{
 const {data:{session}}=await supabase.auth.getSession();s.session=session;
 if(session)await signedIn();else renderAuth();
 supabase.auth.onAuthStateChange((evt,session)=>{if(session)s.session=session;setTimeout(async()=>{if(evt==='SIGNED_OUT'){clearPoll();s.session=null;s.me=null;renderAuth()} else if(evt==='SIGNED_IN'&&!s.me){s.session=session;await signedIn()}},0)});
}catch(e){root.innerHTML=`<div class="auth-wrap"><div class="card">Impossibile caricare il gestionale. ${esc(e.message)}</div></div>`}}
async function signedIn(){
 try{const {data,error}=await supabase.from('profiles').select('*').eq('id',s.session.user.id).single();if(error||!data||!data.active){await supabase.auth.signOut();throw new Error('Account non abilitato. Contatta l’amministratore.')}s.me=data;s.modal=null;s.page=staff()?'checkins':'dashboard';await refreshAll();if(isInviteLanding)passwordModal(true);}catch(e){notice(e.message,true);renderAuth()}
}
async function refreshAll(){
 try{
 s.events=check(await supabase.from('events').select('*').order('event_date',{ascending:false}))||[];
 if(admin()){
  s.users=check(await supabase.from('profiles').select('*').order('full_name'))||[];
  s.assignments=check(await supabase.from('event_assignments').select('*'))||[];
 }
 if(!s.events.some(e=>e.id===s.eventId))s.eventId=s.events[0]?.id||null;
 await refreshEvent();
 }catch(e){notice(e.message,true);render();}
}
async function refreshEvent(quiet=false){
 try{
 if(!s.eventId){s.tables=[];s.guests=[];s.attendance=[];s.exports=[];render();return}
 s.tables=check(await supabase.from('event_tables').select('*').eq('event_id',s.eventId).order('table_name'))||[];
 s.guests=s.tables.length?check(await supabase.from('guest_entries').select('*').in('table_id',s.tables.map(t=>t.id)))||[]:[];
 if(admin()||staff())s.attendance=check(await supabase.from('attendance').select('*').eq('event_id',s.eventId))||[];
 else s.attendance=[];
 if(admin())s.exports=check(await supabase.from('pdf_exports').select('*').eq('event_id',s.eventId).order('version',{ascending:false}))||[];
 if(!quiet)render();else if(s.page==='checkins')render();
 startRealtime();
 }catch(e){notice(e.message,true);if(!quiet)render()}
}
function startRealtime(){
 clearPoll();if(!s.eventId||!staff()&&!admin())return;
 s.channel=supabase.channel('attendance-'+s.eventId).on('postgres_changes',{event:'*',schema:'public',table:'attendance',filter:`event_id=eq.${s.eventId}`},()=>refreshAttendance()).subscribe();
 s.poll=setInterval(()=>{if(s.page==='checkins')refreshAttendance()},3500);
}
async function refreshAttendance(){if(!s.eventId)return;try{s.attendance=check(await supabase.from('attendance').select('*').eq('event_id',s.eventId))||[];if(s.page==='checkins')render();}catch{}}
function renderAuth(){
 root.innerHTML=`<main class="auth-wrap"><div class="auth-panel"><div class="logo">LT</div><h1>Liste Tavoli.</h1><p>Un unico spazio per capigruppo, amministratore e addetti agli ingressi.</p><div class="card"><h2>Accedi al gestionale</h2><form id="loginform"><div class="field"><label>Email</label><input name="email" type="email" required autocomplete="email"/></div><div class="field"><label>Password</label><input name="password" type="password" required autocomplete="current-password"/></div><button class="btn primary full">Accedi</button></form><p class="muted small" style="margin-bottom:0">Gli account vengono creati dall'amministratore.</p></div><div style="margin-top:18px"><button class="btn outline small" data-action="firstSetup">Prima configurazione amministratore</button></div></div></main>${s.modal||''}`;
}
function shell(body){
 const e=current();const name=s.me.full_name||s.session?.user?.email;
 root.innerHTML=`<div class="app-shell"><aside class="side"><div class="brand"><div class="logo">LT</div> Liste Tavoli</div><nav class="nav">${routes().map(r=>`<button data-action="page" data-page="${r}" class="${s.page===r?'active':''}"><span>${icon[r]}</span> ${label[r]}</button>`).join('')}</nav><div class="sidefoot">${esc(name)}<br><span class="muted">${admin()?'Amministratore':staff()?'Addetto liste':'Capogruppo'}</span><br><button data-action="logout" class="btn small" style="margin-top:9px">Esci</button></div></aside><main class="content"><div class="topbar"><div class="heading"><h1>${label[s.page]}</h1><p>${e?esc(e.title)+' · '+dtime(e.event_date+'T12:00:00'): 'Gestionale eventi privato'}</p></div><select id="eventSelect" class="event-select" aria-label="Seleziona evento">${s.events.length?s.events.map(e=>`<option value="${e.id}" ${e.id===s.eventId?'selected':''}>${esc(e.title)} · ${esc(e.event_date)}</option>`).join(''):'<option value="">Nessun evento</option>'}</select></div>${body}<div class="footer-info">Liste Tavoli · Dati protetti da Supabase · Accesso riservato · Versione 1.7</div></main></div>${s.modal||''}`;
}
function dashboard(){const e=current(),ts=eventTables(),count=s.guests.length,st=s.me.role;
 if(!e)return `<div class="card placeholder">${admin()?'Crea il primo evento nella sezione Eventi.':'Non sei ancora assegnato a un evento. Contatta l’amministratore.'}</div>`;
 const deadline=e.status==='open'&&Date.now()<Date.parse(e.deadline)?'Alle '+dtime(e.deadline):'Scaduta';
 const metrics=[['Tavoli',ts.length],['Invitati',count],['Capigruppo',new Set(ts.map(t=>t.leader_id)).size],['Scadenza',deadline]];
 let summary='';if(admin()){
 const grouped=[...new Set(ts.map(t=>t.leader_id))].map(uid=>({uid,t:ts.filter(t=>t.leader_id===uid)})).sort((a,b)=>ownerName(a.uid).localeCompare(ownerName(b.uid),'it'));
 summary=`<div class="card"><h2>Riepilogo capigruppo</h2><div class="gridtable"><table><thead><tr><th>Capogruppo</th><th class="num">Tavoli</th><th class="num">Invitati</th></tr></thead><tbody>${grouped.map(({uid,t})=>`<tr><td>${esc(ownerName(uid))}</td><td class="num">${t.length}</td><td class="num">${t.reduce((n,x)=>n+ntable(x),0)}</td></tr>`).join('')}<tr><td><strong>Totale</strong></td><td class="num"><strong>${ts.length}</strong></td><td class="num"><strong>${count}</strong></td></tr></tbody></table></div></div>`;
 }else summary=`<div class="notice">Visualizzi solo i tavoli associati al tuo account. Per aggiungere invitati vai in <strong>Liste tavoli</strong>.</div>`;
 return `<div class="flex between">${status(e)}<span class="muted small">Chiusura: ${dtime(e.deadline)}</span></div><div class="metrics">${metrics.map(([title,val])=>`<div class="metric"><span>${title}</span><strong style="font-size:${title==='Scadenza'?'16px':'30px'}">${esc(val)}</strong></div>`).join('')}</div>${summary}<div class="toolbar"><button class="btn primary" data-action="page" data-page="tables">Apri le liste tavoli</button>${admin()?'<button class="btn outline" data-action="generatePdf">Scarica PDF</button>':''}</div>`;
}
function eventsPage(){if(!admin())return '<div class="notice">Accesso riservato all’amministratore.</div>';
 return `<div class="card mb"><div class="card-header"><h2>Eventi</h2><button class="btn primary" data-action="eventAdd">+ Nuovo evento</button></div><div class="gridtable"><table><thead><tr><th>Evento</th><th>Data</th><th>Chiusura liste</th><th>Stato</th><th></th></tr></thead><tbody>${s.events.map(e=>`<tr><td><strong>${esc(e.title)}</strong><div class="tiny muted">${esc(e.venue)}</div></td><td>${esc(e.event_date)}</td><td>${dtime(e.deadline)}</td><td>${status(e)}</td><td><button class="btn small" data-action="eventEdit" data-id="${e.id}">Modifica</button></td></tr>`).join('')}</tbody></table></div></div>`;
}
function usersPage(){if(!admin())return '';
 return `<div class="card"><div class="card-header"><h2>Gestione account</h2><button class="btn primary" data-action="userAdd">+ Nuovo utente</button></div><div class="notice">Puoi creare capigruppo e un massimo di tre addetti alle liste. Assegna gli utenti agli eventi per abilitarli.</div><div class="gridtable"><table><thead><tr><th>Nome</th><th>Ruolo</th><th>Account</th><th>Eventi assegnati</th><th></th></tr></thead><tbody>${s.users.map(u=>`<tr><td><strong>${esc(u.full_name)}</strong><div class="tiny muted">${esc(u.email||'')}</div></td><td>${u.role==='addetto'?'Addetto liste':u.role==='admin'?'Admin':'Capogruppo'}</td><td>${u.active?'<span class="badge ok">Attivo</span>':'<span class="badge danger">Disattivato</span>'}</td><td>${s.assignments.filter(a=>a.user_id===u.id).map(a=>s.events.find(e=>e.id===a.event_id)?.title).filter(Boolean).map(esc).join(', ')||'—'}</td><td><button class="btn small" data-action="userEdit" data-id="${u.id}">Gestisci</button></td></tr>`).join('')}</tbody></table></div></div>`;
}
function tablesPage(){const e=current();if(!e)return '<div class="card placeholder">Nessun evento disponibile.</div>';
 const ts=eventTables().filter(t=>(s.filterOwner==='all'||t.leader_id===s.filterOwner)&&norm(t.table_name+' '+t.reference_name+' '+entries(t).map(g=>g.first_name+' '+g.last_name).join(' ')).includes(norm(s.tableSearch)))
 .sort((a,b)=>a.table_name.localeCompare(b.table_name,'it',{sensitivity:'base'}));
 return `<div class="flex between mb">${status(e)} <span class="muted small">${e.status==='open'?`Modifiche capigruppo fino a ${dtime(e.deadline)}`:'Liste non modificabili dai capigruppo'}</span></div><div class="toolbar"><input id="tableSearch" placeholder="Cerca tavolo, referente o invitato..." value="${esc(s.tableSearch)}"/>${admin()?`<select id="filterOwner" style="max-width:220px"><option value="all">Tutti i capigruppo</option>${s.users.filter(x=>x.role==='capogruppo').map(u=>`<option value="${u.id}" ${s.filterOwner===u.id?'selected':''}>${esc(u.full_name)}</option>`).join('')}</select>`:''}<button class="btn primary" data-action="tableAdd" ${canEdit()?'':'disabled'}>+ Nuovo tavolo</button></div>${!canEdit()?'<div class="alert">La scadenza è passata o l’evento è chiuso. Puoi ancora consultare le liste.</div>':''}<div class="tiny muted mb">${ts.length} tavoli · ${ts.reduce((a,t)=>a+ntable(t),0)} nominativi</div>${ts.length?ts.map(t=>{const expanded=s.expanded.has(t.id),gs=entries(t);return `<div class="table-item"><div class="table-head"><div><h3>TAV. ${esc(t.table_name)}</h3><div class="small muted">REF ${esc(t.reference_name)} · ${gs.length} invitati ${admin()?'· '+esc(ownerName(t.leader_id)):''}</div></div><div class="actions"><button class="btn small" data-action="expand" data-id="${t.id}">${expanded?'Chiudi':'Apri'}</button>${canEdit()?`<button class="btn small" data-action="tableEdit" data-id="${t.id}">Modifica</button><button class="btn danger small" data-action="tableDelete" data-id="${t.id}">Elimina</button>`:''}</div></div>${expanded?`<div class="table-body"><div class="flex between mb"><strong class="small">Nominativi</strong>${canEdit()?`<button class="btn small primary" data-action="guestAdd" data-id="${t.id}">+ Aggiungi nomi</button>`:''}</div><div class="stack">${gs.map(g=>`<div class="flex between"><span class="small">${esc(g.first_name)} ${esc(g.last_name)}</span>${canEdit()?`<div class="actions"><button class="btn small" data-action="guestEdit" data-id="${g.id}">Modifica</button><button class="btn small danger" data-action="guestDelete" data-id="${g.id}">×</button></div>`:''}</div>`).join('')||'<p class="muted small">Nessun nominativo inserito</p>'}</div></div>`:''}</div>`}).join(''):'<div class="card placeholder">Nessun tavolo trovato. Usa “Nuovo tavolo” per iniziare.</div>'}`;
}
function checkinPage(){const e=current();if(!e)return '<div class="card placeholder">Nessun evento assegnato. Chiedi all’amministratore di abilitare questa serata.</div>';
 let list=s.guests.map(g=>{const t=s.tables.find(t=>t.id===g.table_id);return {...g,t}}).filter(g=>g.t);
 if(s.search.trim()){const q=norm(s.search);list=list.filter(g=>norm(g.first_name+' '+g.last_name+' '+g.t.table_name+' '+g.t.reference_name).includes(q));}
 list.sort((a,b)=>a.t.table_name.localeCompare(b.t.table_name,'it',{sensitivity:'base'})||(a.first_name+' '+a.last_name).localeCompare(b.first_name+' '+b.last_name,'it',{sensitivity:'base'}));
 const idKey=(t,g)=>norm(t.table_name)+'|'+norm(g.first_name+' '+g.last_name);
 const checkedSet=new Map(s.attendance.map(a=>[norm(a.table_key)+'|'+norm(a.guest_key),a]));
 const total=s.guests.length,inside=s.attendance.length;
 return `<div class="metrics" style="grid-template-columns:repeat(2,1fr)"><div class="metric"><span>Ingressi registrati</span><strong>${inside}</strong></div><div class="metric"><span>Nominativi nelle liste</span><strong>${total}</strong></div></div><div class="card mb"><label for="entrySearch">Cerca tavolo, nome o cognome</label><input id="entrySearch" value="${esc(s.search)}" placeholder="Es. ALIEN oppure Mario Rossi" autocomplete="off"/><p class="tiny muted">Aggiornamento condiviso ogni pochi secondi. Un nominativo già entrato nello stesso tavolo non può essere spuntato due volte.</p></div><div class="search-results">${list.slice(0,250).map(g=>{const hit=checkedSet.get(idKey(g.t,g)),isIn=Boolean(hit);return `<div class="guest-row ${isIn?'checked':''}"><div><strong>${esc(g.first_name)} ${esc(g.last_name)}</strong><p>TAV. ${esc(g.t.table_name)} · REF ${esc(g.t.reference_name)}</p></div><div class="flex">${isIn?`<span class="badge ok">✓ Entrato ${new Date(hit.checked_in_at).toLocaleTimeString('it-IT',{hour:'2-digit',minute:'2-digit'})}</span>${admin()?`<button class="btn danger small" data-action="undoCheckin" data-id="${hit.id}">Annulla</button>`:''}`:`<button class="btn primary" data-action="checkin" data-id="${g.id}">Segna entrato</button>`}</div></div>`}).join('')||'<div class="card placeholder">Nessun nominativo corrispondente</div>'}</div>${list.length>250?'<p class="muted tiny">Mostrati i primi 250 risultati: restringi la ricerca.</p>':''}`;
}
function exportsPage(){if(!admin())return '';return `<div class="card"><div class="card-header"><h2>PDF della serata</h2><button class="btn primary" data-action="generatePdf" ${current()?'':'disabled'}>Genera e salva PDF</button></div><div class="notice">Il PDF ordina automaticamente tavoli per nome e invitati per nome, poi cognome, nel formato A4 a tre colonne. Il download è immediato. L’invio automatico per email non è ancora configurato.</div><div class="stack">${s.exports.map(x=>`<div class="flex between"><span><strong>Versione ${x.version}</strong> · ${dtime(x.created_at)}</span><button class="btn small" data-action="openPdf" data-path="${esc(x.file_path)}">Apri PDF</button></div>`).join('')||'<p class="muted small">Nessun PDF salvato per questo evento.</p>'}</div></div>`;}
function profilePage(){return `<div class="card"><h2>Il mio account</h2><p><strong>${esc(s.me.full_name)}</strong></p><p class="small muted">${esc(s.session.user.email||'')}</p><p>Ruolo: <span class="badge">${admin()?'Amministratore':staff()?'Addetto liste':'Capogruppo'}</span></p><button class="btn primary" data-action="changePassword">Cambia o imposta password</button> <button class="btn" data-action="logout">Esci dall’account</button></div>`}
function render(){if(!s.me){renderAuth();return}const routesOK=routes();if(!routesOK.includes(s.page))s.page=routesOK[0];const body=({dashboard:dashboard,events:eventsPage,users:usersPage,tables:tablesPage,checkins:checkinPage,exports:exportsPage,profile:profilePage})[s.page]();shell(body)}
const modal=(title,fields,form)=>{s.modal=`<div class="overlay"><div class="dialog"><div class="flex between"><h2>${title}</h2><button class="btn small" data-action="closeModal">✕</button></div><form id="${form}" novalidate>${fields}<div class="alert" id="formError" role="alert" style="display:none;white-space:pre-wrap"></div><div class="dialog-footer"><button class="btn" type="button" data-action="closeModal">Annulla</button><button class="btn primary" type="button" data-action="modalSave">Salva</button></div></form></div></div>`;render();
 const currentForm=document.getElementById(form);
 const saveButton=currentForm?.querySelector('[data-action="modalSave"]');
 if(saveButton)saveButton.addEventListener('click',ev=>{
  ev.preventDefault();ev.stopPropagation();
  if(saveButton.dataset.busy==='1')return;
  saveButton.dataset.busy='1';
  void onForm({target:currentForm,preventDefault:()=>{}}).catch(error=>{
    showFormError(currentForm,error?.message||'Errore durante il salvataggio');
  }).finally(()=>{if(saveButton.isConnected)delete saveButton.dataset.busy;});
 });
};
const field=(label,name,value='',type='text',required=false)=>`<div class="field"><label>${label}</label><input name="${name}" type="${type}" value="${esc(value)}" ${required?'required':''}/></div>`;
const select=(label,name,options,value)=>`<div class="field"><label>${label}</label><select name="${name}">${options.map(([v,t])=>`<option value="${esc(v)}" ${String(v)===String(value)?'selected':''}>${esc(t)}</option>`).join('')}</select></div>`;
function eventModal(e={}){
 const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Rome',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 const dt=e.deadline?new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Rome',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(e.deadline)).replace(' ','T'):today+'T23:30';
 const parts=dt.split('T');
 modal(e.id?'Modifica evento':'Nuovo evento',`<input type="hidden" name="id" value="${esc(e.id||'')}"/>${field('Nome evento','title',e.title||'','text',true)}${field('Locale','venue',e.venue||'')}${field('Data evento','event_date',e.event_date||today,'date',true)}${field('Data chiusura liste','deadline_date',parts[0],'date',true)}${field('Ora chiusura liste','deadline_time',parts[1]||'23:30','time',true)}${field('Email destinataria PDF','admin_email',e.admin_email||'','email')}${select('Stato','status',[['draft','Bozza'],['open','Liste aperte'],['closed','Liste chiuse']],e.status||'open')}`,'eventForm');
}
function tableModal(t={}){const owners=admin()?s.users.filter(u=>u.role==='capogruppo'&&u.active&&s.assignments.some(a=>a.user_id===u.id&&a.event_id===s.eventId)):[];
 modal(t.id?'Modifica tavolo':'Nuovo tavolo',`<input type="hidden" name="id" value="${esc(t.id||'')}"/>${field('Nome tavolo','table_name',t.table_name||'','text',true)}${field('Referente (REF)','reference_name',t.reference_name||s.me.full_name,'text',true)}${admin()?select('Capogruppo responsabile','leader_id',owners.map(u=>[u.id,u.full_name]),t.leader_id||owners[0]?.id):''}${!t.id?`<div class="field"><label>Invitati (facoltativo, uno per riga)</label><textarea name="names" placeholder="Mario Rossi\nLucia Bianchi\nAndrea Verdi"></textarea></div>`:''}`,'tableForm');}
function guestModal(tid,g={}){modal(g.id?'Modifica invitato':'Aggiungi invitati',`<input type="hidden" name="table_id" value="${esc(tid)}"/><input type="hidden" name="id" value="${esc(g.id||'')}"/>${g.id?field('Nome','first_name',g.first_name,'text',true)+field('Cognome','last_name',g.last_name,'text',true):`<div class="field"><label>Nomi e cognomi — uno per riga</label><textarea name="names" required placeholder="Mario Rossi\nLucia Bianchi\nAndrea Verdi"></textarea></div>`}`,'guestForm');}
function userModal(u={}){const assigned=s.assignments.filter(a=>a.user_id===u.id).map(a=>a.event_id);modal(u.id?'Gestisci utente':'Crea account',`<input type="hidden" name="id" value="${esc(u.id||'')}"/>${field('Nome e cognome','full_name',u.full_name||'','text',true)}${u.id?`<div class="notice small">${esc(u.email||'')} — Per cambiare password inserisci una nuova password qui sotto.</div>`:field('Email di accesso','email','','email',true)}${field(u.id?'Nuova password (lascia vuoto per non cambiarla)':'Password iniziale (minimo 10 caratteri)','password','','password',!u.id)}${select('Ruolo','role',[['capogruppo','Capogruppo'],['addetto','Addetto liste']],u.role||'capogruppo')}${u.id?select('Stato account','active',[['true','Attivo'],['false','Disattivato']],String(u.active)):''}<div class="field"><label>Eventi abilitati</label>${s.events.map(e=>`<label style="font-weight:500"><input type="checkbox" name="assigned" value="${e.id}" ${assigned.includes(e.id)||(!u.id&&e.id===s.eventId)?'checked':''} style="width:auto"/> ${esc(e.title)}</label>`).join('')||'<p>Crea prima un evento nella sezione Eventi.</p>'}</div>`,'userForm')}
function passwordModal(firstSetup=false){modal(firstSetup?'Imposta la password di accesso':'Cambia la password',`${firstSetup?'<p class="notice">Il tuo invito è stato riconosciuto. Imposta una password personale per poter accedere normalmente in futuro.</p>':''}${field('Nuova password (almeno 12 caratteri)','password','','password',true)}${field('Ripeti la nuova password','confirm_password','','password',true)}`,'passwordForm');}
function parseNames(text){return [...new Set(text.split(/\r?\n/).map(x=>x.trim().replace(/^[-*•\d).\s]+/,'').replace(/\s+/g,' ')).filter(Boolean))].map(x=>{let a=x.split(' ');return {first_name:a.shift(),last_name:a.join(' ')}}).filter(x=>x.first_name&&x.last_name)}
async function saveNames(tableId,names){if(!names.length)return;const rows=names.map(g=>({...g,table_id:tableId,created_by:s.me.id}));check(await supabase.from('guest_entries').insert(rows));}
async function openPdf(path){const {data,error}=await supabase.storage.from('liste-pdfs').createSignedUrl(path,120);if(error)throw error;window.open(data.signedUrl,'_blank','noopener,noreferrer')}
async function generatePdf(){if(!admin()||!current())return;const allTables=[...s.tables].sort((a,b)=>a.table_name.localeCompare(b.table_name,'it',{sensitivity:'base'}));if(!allTables.length)throw Error('Non ci sono tavoli da esportare.');
 if(!window.jspdf){await new Promise((resolve,reject)=>{const sc=document.createElement('script');sc.src='https://cdn.jsdelivr.net/npm/jspdf@2.5.2/dist/jspdf.umd.min.js';sc.onload=resolve;sc.onerror=reject;document.head.append(sc)})}
 const doc=new window.jspdf.jsPDF({orientation:'portrait',unit:'mm',format:'a4'}),xs=[10,76,142];let col=0,y=12;
 const next=()=>{col++;y=12;if(col>2){doc.addPage();col=0}};
 const line=(text,bold=false)=>{doc.setFont('helvetica',bold?'bold':'normal');doc.setFontSize(bold?8.5:8);const chunks=doc.splitTextToSize(String(text),58);for(const segment of chunks){if(y>285)next();doc.text(segment,xs[col],y);y+=4.05}};
 for(const t of allTables){const names=entries(t);if(y>274)next();line('TAV. '+t.table_name.toUpperCase(),true);line('REF '+t.reference_name.toUpperCase(),true);y+=1.2;
 for(let i=0;i<names.length;i++){if(y>286){next();line('TAV. '+t.table_name.toUpperCase()+' (CONT.)',true)}line(names[i].first_name+' '+names[i].last_name)}y+=4;if(y>282)next();}
 const blob=doc.output('blob'),e=current(),version=Math.max(0,...s.exports.map(x=>x.version))+1,path=`${e.id}/liste-tavoli-v${version}.pdf`;
 const {error}=await supabase.storage.from('liste-pdfs').upload(path,blob,{upsert:false,contentType:'application/pdf'});if(error)throw error;
 check(await supabase.from('pdf_exports').insert({event_id:e.id,file_path:path,version}));doc.save(`Lista_Tavoli_${e.title.replace(/[^a-z0-9]/gi,'_')}_v${version}.pdf`);
 notice('PDF generato, salvato e scaricato');await refreshEvent();
}
async function adminRequest(payload){
 // The current token was already obtained during login. Avoid waiting for another
 // getSession lock from inside a Save click (which previously produced no API call).
 let token=s.session?.access_token;
 if(!token)throw new Error('Sessione amministratore non disponibile. Esci e accedi nuovamente.');
 const deadline=new AbortController();
 const timer=setTimeout(()=>deadline.abort(),18000);
 try{
  let response=await fetch(`${URL}/functions/v1/manage-users`,{
   method:'POST',signal:deadline.signal,
   headers:{'content-type':'application/json',apikey:KEY,authorization:`Bearer ${token}`},
   body:JSON.stringify(payload)
  });
  let result=await response.json().catch(()=>({}));
  if(response.status===401){
   const refreshed=await Promise.race([
     supabase.auth.refreshSession(),
     new Promise((_,reject)=>setTimeout(()=>reject(new Error('Sessione scaduta: rieffettua l’accesso.')),8000))
   ]);
   if(refreshed.error||!refreshed.data?.session)throw new Error('Sessione scaduta: rieffettua l’accesso.');
   s.session=refreshed.data.session;token=s.session.access_token;
   response=await fetch(`${URL}/functions/v1/manage-users`,{
    method:'POST',signal:deadline.signal,
    headers:{'content-type':'application/json',apikey:KEY,authorization:`Bearer ${token}`},
    body:JSON.stringify(payload)
   });
   result=await response.json().catch(()=>({}));
  }
  if(!response.ok||!result.ok)throw new Error(result.error||`Richiesta rifiutata (HTTP ${response.status})`);
  return result;
 }catch(e){
  if(e?.name==='AbortError')throw new Error('Il server non ha risposto. Controlla la rete e riprova.');
  throw e;
 }finally{clearTimeout(timer)}
}
function showFormError(form,message,control){
 const banner=form.querySelector('#formError');
 if(banner){banner.textContent='Salvataggio non riuscito: '+message;banner.style.display='block';banner.scrollIntoView({block:'nearest'});}
 notice(message,true);
 if(control)control.focus({preventScroll:true});
}
async function onForm(ev){const form=ev.target;if(!form.id)return;ev.preventDefault();
 const b=form.querySelector('[data-action=modalSave]')||form.querySelector('[type=submit]');const originalLabel=b?.textContent;
 const formError=form.querySelector('#formError');
 if(formError){formError.style.display='none';formError.textContent='';}
 if(b){b.disabled=true;b.textContent='Verifica dati...';}
 const invalid=[...form.elements].find(c=>c.willValidate&&!c.checkValidity());
 if(invalid){
   const lbl=invalid.closest('.field')?.querySelector('label')?.textContent||invalid.name||'Campo obbligatorio';
   const why=invalid.validity.valueMissing?'è obbligatorio':invalid.validity.typeMismatch?'non è valido':invalid.validity.rangeUnderflow?'è troppo breve':'contiene un valore non valido';
   showFormError(form,lbl+': '+why+'.',invalid);
   if(b){b.disabled=false;b.textContent=originalLabel;}
   return;
 }
 if(form.id==='userForm'){
   const pw=form.elements.namedItem('password')?.value||'';
   const creating=!form.elements.namedItem('id')?.value;
   if((creating||pw)&&pw.length<10){
     showFormError(form,'La password del capogruppo/addetto deve contenere almeno 10 caratteri.',form.elements.namedItem('password'));
     if(b){b.disabled=false;b.textContent=originalLabel;}
     return;
   }
 }
 if(form.id==='setupForm'){
   const pw=form.elements.namedItem('password')?.value||'';
   if(pw.length<12){showFormError(form,'La password amministratore deve contenere almeno 12 caratteri.',form.elements.namedItem('password'));if(b){b.disabled=false;b.textContent=originalLabel;}return;}
 }
 if(b){b.disabled=true;b.textContent='Salvataggio...';}
 try{const fd=new FormData(form),obj=Object.fromEntries(fd.entries());let action=form.id;
 if(action==='loginform'){const {error}=await supabase.auth.signInWithPassword({email:obj.email,password:obj.password});if(error)throw error;return}
 if(action==='setupForm'){
  const r=await fetch(`${URL}/functions/v1/manage-users`,{method:'POST',headers:{'content-type':'application/json',apikey:KEY},body:JSON.stringify({action:'bootstrap',code:obj.code,email:obj.email,password:obj.password,full_name:obj.full_name})});const data=await r.json();if(!r.ok)throw Error(data.error||'Errore attivazione');const {error}=await supabase.auth.signInWithPassword({email:obj.email,password:obj.password});if(error)throw error;notice('Account amministratore attivato');return;
 }
 if(action==='passwordForm'){
   const password=String(obj.password||'');
   if(password.length<12)throw new Error('La nuova password deve contenere almeno 12 caratteri.');
   if(password!==obj.confirm_password)throw new Error('Le due password non coincidono.');
   const {error}=await supabase.auth.updateUser({password});
   if(error)throw error;
   s.modal=null;notice('Password salvata. Ora puoi accedere con email e nuova password.');
   render();
 }
 if(action==='eventForm'){
  if(!admin())throw new Error('Solo un amministratore può salvare eventi.');
  const startDate=String(obj.deadline_date||'');
  const startTime=String(obj.deadline_time||'');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(startDate)||!/^\d{2}:\d{2}$/.test(startTime))throw new Error('Inserisci data e ora di chiusura valide.');
  const enteredDate=new Date(startDate+'T'+startTime+':00');
  if(!Number.isFinite(enteredDate.getTime()))throw new Error('Inserisci una data di chiusura valida.');
  const payload={
   title:String(obj.title||'').trim(),venue:String(obj.venue||'').trim(),
   event_date:obj.event_date,deadline:enteredDate.toISOString(),
   admin_email:obj.admin_email?.trim()||null,status:obj.status
  };
  if(!payload.title)throw new Error('Inserisci il nome dell’evento.');
  // The RLS policy already authorizes admins. Write directly to PostgreSQL via
  // Supabase Data API, eliminating the extra Edge Function and getSession hop.
  const operation=obj.id
    ?supabase.from('events').update(payload).eq('id',obj.id)
    :supabase.from('events').insert(payload);
  const saved=check(await Promise.race([
   operation.select('id').single(),
   new Promise((_,reject)=>setTimeout(()=>reject(new Error('Il salvataggio impiega troppo tempo. Controlla la connessione.')),18000))
  ]));
  if(!saved?.id)throw new Error('Il server non ha confermato il salvataggio.');
  s.eventId=saved.id;s.modal=null;render();
  notice('Evento salvato correttamente');
  await refreshAll();
 }
 if(action==='tableForm'){const payload={table_name:obj.table_name.trim(),reference_name:obj.reference_name.trim()};let id=obj.id;if(id){if(admin())payload.leader_id=obj.leader_id;check(await supabase.from('event_tables').update(payload).eq('id',id))}else{const leader=admin()?obj.leader_id:s.me.id;if(!leader)throw Error('Assegna un capogruppo all’evento prima di creare il tavolo');const row=check(await supabase.from('event_tables').insert({...payload,event_id:s.eventId,leader_id:leader}).select('id').single());id=row.id;await saveNames(id,parseNames(obj.names||''))}s.modal=null;notice('Tavolo salvato');await refreshEvent();}
 if(action==='guestForm'){if(obj.id){check(await supabase.from('guest_entries').update({first_name:obj.first_name.trim(),last_name:obj.last_name.trim()}).eq('id',obj.id))}else{const names=parseNames(obj.names||'');if(!names.length)throw Error('Inserisci almeno un nome e cognome');await saveNames(obj.table_id,names)}s.modal=null;notice('Invitati salvati');s.expanded.add(obj.table_id);await refreshEvent();}
 if(action==='userForm'){
  const payload={action:obj.id?'update_user':'create_user',id:obj.id,email:obj.email,full_name:obj.full_name,role:obj.role,password:obj.password};if(obj.id)payload.active=obj.active==='true';
  const result=await adminRequest(payload);
  const uid=obj.id||result.id;const assigned=fd.getAll('assigned');const existing=s.assignments.filter(a=>a.user_id===uid);for(const a of existing.filter(a=>!assigned.includes(a.event_id)))check(await supabase.from('event_assignments').delete().eq('event_id',a.event_id).eq('user_id',uid));for(const eid of assigned.filter(eid=>!existing.some(a=>a.event_id===eid)))check(await supabase.from('event_assignments').insert({event_id:eid,user_id:uid}));
  s.modal=null;notice(obj.id?'Account aggiornato':'Capogruppo o addetto creato correttamente');await refreshAll();
 }
 }catch(e){const message=e?.message||'Errore durante il salvataggio';showFormError(form,message)}finally{if(b){b.disabled=false;b.textContent=originalLabel;}}
}
async function onClick(ev){const btn=ev.target.closest('[data-action]');if(!btn)return;const a=btn.dataset.action,id=btn.dataset.id;
 try{
 if(a==='modalSave'){const form=btn.closest('form');if(!form)throw Error('Modulo non trovato');await onForm({target:form,preventDefault:()=>{}});return}
 if(a==='page'){s.page=btn.dataset.page;render();return}
 if(a==='logout'){clearPoll();await supabase.auth.signOut();return}
 if(a==='closeModal'){s.modal=null;render();return}
 if(a==='changePassword'){passwordModal();return}
 if(a==='firstSetup'){modal('Attiva il primo amministratore',`${field('Nome e cognome','full_name','','text',true)}${field('Email','email','','email',true)}${field('Password (almeno 12 caratteri)','password','','password',true)}${field('Codice di attivazione iniziale','code','','text',true)}<p class="tiny muted">Il codice di attivazione è monouso e viene consegnato al proprietario del gestionale.</p>`,'setupForm');return}
 if(a==='eventAdd'){eventModal();return}if(a==='eventEdit'){eventModal(s.events.find(e=>e.id===id));return}
 if(a==='tableAdd'){tableModal();return}if(a==='tableEdit'){tableModal(s.tables.find(t=>t.id===id));return}
 if(a==='guestAdd'){guestModal(id);return}if(a==='guestEdit'){const g=s.guests.find(g=>g.id===id);guestModal(g.table_id,g);return}
 if(a==='expand'){s.expanded.has(id)?s.expanded.delete(id):s.expanded.add(id);render();return}
 if(a==='tableDelete'){if(!confirm('Eliminare il tavolo e tutti i suoi nominativi?'))return;check(await supabase.from('event_tables').delete().eq('id',id));notice('Tavolo eliminato');await refreshEvent();return}
 if(a==='guestDelete'){if(!confirm('Eliminare il nominativo?'))return;check(await supabase.from('guest_entries').delete().eq('id',id));notice('Nominativo eliminato');await refreshEvent();return}
 if(a==='userAdd'){userModal();return}if(a==='userEdit'){userModal(s.users.find(u=>u.id===id));return}
 if(a==='checkin'){btn.disabled=true;const result=check(await supabase.rpc('check_in_guest',{p_guest_entry_id:id}));if(result?.ok)notice('Ingresso registrato');else notice('Questa persona risulta già entrata nello stesso tavolo',true);await refreshAttendance();return}
 if(a==='undoCheckin'){if(!confirm('Annullare questa spunta di ingresso?'))return;check(await supabase.from('attendance').delete().eq('id',id));notice('Spunta annullata');await refreshAttendance();return}
 if(a==='generatePdf'){btn.disabled=true;await generatePdf();return}
 if(a==='openPdf'){await openPdf(btn.dataset.path);return}
 }catch(e){notice(e.message,true)}finally{if(btn&&btn.isConnected)btn.disabled=false}
}
root.addEventListener('submit',onForm);root.addEventListener('click',onClick);
root.addEventListener('change',async ev=>{if(ev.target.id==='eventSelect'){s.eventId=ev.target.value;s.expanded.clear();s.search='';await refreshEvent();}if(ev.target.id==='filterOwner'){s.filterOwner=ev.target.value;render()}});
root.addEventListener('input',ev=>{if(ev.target.id==='entrySearch'){const cursor=ev.target.selectionStart;s.search=ev.target.value;render();let el=byId('entrySearch');el?.focus();el?.setSelectionRange(cursor,cursor)}if(ev.target.id==='tableSearch'){const cursor=ev.target.selectionStart;s.tableSearch=ev.target.value;render();let el=byId('tableSearch');el?.focus();el?.setSelectionRange(cursor,cursor)}});
start();