// Spillets forløb og skærmbilleder: spillere, omklædningsrum, kamp, finale, resultat og topscore.
import { World, FIGURER } from './world.js';
import * as db from './storage.js';
import { lavOpgave, svarmuligheder, laesSvar, text as fTekst, html as fHtml, same, OPS } from './math.js';
import { lyd, setLyd, sig, stopTale } from './audio.js';
import { TRIN, VALG, udstyr, koebTrin, koebTing, brugTing } from './shop.js';

const ui = document.getElementById('ui');
const stage = document.getElementById('stage');
const world = new World(stage);
const OPGAVER = 10, MAAL_POINT = 25, PERFEKT_BONUS = 30;
const FARVER = ['#D81E2C', '#1E5BD8', '#F5C400', '#159A48', '#F07818', '#7A2FD0', '#35B6F0', '#15171C', '#F4F4F0'];
const HOLDNAVNE = ['FC Lynet', 'Tordenstøvlerne', 'Regnehajerne', 'Gangeløverne', 'Brøkbanden', 'Plus United', 'Minus Mestrene',
  'FC Hattrick', 'Talmagikerne', 'Stolpe Ind FC', 'Dribleholdet', 'Sparkemaskinerne'];
const KAMPRAAB = ['Kom så!', 'Vi giver aldrig op!', 'Fuld fart frem!', 'Regn den ud!', 'Stolpe ind!'];
const NIVEAU_NAVN = { let: 'Let', mellem: 'Mellem', svaer: 'Svær' };

let me = null;       // den aktive spiller
let kamp = null;     // den igangværende kamp
let draft = null;    // spiller under oprettelse/redigering

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const kit = (p) => ({ farve1: p.farve1, farve2: p.farve2, nummer: p.nummer, ...udstyr(p).valgt });
/** Vis spilleren i omklædningsrummet med alt det udstyr, spilleren har købt. */
function hero(p) { world.showHero(p.figur, kit(p)); world.setUdstyr(udstyr(p), kit(p)); }
const btn = (a, label, cls = '', extra = '') => `<button class="btn ${cls}" data-a="${a}" ${extra}><span>${label}</span></button>`;
const klasseNavn = (k) => `${k}. klasse`;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
function show(cls, html) { ui.className = cls; ui.innerHTML = html; ui.scrollTop = 0; }
function kort(p, action) {
  return `<button class="card" data-a="${action}" data-id="${p.id}" style="--c1:${p.farve1};--c2:${p.farve2}">
    <span class="badge">${esc(p.nummer)}</span>
    <span><b>${esc(p.navn)}</b><small>${esc(p.hold)}</small></span>
    <span class="pts">${p.pointIAlt} p</span></button>`;
}

// ------------------------------------------------------------ spillere
function skaermSpillere() {
  kamp = null;
  const list = db.profiler();
  const first = list[0];
  if (first) hero(first);
  show('s-profiles', `<div class="panel">
    <h1>Hvem skal på banen?</h1>
    <div class="list">${list.map((p) => kort(p, 'vaelg')).join('')}</div>
    ${btn('ny', 'Ny spiller')}
    <p class="muted">Spillere og point gemmes på denne enhed.</p>
  </div>`);
}

