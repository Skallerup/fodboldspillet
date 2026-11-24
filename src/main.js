// Spillets forløb og skærmbilleder: spillere, omklædningsrum, kamp, finale, resultat og topscore.
import { World, FIGURER, GRUNDFIGURER } from './world.js';
import * as db from './storage.js';
import { lavOpgave, svarmuligheder, laesSvar, hint, html as fHtml, same, OPS } from './math.js';
import { lyd, setLyd, sig, stopTale, publikum } from './audio.js';
import { TRIN, VALG, LAASE, erLaastOp, udstyr, kraeverTekst, koebTrin, koebTing, brugTing } from './shop.js';
import { dagens, taelDag, DAG_POINT } from './daily.js';
import { hentKort, alleKort, samling, antalKort, traekKort, SJAELDENHED } from './cards.js';

const ui = document.getElementById('ui');
const stage = document.getElementById('stage');
const world = new World(stage);
const MAAL_POINT = 25, PERFEKT_BONUS = 30;
const FARVER = ['#D81E2C', '#1E5BD8', '#F5C400', '#159A48', '#F07818', '#7A2FD0', '#35B6F0', '#15171C', '#F4F4F0'];
const HOLDNAVNE = ['FC Lynet', 'Tordenstøvlerne', 'Regnehajerne', 'Gangeløverne', 'Brøkbanden', 'Plus United', 'Minus Mestrene',
  'FC Hattrick', 'Talmagikerne', 'Stolpe Ind FC', 'Dribleholdet', 'Sparkemaskinerne'];
const KAMPRAAB = ['Kom så!', 'Vi giver aldrig op!', 'Fuld fart frem!', 'Regn den ud!', 'Stolpe ind!'];
const NIVEAU_NAVN = { let: 'Let', mellem: 'Mellem', svaer: 'Svær' };
// Pokalturnering: tre kampe i træk. krav = mål man skal score i finalen, klog = hvor ofte målmanden gætter rigtigt.
const RUNDER = [{ navn: 'Kvartfinale', krav: 3, klog: 0.4 }, { navn: 'Semifinale', krav: 4, klog: 0.5 }, { navn: 'Finale', krav: 4, klog: 0.6 }];
// Rækker: man rykker op, når man har optjent nok point i alt
const RAEKKER = [[0, 'Serie 3'], [300, 'Serie 2'], [800, 'Serie 1'], [1500, 'Danmarksserien'], [2500, '3. division'], [4000, '2. division'],
  [6000, '1. division'], [9000, 'Superligaen'], [13000, 'Champions League'], [20000, 'Verdensmester']];
function raekke(p) {
  let nr = 0;
  RAEKKER.forEach(([fra], i) => { if (p.pointIAlt >= fra) nr = i; });
  const naeste = RAEKKER[nr + 1];
  return { nr, navn: RAEKKER[nr][1], naeste: naeste ? naeste[1] : null, mangler: naeste ? naeste[0] - p.pointIAlt : 0,
    pct: naeste ? Math.round(((p.pointIAlt - RAEKKER[nr][0]) / (naeste[0] - RAEKKER[nr][0])) * 100) : 100 };
}
/** De nærmeste ting at spille for: oprykning, noget i butikken og en hemmelig figur. */
function naesteMaal(p) {
  const ud = [];
  const r = raekke(p);
  if (r.naeste) ud.push(`${r.mangler} point til oprykning til ${r.naeste}`);
  const o = udstyr(p);
  const varer = [];
  for (const [k, kat] of Object.entries(TRIN)) { const n = kat.trin[o[k] + 1]; if (n && !kraeverTekst(p, k)) varer.push([n.pris, `${kat.navn} level ${o[k] + 2}: ${n.navn}`]); }
  for (const [k, kat] of Object.entries(VALG)) for (const [id, t] of Object.entries(kat.ting)) if (!o.ejet[k].includes(id)) varer.push([t.pris, `${kat.navn.toLowerCase()}n „${t.navn}“`.replace('støvlern', 'støvlerne').replace('målfejringn', 'målfejringen')]);
  varer.sort((x, y) => x[0] - y[0]);
  if (varer.length) ud.push(p.point >= varer[0][0] ? `Du har råd til ${varer[0][1]} i butikken` : `${varer[0][0] - p.point} point til ${varer[0][1]}`);
  const figurer = Object.entries(LAASE).map(([f, l]) => [f, ...l.status(p)]).filter(([, har, skal]) => har < skal).sort((x, y) => y[1] / y[2] - x[1] / x[2]);
  if (figurer.length) { const [f, har, skal] = figurer[0]; ud.push(`${FIGURER[f]}: ${har} af ${skal} (${LAASE[f].tekst.toLowerCase()})`); }
  return ud;
}
function maalHtml() {
  const m = naesteMaal(me);
  return m.length ? `<div class="dag"><b>Næste mål</b>${m.map((t) => `<span>${t}</span>`).join('')}</div>` : '';
}
const TURNERING_POINT = 300;
const HOLD = {
  rhino: { navn: 'Hornborg IF', farve1: '#6B7280', farve2: '#F4F4F0' },
  lion: { navn: 'Løvehjerte FC', farve1: '#F07818', farve2: '#15171C' },
  croc: { navn: 'Sumpens Snappere', farve1: '#159A48', farve2: '#F5C400' },
  panda: { navn: 'Bambus Boldklub', farve1: '#15171C', farve2: '#F4F4F0' },
  shark: { navn: 'Hajbugten', farve1: '#1E5BD8', farve2: '#F4F4F0' },
  dragon: { navn: 'Dragebjerg', farve1: '#7A2FD0', farve2: '#F5C400' },
  robot: { navn: 'Robo United', farve1: '#35B6F0', farve2: '#15171C' },
};

