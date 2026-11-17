import test from "node:test";
import assert from "node:assert/strict";
import {formFromAlert,makeAlertRule,replaceAlert} from "../src/alert-editor.js";
const legacy={id:"saved123",scope:"combined",target:"6450",station:"Monte Real",
 event:"arrival",lead:5,days:[0,2,4],scheduleType:"weekly",
 notifyBefore:true,notifyOnArrival:true,enabled:true,backendField:"preserved"};
test("edit restores all configured fields without changing saved alert",()=>{
 const first=JSON.stringify(legacy);
 const form=formFromAlert(legacy);
 assert.deepEqual(form.days,[0,2,4]);
 assert.equal(form.station,"Monte Real");
 assert.equal(form.lead,5);
 assert.equal(form.enabled,true);
 form.target="6451";form.lead=15;form.days.push(6);
 assert.equal(JSON.stringify(legacy),first);
});
test("edit keeps ID and unknown fields, changes requested fields",()=>{
 const edit=makeAlertRule({...formFromAlert(legacy),target:"6451",lead:15,
   scheduleType:"date",date:"2026-11-20",enabled:false},{existing:legacy});
 assert.equal(edit.id,"saved123");
 assert.equal(edit.backendField,"preserved");
 assert.equal(edit.target,"6451");
 assert.equal(edit.lead,15);
 assert.equal(edit.enabled,false);
 assert.equal(edit.date,"2026-11-20");
 assert.equal(edit.monthDay,undefined);
 assert.deepEqual(edit.days,[]);
 const first={id:"other",target:"Leiria"},list=[first,legacy];
 const replaced=replaceAlert(list,edit);
 assert.equal(replaced.length,2);
 assert.strictEqual(replaced[0],first);
 assert.strictEqual(replaced[1],edit);
 assert.strictEqual(list[1],legacy);
});
test("older alerts with missing fields can be edited without ID regeneration",()=>{
 const old={id:"old",target:"Leiria",scope:"station",enabled:true};
 const form=formFromAlert(old);
 assert.equal(form.scheduleType,"weekly");
 assert.equal(form.days.length,7);
 const updated=makeAlertRule(form,{existing:old});
 assert.equal(updated.id,"old");
 assert.equal(updated.target,"Leiria");
});
test("new alerts still get unique ID and all existing behavior",()=>{
 const created=makeAlertRule({...formFromAlert(),target:"Leiria",
  scheduleType:"monthly",monthDay:16,monthYear:"2027",notifyOnArrival:true},
  {createId:()=>"new-id"});
 assert.equal(created.id,"new-id");
 assert.equal(created.monthDay,16);
 assert.equal(created.year,2027);
 assert.equal(created.enabled,true);
});
test("invalid editing never changes a saved alert or creates another",()=>{
 const form=formFromAlert(legacy);
 for(const invalid of [
  {...form,lead:-1},{...form,lead:1500},
  {...form,scope:"combined",station:""},
  {...form,scheduleType:"date",date:"2026-02-30"},
  {...form,scheduleType:"weekly",days:[]},
  {...form,notifyBefore:false,notifyOnArrival:false}
 ]){
  assert.throws(()=>makeAlertRule(invalid,{existing:legacy}));
 }
 assert.equal(legacy.lead,5);
 assert.throws(()=>replaceAlert([legacy],{id:"not-found"}),/não encontrado/);
});
test("disabling an existing alert keeps same ID, but does not dispatch local warnings",async()=>{
 const {alertCandidates}=await import("../src/alerts.js");
 const rule=makeAlertRule({...formFromAlert(legacy),enabled:false},{existing:legacy});
 const results=alertCandidates([{trainNumber:6450,
  trainStops:[{station:{designation:"Monte Real"},ETA:"14:00"}]}],
  [rule],new Date("2026-11-17T13:55:00Z"));
 assert.equal(rule.id,legacy.id);
 assert.deepEqual(results,[]);
});
