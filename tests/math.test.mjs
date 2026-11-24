// Koer: node tests/math.test.mjs
import { lavOpgave, svarmuligheder, laesSvar, text, same, OPS } from '../src/math.js';
let n = 0, fejl = 0;
const eksempler = {};
for (const op of [...Object.keys(OPS), 'blandet', ['plus', 'minus'], ['gange', 'broek', 'divider']]) {
  for (let klasse = 0; klasse <= 10; klasse++) {
    for (const niveau of ['let', 'mellem', 'svaer']) {
      for (let i = 0; i < 300; i++) {
        const q = lavOpgave(op, klasse, niveau);
        n++;
        const bad = (why) => { fejl++; if (fejl < 15) console.log('FEJL', why, op, klasse, niveau, q.say, JSON.stringify(q.answer)); };
        if (!Number.isFinite(q.answer.n) || !Number.isFinite(q.answer.d) || q.answer.d <= 0) bad('svar');
        if (!q.html || !q.say || /undefined|NaN/.test(q.html + q.say)) bad('tekst');
        const valg = svarmuligheder(q);
        const keys = new Set(valg.map((f) => f.n + '/' + f.d));
        if (valg.length !== 4 || keys.size !== 4) bad('valg');
        if (valg.filter((f) => same(f, q.answer)).length !== 1) bad('rigtigt svar mangler');
        if (!same(laesSvar(text(q.answer, q.style)), q.answer)) bad('indtastning ' + text(q.answer, q.style));
        if (klasse + ({ let: -1, mellem: 0, svaer: 1 })[niveau] < 7 && q.answer.n < 0) bad('negativt svar for tidligt');
        if (klasse <= 3 && niveau !== 'svaer' && q.answer.d !== 1 && !(op === 'broek' || op === 'blandet' || Array.isArray(op))) bad('ikke helt tal');
        if (i === 0 && niveau === 'mellem') (eksempler[op] ||= []).push(`${klasse}: ${q.say} = ${text(q.answer, q.style)}`);
      }
    }
  }
}
for (const [op, l] of Object.entries(eksempler)) console.log('\n' + op + '\n  ' + l.join('\n  '));
console.log(`\n${n} opgaver testet, ${fejl} fejl`);
// kombinerede regnearter må kun give de valgte
const set = new Set();
for (let i = 0; i < 2000; i++) set.add(lavOpgave(['plus', 'minus'], 3, 'mellem').op);
if ([...set].sort().join() !== 'minus,plus') { console.log('FEJL kombination', [...set]); fejl++; }
console.log('plus+minus giver:', [...set].sort().join(' og '));
process.exit(fejl ? 1 : 0);
