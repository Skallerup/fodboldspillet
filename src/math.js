// Matematikopgaver for 0.-10. klasse: plus, minus, gange, divider og brøker.
// Alle svar regnes som brøker (n/d), så 0,5 og 1/2 er det samme svar.

export const OPS = { plus: 'Plus', minus: 'Minus', gange: 'Gange', divider: 'Divider', broek: 'Brøker' };
export const NIVEAUER = { let: -1, mellem: 0, svaer: 1 };

const R = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const pick = (arr) => arr[R(0, arr.length - 1)];
const nz = (a, b) => { let v = 0; while (v === 0) v = R(a, b); return v; };

const gcd = (a, b) => { a = Math.abs(a); b = Math.abs(b); while (b) [a, b] = [b, a % b]; return a || 1; };
export const F = (n, d = 1) => { if (d < 0) { n = -n; d = -d; } const g = gcd(n, d); return { n: n / g, d: d / g }; };
const add = (a, b) => F(a.n * b.d + b.n * a.d, a.d * b.d);
const sub = (a, b) => F(a.n * b.d - b.n * a.d, a.d * b.d);
const mul = (a, b) => F(a.n * b.n, a.d * b.d);
const div = (a, b) => F(a.n * b.d, a.d * b.n);
const dec = (k, p) => F(k, 10 ** p);
export const same = (a, b) => !!a && !!b && a.n === b.n && a.d === b.d;

// ---- visning
function decText(f) {
  const s = (f.n / f.d).toFixed(4).replace(/\.?0+$/, '');
  return s.replace('.', ',').replace('-', '−');
}
const isDecimal = (f) => { let d = f.d; while (d % 2 === 0) d /= 2; while (d % 5 === 0) d /= 5; return d === 1; };

export function text(f, style) {
  if (f.d === 1) return String(f.n).replace('-', '−');
  if (style === 'frac' || !isDecimal(f)) return `${f.n}/${f.d}`.replace('-', '−');
  return decText(f);
}
export function html(f, style) {
  if (f.d === 1 || (style !== 'frac' && isDecimal(f))) return `<span class="num">${text(f, style)}</span>`;
  const sign = f.n < 0 ? '<span class="num">−</span>' : '';
  return `${sign}<span class="frac"><span>${Math.abs(f.n)}</span><span>${f.d}</span></span>`;
}
const DELE = { 2: ['halv', 'halve'], 3: ['tredjedel', 'tredjedele'], 4: ['fjerdedel', 'fjerdedele'], 5: ['femtedel', 'femtedele'],
  6: ['sjettedel', 'sjettedele'], 7: ['syvendedel', 'syvendedele'], 8: ['ottendedel', 'ottendedele'], 9: ['niendedel', 'niendedele'],
  10: ['tiendedel', 'tiendedele'], 12: ['tolvtedel', 'tolvtedele'] };
function say(f, style) {
  const minus = f.n < 0 ? 'minus ' : '';
  const n = Math.abs(f.n);
  if (f.d === 1) return minus + n;
  if (style !== 'frac' && isDecimal(f)) return minus + decText(F(n, f.d)).replace(',', ' komma ');
  const navn = DELE[f.d];
  if (!navn) return `${minus}${n} over ${f.d}`;
  return minus + (n === 1 ? `en ${navn[0]}` : `${n} ${navn[1]}`);
}

// ---- opgavebygger
const SYMBOL = { '+': '+', '-': '−', '*': '·', ':': ':' };
const ORD = { '+': 'plus', '-': 'minus', '*': 'gange', ':': 'divideret med' };

function expr(op, terms, signs, answer, style, near = []) {
  // terms: brøker, signs: regnetegn mellem dem
  const part = (f, i) => (i > 0 && f.n < 0 ? `<span class="num">(</span>${html(f, style)}<span class="num">)</span>` : html(f, style));
  let h = part(terms[0], 0);
  let s = say(terms[0], style);
  for (let i = 1; i < terms.length; i++) {
    h += `<span class="op">${SYMBOL[signs[i - 1]]}</span>${part(terms[i], i)}`;
    s += ` ${ORD[signs[i - 1]]} ${say(terms[i], style)}`;
  }
  return { op, html: h, say: `Hvad er ${s}?`, answer, style, near };
}
function custom(op, h, s, answer, style, near = []) {
  return { op, html: h, say: s, answer, style, near };
}

