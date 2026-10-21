import test from 'node:test';import assert from 'node:assert/strict';
import {alertCandidates,timeToday} from '../src/alerts.js';
const now=new Date(2026,9,21,17,40,0);
const trains=[{trainNumber:129,delayMinutes:5,trainStops:[{station:{code:'A',designation:'Leiria'},arrival:'17:50',ETA:'17:48',departure:'17:51',ETD:'17:53'}]}];
test('station alert uses ETA and warns 10 minutes ahead',()=>{const r=alertCandidates(trains,[{id:'1',scope:'station',target:'leiria',event:'arrival',lead:10,enabled:true}],now);assert.equal(r.length,1);assert.equal(r[0].time,'17:48')});
test('train departure 10 minutes away is excluded for 5 minute rule',()=>{const r=alertCandidates(trains,[{id:'2',scope:'train',target:'129',event:'departure',lead:5,enabled:true}],now);assert.equal(r.length,0)});
test('invalid times are ignored',()=>assert.equal(timeToday('25:90',now),null));
