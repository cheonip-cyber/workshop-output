
const app = document.querySelector('#app');
const status = document.querySelector('#status');
const route = location.pathname.match(/^\/(display|join)\/([A-Z0-9]{5})$/);
const role = route?.[1] || 'admin';
const landing = role === 'admin' && new URLSearchParams(location.search).has('home');
let code = route?.[2] || (!landing && sessionStorage.getItem('court-code')) || '';
let admin = sessionStorage.getItem('court-admin') || '';
const juror = role === 'join' ? (localStorage.getItem('court-juror') || Array.from(crypto.getRandomValues(new Uint8Array(18)),b=>b.toString(16).padStart(2,'0')).join('')) : '';
if (juror) localStorage.setItem('court-juror',juror);
let state, busy=false, signature='', failures=0, sound=false, audio, lastScene='', requestEpoch=0, polling=false;
const esc = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const stage = {lobby:'대기실',voting:'투표 중',closed:'투표 마감',reveal:'판결 공개'};
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
document.body.className = role;
const api = async (suffix='',body,override) => {
  const base=override || '/api/rooms/'+code;
  const headers={};
  if(role==='admin' && admin) headers['x-admin']=admin;
  if(juror) headers['x-juror']=juror;
  if(body!==undefined) headers['Content-Type']='application/json';
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),7000);
  let response;
  try {
    response=await fetch(base+suffix,{method:body===undefined?'GET':'POST',headers,body:body===undefined?undefined:JSON.stringify(body),cache:'no-store',signal:controller.signal});
  } finally {
    clearTimeout(timeout);
  }
  const data=await response.json();
  if(!response.ok) throw Object.assign(new Error(data.error),{status:response.status});
  return data;
};
const emblem = '<svg class="emblem" aria-hidden="true" viewBox="0 0 80 80"><path d="M40 13v48M23 63h34M15 28h50M40 18l-25 10m25-10 25 10M15 28l-10 22h20L15 28Zm50 0L55 50h20L65 28Z" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round"/><circle cx="40" cy="13" r="3" fill="currentColor"/></svg>';
const passLabel = pass => pass === 1 ? '1차 판결' : '재판결 '+(pass-1)+'회';
const brand = '<a class="court-logo" href="/?home=1" aria-label="SM 판단법정 홈">'+emblem+'<strong>SM 판단법정</strong></a>';
let draft = [], dirty = false;
function home() {
  return '<section class="scene lobby court-home">'+brand+'<h1>SM 판단법정</h1><p>안건을 준비하고, 참가 QR을 공유하세요.</p><div class="buttons">'+
    (sessionStorage.getItem('court-code') ? '<a class="btn" href="/">진행 중인 방 열기</a>' : '')+
    '<button class="btn gold" data-action="new">새 방 열기</button></div></section>';
}
function headline(s) {
  return '<span class="eyebrow">ROUND '+String(s.round).padStart(2,'0')+' <b>·</b> '+passLabel(s.pass)+'</span>';
}
function choices(s,enabled) {
  return ['A','B'].map(letter=>{
    const value=esc(s.item[letter.toLowerCase()]);
    const selected=s.choice===letter;
    return enabled
      ? '<button class="choice '+letter.toLowerCase()+(selected?' selected':'')+'" data-action="vote" data-value="'+letter+'" aria-pressed="'+selected+'"><strong>'+letter+'</strong><span>'+value+'</span>'+(selected?'<small>접수 완료 ✓</small>':'')+'</button>'
      : '<div class="choice '+letter.toLowerCase()+'"><strong>'+letter+'</strong><span>'+value+'</span></div>';
  }).join('');
}
function result(s) {
  const {a,b,total}=s.result;
  const ap=total ? Math.round(a*100/total):0;
  const bp=total ? 100-ap:0;
  const leading=a===b?'':a>b?'a':'b';
  const panels=[['a',a,ap],['b',b,bp]].map(([letter,v,p])=>
    '<div class="verdict '+letter+(letter===leading?' leading':'')+'" style="--value:'+p+'%"><div class="fill"></div><strong class="letter">'+letter.toUpperCase()+'</strong><span class="label">'+esc(s.item[letter])+'</span><strong class="percent" data-target="'+p+'">'+p+'%</strong><small>'+v+'표</small></div>').join('');
  return '<div class="results">'+panels+'</div><div class="result-foot">'+(!total?'응답 없음':a===b?'동률':total+'표 접수')+'</div>';
}
function animate(s) {
  if(role!=='display') return;
  const next=[s.round,s.pass,s.phase].join('/');
  if(next===lastScene) return;
  lastScene=next;
  if(reduced.matches) return;
  const scene=app.querySelector('.scene');
  scene?.animate([{opacity:0,transform:'scale(.982)'},{opacity:1,transform:'scale(1)'}],{duration:450,easing:'ease-out'});
  if(s.phase==='voting'){
    const gavel=document.createElement('div');
    gavel.className='gavel';
    gavel.setAttribute('aria-hidden','true');
    gavel.innerHTML='<svg viewBox="0 0 120 100"><path d="M18 88h84M70 52l34 29M36 26l28 24m-40-9 28 24M35 20l31 27-17 21-31-27Z" fill="none" stroke="currentColor" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    scene?.append(gavel);
    setTimeout(()=>gavel.remove(),630);
  }
  if(s.phase!=='reveal') return;
  const digits=[...app.querySelectorAll('[data-target]')];
  if(s.result.total){
    const start=performance.now();
    function frame(t){
      const progress=Math.min(1,(t-start)/850);
      for(const digit of digits) digit.textContent=Math.round(Number(digit.dataset.target)*(1-(1-progress)**3))+'%';
      if(progress<1&&digits[0]?.isConnected) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
    for(let i=0;i<38;i++){
      const sparkle=document.createElement('i');
      sparkle.className='spark';
      sparkle.style.setProperty('--dx',(Math.random()-.5)*95+'vw');
      sparkle.style.setProperty('--dy',(Math.random()-.6)*84+'vh');
      sparkle.style.setProperty('--spin',Math.random()*480+'deg');
      scene?.append(sparkle);
      setTimeout(()=>sparkle.remove(),1300);
    }
  }
}
function audience(s) {
  if(s.phase==='lobby') return '<section class="scene lobby">'+brand+'<h1>SM 판단법정</h1>'+
    (role==='display'?'<div class="qr"><img src="/api/rooms/'+s.code+'/qr" alt="참여 QR"></div><a class="join-address" href="'+esc(s.join)+'">'+esc(s.join)+'</a>':'<span class="stamp">입장 완료</span>')+
    '<div class="live"><i></i> 배심원 '+s.participants+'명</div></section>';
  return '<section class="scene phase-'+s.phase+'">'+headline(s)+'<h1 class="prompt">'+esc(s.item.prompt)+'</h1>'+
    (s.phase==='reveal'?result(s):'<div class="choices">'+choices(s,s.phase==='voting'&&role==='join')+'</div>')+
    (s.phase==='voting'?(role==='display'?'<div class="live"><i></i> '+s.received+' / '+Math.max(s.participants,s.received)+' 접수</div>':'<div class="vote-state">'+(s.choice?s.choice+'안 접수 · 마감 전 변경 가능':'A 또는 B를 선택하세요')+'</div>'):
      s.phase==='closed'?'<div class="stamp">투표 마감</div>':'')+'</section>';
}
function controls(s) {
  const button=(id,title,kind='')=>'<button class="btn '+kind+'" data-action="'+id+'">'+title+'</button>';
  const actions=s.phase==='lobby'?[button('open','투표 시작','gold')]:
    s.phase==='voting'?[button('close','투표 마감','gold')]:
    s.phase==='closed'?[button('reveal','결과 공개','gold')]:
    [button('retry','재판결','gold'),...(s.round<s.items.length?[button('next','다음 안건','gold')]:[])];
  const compare=s.comparison===null?'':'<div class="compare"><strong>직전 판결과 비교</strong><br>직전 A '+s.previous.a+' · B '+s.previous.b+' → 이번 A '+s.result.a+' · B '+s.result.b+'<br>선택 변경 '+s.comparison+'명</div>';
  return '<div class="control-top"><span class="section-kicker">투표 진행</span>'+headline(s)+'<span class="tag">'+stage[s.phase]+'</span></div><h2>'+esc(s.item.prompt)+'</h2>'+
    (s.result?result(s):'<div class="choices">'+choices(s,false)+'</div>')+
    '<div class="live"><i></i> '+s.received+' / '+Math.max(s.participants,s.received)+' 접수</div>'+compare+
    (actions.length?'<div class="buttons round-actions">'+actions.join('')+'</div>':'')+
    (s.phase==='reveal'&&s.round===s.items.length?'<p class="minor">마지막 안건</p>':'');
}
function editAllowed(s) {
  return s.phase === 'lobby' && s.round === 1;
}
function renderEditor() {
  const editor=document.querySelector('#editor');
  const locked=!editAllowed(state);
  editor.innerHTML=draft.map((item,i)=>'<fieldset class="agenda-row"><legend>안건 '+(i+1)+'</legend>'+
    '<label>안건<textarea data-row="'+i+'" data-field="prompt" rows="2" maxlength="220">'+esc(item.prompt)+'</textarea></label>'+
    '<div class="option-fields"><label><b>A</b> 선택지<input data-row="'+i+'" data-field="a" maxlength="100" value="'+esc(item.a)+'"></label>'+
    '<label><b>B</b> 선택지<input data-row="'+i+'" data-field="b" maxlength="100" value="'+esc(item.b)+'"></label></div>'+
    (draft.length>1?'<button class="btn small" type="button" data-action="remove" data-index="'+i+'">안건 삭제</button>':'')+'</fieldset>').join('');
  for(const field of editor.querySelectorAll('textarea,input,button'))field.disabled=locked;
  document.querySelector('[data-action=add]').disabled=locked||draft.length>=50;
  document.querySelector('[data-action=save]').disabled=locked;
  editor.dataset.locked=String(locked);
  updateDraftStatus();
}
function updateDraftStatus() {
  document.querySelector('#edit-status').textContent=!editAllowed(state)?'진행 중인 방의 안건은 잠겨 있습니다.':dirty?'저장되지 않은 변경사항':'저장된 안건 '+state.items.length+'개';
}
function adminShell(s) {
  draft=s.items.map(item=>({...item}));
  dirty=false;
  app.innerHTML='<header class="bar">'+brand+'<div class="buttons"><button class="btn" data-action="sound" aria-pressed="'+sound+'">효과음 '+(sound?'켜짐':'꺼짐')+'</button><button class="btn primary" data-action="display">스크린 열기 ↗</button></div></header>'+
    '<div class="workspace-head"><div><span class="section-kicker">진행자 콘솔</span><h1>판단법정 운영</h1></div><span class="room-code">방 코드 <b>'+s.code+'</b></span></div>'+
    '<div class="console"><div class="main-column"><section class="card" id="control"></section>'+
    '<section class="card agenda"><div class="section-head"><div><span class="section-kicker">준비</span><h2>안건 편집</h2></div><span class="minor" id="edit-status"></span></div><div id="editor"></div><div class="buttons"><button class="btn" data-action="add">＋ 안건 추가</button><button class="btn primary" data-action="save">안건 저장</button></div></section></div>'+
    '<aside class="main-column"><section class="card share"><span class="section-kicker">참가 안내</span><h2>참가 QR</h2><button class="qr qr-button" data-action="qr-open" aria-label="참가 QR 크게 보기"><img src="/api/rooms/'+s.code+'/qr" alt="참가 QR"></button>'+
    '<a id="join-link" class="join-address" target="_blank" rel="noopener"></a><div class="buttons"><button class="btn" data-action="copy">링크 복사</button><button class="btn" data-action="qr-open">QR 확대</button><a class="btn" href="/api/rooms/'+s.code+'/qr" download="SM-Court-'+s.code+'.svg">QR 저장</a></div></section>'+
    '<section class="card"><div id="history"></div></section></aside></div>'+
    '<dialog id="qr-dialog" aria-label="참가 QR"><div class="qr-panel"><div class="section-head"><h2>참가 QR</h2><button class="btn" data-action="qr-close">닫기</button></div><img src="/api/rooms/'+s.code+'/qr" alt="참가 QR"><div class="room-code">방 코드 <b>'+s.code+'</b></div><button class="btn" data-action="copy">참가 링크 복사</button></div></dialog>';
  renderEditor();
}
function paint(s) {
  state=s;
  const current=JSON.stringify(role==='join' && s.phase!=='lobby'
    ? {...s,participants:0,received:0}
    : role==='display' && s.phase==='reveal' ? {...s,participants:0}:s);
  if(current===signature) return;
  signature=current;
  if(role==='admin'){
    if(!s.items){app.innerHTML='<section class="scene lobby">'+brand+'<h1>관리자 세션을 확인해 주세요</h1><button class="btn gold" data-action="new">새 방 열기</button></section>';return;}
    if(!document.querySelector('#control')) adminShell(s);
    const link=document.querySelector('#join-link');
    link.href=s.join;link.textContent=s.join;
    document.querySelector('#control').innerHTML=controls(s);
    document.querySelector('#history').innerHTML=s.history.length?'<h2>판결 기록</h2>'+s.history.slice().reverse().map(r=>'<div class="history"><span>R'+r.round+' · '+passLabel(r.pass)+'</span><strong>A '+r.a+' / B '+r.b+'</strong></div>').join(''):'<h2>판결 기록</h2><p class="minor">결과를 공개하면 여기에 표시됩니다.</p>';
    if(document.querySelector('#editor').dataset.locked!==String(!editAllowed(s))) renderEditor();
    else updateDraftStatus();
  } else {
    const active=document.activeElement?.dataset?.value;
    app.innerHTML=(s.phase==='lobby'?'':'<div class="audience-home">'+brand+'</div>')+audience(s);
    if(active) app.querySelector('[data-value="'+active+'"]')?.focus({preventScroll:true});
    animate(s);
  }
}
function say(message){status.textContent=message;}
async function refresh() {
  if(!code||busy||polling) return;
  polling=true;
  const epoch=requestEpoch;
  try {
    const data=await api();
    if(!busy && epoch===requestEpoch && data.code===code){paint(data);if(failures)say('');failures=0;}
  } catch(error) {
    if(epoch!==requestEpoch) return;
    failures++;
    if(error.status===404) {
      app.innerHTML='<section class="scene lobby">'+brand+'<h1>방이 종료되었습니다</h1>'+(role==='admin'?'<button class="btn gold" data-action="new">새 방 열기</button>':'')+'</section>';
      signature='';
    } else if(failures>=2) say('연결을 다시 확인하는 중');
  } finally {polling=false;}
}
function play() {
  if(!sound||!audio) return;
  const t=audio.currentTime;
  for(const [freq,offset] of [[140,0],[82,.08]]){
    const wave=audio.createOscillator(),gain=audio.createGain();
    wave.frequency.setValueAtTime(freq,t+offset);
    wave.frequency.exponentialRampToValueAtTime(freq/2,t+offset+.18);
    gain.gain.setValueAtTime(.14,t+offset);
    gain.gain.exponentialRampToValueAtTime(.001,t+offset+.25);
    wave.connect(gain);gain.connect(audio.destination);wave.start(t+offset);wave.stop(t+offset+.26);
  }
}
app.addEventListener('input', event=>{
  const field=event.target;
  if(!field.dataset.field)return;
  draft[Number(field.dataset.row)][field.dataset.field]=field.value;
  dirty=true;
  updateDraftStatus();
});
app.addEventListener('click', async event=>{
  const button=event.target.closest('button[data-action]');
  if(!button||busy) return;
  const action=button.dataset.action;
  if(action==='vote' && state?.choice===button.dataset.value) return;
  if(action==='qr-open'){document.querySelector('#qr-dialog').showModal();return;}
  if(action==='qr-close'){document.querySelector('#qr-dialog').close();return;}
  if(action==='add' && editAllowed(state) && draft.length<50){
    draft.push({prompt:'',a:'',b:''});dirty=true;renderEditor();
    document.querySelector('[data-row="'+(draft.length-1)+'"][data-field=prompt]').focus();return;
  }
  if(action==='remove' && editAllowed(state) && draft.length>1){
    draft.splice(Number(button.dataset.index),1);dirty=true;renderEditor();
    document.querySelector('[data-action=add]').focus();return;
  }
  if(action==='open' && dirty){say('수정한 안건을 먼저 저장해 주세요.');return;}
  if(action==='display'){const popup=window.open('/display/'+code,'sm-court-display','popup,width=1280,height=720');if(!popup)say('팝업을 허용해 주세요.');return;}
  if(action==='sound'){
    sound=!sound;
    try { if(sound){audio ||= new AudioContext();await audio.resume();} } catch {sound=false;}
    button.textContent=sound?'효과음 켜짐':'효과음 꺼짐';button.setAttribute('aria-pressed',sound);
    if(sound)play();
    return;
  }
  if(action==='copy'){
    try {await navigator.clipboard.writeText(state.join);say('참가 링크를 복사했습니다.');}
    catch {say('주소를 길게 누르거나 선택해 복사하세요.');}
    return;
  }
  if(action==='new'&&state?.phase==='voting'&&!confirm('현재 방의 투표는 계속 열려 있습니다. 새 방을 열까요?')) return;
  requestEpoch++;busy=true;button.disabled=true;say('');
  const voteButtons=action==='vote'?[...app.querySelectorAll('[data-action=vote]')]:[];
  for(const option of voteButtons) option.disabled=true;
  if(action==='vote') button.setAttribute('aria-busy','true');
  try {
    if(action==='new'){
      const created=await api('',{},'/api/rooms');
      code=created.code;admin=created.key;
      if(landing)history.replaceState(null,'','/');
      sessionStorage.setItem('court-code',code);sessionStorage.setItem('court-admin',admin);
      signature='';app.innerHTML='';paint(await api());
    } else if(action==='save'){
      const items=draft.map(item=>({prompt:item.prompt.trim(),a:item.a.trim(),b:item.b.trim()}));
      const incomplete=items.findIndex(item=>!item.prompt||!item.a||!item.b);
      if(incomplete>=0)throw new Error('안건 '+(incomplete+1)+'의 안건과 A·B 선택지를 모두 입력해 주세요.');
      const saved=await api('/items',{items});
      draft=saved.items.map(item=>({...item}));dirty=false;
      paint(saved);renderEditor();say('안건을 저장했습니다.');
    } else if(action==='vote'){
      const {round,pass}=state;
      const previous=app.querySelector('.vote-state');
      if(previous) previous.textContent='선택을 보내는 중…';
      paint({...await api('/vote',{round,pass,choice:button.dataset.value}),join:state.join});
      navigator.vibrate?.(45);
      if(!reduced.matches) app.querySelector('.selected')?.animate([{transform:'scale(.96)'},{transform:'scale(1.015)'},{transform:'scale(1)'}],{duration:360});
    } else {
      const {round,pass}=state;
      paint({...await api('/control',{round,pass,action}),join:state.join});
      if(action==='reveal')play();
    }
  } catch(error){
    if(action==='vote' && state?.phase==='voting'){
      signature='';paint(state);
      say(error.status ? error.message : '접수 여부를 확인 중입니다. 연결 후 다시 확인해 주세요.');
    } else say(error.message);
  } finally {
    busy=false;button.disabled=false;button.removeAttribute('aria-busy');
    for(const option of voteButtons) option.disabled=false;
    await refresh();
  }
});
if(role==='display'){
  document.addEventListener('keydown',event=>{if(event.key.toLowerCase()==='f'&&!document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(()=>{});});
}
if(!code&&role==='admin') app.innerHTML=home();
else {app.innerHTML='<section class="scene lobby">'+emblem+'<h1>연결 중</h1></section>';refresh();}
setInterval(()=>{if(!document.hidden)refresh();},2000);
document.addEventListener("visibilitychange",()=>{if(!document.hidden)refresh();});