function nyDraft(p) {
  draft = p ? { ...p } : { navn: '', alder: 8, klasse: 2, hold: HOLDNAVNE[Math.floor(Math.random() * HOLDNAVNE.length)],
    nummer: 1 + Math.floor(Math.random() * 20), farve1: FARVER[0], farve2: FARVER[8], kampraab: KAMPRAAB[0], figur: 'rhino' };
  draft.klasseRettet = !!p;
  skaermOpret();
}
function skaermOpret(fejl = '') {
  const d = draft;
  hero(d);
  const chips = (key, opts) => Object.entries(opts).map(([v, l]) =>
    `<button class="chip" data-a="set" data-k="${key}" data-v="${esc(v)}" aria-pressed="${String(d[key]) === String(v)}">${esc(l)}</button>`).join('');
  const sw = (key) => FARVER.map((c) =>
    `<button class="swatch" style="--c:${c}" data-a="set" data-k="${key}" data-v="${c}" aria-pressed="${d[key] === c}" aria-label="Farve ${c}"></button>`).join('');
  show('s-create', `<div class="panel">
    <h1>${d.id ? 'Ret spiller' : 'Ny spiller'}</h1>
    <div class="field"><label for="f-navn">Kaldenavn</label>
      <input id="f-navn" type="text" maxlength="14" autocomplete="off" data-k="navn" value="${esc(d.navn)}" placeholder="Fx Lynet"></div>
    ${fejl ? `<p class="error">${fejl}</p>` : ''}
    <div class="row">
      <div class="field grow"><label for="f-alder">Alder</label>
        <input id="f-alder" type="number" inputmode="numeric" min="4" max="99" data-k="alder" value="${esc(d.alder)}"></div>
      <div class="field grow"><label for="f-nr">Rygnummer</label>
        <input id="f-nr" type="number" inputmode="numeric" min="1" max="99" data-k="nummer" value="${esc(d.nummer)}"></div>
    </div>
    <p class="muted" id="klasseforslag">Vi starter dig i ${klasseNavn(d.klasse)}. Du kan altid ændre det.</p>
    <div class="field"><span class="lbl">Figur</span><div class="chips">${chips('figur', FIGURER)}</div></div>
    <div class="field"><label for="f-hold">Holdnavn</label>
      <div class="row"><input class="grow" id="f-hold" type="text" maxlength="22" autocomplete="off" data-k="hold" value="${esc(d.hold)}" style="width:auto">
      <button class="chip" data-a="holdnavn">Find på et</button></div></div>
    <div class="field"><span class="lbl">Trøjefarve</span><div class="chips">${sw('farve1')}</div></div>
    <div class="field"><span class="lbl">Shorts og kanter</span><div class="chips">${sw('farve2')}</div></div>
    <div class="field"><label for="f-raab">Kampråb</label>
      <input id="f-raab" type="text" maxlength="30" autocomplete="off" data-k="kampraab" value="${esc(d.kampraab)}">
      <div class="chips">${KAMPRAAB.map((k) => `<button class="chip" data-a="set" data-k="kampraab" data-v="${esc(k)}" aria-pressed="${d.kampraab === k}">${esc(k)}</button>`).join('')}</div></div>
    <div class="row">${btn('gemSpiller', 'Gem spiller')}${db.profiler().length || d.id ? btn('fortryd', 'Fortryd', 'ghost') : ''}</div>
    ${d.id ? `<div class="row">${btn('slet', 'Slet spiller', 'ghost')}</div>` : ''}
  </div>`);
}
function laesFelter() {
  ui.querySelectorAll('input[data-k]').forEach((el) => {
    const k = el.dataset.k;
    if (el.type === 'number') {
      const max = Number(el.max), min = Number(el.min);
      const v = Math.round(Number(el.value));
      if (Number.isFinite(v) && el.value !== '') draft[k] = Math.max(min, Math.min(max, v));
    } else draft[k] = el.value.trim();
  });
}

