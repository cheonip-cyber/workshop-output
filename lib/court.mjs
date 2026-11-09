import {randomBytes, randomInt} from 'node:crypto';
import {qrSvg} from './qr.mjs';
const sample = {
  prompt: '사장님이 제안서를 덮으며 “지금은 됐습니다”라고 말했다.',
  a: '지금 거절 이유를 묻는다.',
  b: '다음 접점을 잡고 물러난다.'
};
const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const key = () => randomBytes(24).toString('hex');
const allowedId = /^[a-z0-9-]{16,80}$/i;
const json = (value, status = 200) => Response.json(value, {status, headers:{'Cache-Control':'no-store'}});
const fail = (message, status = 400) => json({error:message}, status);
const tally = votes => {
  let a = 0, b = 0;
  for (const choice of votes.values()) choice === 'A' ? a++ : b++;
  return {a,b,total:a+b};
};
function roomView(room, participant, admin) {
  const ballots = room.votes[room.pass-1];
  const seen = Date.now()-45000;
  const participants = [...room.people.values()].filter(t => t > seen).length;
  const published = room.phase === 'reveal';
  const earlier = room.pass > 1 ? room.votes[room.pass-2] : null;
  const changes = published && earlier ? {ab:0, ba:0} : null;
  if (changes) {
    for (const [id, choice] of ballots) {
      if (earlier.get(id)==='A' && choice==='B') changes.ab++;
      if (earlier.get(id)==='B' && choice==='A') changes.ba++;
    }
  }
  const comparison = changes ? changes.ab+changes.ba : null;
  return {
    code:room.code, phase:room.phase, round:room.index+1, pass:room.pass,
    item: room.phase === 'lobby' && !admin ? null : room.items[room.index],
    participants, received:ballots.size, choice:ballots.get(participant) ?? null,
    result:room.phase === 'reveal' ? tally(ballots) : null,
    comparison, changes,
    liveMatch:room.liveMatch===true,
    live:room.phase==='voting' && room.liveMatch===true ? tally(ballots) : null,
    ...(published && earlier ? {priorResult:tally(earlier), previousChoice:earlier.get(participant) ?? null} : {}),
    ...(admin ? {items:room.items, first:room.pass > 1 ? tally(room.votes[0]) : null, previous:room.pass > 1 ? tally(room.votes[room.pass-2]) : null, history:room.history} : {})
  };
}
function advance(room, action) {
  const phase = room.phase;
  if (action === 'live-on' || action === 'live-off') {
    if (phase !== 'lobby' && phase !== 'voting') return false;
    room.liveMatch = action === 'live-on';
  } else if (action === 'open' && phase === 'lobby') room.phase = 'voting';
  else if (action === 'close' && phase === 'voting') room.phase = 'closed';
  else if (action === 'reveal' && phase === 'closed') {
    room.phase = 'reveal';
    room.history.push({round:room.index+1,pass:room.pass,...tally(room.votes[room.pass-1])});
  } else if (action === 'retry' && phase === 'reveal') {
    room.pass++;
    room.votes[room.pass-1] = new Map();
    room.phase = 'voting';
  } else if (action === 'next' && phase === 'reveal' && room.index+1 < room.items.length) {
    room.index++;
    room.liveMatch = false;
    room.pass = 1;
    room.votes = [new Map(),new Map()];
    room.phase = 'lobby';
  } else return false;
  return true;
}