let me = null;       // den aktive spiller
let kamp = null;     // den igangværende kamp
let draft = null;    // spiller under oprettelse/redigering

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const kit = (p) => ({ farve1: p.farve1, farve2: p.farve2, nummer: p.nummer, ...udstyr(p).valgt });
/** Vis spilleren i omklædningsrummet med alt det udstyr, spilleren har købt. */
function hero(p) { world.turneringer = p.turneringer | 0; world.showHero(p.figur, kit(p)); world.setUdstyr(udstyr(p), kit(p)); }
const btn = (a, label, cls = '', extra = '') => `<button class="btn ${cls}" data-a="${a}" ${extra}><span>${label}</span></button>`;
const klasseNavn = (k) => `${k}. klasse`;
/** Spillerens valgte regnearter som liste (ældre gemte spillere har kun ét valg). */
function arter(p) {
  if (!Array.isArray(p.regnearter) || !p.regnearter.length) {
    p.regnearter = p.regneart && p.regneart !== 'blandet' ? [p.regneart] : Object.keys(OPS);
  }
  return p.regnearter;
}
/** Figurer, der lige er blevet låst op, og som spilleren ikke har fået besked om endnu. */
function nyeFigurer(p) {
  p.laastOp ||= [];
  const nye = Object.keys(LAASE).filter((k) => erLaastOp(p, k) && !p.laastOp.includes(k));
  p.laastOp.push(...nye);
  nye.forEach((k) => world.loadFigur(k).catch(() => {}));
  return nye;
}
function kortHtml(k, antal = 1) {
  return `<div class="kort r-${k.sjaeldenhed}">
    <div class="kort-top"><span>${SJAELDENHED[k.sjaeldenhed]}</span>${antal > 1 ? `<span>x${antal}</span>` : ''}</div>
    <img src="assets/cards/${k.id}.webp" alt="" loading="lazy">
    <div class="kort-navn">${esc(k.navn)}</div>
    <div class="kort-pos">${esc(k.stilling)}</div>
    <div class="kort-stats"><span><b>${k.fart}</b>Fart</span><span><b>${k.skud}</b>Skud</span><span><b>${k.hjerne}</b>Hjerne</span></div>
  </div>`;
}
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
    <div class="field"><span class="lbl">Figur</span><div class="chips">${Object.entries(FIGURER).map(([v, l]) => (erLaastOp(d, v)
    ? `<button class="chip" data-a="set" data-k="figur" data-v="${v}" aria-pressed="${d.figur === v}">${l}</button>`
    : `<button class="chip locked" disabled title="${LAASE[v].tekst}">${l} (låst)</button>`)).join('')}</div>
      <span class="muted">Haj, drage og robot er hemmelige figurer. Se i albummet, hvordan du låser dem op.</span></div>
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
  const valgt = arter(me);
  const arterTekst = valgt.length === Object.keys(OPS).length ? 'Alle regnearter' : valgt.map((v) => OPS[v]).join(', ');
  show('s-hub', `<div class="panel">
    <button class="card" data-a="spillere" style="--c1:${me.farve1};--c2:${me.farve2}" aria-label="Skift spiller. Nu: ${esc(me.navn)}">
      <span class="badge">${esc(me.nummer)}</span>
      <span><b>${esc(me.navn)}</b><small>${esc(me.hold)} · ${raekke(me).navn}</small></span>
      <span class="pts">${me.pointIAlt} p<small class="skift">Skift spiller</small></span></button>
    ${btn('spil', 'Spil kamp', 'big wide')}
    <div class="row">${btn('hurtig', 'Hurtig kamp · 5 opgaver', 'ghost')}${btn('toSpillere', 'To spillere', 'ghost')}</div>
    <button class="summary" data-a="indstillinger"><span><b>${klasseNavn(me.klasse)} · ${NIVEAU_NAVN[me.niveau]}</b><small>${arterTekst}</small></span><span class="inuse">Skift</span></button>
    ${btn('turnering', me.turnering ? `Turnering: ${RUNDER[me.turnering.runde].navn.toLowerCase()}` : 'Pokalturnering', 'ghost wide')}
    ${dagHtml()}
    ${maalHtml()}
    <div class="tiles">
      <button class="tile" data-a="butik"><b>Butik</b><small>${me.point} p</small></button>
      <button class="tile" data-a="album"><b>Album</b><small>${antalKort(me)}/${alleKort().length}${samling(me) && me.pakker ? ` · ${me.pakker} pakke` : ''}</small></button>
      <button class="tile" data-a="top"><b>Topscore</b><small>${me.kampe} kampe</small></button>
      <button class="tile" data-a="indstillinger"><b>Indstillinger</b><small>Lyd, grafik, spiller</small></button>
    </div>
  </div>`);
}
function skaermIndstil(scroll = 0) {
  const seg = (key, opts) => Object.entries(opts).map(([v, l]) =>
    `<button class="chip" data-a="indstil" data-k="${key}" data-v="${v}" aria-pressed="${me[key] === v}">${l}</button>`).join('');
  const g = grafikValg();
  show('s-settings', `<div class="panel">
    <h1>Indstillinger</h1>
    <h2>Opgaver</h2>
    <div class="field"><span class="lbl">Klassetrin</span>
      <div class="stepper"><button data-a="klasse" data-v="-1" aria-label="Lavere klassetrin">−</button>
      <output>${klasseNavn(me.klasse)}</output><button data-a="klasse" data-v="1" aria-label="Højere klassetrin">+</button></div></div>
    <div class="field"><span class="lbl">Niveau</span><div class="chips">${seg('niveau', NIVEAU_NAVN)}</div></div>
    <div class="field"><span class="lbl">Regnearter (vælg en eller flere)</span><div class="chips">
      ${Object.entries(OPS).map(([v, l]) => `<button class="chip" data-a="art" data-v="${v}" aria-pressed="${arter(me).includes(v)}">${l}</button>`).join('')}
      <button class="chip" data-a="art" data-v="alle" aria-pressed="${arter(me).length === Object.keys(OPS).length}">Alle</button></div></div>
    <div class="chips"><button class="chip" data-a="skift" data-k="tilpas" aria-pressed="${me.tilpas !== false}">Tilpas sværhedsgraden automatisk</button></div>
    <p class="muted">${me.tilpas === false ? 'Opgaverne følger kun det klassetrin og niveau, du har valgt.'
    : `Fem rigtige i træk gør opgaverne lidt sværere, tre forkerte gør dem lidt lettere.${juster(me) ? ` Lige nu: ${juster(me) > 0 ? '+' : ''}${juster(me)} klassetrin.` : ''}`}</p>
    <h2>Lyd</h2>
    <div class="chips">
      <button class="chip" data-a="skift" data-k="kommentator" aria-pressed="${me.kommentator !== false}">Kommentator</button>
      <button class="chip" data-a="skift" data-k="lyd" aria-pressed="${me.lyd}">Lydeffekter</button>
      <button class="chip" data-a="skift" data-k="oplaesning" aria-pressed="${me.oplaesning}">Læs opgaver højt</button>
    </div>
    <h2>Grafik</h2>
    <div class="chips">${Object.entries({ auto: 'Automatisk', flot: 'Flot', hurtig: 'Hurtig' }).map(([v, l]) =>
    `<button class="chip" data-a="grafik" data-v="${v}" aria-pressed="${g === v}">${l}</button>`).join('')}</div>
    <p class="muted">${g === 'auto' ? `Spillet vælger selv. Lige nu: ${world.lav ? 'hurtig' : 'flot'} grafik.` : 'Vælg „Hurtig“, hvis spillet hakker.'}</p>
    <h2>Spiller</h2>
    <div class="row">${btn('ret', 'Ret spiller', 'ghost')}${btn('spillere', 'Skift spiller', 'ghost')}</div>
    <p class="muted">Kampe: ${me.kampe} · Mål: ${me.maal} · Bedste kamp: ${me.bedsteKamp} p${me.turneringer ? ` · Turneringer vundet: ${me.turneringer}` : ''}</p>
    ${btn('hub', 'Tilbage', 'ghost')}
  </div>`);
  ui.firstElementChild.scrollTop = scroll;
}
// Grafik gemmes for enheden (ikke pr. spiller): auto, flot eller hurtig
const GRAFIK = 'fodboldspillet.grafik';
function grafikValg() { try { return localStorage.getItem(GRAFIK) || 'auto'; } catch { return 'auto'; } }
function skalVaereLet() {
  const g = grafikValg();
  if (g !== 'auto') return g === 'hurtig';
  let maalt = null;
  try { maalt = localStorage.getItem(GRAFIK + '.maalt'); } catch { /* ingen lagring */ }
  return maalt === 'lav' || (navigator.deviceMemory || 8) <= 2 || (navigator.hardwareConcurrency || 8) <= 2;
}
function dagHtml() {
  const d = dagens(me);
  return `<div class="dag ${d.faerdig ? 'done' : ''}"><b>Dagens udfordring</b><span>${d.u.tekst}</span>
    <span class="progress"><i style="width:${Math.round((d.har / d.u.n) * 100)}%"></i></span>
    <small>${d.faerdig ? 'Klaret! Kom igen i morgen.' : `${d.har} af ${d.u.n} · Præmie: ${DAG_POINT} point og en kortpakke`}</small></div>`;
}