// ------------------------------------------------------------ omklædningsrum
function skaermHub() {
  kamp = null;
  stopTale();
  setLyd(me.lyd);
  hero(me);
  const seg = (key, opts) => Object.entries(opts).map(([v, l]) =>
    `<button class="chip" data-a="indstil" data-k="${key}" data-v="${v}" aria-pressed="${me[key] === v}">${l}</button>`).join('');
  show('s-hub', `<div class="panel">
    <div class="card" style="--c1:${me.farve1};--c2:${me.farve2}">
      <span class="badge">${esc(me.nummer)}</span>
      <span><b>${esc(me.navn)}</b><small>${esc(me.hold)} · „${esc(me.kampraab)}“</small></span>
      <span class="pts">${me.pointIAlt} p</span></div>
    <div class="row">${btn('spil', 'Spil kamp', 'big')}${btn('butik', `Butik · ${me.point} p`, 'ghost')}</div>
    <div class="field"><span class="lbl">Klassetrin</span>
      <div class="stepper"><button data-a="klasse" data-v="-1" aria-label="Lavere klassetrin">−</button>
      <output>${klasseNavn(me.klasse)}</output><button data-a="klasse" data-v="1" aria-label="Højere klassetrin">+</button></div></div>
    <div class="field"><span class="lbl">Niveau</span><div class="chips">${seg('niveau', NIVEAU_NAVN)}</div></div>
    <div class="field"><span class="lbl">Regneart</span><div class="chips">${seg('regneart', { blandet: 'Blandet', ...OPS })}</div></div>
    <div class="chips">
      <button class="chip" data-a="skift" data-k="lyd" aria-pressed="${me.lyd}">Lyd</button>
      <button class="chip" data-a="skift" data-k="oplaesning" aria-pressed="${me.oplaesning}">Læs opgaver højt</button>
    </div>
    <div class="row">${btn('top', 'Topscore', 'ghost')}${btn('ret', 'Ret spiller', 'ghost')}${btn('spillere', 'Skift spiller', 'ghost')}</div>
    <p class="muted">Kampe: ${me.kampe} · Mål: ${me.maal} · Bedste kamp: ${me.bedsteKamp} p</p>
  </div>`);
}

function skaermTop() {
  const list = db.topscore();
  show('s-top', `<div class="panel">
    <h1>Topscore</h1>
    ${list.length < 2 ? '<p class="muted">Du er alene på listen. Opret flere spillere, og se hvem der fører.</p>' : ''}
    <table class="top"><thead><tr><th></th><th>Spiller</th><th class="n">Bedste kamp</th><th class="n">Point</th></tr></thead><tbody>
    ${list.map((p, i) => `<tr class="${me && p.id === me.id ? 'me' : ''}"><td>${i + 1}</td>
      <td>${esc(p.navn)}<br><span class="muted">${esc(p.hold)}</span></td><td class="n">${p.bedsteKamp}</td><td class="n">${p.pointIAlt}</td></tr>`).join('')}
    </tbody></table>
    ${btn(me ? 'hub' : 'spillere', 'Tilbage', 'ghost')}
  </div>`);
}

