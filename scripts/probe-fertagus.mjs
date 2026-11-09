// TML independent GPS diagnostic. Read-only; does not publish positions.
const BASE="https://go.tmlmobilidade.pt/hub/api/v1";
const fetchJson=async url=>{
 const c=new AbortController(),t=setTimeout(()=>c.abort(),15000);
 try{const r=await fetch(url,{headers:{accept:"application/json"},signal:c.signal});if(!r.ok)throw Error("HTTP "+r.status);return await r.json()}finally{clearTimeout(t)}
};
const asRows=x=>Array.isArray(x?.data)?x.data:Array.isArray(x)?x:[];
const output={checkedAt:new Date().toISOString(),agencyId:"7NTB1",organizations:[],agency:null,probes:[]};
try{
 const [organizations,agencies]=await Promise.all([fetchJson(BASE+"/organizations"),fetchJson(BASE+"/agencies")]);
 output.organizations=asRows(organizations).filter(o=>(o.agency_ids||[]).includes("7NTB1")).map(o=>({id:o._id,fields:Object.keys(o)}));
 const agency=asRows(agencies).find(a=>a._id==="7NTB1");
 output.agency=agency?{fields:Object.keys(agency),services:agency.services??null,openDataServices:agency.open_data?.services??null}:null;
 for(const org of output.organizations){
  const url=BASE+"/"+encodeURIComponent(org.id)+"/vehicles/positions";
  try{
   const payload=await fetchJson(url),rows=asRows(payload);
   const ft=rows.filter(v=>v.agency_id==="7NTB1");
   output.probes.push({organizationId:org.id,status:"ok",totalRecords:rows.length,fertagusRecords:ft.length,sampleFields:rows[0]?Object.keys(rows[0]):[],fertagusSampleFields:ft[0]?Object.keys(ft[0]):[]});
  }catch(e){output.probes.push({organizationId:org.id,status:"error",error:String(e?.message||e)})}
 }
 console.log(JSON.stringify(output,null,2));
 if(!output.organizations.length)process.exitCode=2;
}catch(e){console.error("TML discovery failed:",String(e?.message||e));process.exitCode=1}
