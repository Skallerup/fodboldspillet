// Koer: node tests/daily.test.mjs
import { dagens, taelDag, DAG_POINT } from '../src/daily.js';
let fejl = 0;
const set = new Set();
for (let d = 1; d <= 28; d++) {
  const dato = `2026-11-${String(d).padStart(2, '0')}`;
  set.add(dagens({}, dato).u.id);
}
console.log('udfordringer på 28 dage:', [...set].join(', '));
if (set.size < 5) { console.log('FEJL: for lidt variation'); fejl++; }
// klar dagens udfordring og tjek, at præmien kun gives én gang
const p = { point: 0, pointIAlt: 0 };
const { u } = dagens(p);
let klaret = 0;
for (let i = 0; i < u.n + 3; i++) if (taelDag(p, u.id, u.id === 'stribe' ? i + 1 : 1, u.id === 'stribe')) klaret++;
console.log(`i dag: "${u.tekst}" -> klaret ${klaret} gang, point ${p.point}, pakker ${p.pakker}`);
if (klaret !== 1 || p.point !== DAG_POINT || p.pakker !== 1 || !dagens(p).faerdig) { console.log('FEJL: præmie'); fejl++; }
// andre tællere må ikke udløse præmien
const q = { point: 0, pointIAlt: 0 };
const andet = dagens(q).u.id === 'maal' ? 'kampe' : 'maal';
for (let i = 0; i < 50; i++) taelDag(q, andet);
if (q.point !== 0) { console.log('FEJL: forkert tæller gav præmie'); fejl++; }
// ny dag nulstiller
p.dag.dato = '2000-01-01';
if (dagens(p).faerdig || dagens(p).har !== 0) { console.log('FEJL: ny dag nulstiller ikke'); fejl++; }
console.log(fejl ? `${fejl} fejl` : 'dagens udfordring: 0 fejl');
process.exit(fejl ? 1 : 0);