// ------------------------------------------------------------ pokalturnering
function skaermTurnering() {
  const t = me.turnering, r = RUNDER[t.runde], hold = HOLD[t.hold[t.runde]];
  hero(me);
  show('s-result', `<div class="panel">
    <h1>${r.navn}</h1>
    <div class="list">${RUNDER.map((x, i) => `<div class="item ${i === t.runde ? 'on' : ''}"><span><b>${x.navn}</b><small>${HOLD[t.hold[i]].navn} · ${FIGURER[t.hold[i]]}</small></span>
      <span class="${i < t.runde ? 'inuse' : 'need'}">${i < t.runde ? 'Vundet' : `${x.krav} mål`}</span></div>`).join('')}</div>
    <p>Du møder <b>${hold.navn}</b>. Scor mindst ${r.krav} mål i kampen for at gå videre. Hvert tredje rigtige svar giver en chance, og finalen giver flere skud.</p>
    <p class="muted">Vinder du alle tre kampe, får du turneringspokalen, ${TURNERING_POINT} point og to kortpakker. Taber du, starter turneringen forfra.</p>
    <div class="row">${btn('spilTurnering', 'Spil kampen', 'big')}</div>
    <div class="row">${btn('hub', 'Tilbage', 'ghost')}</div>
  </div>`);
}

function skaermTop() {
  const list = db.topscore();
  show('s-top', `<div class="panel">
    <h1>Topscore</h1>
    ${list.length < 2 ? '<p class="muted">Du er alene på listen. Opret flere spillere, og se hvem der fører.</p>' : ''}
    <table class="top"><thead><tr><th></th><th>Spiller</th><th class="n">Bedste kamp</th><th class="n">Point</th></tr></thead><tbody>
    ${list.map((p, i) => `<tr class="${me && p.id === me.id ? 'me' : ''}"><td>${i + 1}</td>
      <td>${esc(p.navn)}<br><span class="muted">${esc(p.hold)} · ${raekke(p).navn}</span></td><td class="n">${p.bedsteKamp}</td><td class="n">${p.pointIAlt}</td></tr>`).join('')}
    </tbody></table>
    ${btn(me ? 'hub' : 'spillere', 'Tilbage', 'ghost')}
  </div>`);
}

// ------------------------------------------------------------ kamp
/** Hvor meget sværhedsgraden er justeret automatisk for spilleren (-2 til +2 klassetrin). */
const juster = (p) => (p.tilpas === false ? 0 : Math.max(-2, Math.min(2, p.justering | 0)));
function kommentar(tekst) { if (me && me.kommentator !== false && me.lyd) sig(tekst); }

function startKamp({ turnering = false, antal = 10 } = {}) {
  const t = turnering && me.turnering ? { ...RUNDER[me.turnering.runde], figur: me.turnering.hold[me.turnering.runde] } : null;
  kamp = { antal: t ? 10 : antal, nr: 0, rigtige: 0, stribe: 0, fejlStribe: 0, point: 0, svar: [], maal: 0, skud: [], laast: false, q: null,
    indtastet: '', forsoeg: 0, fase: 'opgaver', superskud: 0, chancer: 0, turnering: t, dagKlaret: false, sigte: null, raekkeFoer: raekke(me).nr };
  world.startMatch(me.figur, kit(me), t ? { rival: t.figur, rivalKit: HOLD[t.figur] } : {});
  world.setUdstyr(udstyr(me), kit(me));
  lyd.floejte();
  publikum(0.3);
  if (!me.oplaesning) kommentar(`Velkommen til kampen. ${me.navn} har bolden.`);
  naesteOpgave();
}
function givPoint(n) {
  kamp.point += n; me.point += n; me.pointIAlt += n;
  db.gem(me);
}
function hud() {
  if (kamp.duel) return duelHud();
  const dots = Array.from({ length: kamp.antal }, (_, i) =>
    `<i class="${kamp.svar[i] === true ? 'ok' : kamp.svar[i] === 'halv' ? 'halv' : kamp.svar[i] === false ? 'no' : i === kamp.nr ? 'now' : ''}"></i>`).join('');
  return `<div class="hud"><button class="quit" data-a="stop">Stop</button><div class="dots" aria-hidden="true">${dots}</div>
    <div class="score" id="score">${kamp.point} p</div></div>`;
}
/** Tegn opgaven på måltavlen med svarmuligheder eller taltastatur. */
function tegnOpgave(meta) {
  const q = kamp.q;
  const svar = kamp.valg
    ? `<div class="choices">${kamp.valg.map((f, i) => `<button class="choice" data-a="svar" data-i="${i}">${fHtml(f, q.style)}</button>`).join('')}</div>`
    : `<div class="typed"><output id="ind" aria-live="polite"></output>${btn('indsend', 'Svar')}</div>
       <div class="pad">${['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', ',', '−', '/', '⌫'].map((k) =>
    `<button data-a="tast" data-k="${k}" aria-label="${k === '⌫' ? 'Slet' : k === '/' ? 'Brøkstreg' : k}">${k}</button>`).join('')}</div>`;
  show('s-match', `<div class="top-group">${hud()}
    <div class="board"><div class="meta"><span>${meta}</span>
      <button class="say" data-a="laesop">Læs op</button></div>
      <div class="q" id="q">${q.html}</div><div class="hintbox" id="hint" hidden></div><div class="flash" id="flash" aria-live="assertive"></div></div></div>
    <div class="answers">${svar}</div>`);
}
function naesteOpgave() {
  if (!kamp) return;
  if (kamp.nr >= kamp.antal) return startFinale();
  const q = kamp.q = lavOpgave(arter(me), me.klasse, me.niveau, juster(me));
  kamp.valg = me.klasse <= 3 ? svarmuligheder(q) : null;
  kamp.indtastet = '';
  kamp.laast = false;
  kamp.forsoeg = 0;
  kamp.fase = 'opgaver';
  kamp.start = performance.now();
  tegnOpgave(`Opgave ${kamp.nr + 1} af ${kamp.antal} · ${OPS[q.op]}`);
  if (me.oplaesning) sig(q.say);
}
/** Automatisk sværhedsgrad: fem rigtige i træk gør opgaverne sværere, tre forkerte i træk gør dem lettere. */
function tilpas(op) {
  if (me.tilpas === false) return '';
  const foer = juster(me);
  me.justering = Math.max(-2, Math.min(2, foer + op));
  if (me.justering === foer) return '';
  return op > 0 ? ' Nu bliver opgaverne lidt sværere.' : ' Vi tager nogle lidt lettere opgaver.';
}
async function besvar(f, knap) {
  if (!kamp || kamp.laast) return;
  kamp.laast = true;
  stopTale();
  const q = kamp.q, k = kamp;
  const rigtigt = same(f, q.answer);
  const flash = document.getElementById('flash');
  // første forkerte svar: et hint og ét forsøg mere
  if (!rigtigt && kamp.forsoeg === 0) {
    kamp.forsoeg = 1;
    kamp.stribe = 0;
    kamp.fejlStribe++;
    lyd.forkert();
    publikum(0.25);
    if (knap) { knap.classList.add('wrong'); knap.setAttribute('disabled', ''); }
    let ekstra = '';
    if (kamp.fejlStribe >= 3) { ekstra = tilpas(-1); kamp.fejlStribe = 0; db.gem(me); }
    flash.className = 'flash no';
    flash.textContent = 'Ikke helt. Prøv én gang til!';
    const h = document.getElementById('hint');
    h.innerHTML = `<b>Hint</b>${hint(q)}${ekstra ? `<small>${ekstra}</small>` : ''}`;
    h.hidden = false;
    if (!kamp.valg) { kamp.indtastet = ''; document.getElementById('ind').textContent = ''; }
    kamp.laast = false;
    return;
  }
  ui.querySelectorAll('.answers button').forEach((b) => b.setAttribute('disabled', ''));
  if (rigtigt) {
    const foerste = kamp.forsoeg === 0;
    kamp.rigtige++;
    kamp.svar[kamp.nr] = foerste ? true : 'halv';
    const grund = { let: 8, mellem: 10, svaer: 12 }[me.niveau];
    let p, tekst;
    if (foerste) {
      kamp.stribe++; kamp.fejlStribe = 0;
      const sek = (performance.now() - kamp.start) / 1000;
      p = grund + Math.min(kamp.stribe - 1, 5) * 2 + (sek < (kamp.valg ? 6 : 10) ? 3 : 0);
      tekst = `${['Flot!', 'Sådan!', 'Lige i krogen!', 'Stærkt!', 'Du er forbi!'][kamp.nr % 5]} +${p} p${kamp.stribe >= 3 ? ` · ${kamp.stribe} i træk` : ''}`;
    } else {
      p = Math.round(grund / 2);
      tekst = `Der var den! +${p} p`;
    }
    givPoint(p);
    lyd.rigtigt();
    knap?.classList.add('right');
    if (foerste && kamp.stribe % 5 === 0) {
      kamp.superskud++;
      lyd.jubel();
      tekst = `${kamp.stribe} i træk: superskud! +${p} p.${tilpas(1)}`;
      kommentar(`${kamp.stribe} rigtige i træk. ${me.navn} får et superskud!`);
    }
    publikum(Math.min(1, 0.3 + kamp.stribe * 0.14));
    for (const [id, n, hoejest] of [['rigtige', 1], [q.op, 1], ['stribe', kamp.stribe, true]]) if (taelDag(me, id, n, hoejest)) kamp.dagKlaret = true;
    db.gem(me);
    flash.className = 'flash ok';
    flash.textContent = tekst;
  } else {
    kamp.svar[kamp.nr] = false;
    lyd.forkert();
    knap?.classList.add('wrong');
    if (kamp.valg) ui.querySelectorAll('.choice').forEach((b) => { if (same(kamp.valg[Number(b.dataset.i)], q.answer)) b.classList.add('right'); });
    flash.className = 'flash no';
    flash.innerHTML = `Svaret var ${fHtml(q.answer, q.style)}`;
  }
  document.getElementById('score').textContent = `${kamp.point} p`;
  await Promise.all([world.matchStep(rigtigt), wait(rigtigt ? 1300 : 2200)]);
  if (kamp !== k) return;
  kamp.nr++;
  // hvert tredje rigtige svar giver en chance med det samme
  if (rigtigt && kamp.rigtige % 3 === 0 && kamp.nr < kamp.antal) {
    await chance(k);
    if (kamp !== k) return;
  }
  naesteOpgave();
}
function tast(k) {
  if (!kamp || kamp.laast || kamp.valg || !kamp.q || kamp.fase !== 'opgaver') return;
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
  if (!kamp || kamp.laast || kamp.valg || kamp.fase !== 'opgaver') return;
  const f = laesSvar(kamp.indtastet);
  if (!f) { const fl = document.getElementById('flash'); fl.className = 'flash no'; fl.textContent = 'Skriv et tal først'; return; }
  (kamp.duel ? duelSvar : besvar)(f, null);
}

