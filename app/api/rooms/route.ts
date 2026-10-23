import {roomApi} from '../../../lib/room-api';
export const POST=(r:Request)=>roomApi(r,'create');
