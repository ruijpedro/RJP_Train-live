import test from "node:test";
import assert from "node:assert/strict";
import {serviceTypeCode,serviceTypeLabel} from "../src/sources.js";
for (const [input,code,label] of [
 ["U","U","Urbano"],["Urbanos","U","Urbano"],["R","R","Regional"],["Regional","R","Regional"],
 ["IR","IR","InterRegional"],["Inter-Regional","IR","InterRegional"],
 ["IC","IC","Intercidades"],["Intercidades","IC","Intercidades"],
 ["AP","AP","Alfa Pendular"],["Alfa Pendular","AP","Alfa Pendular"],
 ["P","P","Pendular"],["Pendular","P","Pendular"]
]) test(`service type ${input} → ${code}`,()=>{
 assert.equal(serviceTypeCode(input),code);
 assert.equal(serviceTypeLabel(input),label);
});
test("unknown service has no invented code",()=>assert.equal(serviceTypeCode("unknown"),""));