// ------------------------------------------------------------ skud på mål (chancer, finale og duel)
function skudHud() {
  if (kamp.duel) return duelHud();
  const f = kamp.finale, t = kamp.turnering;
  const midt = f
    ? Array.from({ length: f.antal }, (_, i) => `<i class="${kamp.skud[i] === true ? 'goal' : kamp.skud[i] === false ? 'miss' : i === f.nr ? 'now' : ''}"></i>`).join('')
    : '<span class="krav">Chance!</span>';
  return `<div class="hud"><button class="quit" data-a="stop">Stop</button><div class="shots" aria-label="Skud">${midt}
    ${t ? `<span class="krav">${kamp.maal} af ${t.krav} mål</span>` : ''}</div><div class="score">${kamp.point} p</div></div>`;
}
/** Vent på, at spilleren trykker i målet. tid = sekunder, før det er for sent (0 = ingen grænse). */
function etSkud({ tekst, tid = 0, superOk = true, zone = null }) {
  return new Promise((resolve) => {
    const s = kamp.sigte = { klar: true, super: false, tekst, superOk, zone, resolve, timer: null };
    tegnSigte();
    if (tid) s.timer = setTimeout(() => { if (kamp?.sigte === s && s.klar) { s.klar = false; world.visSigte(null); resolve('forsent'); } }, tid * 1000);
  });
}
function tegnSigte() {
  const s = kamp.sigte;
  const knap = s.superOk && kamp.superskud > 0
    ? `<button class="superknap" data-a="superskud" aria-pressed="${s.super}">${s.super ? 'Superskud er klar' : `Brug superskud (${kamp.superskud})`}</button>` : '';
  show('s-finale', `${skudHud()}<span></span><div class="bund">${knap}<div class="hint">${s.super ? 'Superskud: tryk i målet!' : s.tekst}</div></div>`);
}
async function affyr(x, y) {
  const s = kamp?.sigte;
  if (!s || !s.klar) return;
  const pt = world.sigtepunkt(x, y);
  if (!pt) return;
  s.klar = false;
  clearTimeout(s.timer);
  const brugSuper = s.super && kamp.superskud > 0;
  if (brugSuper) kamp.superskud--;
  show('s-finale', `${skudHud()}<span></span><span></span>`);
  s.resolve(await world.skyd(pt, () => lyd.spark(), brugSuper, s.zone));
}
/** Vis resultatet af et skud, og giv point og lyd. navn bruges af kommentatoren. */
async function visSkud(res, k, navn = me.navn, giv = givPoint) {
  const maal = res === 'maal';
  if (maal) {
    giv(MAAL_POINT); lyd.jubel(); publikum(1);
    kommentar(`Mål! ${navn} scorer!`);
  } else if (res === 'stolpe') { lyd.stolpe(); kommentar('Stolpen!'); } else { lyd.aah(); if (res === 'reddet') kommentar('Målmanden redder!'); }
  const tekst = { maal: `Mååål!<small>+${MAAL_POINT} point</small>`, reddet: 'Reddet!', stolpe: 'Stolpen!', forbi: 'Forbi!', forsent: 'For sent!' }[res];
  show('s-finale', `${skudHud()}<div class="shout ${maal ? '' : 'no'}">${tekst}</div><span></span>`);
  await wait(maal ? 1900 : 1500);
  if (kamp === k) publikum(0.3);
}
/** En chance midt i kampen: skiftevis et frispark og en friløber, hvor målmanden løber ud. */
async function chance(k) {
  const friloeber = k.chancer % 2 === 1;
  k.chancer++;
  k.fase = 'chance';
  world.startChance(friloeber);
  lyd.floejte();
  publikum(0.7);
  show('s-finale', `${skudHud()}<div class="shout">${friloeber ? 'Friløber!' : 'Frispark!'}<small>${friloeber ? 'Skyd, før målmanden når frem' : 'Tre rigtige giver et skud på mål'}</small></div><span></span>`);
  await wait(1300);
  if (kamp !== k) return;
  const res = await etSkud({ tekst: friloeber ? 'Skynd dig: tryk i målet!' : 'Tryk i målet, dér hvor du vil skyde', tid: friloeber ? 5 : 0 });
  if (kamp !== k) return;
  if (res === 'forsent') world.goalie.play('cheer');
  if (res === 'maal') { k.maal++; if (taelDag(me, 'maal')) k.dagKlaret = true; }
  await visSkud(res, k);
  if (kamp !== k) return;
  world.slutChance();
}