// ---- plus
function plus(l) {
  let p = 0, t;
  if (l <= -1) t = [R(0, 3), R(1, 2)];
  else if (l === 0) t = [R(1, 5), R(1, 5)];
  else if (l === 1) t = [R(2, 10), R(1, 10)];
  else if (l === 2) t = [R(10, 60), R(2, 39)];
  else if (l === 3) t = [R(100, 600), R(11, 399)];
  else if (l === 4) t = [R(1000, 6000), R(101, 3999)];
  else if (l === 5) { p = 1; t = [R(1, 200), R(1, 200)]; }
  else if (l === 6) { p = 2; t = [R(1, 2000), R(1, 2000)]; }
  else if (l === 7) t = [R(-30, 30), R(-30, -1)];
  else if (l === 8) { p = 1; t = [R(-200, 200), nz(-200, 200)]; }
  else if (l === 9) t = [R(-100, 100), nz(-100, 100), nz(-50, 50)];
  else { p = l >= 11 ? 2 : 1; const m = l >= 11 ? 5000 : 500; t = [R(-m, m), nz(-m, m), nz(-m, m)]; }
  const terms = t.map((k) => dec(k, p));
  return expr('plus', terms, terms.slice(1).map(() => '+'), terms.reduce(add), 'dec');
}

// ---- minus
function minus(l) {
  let p = 0, t;
  const below = (lo, hi, min = 1) => { const a = R(lo, hi); return [a, R(min, a)]; };
  if (l <= -1) t = below(1, 5, 0);
  else if (l === 0) t = below(2, 10);
  else if (l === 1) t = below(5, 20);
  else if (l === 2) t = below(20, 100, 2);
  else if (l === 3) t = below(100, 1000, 11);
  else if (l === 4) t = below(1000, 10000, 101);
  else if (l === 5) { p = 1; t = below(10, 300); }
  else if (l === 6) { p = 2; t = below(100, 3000); }
  else if (l === 7) t = [R(-30, 30), nz(-30, 30)];
  else if (l === 8) { p = 1; t = [R(-200, 200), nz(-200, 200)]; }
  else if (l === 9) t = [R(-100, 100), nz(-100, 100), nz(-50, 50)];
  else { p = l >= 11 ? 2 : 1; const m = l >= 11 ? 5000 : 500; t = [R(-m, m), nz(-m, m), nz(-m, m)]; }
  const terms = t.map((k) => dec(k, p));
  return expr('minus', terms, terms.slice(1).map(() => '-'), terms.reduce(sub), 'dec');
}

// ---- gange
function gange(l) {
  let a, b, c = null;
  const I = (k) => F(k);
  if (l <= -1) [a, b] = [I(2), I(R(1, 3))];
  else if (l === 0) [a, b] = [I(2), I(R(1, 5))];
  else if (l === 1) [a, b] = [I(pick([2, 5, 10])), I(R(1, 5))];
  else if (l === 2) [a, b] = [I(pick([2, 3, 4, 5, 10])), I(R(1, 10))];
  else if (l === 3) [a, b] = [I(R(2, 10)), I(R(2, 10))];
  else if (l === 4) [a, b] = [I(R(11, 99)), I(R(2, 9))];
  else if (l === 5) [a, b] = Math.random() < 0.5 ? [I(R(11, 30)), I(R(11, 20))] : [I(R(2, 99)), I(pick([10, 100, 1000]))];
  else if (l === 6) [a, b] = [dec(R(1, 99), 1), I(R(2, 9))];
  else if (l === 7) { a = I(nz(-12, 12)); b = I(-R(2, 12)); }
  else if (l === 8) {
    if (Math.random() < 0.4) {
      const k = R(11, 20);
      return custom('gange', `<span class="num">${k}</span><sup>2</sup>`, `Hvad er ${k} i anden?`, F(k * k), 'dec',
        [F(k * 2), F(k * k + k), F(k * k - k)]);
    }
    [a, b] = [dec(R(1, 50), 1), dec(R(1, 30), 1)];
  } else if (l === 9) {
    if (Math.random() < 0.4) {
      const k = R(2, 6);
      return custom('gange', `<span class="num">${k}</span><sup>3</sup>`, `Hvad er ${k} i tredje?`, F(k ** 3), 'dec',
        [F(k * 3), F(k * k), F(k ** 3 + k)]);
    }
    [a, b, c] = [I(-R(2, 9)), I(R(2, 9)), I(nz(-5, 5))];
  } else [a, b] = [dec(R(1, 120), 1), dec(nz(-30, 30), 1)];
  if (l <= 6 && Math.random() < 0.5) [a, b] = [b, a];
  const terms = c ? [a, b, c] : [a, b];
  const near = c ? [] : [mul(a, add(b, F(1))), mul(add(a, F(1)), b), add(a, b)];
  return expr('gange', terms, terms.slice(1).map(() => '*'), terms.reduce(mul), 'dec', near);
}

