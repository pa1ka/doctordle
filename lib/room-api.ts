import {env} from 'cloudflare:workers';
import {CASES} from '../game/data.js';
import {createGame,makeGuess,getCase} from '../game/engine.js';
const json=(v:unknown,status=200)=>Response.json(v,{status,headers:{'Cache-Control':'no-store'}});
const hash=async(s:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s))),b=>b.toString(16).padStart(2,'0')).join('');
const token=(r:Request)=>r.headers.get('Authorization')?.replace(/^Bearer /,'')||'';
export async function roomApi(req:Request,action:string){
 try{
 if(req.method==='POST' && req.headers.get('Origin') && req.headers.get('Origin')!==new URL(req.url).origin)return json({error:'Недопустимый источник запроса'},403);
 const secret=token(req);if(!/^[a-f0-9]{64}$/.test(secret))return json({error:'Необходим ключ участника'},401);
 const who=await hash(secret),db=env.DB!;if(!db)return json({error:'Хранилище комнат недоступно'},503);
 if(Number(req.headers.get('Content-Length')||0)>8192)return json({error:'Слишком большой запрос'},413);
 const body=req.method==='POST'?await req.json() as any:{};
 const roomId=new URL(req.url).searchParams.get('id')||body.id;
 if(action==='create'){
 const c=CASES.find((c:any)=>c.id===body.caseId);if(!c)return json({error:'Неизвестный случай'},400);
 const name=String(body.name||'').trim().slice(0,40);if(!name)return json({error:'Укажите имя'},400);
 const id=crypto.randomUUID();
 await db.batch([db.prepare('INSERT INTO rooms (id,case_id,host_hash,created_at) VALUES (?,?,?,?)').bind(id,c.id,who,Date.now()),db.prepare('INSERT INTO room_members (room_id,token_hash,name,game) VALUES (?,?,?,?)').bind(id,who,name,JSON.stringify(createGame(c.id)))]);
 return json({id});
 }
 if(typeof roomId!=='string'||roomId.length>50)return json({error:'Комната не найдена'},404);
 const room=await db.prepare('SELECT * FROM rooms WHERE id=?').bind(roomId).first<any>();
 if(!room)return json({error:'Комната не найдена'},404);
 if(Date.now()-room.created_at>7*86400000)return json({error:'Срок комнаты истёк (7 дней)'},410);
 let member=await db.prepare('SELECT * FROM room_members WHERE room_id=? AND token_hash=?').bind(roomId,who).first<any>();
 if(action==='join'&&!member){
 const name=String(body.name||'').trim().slice(0,40);if(!name)return json({error:'Укажите имя'},400);
 const insert=await db.prepare('INSERT INTO room_members (room_id,token_hash,name,game) SELECT ?,?,?,? WHERE EXISTS (SELECT 1 FROM rooms WHERE id=? AND started=0) AND (SELECT COUNT(*) FROM room_members WHERE room_id=?)<12').bind(roomId,who,name,JSON.stringify(createGame(room.case_id)),roomId,roomId).run();
 if(!insert.meta.changes)return json({error:'Игра уже началась или комната заполнена'},409);
 member=await db.prepare('SELECT * FROM room_members WHERE room_id=? AND token_hash=?').bind(roomId,who).first<any>();
 }
 if(!member)return json({join:true,started:!!room.started});
 if(action==='start'){
 if(who!==room.host_hash)return json({error:'Начать может только создатель'},403);
 const count=await db.prepare('SELECT COUNT(*) AS n FROM room_members WHERE room_id=?').bind(roomId).first<any>();
 if(count.n<2)return json({error:'Нужно минимум два участника'},400);
 await db.prepare('UPDATE rooms SET started=1 WHERE id=?').bind(roomId).run();room.started=1;
 }
 if(action==='guess'||action==='finish'){
 if(!room.started)return json({error:'Дождитесь начала'},409);
 let g=JSON.parse(member.game);
 if(g.status!=='playing')return json({error:'Игра уже завершена'},409);
 if(body.turn!==g.guesses.length)return json({error:'Состояние обновилось. Повторите после обновления.'},409);
 if(action==='finish')g={...g,status:'lost'};
 else {const result=makeGuess(g,body.diagnosis,body.confidence);if(result.error)return json({error:result.error},400);g=result.game;}
 const update=await db.prepare('UPDATE room_members SET game=? WHERE room_id=? AND token_hash=? AND game=?').bind(JSON.stringify(g),roomId,who,member.game).run();
 if(!update.meta.changes)return json({error:'Ответ уже обработан. Обновите комнату.'},409);
 member.game=JSON.stringify(g);
 }
 const members=(await db.prepare('SELECT token_hash,name,game FROM room_members WHERE room_id=? ORDER BY rowid').bind(roomId).all<any>()).results;
 const completed=!!room.started && members.every((m:any)=>JSON.parse(m.game).status!=='playing');
 return json({id:room.id,started:!!room.started,isHost:who===room.host_hash,caseId:room.case_id,game:JSON.parse(member.game),completed,members:members.map((m:any)=>({name:m.name,self:m.token_hash===who,finished:JSON.parse(m.game).status!=='playing',...(completed?{game:JSON.parse(m.game)}:{})})),...(completed?{answer:getCase(room.case_id).diagnosis}:{})});
 }catch(e){console.error('Room API failure',e);return json({error:'Не удалось обработать запрос. Попробуйте ещё раз.'},500);}
}