// ------------------------------------------------------------ kamp
function startKamp() {
  kamp = { nr: 0, rigtige: 0, stribe: 0, point: 0, svar: [], maal: 0, skud: [], laast: false, q: null, indtastet: '' };
  world.startMatch(me.figur, kit(me));
  world.setUdstyr(udstyr(me), kit(me));
  lyd.floejte();
  naesteOpgave();
}
function givPoint(n) {
  kamp.point += n; me.point += n; me.pointIAlt += n;
  db.gem(me);
}
function hud() {
  const dots = Array.from({ length: OPGAVER }, (_, i) =>
    `<i class="${kamp.svar[i] === true ? 'ok' : kamp.svar[i] === false ? 'no' : i === kamp.nr ? 'now' : ''}"></i>`).join('');
  return `<div class="hud"><button class="quit" data-a="stop">Stop</button><div class="dots" aria-hidden="true">${dots}</div>
    <div class="score" id="score">${kamp.point} p</div></div>`;
}
function naesteOpgave() {
  if (!kamp) return;
  if (kamp.nr >= OPGAVER) return startFinale();
  const q = kamp.q = lavOpgave(me.regneart, me.klasse, me.niveau);
  kamp.valg = me.klasse <= 3 ? svarmuligheder(q) : null;
  kamp.indtastet = '';
  kamp.laast = false;
  kamp.start = performance.now();
  const svar = kamp.valg
    ? `<div class="choices">${kamp.valg.map((f, i) => `<button class="choice" data-a="svar" data-i="${i}">${fHtml(f, q.style)}</button>`).join('')}</div>`
    : `<div class="typed"><output id="ind" aria-live="polite"></output>${btn('indsend', 'Svar')}</div>
       <div class="pad">${['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', ',', '−', '/', '⌫'].map((k) =>
    `<button data-a="tast" data-k="${k}" aria-label="${k === '⌫' ? 'Slet' : k === '/' ? 'Brøkstreg' : k}">${k}</button>`).join('')}</div>`;
  show('s-match', `<div class="top-group">${hud()}
    <div class="board"><div class="meta"><span>Opgave ${kamp.nr + 1} af ${OPGAVER} · ${OPS[q.op]}</span>
      <button class="say" data-a="laesop">Læs op</button></div>
      <div class="q" id="q">${q.html}</div><div class="flash" id="flash" aria-live="assertive"></div></div></div>
    <div class="answers">${svar}</div>`);
  if (me.oplaesning) sig(q.say);
}
async function besvar(f, knap) {
  if (!kamp || kamp.laast) return;
  kamp.laast = true;
  stopTale();
  const q = kamp.q;
  const rigtigt = same(f, q.answer);
  const flash = document.getElementById('flash');
  ui.querySelectorAll('.answers button').forEach((b) => b.setAttribute('disabled', ''));
  kamp.svar[kamp.nr] = rigtigt;
  if (rigtigt) {
    kamp.rigtige++; kamp.stribe++;
    const sek = (performance.now() - kamp.start) / 1000;
    let p = { let: 8, mellem: 10, svaer: 12 }[me.niveau] + Math.min(kamp.stribe - 1, 5) * 2;
    if (sek < (kamp.valg ? 6 : 10)) p += 3;
    givPoint(p);
    lyd.rigtigt();
    knap?.classList.add('right');
    flash.className = 'flash ok';
    flash.innerHTML = `${['Flot!', 'Sådan!', 'Lige i krogen!', 'Stærkt!', 'Du er forbi!'][kamp.nr % 5]} +${p} p${kamp.stribe >= 3 ? ` · ${kamp.stribe} i træk` : ''}`;
  } else {
    kamp.stribe = 0;
    lyd.forkert();
    knap?.classList.add('wrong');
    if (kamp.valg) ui.querySelectorAll('.choice').forEach((b) => { if (same(kamp.valg[Number(b.dataset.i)], q.answer)) b.classList.add('right'); });
    flash.className = 'flash no';
    flash.innerHTML = `Svaret var ${fHtml(q.answer, q.style)}`;
  }
  document.getElementById('score').textContent = `${kamp.point} p`;
  const k = kamp;
  await Promise.all([world.matchStep(rigtigt), wait(rigtigt ? 1300 : 2400)]);
  if (kamp !== k) return;
  kamp.nr++;
  naesteOpgave();
}
function tast(k) {
  if (!kamp || kamp.laast || kamp.valg || !kamp.q) return;
  let s = kamp.indtastet;
  if (k === '⌫') s = s.slice(0, -1);
  else if (k === '−') s = s.startsWith('−') ? s.slice(1) : '−' + s;
  else if (s.replace('−', '').length < 9) {
    if ((k === ',' || k === '/') && (s.includes(',') || s.includes('/') || !/\d$/.test(s))) return;
    s += k;
  }
  kamp.indtastet = s;
  document.getElementById('ind').textContent = s;
}
function indsend() {
  if (!kamp || kamp.laast || kamp.valg) return;
  const f = laesSvar(kamp.indtastet);
  if (!f) { const fl = document.getElementById('flash'); fl.className = 'flash no'; fl.textContent = 'Skriv et tal først'; return; }
  besvar(f, null);
}

