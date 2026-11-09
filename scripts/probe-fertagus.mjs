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


// Independent schema inspection: show field names only, not full payloads or secrets.
try {
 const base="https://go.tmlmobilidade.pt/hub/api/v1";
 const orgs=await fetchJson(base+"/organizations");
 const org=(orgs?.data||[]).find(o=>(o.agency_ids||[]).includes("7NTB1"));
 if(org){
  const endpoint=base+"/"+encodeURIComponent(org._id)+"/agencies";
  const data=await fetchJson(endpoint);
  const agency=(data?.data||[]).find(a=>a._id==="7NTB1");
  console.log("Fertagus agency schema:",JSON.stringify({
    organizationId:org._id,
    found:!!agency,
    fields:agency?Object.keys(agency):[],
    services:agency?.services??null,
    openDataServices:agency?.open_data?.services??null,
    openDataKeys:agency?.open_data?Object.keys(agency.open_data):[]
  },null,2));
  const posUrl=base+"/"+encodeURIComponent(org._id)+"/vehicles/positions";
  try {
    const positions=await fetchJson(posUrl);
    const rows=Array.isArray(positions?.data)?positions.data:[];
    console.log("TML positions endpoint:",JSON.stringify({
      http:"ok",records:rows.length,
      fertagusRecords:rows.filter(x=>x.agency_id==="7NTB1").length,
      sampleFields:rows.length?Object.keys(rows[0]):[]
    }));
  }catch(error){console.log("TML positions endpoint error:",String(error?.message||error))}
 }
}catch(error){console.log("Schema inspection error:",String(error?.message||error))}
