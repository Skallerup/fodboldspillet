// Lydeffekter lavet med Web Audio (ingen lydfiler) og oplæsning med browserens danske stemme.
let ctx = null;
let on = true;
export function setLyd(v) { on = v; if (!v && pub) pub.gain.value = 0; }

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
function noise(start, dur, vol, freq, q = 0.8) {
  const c = ac(); if (!c || !on) return;
  const len = Math.floor(c.sampleRate * dur);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource(); src.buffer = buf;
  const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
  const g = c.createGain(); const t = c.currentTime + start;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + dur * 0.25);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(c.destination); src.start(t);
}
export const lyd = {
  klik: () => tone(520, 0, 0.06, 'triangle', 0.08),
  rigtigt: () => { tone(523, 0, 0.12, 'triangle'); tone(659, 0.1, 0.12, 'triangle'); tone(784, 0.2, 0.2, 'triangle'); },
  forkert: () => { tone(220, 0, 0.18, 'sawtooth', 0.1, -80); tone(165, 0.16, 0.25, 'sawtooth', 0.1, -60); },
  spark: () => { noise(0, 0.12, 0.5, 180, 1.2); tone(120, 0, 0.1, 'sine', 0.3, -60); },
  floejte: () => { tone(2100, 0, 0.18, 'square', 0.06); tone(2100, 0.24, 0.5, 'square', 0.06); },
  jubel: () => { noise(0, 2.4, 0.35, 900, 0.5); noise(0.1, 2.0, 0.2, 1800, 0.7); [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.12, 0.3, 'triangle', 0.14)); },
  aah: () => { noise(0, 1.0, 0.18, 500, 0.6); tone(300, 0, 0.5, 'sine', 0.08, -120); },
  stolpe: () => { tone(880, 0, 0.3, 'square', 0.12, -200); noise(0, 0.9, 0.15, 500, 0.6); },
};

// Publikum: en vedvarende summen, der bliver højere, når det går godt (niveau 0-1; 0 slukker)
let pub = null;
export function publikum(niveau) {
  const c = ac();
  if (!c) return;
  if (!pub) {
    const len = c.sampleRate * 2;
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = c.createBufferSource(); src.buffer = buf; src.loop = true;
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 700; f.Q.value = 0.4;
    const g = c.createGain(); g.gain.value = 0;
    src.connect(f).connect(g).connect(c.destination); src.start();
    pub = g;
  }
  pub.gain.setTargetAtTime(on ? niveau * 0.1 : 0, c.currentTime, 0.5);
}

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
