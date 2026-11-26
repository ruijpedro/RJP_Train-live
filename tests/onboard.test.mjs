import test from 'node:test';
import assert from 'node:assert/strict';
import {onboardTrainId,onboardStops,onboardProgress,onboardArrivalMinutes,gpsSpeedKmh,validOnboardPosition} from '../src/onboard.js';

const train={
  trainNumber:'6450',lastStation:'Leiria',delayMinutes:5,
  trainStops:[
    {station:{code:'LRA',designation:'Leiria'},arrival:'14:00'},
    {station:{code:'MRE',designation:'Monte Real'},arrival:'14:20'},
    {station:{code:'LRL',designation:'Louriçal'},arrival:'14:45'}
  ]
};
test('A bordo: railway train ID is stable and separated from FT',()=>{
  assert.equal(onboardTrainId(train),'CP:6450');
  assert.equal(onboardTrainId({type:'FT',vehicleId:'123'}),'FT:123');
  assert.equal(onboardTrainId(null),'');
});
test('A bordo: stations and schedule are presentation-only',()=>{
  assert.deepEqual(onboardStops(train).map(s=>s.station),['Leiria','Monte Real','Louriçal']);
  assert.equal(onboardStops(train)[1].eta,'14:25');
  assert.deepEqual(onboardStops({}),[]);
});
test('A bordo: progress based only on last confirmed station, no fabricated GPS',()=>{
  assert.deepEqual(onboardProgress(train),{lastIndex:0,total:3,percent:33,next:'Monte Real'});
  assert.equal(onboardProgress({trainStops:[]}).percent,null);
});
test('A bordo: destination countdown handles estimated arrivals',()=>{
  assert.equal(onboardArrivalMinutes('Monte Real',train,new Date(2026,10,26,14,20,0)),5);
  assert.equal(onboardArrivalMinutes('Indisponível',train,new Date(2026,10,26,14,20,0)),null);
});
test('A bordo: speed conversion and location validation',()=>{
  assert.equal(gpsSpeedKmh(20),72);
  assert.equal(gpsSpeedKmh(null),null);
  assert.equal(gpsSpeedKmh(-1),null);
  assert.equal(validOnboardPosition({latitude:39.7,longitude:-8.8}),true);
  assert.equal(validOnboardPosition({latitude:999,longitude:-8.8}),false);
  assert.equal(validOnboardPosition(null),false);
});
