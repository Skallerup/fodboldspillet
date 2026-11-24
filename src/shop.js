// Butikken: hvad man kan købe for sine point, og hvad spilleren ejer og bruger.
import { SAET, harSaet, antalKort } from './cards.js';

/** Ting man opgraderer i ti levels. Level 1 har man fra start; hvert level gør det større og flottere. */
const trin = (navne, priser) => navne.map(([navn, tekst], i) => ({ navn, tekst, pris: priser[i] }));
export const TRIN = {
  stadion: { navn: 'Stadion', trin: trin([
    ['Græsbanen', 'En bane, to mål og et par træer'],
    ['Bander', 'Reklamebander hele vejen rundt om banen'],
    ['Tribuner på langsiderne', 'De første tilskuerpladser'],
    ['Tribuner bag målene', 'Nu er der tribuner hele vejen rundt'],
    ['Projektører', 'Fire høje lysmaster til aftenkampe'],
    ['Store tribuner på langsiderne', 'Plads til tusindvis af tilskuere'],
    ['Store tribuner bag målene', 'Et stadion i to etager'],
    ['Tag over tribunerne', 'Nu sidder alle i tørvejr'],
    ['Storskærm', 'En kæmpe skærm tårner sig op bag målet'],
    ['Mesterbuen', 'En hvid bue hen over hele stadion'],
  ], [0, 500, 800, 1100, 1500, 2000, 2600, 3400, 4700, 6200]) },
  tilskuere: { navn: 'Tilskuere og stemning', kraever: { stadion: 2 }, trin: trin([
    ['Tomme tribuner', 'Der er ingen kommet endnu'],
    ['De første tilskuere', 'En lille flok har fundet vej'],
    ['Halvfyldte tribuner', 'Rygtet om dit hold breder sig'],
    ['Fuldt hus', 'Alle pladser er optaget'],
    ['Maskotten Ørni', 'En stor gul fugl, der hepper på dig'],
    ['Flag i dine farver', 'Fansene hejser dit holds flag'],
    ['Kæmpebannere', 'Store bannere i holdets farver på tribunerne'],
    ['Konfettiregn', 'Meget mere konfetti, når du scorer'],
    ['Fyrværkeri', 'Himlen lyser op ved hvert mål'],
    ['Aftenkamp med lysshow', 'Mørket falder på, og lyskegler fejer hen over stadion'],
  ], [0, 400, 600, 900, 1200, 1600, 2100, 2700, 3500, 5000]) },
  pokaler: { navn: 'Pokalrum', trin: trin([
    ['Tomt podie', 'Her er plads til ni pokaler'],
    ['Kobberpokalen', 'Din første pokal'],
    ['Bronzepokalen', 'Lidt større end den første'],
    ['Jernpokalen', 'Tung og sej'],
    ['Sølvpokalen', 'Blank som en ny bold'],
    ['Stålpokalen', 'Den holder til det hele'],
    ['Perlepokalen', 'Den skinner helt hvidt'],
    ['Guldpokalen', 'Kun for de bedste'],
    ['Rosenguldpokalen', 'Sjælden og flot'],
    ['Mesterpokalen', 'Den største af dem alle'],
  ], [0, 450, 650, 900, 1300, 1800, 2400, 3100, 4100, 6000]) },
};

/** Ting man ejer flere af og vælger imellem. */
export const VALG = {
  troeje: { navn: 'Trøje', ting: {
    striber: { navn: 'Striber', pris: 0 },
    ensfarvet: { navn: 'Ensfarvet', pris: 450 },
    ringe: { navn: 'Tværstriber', pris: 600 },
    skraa: { navn: 'Skråbånd', pris: 750 },
    tern: { navn: 'Tern', pris: 750 },
    guld: { navn: 'Guldtrøjen', pris: 1800 },
    // sættrøjer: kan ikke købes, men fås ved at samle alle tre kort af et dyr
    ...Object.fromEntries(Object.entries(SAET).map(([figur, navn]) => [`saet_${figur}`, { navn, saet: figur }])),
  } },
  bold: { navn: 'Bold', ting: {
    klassisk: { navn: 'Klassisk', pris: 0 },
    neon: { navn: 'Neonbold', pris: 450 },
    guld: { navn: 'Guldbold', pris: 900 },
    ild: { navn: 'Ildbold', pris: 1500 },
  } },
  stoevler: { navn: 'Støvler', ting: {
    sort: { navn: 'Sorte', pris: 0 },
    hvid: { navn: 'Hvide', pris: 400 },
    roed: { navn: 'Røde lyn', pris: 400 },
    neon: { navn: 'Neon', pris: 600 },
    guld: { navn: 'Guldstøvler', pris: 1200 },
  } },
  jubel: { navn: 'Målfejring', ting: {
    hop: { navn: 'Hop', pris: 0 },
    dans: { navn: 'Sejrsdans', pris: 450 },
    flyver: { navn: 'Flyveren', pris: 900 },
    salto: { navn: 'Baglæns salto', pris: 1500 },
  } },
};

