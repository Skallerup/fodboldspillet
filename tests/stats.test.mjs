// Koer: node tests/stats.test.mjs
import { noter, overblik, stat } from '../src/stats.js';
import { lavOpgave } from '../src/math.js';
let fejl = 0;
const tjek = (ok, tekst) => { if (!ok) { console.log('FEJL:', tekst); fejl++; } };
const p = {};
// 20 plus: 18 rigtige med det samme, 2 efter hint. 10 gange: 4 rigtige, 6 forkerte. 3 brøker.
for (let i = 0; i < 20; i++) noter(p, lavOpgave('plus', 2, 'mellem'), i < 18 ? 'foerste' : 'andet', 5, '2026-11-24');
for (let i = 0; i < 10; i++) noter(p, lavOpgave('gange', 3, 'mellem'), i < 4 ? 'foerste' : 'forkert', 12, '2026-11-23');
for (let i = 0; i < 3; i++) noter(p, lavOpgave('broek', 4, 'mellem'), 'foerste', 99999, '2026-11-10');
const o = overblik(p, '2026-11-24');
const r = Object.fromEntries(o.ops.map((x) => [x.op, x]));
tjek(o.n === 33, 'antal opgaver');
tjek(r.plus.foerste === 90 && r.plus.andet === 10 && r.plus.vurdering === 'staerk', 'plus');
tjek(r.gange.foerste === 40 && r.gange.forkert === 60 && r.gange.vurdering === 'oev', 'gange');
tjek(r.broek.vurdering === 'faa' && r.minus.n === 0, 'for få opgaver');
tjek(o.svagest.op === 'gange' && o.staerkest.op === 'plus', 'stærkest og svagest');
tjek(r.broek.sek === 180, 'tid pr. opgave har et loft');
tjek(o.dage.length === 7 && o.dage[6].n === 20 && o.dage[5].n === 10 && o.dage[6].ugedag === 'tir', 'seneste 7 dage');
tjek(o.drillede.length === 6 && o.drillede[0].svar && !/undefined/.test(o.drillede[0].opgave), 'opgaver der drillede');
for (let i = 0; i < 40; i++) noter(p, lavOpgave('minus', 2, 'mellem'), 'forkert', 3, '2026-11-24');
tjek(stat(p).drillede.length === 12, 'listen over drillede opgaver har et loft');
console.log('eksempel:', o.drillede[0].opgave, '=', o.drillede[0].svar);
console.log(fejl ? `${fejl} fejl` : 'statistik: 0 fejl');
process.exit(fejl ? 1 : 0);
