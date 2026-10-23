import test from 'node:test';import assert from 'node:assert/strict';
import {alertCandidates,timeToday} from '../src/alerts.js';
const now=new Date(2026,9,21,17,40,0);
const trains=[{trainNumber:129,delayMinutes:5,trainStops:[{station:{code:'A',designation:'Leiria'},arrival:'17:50',ETA:'17:48',departure:'17:51',ETD:'17:53'}]}];
test('station alert uses ETA and warns 10 minutes ahead',()=>{const r=alertCandidates(trains,[{id:'1',scope:'station',target:'leiria',event:'arrival',lead:10,enabled:true}],now);assert.equal(r.length,1);assert.equal(r[0].time,'17:48')});
test('train departure 10 minutes away is excluded for 5 minute rule',()=>{const r=alertCandidates(trains,[{id:'2',scope:'train',target:'129',event:'departure',lead:5,enabled:true}],now);assert.equal(r.length,0)});
test('invalid times are ignored',()=>assert.equal(timeToday('25:90',now),null));

test('combined alert only matches the selected train at the selected station',()=>{
 const now=new Date(2026,9,23,15,0,0);
 const trains=[{trainNumber:6450,trainStops:[{station:{designation:'Monte Real'},ETA:'15:10'},{station:{designation:'Leiria'},ETA:'15:10'}]},{trainNumber:805,trainStops:[{station:{designation:'Monte Real'},ETA:'15:10'}]}];
 const rule=[{id:'combined-test',scope:'combined',target:'6450',station:'Monte Real',event:'arrival',lead:10,enabled:true}];
 const candidates=alertCandidates(trains,rule,now);
 assert.equal(candidates.length,1);
 assert.equal(candidates[0].station,'Monte Real');
 assert.equal(candidates[0].train,'6450');
});
