import {roomApi} from '../../../lib/room-api';
export const GET=(r:Request)=>roomApi(r,'read');
export const POST=(r:Request)=>roomApi(r,'join');
