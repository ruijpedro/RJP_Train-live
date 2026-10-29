import test from 'node:test';
import assert from 'node:assert/strict';
import {minutesUntil,etaProgress} from '../src/eta.js';
test('countdown ETA futuro',()=>assert.equal(minutesUntil('17:27',new Date(2026,9,29,17,12,0)),15));
test('ETA após meia-noite',()=>assert.equal(minutesUntil('00:05',new Date(2026,9,29,23,55,0)),10));
test('não mostra countdown de chegada antiga',()=>assert.equal(minutesUntil('16:00',new Date(2026,9,29,17,0,0)),null));
test('não inventa countdown sem horário',()=>assert.equal(minutesUntil(null,new Date()),null));
test('posição no percurso',()=>assert.deepEqual(etaProgress({lastStation:'Valado',trainStops:[{station:{designation:'Valado'},arrival:'17:00'},{station:{designation:'São Martinho do Porto'},arrival:'17:20'}],delayMinutes:5}).nextIndex,1));
