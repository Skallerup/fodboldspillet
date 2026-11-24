// Samlekort: man får en kortpakke efter hver kamp. Kortene står i assets/cards/cards.json,
// og billederne er renderet i Blender (tools/blender/build_assets.py --cards).
let KORT = [];
export const SJAELDENHED = { alm: 'Almindeligt', sjaelden: 'Sjældent', guld: 'Guld' };
const CHANCE = { alm: 62, sjaelden: 30, guld: 8 };      // procent
const DUBLET_POINT = { alm: 15, sjaelden: 30, guld: 75 };

export async function hentKort() {
  KORT = await (await fetch('assets/cards/cards.json')).json();
  return KORT;
}
export const alleKort = () => KORT;
export function samling(p) {
  p.kort ||= {};
  p.pakker = p.pakker | 0;
  return p.kort;
}
export const antalKort = (p) => KORT.filter((k) => samling(p)[k.id]).length;

/** Åbn en pakke: giver { kort, nyt, point }. Dubletter veksles til point. */
export function traekKort(p, tilfaeldig = Math.random) {
  const ejet = samling(p);
  let r = tilfaeldig() * 100;
  let sj = 'alm';
  for (const [k, pct] of Object.entries(CHANCE)) { if (r < pct) { sj = k; break; } r -= pct; }
  const pulje = KORT.filter((k) => k.sjaeldenhed === sj);
  const nye = pulje.filter((k) => !ejet[k.id]);
  const fra = nye.length && tilfaeldig() < 0.6 ? nye : pulje;
  const kort = fra[Math.floor(tilfaeldig() * fra.length)];
  const nyt = !ejet[kort.id];
  ejet[kort.id] = (ejet[kort.id] || 0) + 1;
  const point = nyt ? 0 : DUBLET_POINT[sj];
  p.point += point;
  p.pointIAlt += point;
  p.pakker = Math.max(0, p.pakker - 1);
  return { kort, nyt, point };
}
