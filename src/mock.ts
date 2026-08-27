import type { ApiSignalResponse, Intersection } from './types';
export const mockIntersections:Intersection[]=[{id:'MOCK-001',name:'삼성역사거리',latitude:37.50874,longitude:127.06675},{id:'MOCK-002',name:'봉은사역교차로',latitude:37.5142,longitude:127.0602}];
export const mockSignal=():ApiSignalResponse=>({intersectionId:'MOCK-001',intersectionName:'삼성역사거리',approach:'E',signal:{straight:{state:'GREEN',remainingSeconds:23.7},left:{state:'RED',remainingSeconds:38.2}},timestamp:new Date().toISOString()});