// ------------------------------------------------------------ finale
function startFinale() {
  const antal = Math.max(1, Math.ceil(kamp.rigtige / 2));
  kamp.finale = { antal, nr: 0 };
  kamp.fase = 'finale';
  const t = kamp.turnering;
  const bonus = kamp.antal >= 10 ? PERFEKT_BONUS : Math.round(PERFEKT_BONUS / 2);
  const perfekt = kamp.svar.filter((s) => s === true).length === kamp.antal;
  if (perfekt) givPoint(bonus);
  world.startFinale(me.figur, kit(me), t ? { rival: t.figur, klog: t.klog } : { klog: 0.3 + 0.025 * me.klasse });
  world.setUdstyr(udstyr(me), kit(me));
  lyd.floejte();
  publikum(0.6);
  show('s-finale', `${skudHud()}<div class="callout">
    <h2>Finalen</h2>
    <p>Du fik ${kamp.rigtige} af ${kamp.antal} rigtige${perfekt ? ` og ${bonus} bonuspoint for en fejlfri kamp` : ''}.
    Det giver ${antal} skud på mål. Hvert mål giver ${MAAL_POINT} point.</p>
    ${t ? `<p><b>${t.navn}: du har ${kamp.maal} mål og skal have mindst ${t.krav} for at vinde over ${HOLD[t.figur].navn}.</b></p>` : ''}
    ${kamp.superskud ? `<p class="unlock">Du har ${kamp.superskud} superskud: en ildkugle, som målmanden ikke kan redde.</p>` : ''}
    ${btn('klar', 'Jeg er klar', 'big')}</div><span></span>`);
}
async function finaleLoop() {
  const k = kamp, f = k.finale;
  while (f.nr < f.antal) {
    world.resetSkud();
    const res = await etSkud({ tekst: `Skud ${f.nr + 1} af ${f.antal}: tryk i målet, dér hvor du vil skyde` });
    if (kamp !== k) return;
    const maal = res === 'maal';
    k.skud[f.nr] = maal;
    f.nr++;
    if (maal) { k.maal++; if (taelDag(me, 'maal')) k.dagKlaret = true; }
    await visSkud(res, k);
    if (kamp !== k) return;
  }
  skaermResultat();
}

function skaermResultat() {
  const k = kamp;
  const rekord = k.point > me.bedsteKamp && me.kampe > 0;
  me.kampe++; me.maal += k.maal; me.rigtige += k.rigtige; me.besvaret += k.antal;
  me.bedsteKamp = Math.max(me.bedsteKamp, k.point);
  samling(me);
  me.pakker++;
  if (taelDag(me, 'kampe')) k.dagKlaret = true;
  // pokalturnering: videre, vundet eller ude
  let tur = '';
  if (k.turnering && me.turnering) {
    const t = k.turnering;
    if (k.maal >= t.krav) {
      me.turnering.runde++;
      if (me.turnering.runde >= RUNDER.length) {
        me.turnering = null;
        me.turneringer = (me.turneringer | 0) + 1;
        me.point += TURNERING_POINT; me.pointIAlt += TURNERING_POINT; me.pakker += 2;
        tur = `<p class="unlock">Du har vundet pokalturneringen! Turneringspokalen står nu i dit omklædningsrum, og du får ${TURNERING_POINT} point og to ekstra kortpakker.</p>`;
        kommentar(`${me.navn} vinder pokalturneringen!`);
      } else {
        tur = `<p class="unlock">Sejr over ${HOLD[t.figur].navn}! Du er videre til ${RUNDER[me.turnering.runde].navn.toLowerCase()}n.</p><div class="row">${btn('turnering', 'Næste turneringskamp', 'big')}</div>`;
      }
    } else {
      me.turnering = null;
      tur = `<p class="error">${HOLD[t.figur].navn} vandt: du scorede ${k.maal} mål, og der skulle ${t.krav} til. Turneringen starter forfra.</p><div class="row">${btn('turnering', 'Prøv turneringen igen', 'ghost')}</div>`;
    }
  }
  const nye = nyeFigurer(me);
  const r = raekke(me);
  const oprykket = r.nr > k.raekkeFoer;
  if (oprykket) { lyd.jubel(); kommentar(`Oprykning! ${me.navn} spiller nu i ${r.navn}.`); }
  const gemt = db.gem(me);
  kamp = null;
  publikum(0);
  hero(me);
  world.player.play(k.rigtige >= k.antal / 2 ? 'cheer' : 'idle');
  const plads = db.topscore().findIndex((p) => p.id === me.id) + 1;
  const andel = k.rigtige / k.antal;
  show('s-result', `<div class="panel">
    <h1>${andel >= 0.8 ? 'Kæmpe kamp!' : andel >= 0.5 ? 'Godt spillet!' : 'Kampen er slut'}</h1>
    ${oprykket ? `<p class="unlock">Oprykning! Du spiller nu i ${r.navn}.</p>` : ''}
    ${rekord ? '<p class="saved">Ny rekord: din bedste kamp indtil nu.</p>' : ''}
    ${tur}
    ${k.dagKlaret ? `<p class="unlock">Dagens udfordring klaret: ${DAG_POINT} point og en ekstra kortpakke.</p>` : ''}
    <div class="stats">
      <div class="stat"><b>${k.rigtige}/${k.antal}</b><span>rigtige svar</span></div>
      <div class="stat"><b>${k.maal}</b><span>mål</span></div>
      <div class="stat"><b>+${k.point}</b><span>point</span></div>
    </div>
    <p>Du har nu <b>${me.pointIAlt} point</b> og ligger nummer ${plads} på topscoren.</p>
    ${maalHtml()}
    <p class="${gemt ? 'saved' : 'error'}">${gemt ? 'Dine point er gemt.' : 'Pointene kunne ikke gemmes på denne enhed.'}</p>
    ${nye.map((f) => `<p class="unlock">Ny figur låst op: ${FIGURER[f]}! Vælg den under „Ret spiller“.</p>`).join('')}
    <div class="row">${btn('pakke', me.pakker > 1 ? `Åbn dine kortpakker (${me.pakker})` : 'Åbn din kortpakke', 'big')}</div>
    <div class="row">${btn('spil', 'Spil igen', 'ghost')}${btn('butik', 'Butik', 'ghost')}${btn('top', 'Topscore', 'ghost')}${btn('hub', 'Omklædningsrum', 'ghost')}</div>
  </div>`);
}

