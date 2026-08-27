import type { ApiSignalResponse, ApproachDirection, SignalTiming } from '../types';
export const normalizeSignalDirection=(value:string):ApproachDirection=>{const v=value.trim().toUpperCase().replace(/방향|BOUND/g,'');const map:Record<string,ApproachDirection>={북:'N',NORTH:'N',N:'N',북동:'NE',NORTHEAST:'NE',NE:'NE',동:'E',EAST:'E',E:'E',남동:'SE',SOUTHEAST:'SE',SE:'SE',남:'S',SOUTH:'S',S:'S',남서:'SW',SOUTHWEST:'SW',SW:'SW',서:'W',WEST:'W',W:'W',북서:'NW',NORTHWEST:'NW',NW:'NW'};return map[v]??'UNKNOWN';};
export function getSignalForApproach(rows:ApiSignalResponse[],direction:ApproachDirection):ApiSignalResponse|undefined{return rows.find(r=>r.approach===direction)??rows.find(r=>r.approach==='UNKNOWN')??rows[0];}
export const unknownSignal=():SignalTiming=>({state:'UNKNOWN',remainingSeconds:null});
