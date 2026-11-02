import test from "node:test";
import assert from "node:assert/strict";
import {reconcileVehicles} from "../src/reconcile.js";
const now=Date.parse("2026-11-02T12:00:00Z");
test("merges matching stable service identity and preserves provenance",()=>{
 const x=reconcileVehicles([
 {operator:"CP",serviceDate:"2026-11-02",serviceId:"4515",source:"Comboios Live",observedAt:"2026-11-02T11:59:00Z",latitude:39,longitude:-8,delayMinutes:2},
 {operator:"CP",serviceDate:"2026-11-02",serviceId:"4515",source:"Já Vou",observedAt:"2026-11-02T11:59:30Z",latitude:40,longitude:-9,delayMinutes:3}
 ],{now});assert.equal(x.length,1);assert.equal(x[0].latitude,40);assert.equal(x[0].longitude,-9);assert.equal(x[0].provenance.delayMinutes.source,"Já Vou");assert.equal(x[0].sources.length,2)
});
test("does not merge unverified service identities",()=>{
 const x=reconcileVehicles([{source:"A",serviceId:"4515"},{source:"B",serviceId:"4515"}],{now});assert.equal(x.length,2)
});
test("does not show stale positions as current",()=>{
 const x=reconcileVehicles([{operator:"CP",serviceDate:"2026-11-02",serviceId:"4515",source:"A",observedAt:"2026-11-02T11:40:00Z",latitude:40,longitude:-8}],{now});assert.equal(x[0].latitude,null);assert.equal(x[0].positionStatus,"unverified")
});
test("keeps coordinates from a single observation",()=>{
 const x=reconcileVehicles([{operator:"CP",serviceDate:"2026-11-02",serviceId:"4515",source:"A",observedAt:"2026-11-02T11:59:00Z",latitude:39,longitude:-8},{operator:"CP",serviceDate:"2026-11-02",serviceId:"4515",source:"B",observedAt:"2026-11-02T11:59:30Z",latitude:999,longitude:999}],{now});assert.equal(x[0].latitude,39);assert.equal(x[0].longitude,-8)
});