// ------------------------------------------------------------ to spillere på samme enhed
function skaermDuelValg() {
  const andre = db.profiler().filter((p) => p.id !== me.id);
  hero(me);
  show('s-profiles', `<div class="panel">
    <h1>To spillere</h1>
    <p>I skiftes til at svare på fem opgaver hver, med hver jeres klassetrin. Bagefter skyder I straffespark mod hinanden, og den anden er målmand.</p>
    ${andre.length ? `<p class="muted">Hvem skal ${esc(me.navn)} spille mod?</p><div class="list">${andre.map((p) => kort(p, 'duel')).join('')}</div>`
    : `<p class="unlock">Der skal være to spillere på denne enhed. Opret en spiller mere først.</p>${btn('ny', 'Ny spiller')}`}
    ${btn('hub', 'Tilbage', 'ghost')}
  </div>`);
}
async function startDuel(id) {
  const b = db.profiler().find((p) => p.id === id);
  if (!b) return skaermDuelValg();
  try { await world.loadFigur(b.figur); } catch { return; }
  kamp = { duel: { sp: [me, b], tur: 0, rigtige: [0, 0], maal: [0, 0], point: [0, 0] }, antal: 10, nr: 0, svar: [], point: 0, laast: false,
    q: null, indtastet: '', forsoeg: 0, fase: 'opgaver', superskud: 0, sigte: null, zoneValg: null };
  world.startMatch(me.figur, kit(me), { rival: b.figur, rivalKit: kit(b) });
  world.setUdstyr(udstyr(me), kit(me));
  lyd.floejte();
  publikum(0.4);
  duelOpgave();
}
function duelHud() {
  const d = kamp.duel;
  const side = (i) => `<span class="duelnavn ${kamp.fase === 'opgaver' && d.tur === i ? 'tur' : ''}" style="--c1:${d.sp[i].farve1}">${esc(d.sp[i].navn)}</span>`;
  const tal = kamp.fase === 'opgaver' ? d.rigtige : d.maal;
  return `<div class="hud"><button class="quit" data-a="stop">Stop</button><div class="duel">${side(0)}<b>${tal[0]} – ${tal[1]}</b>${side(1)}</div>
    <div class="score">${kamp.fase === 'opgaver' ? 'rigtige' : 'mål'}</div></div>`;
}
function duelOpgave() {
  const k = kamp, d = k.duel;
  if (k.nr >= k.antal) return duelFinale();
  d.tur = k.nr % 2;
  const p = d.sp[d.tur];
  const q = k.q = lavOpgave(arter(p), p.klasse, p.niveau, juster(p));
  k.valg = p.klasse <= 3 ? svarmuligheder(q) : null;
  k.indtastet = '';
  k.laast = false;
  tegnOpgave(`${esc(p.navn)}s tur · ${OPS[q.op]}`);
  if (p.oplaesning) sig(q.say);
}
async function duelSvar(f, knap) {
  const k = kamp, d = k.duel;
  if (!k || k.laast) return;
  k.laast = true;
  stopTale();
  const q = k.q, rigtigt = same(f, q.answer);
  ui.querySelectorAll('.answers button').forEach((b) => b.setAttribute('disabled', ''));
  const flash = document.getElementById('flash');
  if (rigtigt) {
    d.rigtige[d.tur]++; d.point[d.tur] += 10;
    lyd.rigtigt(); knap?.classList.add('right');
    flash.className = 'flash ok'; flash.textContent = `Rigtigt, ${d.sp[d.tur].navn}!`;
  } else {
    lyd.forkert(); knap?.classList.add('wrong');
    if (k.valg) ui.querySelectorAll('.choice').forEach((b) => { if (same(k.valg[Number(b.dataset.i)], q.answer)) b.classList.add('right'); });
    flash.className = 'flash no'; flash.innerHTML = `Svaret var ${fHtml(q.answer, q.style)}`;
  }
  // spiller 1 dribler frem ved rigtigt svar; spiller 2 erobrer bolden ved sit rigtige svar
  await Promise.all([rigtigt ? world.matchStep(d.tur === 0) : wait(0), wait(rigtigt ? 1300 : 2200)]);
  if (kamp !== k) return;
  k.nr++;
  duelOpgave();
}
function duelFinale() {
  const k = kamp, d = k.duel;
  k.fase = 'finale';
  d.antal = d.rigtige.map((r) => Math.max(1, Math.ceil(r / 2)));
  lyd.floejte();
  show('s-finale', `${duelHud()}<div class="callout">
    <h2>Straffespark</h2>
    <p>${esc(d.sp[0].navn)} fik ${d.rigtige[0]} rigtige og har ${d.antal[0]} skud. ${esc(d.sp[1].navn)} fik ${d.rigtige[1]} rigtige og har ${d.antal[1]} skud.</p>
    <p>Den, der ikke skyder, er målmand og vælger i hemmelighed, hvor han kaster sig.</p>
    ${btn('duelKlar', 'Vi er klar', 'big')}</div><span></span>`);
}
function vaelgZone(vogter, skytte) {
  return new Promise((resolve) => {
    kamp.zoneValg = resolve;
    show('s-finale', `${duelHud()}<div class="callout">
      <h2>${esc(vogter.navn)} er målmand</h2>
      <p>Vælg, hvor du kaster dig. ${esc(skytte.navn)} må ikke kigge!</p>
      <div class="row" style="justify-content:center">${btn('zone', 'Venstre', '', 'data-v="1"')}${btn('zone', 'Midten', '', 'data-v="0"')}${btn('zone', 'Højre', '', 'data-v="-1"')}</div>
    </div><span></span>`);
  });
}
async function duelLoop() {
  const k = kamp, d = k.duel;
  for (let r = 0; r < Math.max(...d.antal); r++) {
    for (const i of [0, 1]) {
      if (r >= d.antal[i]) continue;
      const skytte = d.sp[i], vogter = d.sp[1 - i];
      world.startFinale(skytte.figur, kit(skytte), { rival: vogter.figur, keeperKit: kit(vogter) });
      world.setUdstyr(udstyr(skytte), kit(skytte));
      const zone = await vaelgZone(vogter, skytte);
      if (kamp !== k) return;
      const res = await etSkud({ tekst: `${esc(skytte.navn)}: tryk i målet, dér hvor du vil skyde`, superOk: false, zone });
      if (kamp !== k) return;
      if (res === 'maal') d.maal[i]++;
      await visSkud(res, k, skytte.navn, (n) => { d.point[i] += n; });
      if (kamp !== k) return;
    }
  }
  duelResultat();
}
function duelResultat() {
  const d = kamp.duel;
  const vinder = d.maal[0] !== d.maal[1] ? (d.maal[0] > d.maal[1] ? 0 : 1) : d.rigtige[0] !== d.rigtige[1] ? (d.rigtige[0] > d.rigtige[1] ? 0 : 1) : -1;
  d.sp.forEach((p, i) => {
    if (vinder === i) d.point[i] += 50;
    p.point += d.point[i]; p.pointIAlt += d.point[i];
    p.kampe++; p.maal += d.maal[i]; p.rigtige += d.rigtige[i]; p.besvaret += 5;
    nyeFigurer(p);
    db.gem(p);
  });
  const modstander = d.sp[1];
  kamp = null;
  publikum(0);
  hero(vinder === 1 ? modstander : me);
  world.player.play('cheer');
  if (vinder >= 0) kommentar(`${d.sp[vinder].navn} vinder duellen!`);
  show('s-result', `<div class="panel">
    <h1>${vinder < 0 ? 'Uafgjort!' : `${esc(d.sp[vinder].navn)} vinder!`}</h1>
    <div class="list">${d.sp.map((p, i) => `<div class="item ${vinder === i ? 'on' : ''}"><span><b>${esc(p.navn)}</b><small>${d.rigtige[i]} rigtige · ${d.maal[i]} mål</small></span>
      <span class="inuse">+${d.point[i]} p</span></div>`).join('')}</div>
    <p class="muted">${vinder < 0 ? 'Lige mange mål og lige mange rigtige svar.' : 'Vinderen får 50 point ekstra.'} Pointene er gemt hos jer begge.</p>
    <div class="row">${btn('duel', 'Omkamp', 'big', `data-id="${modstander.id}"`)}</div>
    <div class="row">${btn('hub', 'Omklædningsrum', 'ghost')}</div>
  </div>`);
}

