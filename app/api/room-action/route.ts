import {roomApi} from '../../../lib/room-api';
export async function POST(r:Request){const action=new URL(r.url).searchParams.get('action');if(!['start','guess','finish'].includes(action||''))return Response.json({error:'Неизвестное действие'},{status:400});return roomApi(r,action!);}
