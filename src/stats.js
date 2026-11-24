// Statistik til forældre og lærere: hvordan det går pr. regneart, hvor meget der spilles, og hvilke opgaver der drillede.
// Alt gemmes sammen med spilleren på enheden.
import { OPS, text } from './math.js';

const iDag = () => new Date().toLocaleDateString('sv-SE');   // ÅÅÅÅ-MM-DD i lokal tid
const MAKS_DAGE = 60, MAKS_DRILLEDE = 12, FOR_FAA = 8;

export function stat(p) {
  p.stat ||= { fra: iDag(), ops: {}, dage: {}, drillede: [] };
  return p.stat;
}

/** Notér en færdig opgave. udfald: 'foerste' (rigtigt med det samme), 'andet' (rigtigt efter hint) eller 'forkert'. */
export function noter(p, q, udfald, sek, dato = iDag()) {
  const s = stat(p);
  const tid = Math.round(Math.max(0, Math.min(180, sek || 0)) * 10) / 10;   // en glemt skærm skal ikke tælle som en halv time
  const o = (s.ops[q.op] ||= { n: 0, foerste: 0, andet: 0, forkert: 0, sek: 0 });
  o.n++; o[udfald]++; o.sek = Math.round((o.sek + tid) * 10) / 10;
  const d = (s.dage[dato] ||= { n: 0, rigtige: 0, sek: 0 });
  d.n++; d.sek = Math.round((d.sek + tid) * 10) / 10;
  if (udfald !== 'forkert') d.rigtige++;
  const datoer = Object.keys(s.dage).sort();
  while (datoer.length > MAKS_DAGE) delete s.dage[datoer.shift()];
  if (udfald === 'forkert') {
    s.drillede.unshift({ dato, op: q.op, opgave: q.say.replace(/^Hvad er /, '').replace(/\?$/, ''), svar: text(q.answer, q.style) });
    s.drillede.length = Math.min(s.drillede.length, MAKS_DRILLEDE);
  }
}

/** Tal klar til visning. dage: de seneste 7 dage inkl. i dag. */
export function overblik(p, idag = iDag()) {
  const s = stat(p);
  const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
  const ops = Object.keys(OPS).map((op) => {
    const o = s.ops[op] || { n: 0, foerste: 0, andet: 0, forkert: 0, sek: 0 };
    const foerste = pct(o.foerste, o.n);
    return { op, navn: OPS[op], n: o.n, foerste, andet: pct(o.andet, o.n), forkert: pct(o.forkert, o.n), sek: o.n ? Math.round(o.sek / o.n) : 0,
      vurdering: o.n < FOR_FAA ? 'faa' : foerste >= 85 ? 'staerk' : foerste < 60 ? 'oev' : 'ok' };
  });
  const alle = Object.values(s.ops);
  const n = alle.reduce((a, o) => a + o.n, 0);
  const dage = [];
  for (let i = 6; i >= 0; i--) {
    const t = new Date(`${idag}T12:00:00`);
    t.setDate(t.getDate() - i);
    const dato = t.toLocaleDateString('sv-SE');
    const d = s.dage[dato] || { n: 0, rigtige: 0, sek: 0 };
    dage.push({ dato, ugedag: ['søn', 'man', 'tir', 'ons', 'tor', 'fre', 'lør'][t.getDay()], n: d.n, rigtige: d.rigtige, min: Math.round(d.sek / 60) });
  }
  const vurderet = ops.filter((o) => o.vurdering !== 'faa');
  const svagest = vurderet.length ? vurderet.reduce((a, b) => (b.foerste < a.foerste ? b : a)) : null;
  const staerkest = vurderet.length ? vurderet.reduce((a, b) => (b.foerste > a.foerste ? b : a)) : null;
  return { fra: s.fra, n, foerste: pct(alle.reduce((a, o) => a + o.foerste, 0), n), efterHint: pct(alle.reduce((a, o) => a + o.andet, 0), n),
    minutter: Math.round(alle.reduce((a, o) => a + o.sek, 0) / 60), spilledage: Object.keys(s.dage).length, ops, dage, drillede: s.drillede,
    svagest: svagest && svagest.vurdering === 'oev' ? svagest : null, staerkest: staerkest && staerkest.vurdering === 'staerk' ? staerkest : null };
}
