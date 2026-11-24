// Butikken: hvad man kan købe for sine point, og hvad spilleren ejer og bruger.

/** Ting man køber ét trin ad gangen. Første trin har man fra start. */
export const TRIN = {
  stadion: { navn: 'Stadion', trin: [
    { navn: 'Træningsbanen' },
    { navn: 'Projektører', pris: 200, tekst: 'Fire høje lysmaster rundt om banen' },
    { navn: 'Store tribuner', pris: 500, tekst: 'Plads til tusindvis af tilskuere' },
    { navn: 'Tag over tribunerne', pris: 1000, tekst: 'Nu er det et rigtigt stadion' },
  ] },
  tilskuere: { navn: 'Tilskuere og maskot', trin: [
    { navn: 'Stille tribuner' },
    { navn: 'Maskotten Ørni', pris: 250, tekst: 'En stor gul fugl, der hepper på dig' },
    { navn: 'Flag i dine farver', pris: 400, tekst: 'Fansene hejser dit holds flag' },
    { navn: 'Fyrværkeri ved mål', pris: 700, tekst: 'Himlen lyser op, når du scorer' },
  ] },
  pokaler: { navn: 'Pokalskab', trin: [
    { navn: 'Tomt bord' },
    { navn: 'Bronzepokalen', pris: 300, tekst: 'Din første pokal' },
    { navn: 'Sølvpokalen', pris: 600, tekst: 'Blank som en ny bold' },
    { navn: 'Guldpokalen', pris: 1200, tekst: 'Kun for de bedste' },
    { navn: 'Mesterpokalen', pris: 2500, tekst: 'Den største af dem alle' },
  ] },
};

/** Ting man ejer flere af og vælger imellem. */
export const VALG = {
  troeje: { navn: 'Trøje', ting: {
    striber: { navn: 'Striber', pris: 0 },
    ensfarvet: { navn: 'Ensfarvet', pris: 100 },
    ringe: { navn: 'Tværstriber', pris: 150 },
    skraa: { navn: 'Skråbånd', pris: 250 },
    tern: { navn: 'Tern', pris: 250 },
    guld: { navn: 'Guldtrøjen', pris: 600 },
  } },
  bold: { navn: 'Bold', ting: {
    klassisk: { navn: 'Klassisk', pris: 0 },
    neon: { navn: 'Neonbold', pris: 100 },
    guld: { navn: 'Guldbold', pris: 300 },
    ild: { navn: 'Ildbold', pris: 500 },
  } },
  stoevler: { navn: 'Støvler', ting: {
    sort: { navn: 'Sorte', pris: 0 },
    hvid: { navn: 'Hvide', pris: 80 },
    roed: { navn: 'Røde lyn', pris: 80 },
    neon: { navn: 'Neon', pris: 150 },
    guld: { navn: 'Guldstøvler', pris: 400 },
  } },
  jubel: { navn: 'Målfejring', ting: {
    hop: { navn: 'Hop', pris: 0 },
    dans: { navn: 'Sejrsdans', pris: 150 },
    flyver: { navn: 'Flyveren', pris: 300 },
    salto: { navn: 'Baglæns salto', pris: 500 },
  } },
};

/** Spillerens udstyr med standardværdier (ældre gemte spillere mangler felterne). */
export function udstyr(p) {
  const o = (p.opgraderinger ||= {});
  for (const k of Object.keys(TRIN)) o[k] = Math.max(0, Math.min(TRIN[k].trin.length - 1, o[k] | 0));
  o.ejet ||= {};
  o.valgt ||= {};
  for (const [k, kat] of Object.entries(VALG)) {
    const gratis = Object.keys(kat.ting)[0];
    if (!Array.isArray(o.ejet[k])) o.ejet[k] = [];
    if (!o.ejet[k].includes(gratis)) o.ejet[k].unshift(gratis);
    if (!o.ejet[k].includes(o.valgt[k])) o.valgt[k] = gratis;
  }
  return o;
}

/** Køb næste trin. Giver true, hvis købet gik igennem. */
export function koebTrin(p, k) {
  const o = udstyr(p);
  const naeste = TRIN[k].trin[o[k] + 1];
  if (!naeste || p.point < naeste.pris) return false;
  p.point -= naeste.pris;
  o[k]++;
  return true;
}
/** Køb en ting og tag den i brug. */
export function koebTing(p, k, id) {
  const o = udstyr(p);
  const ting = VALG[k].ting[id];
  if (!ting || o.ejet[k].includes(id) || p.point < ting.pris) return false;
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
