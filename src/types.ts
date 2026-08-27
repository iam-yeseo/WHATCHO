export type SignalColor = 'GREEN' | 'YELLOW' | 'RED' | 'UNKNOWN';
export type ApproachDirection = 'N'|'NE'|'E'|'SE'|'S'|'SW'|'W'|'NW'|'UNKNOWN';
export interface UserPosition { latitude:number; longitude:number; accuracy:number; speed:number|null; heading:number|null; timestamp:number }
export interface Intersection { id:string; name:string; latitude:number; longitude:number }
export interface SignalTiming { state:SignalColor; remainingSeconds:number|null }
export interface ApiSignalResponse { intersectionId:string; intersectionName?:string; approach?:ApproachDirection; signal:{straight:SignalTiming;left?:SignalTiming}; timestamp:string }
export interface SelectedIntersection extends Intersection { distanceMeters:number; bearing:number; approach:ApproachDirection }
