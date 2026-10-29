import test from 'node:test';
import assert from 'node:assert/strict';
import {clockMinutes,stopEta,trainStopsEta} from '../src/eta.js';
test('hora prevista mais atraso',()=>assert.deepEqual(stopEta({arrival:'17:20'},{delayMinutes:7}),{scheduled:'17:20',eta:'17:27',delay:7,source:'calculado'}));
test('passagem da meia-noite',()=>assert.equal(stopEta({arrival:'23:58'},{delayMinutes:7}).eta,'00:05'));
test('sem atraso conhecido não inventa ETA',()=>assert.equal(stopEta({arrival:'17:20'},{}).eta,null));
test('sem horário não inventa ETA',()=>assert.equal(stopEta({}, {delayMinutes:5}).eta,null));
test('validação de relógio',()=>{assert.equal(clockMinutes('25:20'),null);assert.equal(clockMinutes('17:20:00'),1040)});
test('ETA por estação',()=>assert.equal(trainStopsEta({trainStops:[{station:{designation:'São Martinho do Porto'},arrival:'17:20'}],delayMinutes:7})[0].eta,'17:27'));