// ---- divider
function halvdelen(op, max) {
  const n = 2 * R(1, max);
  return custom(op, `<span class="word">Halvdelen af</span><span class="num">${n}</span>`, `Hvad er halvdelen af ${n}?`,
    F(n / 2), 'dec', [F(n), F(n / 2 + 1), F(n * 2)]);
}
function divider(l) {
  let q, b;
  const I = (k) => F(k);
  if (l <= -1) return halvdelen('divider', 3);
  if (l === 0) return halvdelen('divider', 5);
  if (l === 1) [q, b] = [I(R(1, 10)), I(2)];
  else if (l === 2) [q, b] = [I(R(1, 10)), I(pick([2, 5, 10]))];
  else if (l === 3) [q, b] = [I(R(1, 10)), I(R(2, 10))];
  else if (l === 4) [q, b] = [I(R(11, 30)), I(R(2, 9))];
  else if (l === 5) [q, b] = Math.random() < 0.6 ? [I(R(20, 150)), I(R(2, 9))] : [I(R(2, 99)), I(pick([10, 100]))];
  else if (l === 6) {
    b = I(pick([2, 4, 5, 10]));
    let a = R(1, 60);
    while (a % b.n === 0) a = R(1, 60);
    q = F(a, b.n);
  } else if (l === 7) { q = I(nz(-12, 12)); b = I(-R(2, 12)); }
  else if (l === 8) [q, b] = [dec(R(1, 99), 1), I(R(2, 9))];
  else if (l === 9) b = pick([F(1, 2), F(1, 4), F(1, 5), F(1, 10)]);
  else [q, b] = [dec(R(1, 99), 1), dec(R(2, 25), 1)];
  if (l === 9) { const a = I(R(1, 30)); return expr('divider', [a, b], [':'], div(a, b), 'dec', [mul(a, b), a]); }
  const a = mul(q, b);
  return expr('divider', [a, b], [':'], q, 'dec', [add(q, F(1)), sub(q, F(1)), b]);
}

// ---- brøker
function afTal(op, f, n) {
  const ans = mul(f, F(n));
  const navn = f.n === 1 && f.d === 2 ? 'halvdelen' : say(f, 'frac');
  return custom(op, `${html(f, 'frac')}<span class="word">af</span><span class="num">${n}</span>`, `Hvad er ${navn} af ${n}?`,
    ans, 'frac', [F(n), F(Math.max(1, Math.round(n / f.d) + 1)), add(ans, F(1)), F(n * f.n)]);
}
function broek(l) {
  if (l <= -1) return halvdelen('broek', 3);
  if (l === 0) return halvdelen('broek', 5);
  if (l === 1) { const d = pick([2, 2, 4]); return afTal('broek', F(1, d), d * R(1, 5)); }
  if (l === 2) { const d = pick([2, 3, 4, 5, 10]); return afTal('broek', F(1, d), d * R(1, 10)); }
  if (l === 3) { const d = pick([3, 4, 5, 6, 8, 10]); return afTal('broek', F(R(2, d - 1), d), d * R(1, 10)); }
  const fr = (maxD, neg = false) => { const d = R(2, maxD); const n = R(1, d - 1); return F(neg && Math.random() < 0.5 ? -n : n, d); };
  if (l === 4) {
    const d = R(3, 10);
    if (Math.random() < 0.5) { const a = R(1, d - 2), c = R(1, d - 1 - a); return broekExpr([F(a, d), F(c, d)], ['+'], d); }
    const a = R(2, d - 1), c = R(1, a - 1);
    return broekExpr([F(a, d), F(c, d)], ['-'], d);
  }
  if (l === 5) {
    const d = pick([2, 3, 4, 5]); const k = pick([2, 3]);
    const a = F(R(1, d - 1), d), c = F(R(1, d * k - 1), d * k);
    return sub(a, c).n >= 0 && Math.random() < 0.5 ? broekExpr([a, c], ['-']) : broekExpr([a, c], ['+']);
  }
  if (l === 6) {
    let a = fr(6), c = fr(6);
    while (a.d === c.d) c = fr(6);
    if (Math.random() < 0.5) { if (sub(a, c).n < 0) [a, c] = [c, a]; return broekExpr([a, c], ['-']); }
    return broekExpr([a, c], ['+']);
  }
  if (l === 7) return Math.random() < 0.6 ? broekExpr([fr(6), fr(6)], ['*']) : broekExpr([F(R(2, 9)), fr(8)], ['*']);
  if (l === 8) return Math.random() < 0.6 ? broekExpr([fr(6), fr(6)], [':']) : broekExpr([fr(8), F(R(2, 6))], [':']);
  if (l === 9) return broekExpr([fr(10, true), fr(10, true)], [pick(['+', '-', '*'])]);
  // 10. klasse og svær: regnearternes rækkefølge
  const [a, b, c] = [fr(8), fr(6), fr(6)];
  const second = pick(['*', ':']);
  const first = pick(['+', '-']);
  const inner = second === '*' ? mul(b, c) : div(b, c);
  const ans = first === '+' ? add(a, inner) : sub(a, inner);
  const q = expr('broek', [a, b, c], [first, second], ans, 'frac');
  q.near = [second === '*' ? mul(first === '+' ? add(a, b) : sub(a, b), c) : div(first === '+' ? add(a, b) : sub(a, b), c)];
  return q;
}
function broekExpr(terms, signs, sameDen) {
  const fn = { '+': add, '-': sub, '*': mul, ':': div }[signs[0]];
  const ans = fn(terms[0], terms[1]);
  const [a, c] = terms;
  const near = [];
  if (signs[0] === '+' || signs[0] === '-') {
    const n = signs[0] === '+' ? a.n + c.n : a.n - c.n;
    near.push(F(n || 1, a.d + c.d));
    if (sameDen) near.push(F(n + 1, sameDen), F(Math.abs(n - 1) || 2, sameDen));
  } else {
    near.push(signs[0] === '*' ? div(a, c) : mul(a, c), F(a.n * c.n || 1, a.d + c.d));
  }
  return expr('broek', terms, signs, ans, 'frac', near);
}

