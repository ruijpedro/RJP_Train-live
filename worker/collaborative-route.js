import {validateSample,consensus} from './collaborative.js';
import {withinCorridor} from './corridor.js';
// routes must be supplied by trusted server-side timetable/route mapping.
// Never accept geometry from the reporting client.
export function routeConsensus(samples,routes,now=Date.now()){
 if(!Array.isArray(samples)||!(routes instanceof Map))return [];
 const accepted=samples.filter(s=>validateSample(s,now)&&withinCorridor(s,routes.get(s.operator+'|'+s.train)));
 return consensus(accepted,now).filter(s=>withinCorridor({...s,accuracy:50},routes.get(s.operator+'|'+s.train))).map(s=>({...s,source:'collaborative-experimental',corridorMatched:true,verified:false}));
}