// ------------------------------------------------------------ finale
function startFinale() {
  const antal = Math.max(1, Math.ceil(kamp.rigtige / 2));
  kamp.finale = { antal, nr: 0, klar: false };
  if (kamp.rigtige === OPGAVER) givPoint(PERFEKT_BONUS);
  world.startFinale(me.figur, kit(me));
  world.setUdstyr(udstyr(me), kit(me));
  lyd.floejte();
  show('s-finale', `${finaleHud()}<div class="callout">
    <h2>Finalen</h2>
    <p>Du fik ${kamp.rigtige} af ${OPGAVER} rigtige${kamp.rigtige === OPGAVER ? ` og ${PERFEKT_BONUS} bonuspoint` : ''}.
    Det giver ${antal} ${antal === 1 ? 'skud' : 'skud'} på mål. Hvert mål giver ${MAAL_POINT} point.</p>
    ${btn('klar', 'Jeg er klar', 'big')}</div><span></span>`);
}
function finaleHud() {
  const f = kamp.finale;
  const balls = Array.from({ length: f.antal }, (_, i) =>
    `<i class="${kamp.skud[i] === true ? 'goal' : kamp.skud[i] === false ? 'miss' : i === f.nr ? 'now' : ''}"></i>`).join('');
  return `<div class="hud"><button class="quit" data-a="stop">Stop</button><div class="shots" aria-label="Skud">${balls}</div>
    <div class="score">${kamp.point} p</div></div>`;
}
function finaleKlar() {
  const f = kamp.finale;
  f.klar = true;
  show('s-finale', `${finaleHud()}<span></span><div class="hint">Skud ${f.nr + 1} af ${f.antal}: tryk i målet, dér hvor du vil skyde</div>`);
}
async function skyd(x, y) {
  const f = kamp?.finale;
  if (!f || !f.klar) return;
  const pt = world.sigtepunkt(x, y);
  if (!pt) return;
  f.klar = false;
  show('s-finale', `${finaleHud()}<span></span><span></span>`);
  const k = kamp;
  const res = await world.skyd(pt, () => lyd.spark());
  if (kamp !== k) return;
  const maal = res === 'maal';
  kamp.skud[f.nr] = maal;
  if (maal) { kamp.maal++; givPoint(MAAL_POINT); lyd.jubel(); } else if (res === 'stolpe') lyd.stolpe(); else lyd.aah();
  const tekst = { maal: `Mååål!<small>+${MAAL_POINT} point</small>`, reddet: 'Reddet!', stolpe: 'Stolpen!', forbi: 'Forbi!' }[res];
  f.nr++;
  show('s-finale', `${finaleHud()}<div class="shout ${maal ? '' : 'no'}">${tekst}</div><span></span>`);
  await wait(maal ? 1900 : 1500);
  if (kamp !== k) return;
  if (f.nr >= f.antal) return skaermResultat();
  world.resetSkud();
  finaleKlar();
}

function skaermResultat() {
  const k = kamp;
  const rekord = k.point > me.bedsteKamp && me.kampe > 0;
  me.kampe++; me.maal += k.maal; me.rigtige += k.rigtige; me.besvaret += OPGAVER;
  me.bedsteKamp = Math.max(me.bedsteKamp, k.point);
  const gemt = db.gem(me);
  kamp = null;
  hero(me);
  world.player.play(k.rigtige >= 5 ? 'cheer' : 'idle');
  const plads = db.topscore().findIndex((p) => p.id === me.id) + 1;
  show('s-result', `<div class="panel">
    <h1>${k.rigtige >= 8 ? 'Kæmpe kamp!' : k.rigtige >= 5 ? 'Godt spillet!' : 'Kampen er slut'}</h1>
    ${rekord ? '<p class="saved">Ny rekord: din bedste kamp indtil nu.</p>' : ''}
    <div class="stats">
      <div class="stat"><b>${k.rigtige}/${OPGAVER}</b><span>rigtige svar</span></div>
      <div class="stat"><b>${k.maal}/${k.finale.antal}</b><span>mål i finalen</span></div>
      <div class="stat"><b>+${k.point}</b><span>point</span></div>
    </div>
    <p>Du har nu <b>${me.pointIAlt} point</b> og ligger nummer ${plads} på topscoren. Du har ${me.point} point at købe for i butikken.</p>
    <p class="${gemt ? 'saved' : 'error'}">${gemt ? 'Dine point er gemt.' : 'Pointene kunne ikke gemmes på denne enhed.'}</p>
    <div class="row">${btn('spil', 'Spil igen', 'big')}</div>
    <div class="row">${btn('butik', 'Butik', 'ghost')}${btn('top', 'Topscore', 'ghost')}${btn('hub', 'Omklædningsrum', 'ghost')}</div>
  </div>`);
}