export function makeHandler(store) {
  async function change(code, work) {
    for (let attempt=0;attempt<10;attempt++) {
      const saved=await store.read(code);
      if(!saved || Date.now()-saved.room.created>43200000) return fail('방을 찾을 수 없습니다.',404);
      const room=saved.room;
      const before=JSON.stringify(encode(room));
      const response=work(room);
      if(response.status>=400) return response;
      const after=JSON.stringify(encode(room));
      if(before===after || await store.write(code,after,saved.tag)) return response;
      await new Promise(resolve=>setTimeout(resolve,25+randomInt(35*(attempt+1))));
    }
    return fail('요청이 몰리고 있습니다. 잠시 후 다시 시도해 주세요.',409);
  }
  return async function handle(request) {
    const url=new URL(request.url);
    const {pathname,origin}=url;
    const method=request.method;
    const participant=request.headers.get('x-juror') ?? '';
    const adminKey=request.headers.get('x-admin') ?? '';
    if(method==='POST' && !request.headers.get('content-type')?.includes('application/json')) return fail('요청 형식이 올바르지 않습니다.',415);
    if(method==='POST' && pathname==='/api/rooms'){
      for(let i=0;i<5;i++){
        const code=Array.from({length:5},()=>alphabet[randomInt(alphabet.length)]).join('');
        const room={code,key:key(),created:Date.now(),phase:'lobby',index:0,pass:1,items:[sample],people:new Map(),votes:[new Map(),new Map()],history:[]};
        if(await store.write(code,JSON.stringify(encode(room)),null))return json({code,key:room.key},201);
      }
      return fail('새 방을 열 수 없습니다. 다시 시도해 주세요.',503);
    }
    const match=pathname.match(/^\/api\/rooms\/([A-Z0-9]{5})(?:\/(vote|control|items|qr))?$/);
    if(!match)return fail('요청을 찾을 수 없습니다.',404);
    const [,code,action]=match;
    const join=origin+'/join/'+code;
    if(method==='GET' && action==='qr'){
      return new Response(qrSvg(join),{headers:{'Content-Type':'image/svg+xml','Cache-Control':'public, max-age=300'}});
    }
    if(method==='GET' && !action){
      return change(code,room=>{
        const now=Date.now();
        const previous=room.people.get(participant);
        if(allowedId.test(participant) && (previous || room.people.size<500) && (!previous || now-previous>25000)){
          room.people.set(participant,now);
        }
        return json({...roomView(room,participant,room.key===adminKey),join});
      });
    }
    if(method!=='POST')return fail('요청을 처리할 수 없습니다.',405);
    let body;
    try{
      const raw=await request.text();
      if(raw.length>64000) return fail('요청이 너무 큽니다.',413);
      body=JSON.parse(raw);
    }catch{return fail('요청 형식이 올바르지 않습니다.');}
    if(!body || typeof body!=='object') return fail('요청 형식이 올바르지 않습니다.');
    return change(code,room=>{
      if(action==='vote'){
        if(!room.people.has(participant))return fail('방에 다시 접속해 주세요.',403);
        if(room.phase!=='voting'||body.round!==room.index+1||body.pass!==room.pass)return fail('현재 투표가 마감되었습니다.',409);
        if(!['A','B'].includes(body.choice))return fail('A 또는 B를 선택해 주세요.');
        room.votes[room.pass-1].set(participant,body.choice);
        room.people.set(participant,Date.now());
        return json({...roomView(room,participant,false),join});
      }
      if(room.key!==adminKey)return fail('관리자 권한이 필요합니다.',403);
      if(action==='control'){
        if(body.round!==room.index+1||body.pass!==room.pass||!advance(room,body.action))return fail('진행 상태가 바뀌었습니다.',409);
      }else if(action==='items'){
        if(room.phase!=='lobby'||room.index!==0)return fail('첫 안건을 열기 전에 저장해 주세요.',409);
        if(!Array.isArray(body.items)||body.items.length<1||body.items.length>50)return fail('안건은 1~50개까지 등록할 수 있습니다.');
        const items=[];
        for(const row of body.items){
          const item={};
          for(const [field,limit] of Object.entries({prompt:220,a:100,b:100})){
            const value=row?.[field];
            if(typeof value!=='string'||!value.trim()||value.trim().length>limit)return fail('안건 220자, 선택지 각 100자 이내로 입력해 주세요.');
            item[field]=value.trim();
          }
          items.push(item);
        }
        room.items=items;
      }else return fail('요청을 찾을 수 없습니다.',404);
      return json({...roomView(room,'',true),join});
    });
  };
}
export const encode=room=>({...room,people:[...room.people],votes:room.votes.map(votes=>[...votes])});
export const decode=room=>({...room,people:new Map(room.people),votes:room.votes.map(votes=>new Map(votes))});