/** Spillerens udstyr med standardværdier (ældre gemte spillere mangler felterne). */
export function udstyr(p) {
  const o = (p.opgraderinger ||= {});
  if (!o.v) {   // spillere gemt før de ti levels: oversæt de gamle trin til de nye
    const haft = Object.keys(o).length > 0;
    o.stadion = haft ? [3, 4, 6, 7][o.stadion | 0] ?? 3 : 0;
    o.tilskuere = haft ? [3, 4, 5, 8][o.tilskuere | 0] ?? 3 : 0;
    o.pokaler = haft ? (o.pokaler | 0) : 0;
    o.v = 2;
  }
  for (const k of Object.keys(TRIN)) o[k] = Math.max(0, Math.min(TRIN[k].trin.length - 1, o[k] | 0));
  o.ejet ||= {};
  o.valgt ||= {};
  for (const [k, kat] of Object.entries(VALG)) {
    const gratis = Object.keys(kat.ting)[0];
    if (!Array.isArray(o.ejet[k])) o.ejet[k] = [];
    if (!o.ejet[k].includes(gratis)) o.ejet[k].unshift(gratis);
    for (const [id, t] of Object.entries(kat.ting)) if (t.saet && harSaet(p, t.saet) && !o.ejet[k].includes(id)) o.ejet[k].push(id);
    if (!o.ejet[k].includes(o.valgt[k])) o.valgt[k] = gratis;
  }
  return o;
}
/** Mangler spilleren noget for at kunne købe videre i en kategori? Giver fx 'Stadion level 3' eller ''. */
export function kraeverTekst(p, k) {
  const o = udstyr(p), krav = TRIN[k].kraever;
  if (!krav) return '';
  for (const [kat, lvl] of Object.entries(krav)) if (o[kat] < lvl) return `${TRIN[kat].navn} level ${lvl + 1}`;
  return '';
}

/** Køb næste trin. Giver true, hvis købet gik igennem. */
export function koebTrin(p, k) {
  const o = udstyr(p);
  const naeste = TRIN[k].trin[o[k] + 1];
  if (!naeste || p.point < naeste.pris || kraeverTekst(p, k)) return false;
  p.point -= naeste.pris;
  o[k]++;
  return true;
}
/** Køb en ting og tag den i brug. */
export function koebTing(p, k, id) {
  const o = udstyr(p);
  const ting = VALG[k].ting[id];
  if (!ting || ting.saet || o.ejet[k].includes(id) || p.point < ting.pris) return false;
  p.point -= ting.pris;
  o.ejet[k].push(id);
  o.valgt[k] = id;
  return true;
}
export function brugTing(p, k, id) {
  const o = udstyr(p);
  if (!o.ejet[k].includes(id)) return false;
  o.valgt[k] = id;
  return true;
}

// ---- hemmelige figurer, der låses op ved at nå et mål
export const LAASE = {
  shark: { tekst: 'Scor 15 mål i finaler', status: (p) => [p.maal | 0, 15] },
  dragon: { tekst: 'Svar rigtigt på 150 opgaver', status: (p) => [p.rigtige | 0, 150] },
  robot: { tekst: 'Saml 10 forskellige kort', status: (p) => [antalKort(p), 10] },
};
export function erLaastOp(p, figur) {
  if (!LAASE[figur]) return true;
  const [har, skal] = LAASE[figur].status(p);
  return har >= skal;
}
