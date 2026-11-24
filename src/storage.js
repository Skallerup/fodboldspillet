// Profiler og point gemmes lokalt i browseren (localStorage). Intet sendes ud af enheden.
const KEY = 'fodboldspillet.v1';

function read() {
  try {
    const db = JSON.parse(localStorage.getItem(KEY));
    if (db && Array.isArray(db.profiles)) return db;
  } catch { /* tom eller ødelagt: start forfra */ }
  return { profiles: [], aktiv: null };
}
let db = read();
function write() {
  try { localStorage.setItem(KEY, JSON.stringify(db)); return true; } catch { return false; }
}

export const profiler = () => db.profiles;
export const aktiv = () => db.profiles.find((p) => p.id === db.aktiv) || null;
export function vaelg(id) { db.aktiv = id; write(); return aktiv(); }

export function opret(data) {
  const p = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    navn: 'Spiller', alder: 8, klasse: 2, niveau: 'mellem', regneart: 'blandet',
    hold: 'FC Lynet', nummer: 10, farve1: '#D81E2C', farve2: '#F4F4F0', kampraab: 'Kom så!', figur: 'rhino',
    point: 0, pointIAlt: 0, bedsteKamp: 0, kampe: 0, maal: 0, rigtige: 0, besvaret: 0,
    lyd: true, oplaesning: true, opgraderinger: {}, oprettet: new Date().toISOString(),
    ...data,
  };
  db.profiles.push(p);
  db.aktiv = p.id;
  write();
  return p;
}
export function gem(p) {
  const i = db.profiles.findIndex((x) => x.id === p.id);
  if (i >= 0) db.profiles[i] = p;
  return write();
}
export function slet(id) {
  db.profiles = db.profiles.filter((p) => p.id !== id);
  if (db.aktiv === id) db.aktiv = null;
  write();
}
export const topscore = () => [...db.profiles].sort((a, b) => b.pointIAlt - a.pointIAlt || b.bedsteKamp - a.bedsteKamp);