// ------------------------------------------------------------ butik
function skaermButik(besked = '', scroll = 0) {
  const o = udstyr(me);
  hero(me);
  const koebKnap = (a, k, id, pris) => (me.point >= pris
    ? `<button class="buy" data-a="${a}" data-k="${k}" data-id="${id}">Køb · ${pris} p</button>`
    : `<span class="need">Mangler ${pris - me.point} p</span>`);
  const trin = Object.entries(TRIN).map(([k, kat]) => {
    const naeste = kat.trin[o[k] + 1];
    return `<section class="shop"><h2>${kat.navn}</h2>
      <p class="muted">Du har: ${kat.trin[o[k]].navn} (${o[k]} af ${kat.trin.length - 1})</p>
      ${naeste ? `<div class="item"><span><b>${naeste.navn}</b><small>${naeste.tekst}</small></span>${koebKnap('koebTrin', k, '', naeste.pris)}</div>`
    : '<p class="saved">Du har købt det hele her.</p>'}</section>`;
  }).join('');
  const valg = Object.entries(VALG).map(([k, kat]) => `<section class="shop"><h2>${kat.navn}</h2>
    ${Object.entries(kat.ting).map(([id, t]) => {
    const ejer = o.ejet[k].includes(id), iBrug = o.valgt[k] === id;
    return `<div class="item ${iBrug ? 'on' : ''}"><span><b>${t.navn}</b></span>${iBrug ? '<span class="inuse">I brug</span>'
      : ejer ? `<button class="buy use" data-a="brug" data-k="${k}" data-id="${id}">Brug</button>` : koebKnap('koebTing', k, id, t.pris)}</div>`;
  }).join('')}</section>`).join('');
  show('s-shop', `<div class="panel">
    <div class="row spread"><h1>Butik</h1><span class="wallet">${me.point} p</span></div>
    <p class="${besked ? 'saved' : 'muted'}" aria-live="polite">${besked || 'Brug dine point på at gøre dit hold sejere. Du tjener point ved at svare rigtigt og score.'}</p>
    ${valg}${trin}
    ${btn('hub', 'Tilbage', 'ghost')}
  </div>`);
  ui.firstElementChild.scrollTop = scroll;
}
function handel(ok, navn) {
  const scroll = ui.firstElementChild.scrollTop;
  if (ok) { db.gem(me); lyd.rigtigt(); if (kampFejring) world.player.play('cheer'); }
  skaermButik(ok ? navn : '', scroll);
  if (ok && kampFejring) world.player.play('cheer');
}
let kampFejring = false;