// ------------------------------------------------------------ samlekort
function skaermPakke() {
  samling(me);
  if (me.pakker <= 0) return skaermAlbum();
  const { kort, nyt, point } = traekKort(me);
  const nye = nyeFigurer(me);
  db.gem(me);
  if (kort.sjaeldenhed === 'guld') lyd.jubel(); else lyd.rigtigt();
  hero(me);
  show('s-pack', `<div class="callout pack">
    <h2>${kort.sjaeldenhed === 'guld' ? 'Guldkort!' : nyt ? 'Nyt kort!' : 'Dublet'}</h2>
    <div class="reveal">${kortHtml(kort, 1)}</div>
    <p>${nyt ? `Du har nu ${antalKort(me)} af ${alleKort().length} kort.` : `Du havde kortet i forvejen, så du får ${point} point i stedet.`}</p>
    ${nye.map((f) => `<p class="unlock">Ny figur låst op: ${FIGURER[f]}! Vælg den under „Ret spiller“.</p>`).join('')}
    <div class="row" style="justify-content:center">${me.pakker > 0 ? btn('pakke', `Åbn næste pakke (${me.pakker})`) : ''}${btn('album', 'Se album', 'ghost')}${btn('spil', 'Spil igen', 'ghost')}${btn('hub', 'Omklædningsrum', 'ghost')}</div>
  </div>`);
}
function skaermAlbum() {
  const ejet = samling(me);
  hero(me);
  const kort = alleKort().map((k, i) => (ejet[k.id]
    ? `<button class="slot" data-a="visKort" data-id="${k.id}" aria-label="${esc(k.navn)}">${kortHtml(k, ejet[k.id])}</button>`
    : `<div class="slot"><div class="kort mangler r-${k.sjaeldenhed}"><span>${i + 1}</span><small>${SJAELDENHED[k.sjaeldenhed]}</small></div></div>`)).join('');
  const figurer = Object.entries(LAASE).map(([f, l]) => {
    const [har, skal] = l.status(me);
    const ok = har >= skal;
    return `<div class="item ${ok ? 'on' : ''}"><span><b>${FIGURER[f]}</b><small>${l.tekst}</small>
      <span class="progress"><i style="width:${Math.min(100, Math.round((har / skal) * 100))}%"></i></span></span>
      <span class="${ok ? 'inuse' : 'need'}">${ok ? 'Låst op' : `${Math.min(har, skal)} af ${skal}`}</span></div>`;
  }).join('');
  show('s-album', `<div class="panel wide">
    <div class="row spread"><h1>Album</h1><span class="wallet">${antalKort(me)}/${alleKort().length}</span></div>
    ${me.pakker > 0 ? `<div class="row">${btn('pakke', `Åbn kortpakke (${me.pakker})`)}</div>` : '<p class="muted">Du får en kortpakke, hver gang du har spillet en kamp færdig.</p>'}
    <div class="album">${kort}</div>
    <section class="shop"><h2>Hemmelige figurer</h2>${figurer}</section>
    ${btn('hub', 'Tilbage', 'ghost')}
  </div>`);
}
function skaermKort(id) {
  const k = alleKort().find((x) => x.id === id);
  if (!k) return skaermAlbum();
  show('s-pack', `<div class="callout pack"><div class="reveal">${kortHtml(k, samling(me)[k.id])}</div>
    <div class="row" style="justify-content:center">${btn('album', 'Tilbage til album', 'ghost')}</div></div>`);
}

// ------------------------------------------------------------ butik
let proeve = null;   // det, man kigger på i butikken uden at have købt det: { k, id } eller { k } for næste trin
function skaermButik(besked = '', scroll = 0) {
  const o = udstyr(me);
  // vis spilleren med det, man prøver, uden at ændre det, der er gemt
  const vis = structuredClone(o);
  let proeveNavn = '';
  if (proeve?.id) { vis.valgt[proeve.k] = proeve.id; proeveNavn = VALG[proeve.k].ting[proeve.id].navn; }
  else if (proeve) { vis[proeve.k] = o[proeve.k] + 1; proeveNavn = TRIN[proeve.k].trin[vis[proeve.k]].navn; }
  const k2 = { farve1: me.farve1, farve2: me.farve2, nummer: me.nummer, ...vis.valgt };
  world.showHero(me.figur, k2);
  world.setUdstyr(vis, k2);
  if (proeve?.k === 'jubel') world.player.play('cheer');
  if (proeve?.k === 'tilskuere' && vis.tilskuere === 8) world.fyrStart(-9);
  if (proeve?.k === 'tilskuere' && vis.tilskuere === 7) world.konfettiStart(-4);
  const koebKnap = (a, k, id, pris) => (me.point >= pris
    ? `<button class="buy" data-a="${a}" data-k="${k}" data-id="${id}">Køb · ${pris} p</button>`
    : `<span class="need">${pris} p<br>mangler ${pris - me.point}</span>`);
  const seKnap = (k, id) => {
    const aktiv = proeve && proeve.k === k && (proeve.id || '') === id;
    return `<button class="buy use" data-a="proev" data-k="${k}" data-id="${id}" aria-pressed="${!!aktiv}">${aktiv ? 'Vises' : 'Se'}</button>`;
  };
  const trin = Object.entries(TRIN).map(([k, kat]) => {
    const naeste = kat.trin[o[k] + 1], krav = kraeverTekst(me, k);
    const prikker = kat.trin.map((_, i) => `<i class="${i <= o[k] ? 'ok' : ''}"></i>`).join('');
    return `<section class="shop"><h2>${kat.navn}</h2>
      <div class="levels" aria-hidden="true">${prikker}</div>
      <p class="muted">Level ${o[k] + 1} af ${kat.trin.length}: ${kat.trin[o[k]].navn}</p>
      ${!naeste ? '<p class="saved">Du har nået det højeste level.</p>'
    : `<div class="item"><span><b>Level ${o[k] + 2}: ${naeste.navn}</b><small>${naeste.tekst}</small></span><span class="acts">${seKnap(k, '')}${
      krav ? `<span class="need">Kræver<br>${krav}</span>` : koebKnap('koebTrin', k, '', naeste.pris)}</span></div>`}</section>`;
  }).join('');
  const valg = Object.entries(VALG).map(([k, kat]) => `<section class="shop"><h2>${kat.navn}</h2>
    ${Object.entries(kat.ting).map(([id, t]) => {
    const ejer = o.ejet[k].includes(id), iBrug = o.valgt[k] === id;
    return `<div class="item ${iBrug ? 'on' : ''}"><span><b>${t.navn}</b></span><span class="acts">${iBrug ? '<span class="inuse">I brug</span>'
      : ejer ? `<button class="buy use" data-a="brug" data-k="${k}" data-id="${id}">Brug</button>` : seKnap(k, id) + koebKnap('koebTing', k, id, t.pris)}</span></div>`;
  }).join('')}</section>`).join('');
  const info = proeveNavn ? `Du kigger på: ${proeveNavn}. Det er ikke købt endnu.`
    : besked || 'Tryk „Se“ for at prøve noget, før du køber. Du tjener point ved at svare rigtigt og score.';
  show('s-shop', `<div class="panel">
    <div class="row spread"><h1>Butik</h1><span class="wallet">${me.point} p</span></div>
    <p class="${proeveNavn ? 'unlock' : besked ? 'saved' : 'muted'}" aria-live="polite">${info}</p>
    ${trin}${valg}
    ${btn('hub', 'Tilbage', 'ghost')}
  </div>`);
  ui.firstElementChild.scrollTop = scroll;
}
function handel(ok, besked, jubel) {
  const scroll = ui.firstElementChild.scrollTop;
  proeve = null;
  if (ok) { db.gem(me); lyd.rigtigt(); }
  skaermButik(ok ? besked : '', scroll);
  if (ok && jubel) world.player.play('cheer');
}

