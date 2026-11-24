// Dagens udfordring: én lille opgave om dagen, valgt ud fra datoen. Belønning: point og en ekstra kortpakke.
import { samling } from './cards.js';

export const DAG_POINT = 100;
const LISTE = [
  { id: 'maal', n: 4, tekst: 'Scor 4 mål i finaler' },
  { id: 'rigtige', n: 20, tekst: 'Svar rigtigt på 20 opgaver' },
  { id: 'stribe', n: 6, tekst: 'Få 6 rigtige i træk i én kamp' },
  { id: 'kampe', n: 2, tekst: 'Spil 2 kampe færdig' },
  { id: 'plus', n: 8, tekst: 'Svar rigtigt på 8 plus-opgaver' },
  { id: 'minus', n: 8, tekst: 'Svar rigtigt på 8 minus-opgaver' },
  { id: 'gange', n: 8, tekst: 'Svar rigtigt på 8 gange-opgaver' },
  { id: 'divider', n: 8, tekst: 'Svar rigtigt på 8 divisions-opgaver' },
  { id: 'broek', n: 8, tekst: 'Svar rigtigt på 8 brøk-opgaver' },
];
const iDag = () => new Date().toLocaleDateString('sv-SE');   // ÅÅÅÅ-MM-DD i lokal tid

/** Dagens udfordring for spilleren: { u, har, faerdig }. Nulstiller tællerne, når datoen skifter. */
export function dagens(p, dato = iDag()) {
  if (!p.dag || p.dag.dato !== dato) p.dag = { dato, taeller: {}, faerdig: false };
  const h = [...dato].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
  const u = LISTE[h % LISTE.length];
  return { u, har: Math.min(u.n, p.dag.taeller[u.id] | 0), faerdig: p.dag.faerdig };
}
/** Tæl noget med (fx 'maal' eller 'plus'). hoejest: gem den højeste værdi i stedet for at lægge til.
 *  Giver true i det øjeblik, dagens udfordring bliver klaret. */
export function taelDag(p, id, n = 1, hoejest = false) {
  const { u } = dagens(p);
  const t = p.dag.taeller;
  t[id] = hoejest ? Math.max(t[id] | 0, n) : (t[id] | 0) + n;
  if (p.dag.faerdig || (t[u.id] | 0) < u.n) return false;
  p.dag.faerdig = true;
  p.point += DAG_POINT;
  p.pointIAlt += DAG_POINT;
  samling(p);
  p.pakker++;
  return true;
}
