// Lydeffekter lavet med Web Audio (ingen lydfiler) og oplæsning med browserens danske stemme.
let ctx = null;
let on = true;
export function setLyd(v) { on = v; }

function ac() {
  if (!ctx) { const C = window.AudioContext || window.webkitAudioContext; if (C) ctx = new C(); }
  if (ctx && ctx.state === 'suspended') ctx.resume();
  return ctx;
}
function tone(freq, start, dur, type = 'sine', vol = 0.18, slide = 0) {
  const c = ac(); if (!c || !on) return;
  const o = c.createOscillator(), g = c.createGain();
  const t = c.currentTime + start;
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(c.destination); o.start(t); o.stop(t + dur + 0.05);
}
// Alle lyde er rene toner. Tidligere blev publikum, jubel og spark lavet af filtreret støj,
// og det lød som sus i højttaleren, så støjen er fjernet helt.
export const lyd = {
  klik: () => tone(520, 0, 0.06, 'triangle', 0.08),
  rigtigt: () => { tone(523, 0, 0.12, 'triangle'); tone(659, 0.1, 0.12, 'triangle'); tone(784, 0.2, 0.2, 'triangle'); },
  forkert: () => { tone(196, 0, 0.16, 'triangle', 0.14); tone(147, 0.15, 0.24, 'triangle', 0.14); },
  spark: () => { tone(150, 0, 0.12, 'sine', 0.32, -90); tone(900, 0, 0.03, 'triangle', 0.06); },
  floejte: () => { tone(1800, 0, 0.14, 'sine', 0.09); tone(1800, 0.2, 0.34, 'sine', 0.09); },
  jubel: () => {
    [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.11, 0.22, 'triangle', 0.14));
    [523, 659, 784, 1047].forEach((f) => tone(f, 0.46, 0.6, 'triangle', 0.09));
  },
  aah: () => { tone(392, 0, 0.2, 'sine', 0.1); tone(330, 0.18, 0.2, 'sine', 0.1); tone(262, 0.36, 0.4, 'sine', 0.1); },
  stolpe: () => { tone(1320, 0, 0.35, 'sine', 0.12); tone(1980, 0, 0.2, 'sine', 0.06); },
};

/** Publikumslyd er slået fra: den var lavet af støj og lød dårligt. Funktionen findes stadig, så resten af spillet ikke skal ændres. */
export function publikum() {}

let stemme = null;
function findStemme() {
  if (!('speechSynthesis' in window)) return;
  stemme = speechSynthesis.getVoices().find((v) => v.lang && v.lang.toLowerCase().startsWith('da')) || null;
}
if ('speechSynthesis' in window) { findStemme(); speechSynthesis.addEventListener?.('voiceschanged', findStemme); }
export const harDanskStemme = () => !!stemme;
export function sig(tekst) {
  if (!('speechSynthesis' in window)) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(tekst);
  u.lang = 'da-DK'; if (stemme) u.voice = stemme; u.rate = 0.9;
  speechSynthesis.speak(u);
}
export function stopTale() { if ('speechSynthesis' in window) speechSynthesis.cancel(); }