const GEN = { plus, minus, gange, divider, broek };

/** Lav en opgave. regneart: 'blandet', en nøgle fra OPS eller en liste af nøgler (fx ['plus', 'minus']). klasse 0-10, niveau let/mellem/svaer. */
export function lavOpgave(regneart, klasse, niveau) {
  const l = Math.max(-1, Math.min(11, klasse + (NIVEAUER[niveau] ?? 0)));
  const liste = Array.isArray(regneart) ? regneart : regneart === 'blandet' ? Object.keys(OPS) : [regneart];
  const op = pick(liste.length ? liste : Object.keys(OPS));
  const q = GEN[op](l);
  q.negativ = l >= 7;
  return q;
}

/** Fire svarmuligheder (det rigtige svar og tre forkerte), blandet. */
export function svarmuligheder(q) {
  const key = (f) => `${f.n}/${f.d}`;
  const seen = new Set([key(q.answer)]);
  const out = [];
  const ok = (f) => f && f.d !== 0 && Number.isFinite(f.n) && (q.negativ || f.n >= 0) && !seen.has(key(f));
  const push = (f) => { if (out.length < 3 && ok(f)) { seen.add(key(f)); out.push(f); } };
  [...q.near].sort(() => Math.random() - 0.5).forEach((f) => { if (Math.random() < 0.75) push(f); });
  const a = q.answer;
  let guard = 0;
  while (out.length < 3 && guard++ < 200) {
    let c;
    if (a.d === 1) {
      const span = Math.abs(a.n) > 40 ? pick([1, 2, 10, 10, 20]) : pick([1, 1, 2, 3]);
      c = F(a.n + span * pick([-1, 1]));
    } else if (q.style === 'frac') {
      c = pick([F(a.n + 1, a.d), F(a.n - 1 || 1, a.d), F(a.n, a.d + 1), F(a.d, Math.abs(a.n) || 1), F(a.n + 1, a.d + 1), F(a.n + 2, a.d)]);
    } else {
      c = pick([add(a, F(1, a.d)), sub(a, F(1, a.d)), add(a, F(1)), sub(a, F(1)), mul(a, F(10)), div(a, F(10))]);
    }
    push(c);
  }
  let filler = 1;
  while (out.length < 3) push(add(a, F(filler++)));
  return [...out, a].sort(() => Math.random() - 0.5);
}

/** Læs et indtastet svar som brøk. Forstår 12, -3, 3,5, 0.25 og 3/4. */
export function laesSvar(s) {
  s = String(s).replace(/−/g, '-').replace(/\s/g, '');
  let m = s.match(/^(-?\d+)\/(\d+)$/);
  if (m) return Number(m[2]) === 0 ? null : F(Number(m[1]), Number(m[2]));
  m = s.match(/^(-?)(\d+)(?:[.,](\d+))?$/);
  if (!m) return null;
  const decimals = m[3] || '';
  const n = Number(m[2] + decimals) * (m[1] ? -1 : 1);
  return F(n, 10 ** decimals.length);
}
