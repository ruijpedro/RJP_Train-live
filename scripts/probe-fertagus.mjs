import { probeFertagusPositions } from "../src/fertagus-tml.js";
const fetchJson=async url=>{
 const controller=new AbortController();
 const timer=setTimeout(()=>controller.abort(),15000);
 try{
  const res=await fetch(url,{headers:{accept:"application/json"},signal:controller.signal});
  if(!res.ok)throw Error("HTTP "+res.status+" "+url);
  return await res.json();
 }finally{clearTimeout(timer)}
};
try{
 const result=await probeFertagusPositions(fetchJson);
 const summary=result.map(({organizationId,positionsEnabled,status,count,error})=>({organizationId,positionsEnabled,status,count,error}));
 console.log(JSON.stringify({checkedAt:new Date().toISOString(),organizations:summary},null,2));
 if(!result.length)console.log("No Fertagus organization identified. Check TML schema before enabling.");
 if(result.some(x=>x.status==="gps-available"))console.log("Fresh Fertagus GPS found. Manual validation still required.");
}catch(e){console.error("TML diagnostic failed:",e);process.exitCode=1}
