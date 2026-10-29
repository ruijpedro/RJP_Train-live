import test from 'node:test';import assert from 'node:assert/strict';import {activeSchedule,scheduleLabel} from '../src/schedule.js';
const d=new Date('2026-11-15T12:00:00Z');
test('data única corresponde apenas à data escolhida',()=>{assert.equal(activeSchedule({scheduleType:'date',date:'2026-11-15'},d),true);assert.equal(activeSchedule({scheduleType:'date',date:'2026-11-16'},d),false)});
test('dia do mês com e sem ano',()=>{assert.equal(activeSchedule({scheduleType:'monthly',monthDay:15},d),true);assert.equal(activeSchedule({scheduleType:'monthly',monthDay:15,year:2027},d),false)});
test('alertas antigos mantêm dias da semana',()=>{assert.equal(activeSchedule({days:[6]},d),true);assert.equal(activeSchedule({days:[0]},d),false)});
test('rótulo data',()=>assert.equal(scheduleLabel({scheduleType:'date',date:'2026-11-15'}),'Apenas 15/11/2026'));