// ------------------------------------------------------------ hændelser
const handlinger = {
  ny: () => nyDraft(null),
  vaelg: (el) => { me = db.vaelg(el.dataset.id); skaermHub(); },
  set: async (el) => {
    laesFelter();
    const { k, v } = el.dataset;
    if (k === 'figur') { try { await world.loadFigur(v); } catch { return; } }
    draft[k] = v;
    skaermOpret();
  },
  art: (el) => {
    const alle = Object.keys(OPS), v = el.dataset.v;
    let valgt = arter(me);
    if (v === 'alle') valgt = valgt.length === alle.length ? ['plus'] : alle;
    else if (valgt.includes(v)) { if (valgt.length > 1) valgt = valgt.filter((x) => x !== v); }
    else valgt = alle.filter((x) => valgt.includes(x) || x === v);
    me.regnearter = valgt;
    db.gem(me);
    skaermIndstil(ui.firstElementChild.scrollTop);
  },
  turnering: async () => {
    if (!me.turnering) {
      const mulige = Object.keys(FIGURER).filter((f) => f !== me.figur && world.assets[f]).sort(() => Math.random() - 0.5);
      me.turnering = { runde: 0, hold: mulige.slice(0, RUNDER.length) };
      db.gem(me);
    }
    skaermTurnering();
  },
  spilTurnering: async () => {
    try { await world.loadFigur(me.turnering.hold[me.turnering.runde]); } catch { return; }
    startKamp({ turnering: true });
  },
  superskud: () => { const s = kamp?.sigte; if (s?.klar && kamp.superskud > 0) { s.super = !s.super; tegnSigte(); } },
  indstillinger: () => skaermIndstil(),
  grafik: async (el) => {
    try { localStorage.setItem(GRAFIK, el.dataset.v); if (el.dataset.v !== 'auto') localStorage.removeItem(GRAFIK + '.maalt'); } catch { /* ingen lagring */ }
    const scroll = ui.firstElementChild.scrollTop;
    await world.setKvalitet(skalVaereLet());
    if (ui.className === 's-settings') skaermIndstil(scroll);
  },
  pakke: () => skaermPakke(),
  album: () => skaermAlbum(),
  visKort: (el) => skaermKort(el.dataset.id),
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
  indstil: (el) => { me[el.dataset.k] = el.dataset.v; me.justering = 0; db.gem(me); skaermIndstil(ui.firstElementChild.scrollTop); },
  klasse: (el) => { me.klasse = Math.max(0, Math.min(10, me.klasse + Number(el.dataset.v))); me.justering = 0; db.gem(me); skaermIndstil(ui.firstElementChild.scrollTop); },
  skift: (el) => { const felt = el.dataset.k; me[felt] = ['tilpas', 'kommentator'].includes(felt) ? me[felt] === false : !me[felt]; db.gem(me); setLyd(me.lyd); skaermIndstil(ui.firstElementChild.scrollTop); },
  spil: () => startKamp(),
  hurtig: () => startKamp({ antal: 5 }),
  toSpillere: () => skaermDuelValg(),
  duel: (el) => startDuel(el.dataset.id),
  duelKlar: () => duelLoop(),
  zone: (el) => { const r = kamp?.zoneValg; if (r) { kamp.zoneValg = null; r(Number(el.dataset.v)); } },
  top: () => skaermTop(),
  butik: () => { proeve = null; skaermButik(); },
  koebTrin: (el) => { const k = el.dataset.k; const ok = koebTrin(me, k); handel(ok, ok ? `Købt: ${TRIN[k].trin[udstyr(me)[k]].navn}` : ''); },
  koebTing: (el) => { const { k, id } = el.dataset; const ok = koebTing(me, k, id); handel(ok, ok ? `Købt: ${VALG[k].ting[id].navn}` : '', k === 'jubel'); },
  brug: (el) => { const { k, id } = el.dataset; const ok = brugTing(me, k, id); handel(ok, ok ? `Du bruger nu: ${VALG[k].ting[id].navn}` : '', k === 'jubel'); },
  proev: (el) => {
    const { k, id } = el.dataset;
    const samme = proeve && proeve.k === k && (proeve.id || '') === id;
    proeve = samme ? null : (id ? { k, id } : { k });
    skaermButik('', ui.firstElementChild.scrollTop);
  },
  hub: () => skaermHub(),
  ret: () => nyDraft(me),
  spillere: () => skaermSpillere(),
  stop: () => { publikum(0); skaermHub(); },
  laesop: () => kamp?.q && sig(kamp.q.say),
  svar: (el) => (kamp.duel ? duelSvar : besvar)(kamp.valg[Number(el.dataset.i)], el),
  tast: (el) => tast(el.dataset.k),
  indsend: () => indsend(),
  klar: () => finaleLoop(),
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
  if (!kamp || kamp.laast || !kamp.q || kamp.fase !== 'opgaver') return;
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
  if (kamp?.sigte?.klar && e.pointerType === 'mouse') world.visSigte(world.sigtepunkt(e.clientX, e.clientY));
});
stage.addEventListener('pointerdown', (e) => { if (kamp?.sigte?.klar) affyr(e.clientX, e.clientY); });

// ------------------------------------------------------------ start
(async function start() {
  world.setKvalitet(skalVaereLet());
  world.onLangsom = () => {
    if (grafikValg() !== 'auto') return;
    try { localStorage.setItem(GRAFIK + '.maalt', 'lav'); } catch { /* ingen lagring */ }
    world.setKvalitet(true);
  };
  try {
    const ekstra = db.profiler().map((p) => p.figur).filter((f) => FIGURER[f] && !GRUNDFIGURER.includes(f));
    await Promise.all([world.load((k) => { document.getElementById('bar').style.width = `${Math.round(k * 100)}%`; }, ekstra), hentKort(),
      document.fonts?.load('800 40px "Barlow Condensed"').catch(() => {})]);
  } catch (err) {
    console.error(err);
    show('s-load', '<div class="loadbox"><h1 class="logo">Øv!</h1><p>Spillet kunne ikke hente banen. Tjek forbindelsen, og genindlæs siden.</p></div>');
    return;
  }
  // hent de hemmelige figurer i baggrunden, så de er klar, når de bliver låst op
  Object.keys(FIGURER).forEach((f) => world.loadFigur(f).catch(() => {}));
  me = db.aktiv();
  if (me) skaermHub(); else if (db.profiler().length) skaermSpillere(); else nyDraft(null);
})();

// til fejlfinding og test
window.__spil = { world, db, get kamp() { return kamp; }, get me() { return me; }, testNaeste: () => naesteOpgave() };
