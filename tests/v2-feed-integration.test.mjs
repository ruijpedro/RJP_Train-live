import test from "node:test";
import assert from "node:assert/strict";
import {fetchIndependentTrains} from "../src/v2/independent-feed.js";
const now=Date.parse("2026-11-17T10:30:00Z");
const date="2026-11-17";
const trip={id:"t-800-1",number:"800",type:"IR",origin:"Coimbra-B",destination:"Caldas da Rainha",
 stops:[
  {id:"s1",name:"Coimbra-B",departure:"10:00:00",arrival:"10:00:00",location:[40.2,-8.4]},
  {id:"s2",name:"Caldas da Rainha",departure:"11:00:00",arrival:"11:00:00",location:[39.4,-9.1]}
 ]};
function transportFor(positions){
 return async(url)=>{
  if(url.endsWith("manifest.json"))return {
   days:[{date,file:date+".json",trains:1}],generatedAt:new Date(now).toISOString(),
   realtime:false,gps:false};
  if(url.endsWith(date+".json"))return {date,trains:[trip],realtime:false,gps:false};
  if(url.includes("vehicles/positions"))return positions;
  throw Error("Unexpected fetch URL "+url);
 };
}
test("independent feed gives a clearly labelled map prediction, not false GPS",async()=>{
 const feed=await fetchIndependentTrains({now,transport:transportFor([]),sampleCP:false});
 assert.equal(feed.gpsCount,0);
 assert.equal(feed.trains.length,1);
 assert.equal(feed.trains[0].trainNumber,"800");
 assert.equal(feed.trains[0].positionKind,"timetable-estimated");
 assert.equal(feed.trains[0].isGps,false);
 assert.equal(feed.trains[0].trainStops[1].ETA,null);
 assert.equal(feed.alertEligible.length,0);
});
test("TML vehicle with verified GTFS trip gets precedence over simulated position",async()=>{
 const follow=now+20*60*1000;
 const data=[{agency_id:"N18KL",vehicle_id:"vehicle-not-a-train-number",
  trip_id:"t-800-1",latitude:39.98,longitude:-8.71,received_at:follow/1000,
  route_short_name:"IR"}];
 const transport=async url=>{
  if(url.endsWith("manifest.json"))return {days:[{date,file:date+".json",trains:1}],
   generatedAt:new Date(follow).toISOString(),realtime:false,gps:false};
  if(url.endsWith(date+".json"))return {date,trains:[trip],realtime:false,gps:false};
  if(url.includes("vehicles/positions"))return data;
  throw Error(url);
 };
 const feed=await fetchIndependentTrains({now:follow,transport,sampleCP:false});
 assert.equal(feed.gpsCount,1);
 assert.equal(feed.trains.length,1);
 assert.equal(feed.trains[0].trainNumber,"800");
 assert.equal(feed.trains[0].positionKind,"operator-gps");
 assert.equal(feed.trains[0].latitude,39.98);
});