// ------------------------------------------------------------ hændelser
const handlinger = {
  ny: () => nyDraft(null),
  vaelg: (el) => { me = db.vaelg(el.dataset.id); skaermHub(); },
  set: (el) => { laesFelter(); draft[el.dataset.k] = el.dataset.v; skaermOpret(); },
  holdnavn: () => { laesFelter(); draft.hold = HOLDNAVNE[(HOLDNAVNE.indexOf(draft.hold) + 1 + Math.floor(Math.random() * 5)) % HOLDNAVNE.length]; skaermOpret(); },
  gemSpiller: () => {
    laesFelter();
    if (!draft.navn) return skaermOpret('Skriv et kaldenavn først.');
    const { klasseRettet, ...data } = draft;
    if (data.id) { me = { ...data }; db.gem(me); } else me = db.opret({ ...data, oplaesning: data.klasse <= 2 });
    skaermHub();
  },
  fortryd: () => (me ? skaermHub() : skaermSpillere()),
  slet: (el) => {
    if (el.dataset.sikker) { db.slet(draft.id); me = null; return db.profiler().length ? skaermSpillere() : nyDraft(null); }
    el.dataset.sikker = '1'; el.classList.add('danger'); el.classList.remove('ghost');
    el.firstElementChild.textContent = 'Tryk igen for at slette';
  },
  indstil: (el) => { me[el.dataset.k] = el.dataset.v; db.gem(me); skaermHub(); },
  klasse: (el) => { me.klasse = Math.max(0, Math.min(10, me.klasse + Number(el.dataset.v))); db.gem(me); skaermHub(); },
  skift: (el) => { me[el.dataset.k] = !me[el.dataset.k]; db.gem(me); setLyd(me.lyd); skaermHub(); },
  spil: () => startKamp(),
  top: () => skaermTop(),
  butik: () => skaermButik(),
  koebTrin: (el) => { const k = el.dataset.k; const ok = koebTrin(me, k); kampFejring = false; handel(ok, ok ? `Købt: ${TRIN[k].trin[udstyr(me)[k]].navn}` : ''); },
  koebTing: (el) => { const { k, id } = el.dataset; const ok = koebTing(me, k, id); kampFejring = k === 'jubel'; handel(ok, ok ? `Købt: ${VALG[k].ting[id].navn}` : ''); },
  brug: (el) => { const { k, id } = el.dataset; const ok = brugTing(me, k, id); kampFejring = k === 'jubel'; handel(ok, ok ? `Du bruger nu: ${VALG[k].ting[id].navn}` : ''); },
  hub: () => skaermHub(),
  ret: () => nyDraft(me),
  spillere: () => skaermSpillere(),
  stop: () => skaermHub(),
  laesop: () => kamp?.q && sig(kamp.q.say),
  svar: (el) => besvar(kamp.valg[Number(el.dataset.i)], el),
  tast: (el) => tast(el.dataset.k),
  indsend: () => indsend(),
  klar: () => finaleKlar(),
};
ui.addEventListener('click', (e) => {
  const el = e.target.closest('[data-a]');
  if (!el || el.hasAttribute('disabled')) return;
  if (!['svar', 'tast', 'indsend'].includes(el.dataset.a)) lyd.klik();
  handlinger[el.dataset.a]?.(el);
});
ui.addEventListener('input', (e) => {
  const el = e.target;
  if (!draft || !el.dataset?.k) return;
  laesFelter();
  if (el.dataset.k === 'alder' && !draft.klasseRettet) {
    draft.klasse = Math.max(0, Math.min(10, draft.alder - 6));
    const t = document.getElementById('klasseforslag');
    if (t) t.textContent = `Vi starter dig i ${klasseNavn(draft.klasse)}. Du kan altid ændre det.`;
  }
  if (el.dataset.k === 'nummer') hero(draft);
});
window.addEventListener('keydown', (e) => {
  if (!kamp || kamp.laast || !kamp.q || kamp.finale) return;
  if (kamp.valg) {
    const i = ['1', '2', '3', '4'].indexOf(e.key);
    if (i >= 0) ui.querySelectorAll('.choice')[i]?.click();
    return;
  }
  if (/^\d$/.test(e.key)) tast(e.key);
  else if (e.key === ',' || e.key === '.') tast(',');
  else if (e.key === '-') tast('−');
  else if (e.key === '/') tast('/');
  else if (e.key === 'Backspace') tast('⌫');
  else if (e.key === 'Enter') { e.preventDefault(); indsend(); }
});
stage.addEventListener('pointermove', (e) => {
  if (kamp?.finale?.klar && e.pointerType === 'mouse') world.visSigte(world.sigtepunkt(e.clientX, e.clientY));
});
stage.addEventListener('pointerdown', (e) => { if (kamp?.finale?.klar) skyd(e.clientX, e.clientY); });

// ------------------------------------------------------------ start
(async function start() {
  try {
    await Promise.all([world.load((k) => { document.getElementById('bar').style.width = `${Math.round(k * 100)}%`; }),
      document.fonts?.load('800 40px "Barlow Condensed"').catch(() => {})]);
  } catch (err) {
    console.error(err);
    show('s-load', '<div class="loadbox"><h1 class="logo">Øv!</h1><p>Spillet kunne ikke hente banen. Tjek forbindelsen, og genindlæs siden.</p></div>');
    return;
  }
  me = db.aktiv();
  if (me) skaermHub(); else if (db.profiler().length) skaermSpillere(); else nyDraft(null);
})();

// til fejlfinding og test
window.__spil = { world, db, get kamp() { return kamp; }, get me() { return me; } };
