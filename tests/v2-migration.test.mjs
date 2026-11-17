import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {adaptTrain,fetchIndependentTrains} from "../src/v2/independent-feed.js";
const t={number:"800",origin:"Coimbra-B",destination:"Caldas da Rainha",type:"IR",
 stops:[{id:"111",name:"Coimbra-B",departure:"09:00:00",location:[40.2,-8.4]},
 {id:"222",name:"Caldas da Rainha",arrival:"11:00:00",location:[39.4,-9.1]}]};
test("GTFS estimates never claim GPS or invented ETA",()=>{
 const v=adaptTrain({number:"800",type:"IR",latitude:40.0,longitude:-8.5,level:"timetable"},t);
 assert.equal(v.isGps,false);
 assert.equal(v.positionKind,"timetable-estimated");
 assert.equal(v.trainStops[0].ETA,null);
 assert.equal(v.delayMinutes,null);
});
test("TML coordinates map to operator-reported GPS and retain original train type",()=>{
 const v=adaptTrain({trainNumber:"800",type:"IR",position:{latitude:39.9,longitude:-8.9}},t,{gps:true});
 assert.equal(v.positionKind,"operator-gps");
 assert.equal(v.type,"IR");
 assert.match(v.source,/TML/);
});
test("invalid location is rejected",()=>assert.equal(adaptTrain({latitude:NaN,longitude:0}),null));
test("unavailable independent source throws, enabling the unchanged fallback",async()=>{
 await assert.rejects(fetchIndependentTrains({now:Date.parse("2026-11-17T10:00:00Z"),
 transport:async()=>{throw Error("offline")},sampleCP:false}),/offline/);
});

test("unmatched TML vehicle IDs cannot be represented as validated train GPS numbers",()=>{
 const src=readFileSync(new URL("../src/v2/independent-feed.js",import.meta.url),"utf8");
 assert.match(src,/v\.match\?\.validated/);
 assert.match(src,/cpGpsIdentified\.map/);
});
