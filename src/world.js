// 3D-verdenen: stadion, figurer, bold, kamp-forløb og straffespark.
// Koordinater: banen ligger i x/z-planet, målet man skyder på står ved z = +29, og figurerne kigger mod +z.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export const FIGURER = { rhino: 'Næsehorn', lion: 'Løve', croc: 'Krokodille', panda: 'Panda', shark: 'Haj', dragon: 'Drage', robot: 'Robot' };
export const GRUNDFIGURER = ['rhino', 'lion', 'croc', 'panda'];   // resten låses op i spillet
const GOAL_Z = 29, SPOT_Z = 23, GOAL_HW = 5, GOAL_H = 3.4, BALL_R = 0.17;
const START_Z = -18, STEP = 3.6;
const lerp = (a, b, k) => a + (b - a) * k;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ease = (k) => k * k * (3 - 2 * k);

const STOEVLER = { sort: 0x0b0b0e, hvid: 0xf2f2f2, roed: 0xd81e2c, neon: 0xb6f000, guld: 0xe0a81e };
const BOLDE = {
  klassisk: { lys: 0xf7f7f7, moerk: 0x050505 },
  neon: { lys: 0xd6ff2a, moerk: 0x101418 },
  guld: { lys: 0xf0b020, moerk: 0x7a4a00, ru: 0.25 },
  ild: { lys: 0xff6a00, moerk: 0xffd21f, gloed: 0xff2a00 },
};
const POKALER = [0xb5651d, 0xb06a2c, 0x6e7580, 0xcfd6de, 0x8fa3b8, 0xf2f2ee, 0xf0b020, 0xe8a090, 0xffd21f];
const crowdMaps = {};
function crowdMap(i) {
  if (!crowdMaps[i]) {
    const t = crowdMaps[i] = new THREE.TextureLoader().load(`assets/kits/crowd_${i}.jpg`);
    t.flipY = false; t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
  }
  return crowdMaps[i];
}
const kitMaps = {};
function kitMap(navn) {
  if (!kitMaps[navn]) {
    const t = kitMaps[navn] = new THREE.TextureLoader().load(`assets/kits/${navn}.jpg`);
    t.flipY = false; t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping;
  }
  return kitMaps[navn];
}

class Figur {
  constructor(kind, src) {
    this.kind = kind;
    this.root = new THREE.Group();
    this.model = src.clone(true);
    this.root.add(this.model);
    this.parts = {};
    // Blender giver ens navne et løbenummer (Head.001), så vi matcher på navnets start
    this.model.traverse((o) => {
      const n = o.name.replace(/[._\d]+$/, '');
      if (['Body', 'Head', 'ArmL', 'ArmR', 'LegL', 'LegR'].includes(n) && !this.parts[n]) this.parts[n] = o;
    });
    this.mats = {};
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.canvas.height = 256;
    this.numTex = new THREE.CanvasTexture(this.canvas);
    this.numTex.flipY = false;
    this.numTex.colorSpace = THREE.SRGBColorSpace;
    const numMat = new THREE.MeshStandardMaterial({ map: this.numTex, transparent: true, depthWrite: false, roughness: 0.6,
      polygonOffset: true, polygonOffsetFactor: -2 });
    this.model.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = true;
      const name = o.material.name;
      if (name === 'Number') { o.material = numMat; o.castShadow = false; }
      else if (['Jersey', 'Shorts', 'Socks', 'Trim', 'Boot'].includes(name)) {
        this.mats[name] ||= o.material.clone();
        o.material = this.mats[name];
      }
    });
    this.stribeMap = this.mats.Jersey?.map || null;
    this.jubel = 'hop';
    this.state = 'idle';
    this.t = Math.random() * 10;
    this.st = 0;
  }
  setKit({ farve1, farve2, nummer, troeje = 'striber', stoevler = 'sort', jubel = 'hop' }) {
    const c1 = new THREE.Color(farve1), c2 = new THREE.Color(farve2);
    this.kit = { farve1, farve2, nummer, troeje, stoevler, jubel };
    this.jubel = jubel;
    const j = this.mats.Jersey;
    if (j) {
      j.map = troeje === 'striber' ? this.stribeMap : kitMap(troeje);
      const fuldFarve = troeje === 'guld' || troeje.startsWith('saet_');   // mønstre i egne farver farves ikke med holdfarven
      j.color.copy(fuldFarve ? new THREE.Color(0xffffff) : c1);
      j.roughness = troeje === 'guld' ? 0.35 : 0.6;
      j.needsUpdate = true;
    }
    this.mats.Boot?.color.set(STOEVLER[stoevler] || STOEVLER.sort);
    this.mats.Socks?.color.copy(c1);
    this.mats.Shorts?.color.copy(c2);
    this.mats.Trim?.color.copy(c2);
    const lum = (c) => 0.3 * c.r + 0.6 * c.g + 0.1 * c.b;
    let ink = farve2;
    if (troeje === 'guld') ink = '#3a2300';
    else if (Math.abs(lum(c1) - lum(c2)) < 0.25) ink = lum(c1) > 0.5 ? '#10151f' : '#ffffff';
    const g = this.canvas.getContext('2d');
    g.clearRect(0, 0, 256, 256);
    const saet = troeje.startsWith('saet_');
    if (saet) ink = '#ffffff';
    g.fillStyle = ink;
    g.font = '800 190px "Barlow Condensed", "Arial Narrow", Impact, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    if (saet) { g.lineWidth = 16; g.lineJoin = 'round'; g.strokeStyle = '#10151f'; g.strokeText(String(nummer), 128, 140); }
    g.fillText(String(nummer), 128, 140);
    this.numTex.needsUpdate = true;
  }
  play(state) { if (this.state !== state) { this.state = state; this.st = 0; } }
  update(dt) {
    this.t += dt; this.st += dt;
    const { Body, Head, ArmL, ArmR, LegL, LegR } = this.parts;
    for (const p of [Head, ArmL, ArmR, LegL, LegR]) p.rotation.set(0, 0, 0);
    const m = this.model;
    m.rotation.set(0, 0, 0); m.position.set(0, 0, 0);
    const t = this.t, st = this.st;
    switch (this.state) {
      case 'run': {
        const ph = t * 12, s = Math.sin(ph);
        LegL.rotation.x = s * 0.95; LegR.rotation.x = -s * 0.95;
        ArmL.rotation.x = -s * 0.8; ArmR.rotation.x = s * 0.8;
        m.position.y = Math.abs(Math.cos(ph)) * 0.09;
        m.rotation.x = 0.16;
        break;
      }
      case 'kick': {
        const k = clamp(st / 0.45, 0, 1);
        LegR.rotation.x = k < 0.4 ? lerp(0, 0.9, k / 0.4) : k < 0.65 ? lerp(0.9, -1.35, (k - 0.4) / 0.25) : lerp(-1.35, 0, (k - 0.65) / 0.35);
        ArmL.rotation.x = -LegR.rotation.x * 0.5; ArmR.rotation.z = -0.5;
        m.rotation.x = k > 0.4 && k < 0.8 ? -0.12 : 0.05;
        break;
      }
      case 'cheer': {
        if (this.jubel === 'dans') {
          const s = Math.sin(st * 8);
          m.position.y = Math.abs(s) * 0.12;
          m.rotation.z = s * 0.2; m.rotation.y = Math.sin(st * 4) * 0.7;
          ArmL.rotation.z = 1.5 + s * 1.1; ArmR.rotation.z = -1.5 + s * 1.1;
          LegL.rotation.z = Math.max(0, s) * 0.35; LegR.rotation.z = Math.min(0, s) * 0.35;
          Head.rotation.z = -s * 0.2;
        } else if (this.jubel === 'flyver') {
          const a = st * 3.2, s = Math.sin(st * 12);
          m.position.x = Math.sin(a) * 1.1; m.position.z = Math.sin(a * 2) * 0.5;
          m.rotation.y = Math.cos(a) * 1.0; m.rotation.z = -Math.cos(a) * 0.3; m.rotation.x = 0.2;
          ArmL.rotation.z = 1.55; ArmR.rotation.z = -1.55;
          LegL.rotation.x = s * 0.9; LegR.rotation.x = -s * 0.9;
        } else if (this.jubel === 'salto') {
          const ph = (st % 1.3) / 1.3, k = clamp((ph - 0.15) / 0.6, 0, 1);
          const a = -Math.PI * 2 * ease(k), c = 1.2;
          m.rotation.x = a;
          m.position.y = Math.sin(Math.PI * k) * 1.2 + c - c * Math.cos(a);
          m.position.z = -c * Math.sin(a);
          const tuck = Math.sin(Math.PI * k);
          LegL.rotation.x = -tuck * 1.2; LegR.rotation.x = -tuck * 1.2;
          ArmL.rotation.z = 2.4 - tuck * 1.4; ArmR.rotation.z = -2.4 + tuck * 1.4;
        } else {
          m.position.y = Math.abs(Math.sin(st * 7)) * 0.45;
          ArmL.rotation.z = 2.5 + Math.sin(st * 14) * 0.2; ArmR.rotation.z = -2.5 - Math.sin(st * 14) * 0.2;
          Head.rotation.x = -0.25;
          m.rotation.y = Math.sin(st * 3.5) * 0.5;
        }
        break;
      }
      case 'sad': {
        const k = clamp(st / 0.3, 0, 1);
        Head.rotation.x = 0.5 * k; m.rotation.x = 0.1 * k;
        ArmL.rotation.x = -0.15 * k; ArmR.rotation.x = -0.15 * k;
        Head.rotation.y = Math.sin(st * 5) * 0.25 * k;
        break;
      }
      case 'ready': {
        const b = Math.sin(t * 6);
        m.position.y = -0.04 + b * 0.03;
        LegL.rotation.z = 0.22; LegR.rotation.z = -0.22;
        ArmL.rotation.z = 0.9 + b * 0.08; ArmR.rotation.z = -0.9 - b * 0.08;
        ArmL.rotation.x = -0.3; ArmR.rotation.x = -0.3;
        break;
      }
      case 'dive': {
        ArmL.rotation.z = 2.7; ArmR.rotation.z = -2.7;
        LegL.rotation.z = 0.25; LegR.rotation.z = -0.25;
        break;
      }
      default: {
        m.position.y = Math.sin(t * 2) * 0.012;
        ArmL.rotation.z = 0.04 + Math.sin(t * 2) * 0.03; ArmR.rotation.z = -0.04 - Math.sin(t * 2) * 0.03;
        ArmL.rotation.x = Math.sin(t * 1.3) * 0.06; ArmR.rotation.x = -Math.sin(t * 1.3) * 0.06;
        Head.rotation.y = Math.sin(t * 0.7) * 0.18;
      }
    }
    void Body;
  }
}

export class World {
  constructor(canvas) {
    this.canvas = canvas;
    const r = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFShadowMap;
    r.toneMapping = THREE.NeutralToneMapping;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x8ec9f5);
    this.scene.fog = new THREE.Fog(0x8ec9f5, 120, 320);
    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 500);
    this.hemi = new THREE.HemisphereLight(0xe4f2ff, 0x3f7f45, 1.5);
    this.scene.add(this.hemi);
    const sun = this.sun = new THREE.DirectionalLight(0xfff3dc, 2.4);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -13, right: 13, top: 13, bottom: -13, near: 1, far: 90 });
    sun.shadow.bias = -0.0006;
    sun.shadow.normalBias = 0.03;
    this.scene.add(sun, sun.target);
    this.last = performance.now();
    this.tweens = [];
    this.slots = {};
    this.assets = {};
    this.mode = 'none';
    this.time = 0;
    this.camPos = new THREE.Vector3(0, 3, -10);
    this.camLook = new THREE.Vector3();
    this.snap = true;
    this.focus = new THREE.Vector3();
    this.keeper = { baseX: 0, busy: false, klog: 0.5 };
    this.lav = false;        // let grafik: lette figurer, ingen skygger, lavere opløsning
    this.loaded = false;
    this.maal = { tid: 0, vindue: 0, frames: 0 };
    this.resize();
    window.addEventListener('resize', () => this.resize());
    r.setAnimationLoop(() => this.frame());
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.portrait = w / h < 0.9;
    this.camera.updateProjectionMatrix();
    this.snap = true;
  }

  /** Hent en figur, hvis den ikke allerede er hentet (de hemmelige figurer hentes først, når de skal bruges). */
  loadFigur(kind) {
    if (this.assets[kind]) return Promise.resolve();
    this.pending ||= {};
    const lav = this.lav;
    return (this.pending[kind] ||= new GLTFLoader().loadAsync(`assets/models/char_${kind}${lav ? '_lite' : ''}.glb`)
      .then((g) => { if (this.lav === lav) this.assets[kind] = g.scene; }));
  }

  async load(onProgress, ekstra = []) {
    const loader = new GLTFLoader();
    const files = { stadium: 'stadium.glb', ball: 'ball.glb', trophy: 'trophy.glb', mascot: 'mascot.glb' };
    for (const k of new Set([...GRUNDFIGURER, ...ekstra])) files[k] = `char_${k}${this.lav ? '_lite' : ''}.glb`;
    let done = 0;
    const total = Object.keys(files).length;
    await Promise.all(Object.entries(files).map(async ([k, f]) => {
      this.assets[k] = (await loader.loadAsync(`assets/models/${f}`)).scene;
      onProgress?.(++done / total);
    }));
    const st = this.stadium = this.assets.stadium;
    st.traverse((o) => {
      if (!o.isMesh) return;
      o.receiveShadow = true;
      if (o.material.map) o.material.map.anisotropy = 8;
    });
    this.scene.add(st);
    this.setStadion(0);
    this.ball = this.assets.ball;
    this.ball.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    this.scene.add(this.ball);
    // sigtemærke til straffespark
    this.aim = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.05, 8, 28),
      new THREE.MeshBasicMaterial({ color: 0xffd21f, depthTest: false, transparent: true, opacity: 0.95 }));
    this.aim.renderOrder = 10;
    this.aim.visible = false;
    this.scene.add(this.aim);
    this.initKonfetti();
    this.initFyr();
    // lysshow: farvede lyspletter, der fejer hen over græsset under aftenkampe
    this.lysPletter = new THREE.Group();
    [0x35e0ff, 0xff4fd8, 0xffe14a, 0x7dff9a, 0xffffff].forEach((farve) => {
      const plet = new THREE.Mesh(new THREE.CircleGeometry(3.6, 28),
        new THREE.MeshBasicMaterial({ color: farve, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false }));
      plet.rotation.x = -Math.PI / 2;
      plet.position.y = 0.05;
      this.lysPletter.add(plet);
    });
    this.lysPletter.visible = false;
    this.scene.add(this.lysPletter);
    // maskot
    this.mascot = this.assets.mascot;
    this.mascot.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    this.wings = [this.mascot.getObjectByName('WingL'), this.mascot.getObjectByName('WingR')];
    this.mascot.visible = false;
    this.scene.add(this.mascot);
    // pokalbord
    this.pokalbord = new THREE.Group();
    const stand = this.assets.trophy.getObjectByName('Podium');
    const cup = this.assets.trophy.getObjectByName('Cup');
    this.pokalbord.add(stand);
    this.cups = POKALER.map((farve, i) => {
      const c = cup.clone(true);
      c.traverse((o) => {
        if (!o.isMesh) return;
        o.castShadow = true;
        if (o.material.name === 'Cup') { o.material = o.material.clone(); o.material.color.set(farve); }
      });
      const raekke = Math.floor(i / 3);   // tre pr. trin; forreste trin er lavest, og pokalerne bliver større
      c.scale.setScalar(0.5 + 0.05 * i);
      c.position.set((i % 3 - 1) * 1.05, 0.45 * (raekke + 1) + 0.012, 0.5 - 0.5 * raekke);
      this.pokalbord.add(c);
      return c;
    });
    // turneringspokalen: en kæmpepokal på gulvet, som kun kan vindes
    this.storPokal = cup.clone(true);
    this.storPokal.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = true;
      if (o.material.name === 'Cup') { o.material = o.material.clone(); o.material.color.set(0x8fe3ff); }
    });
    this.storPokal.scale.setScalar(1.6);
    this.storPokal.position.set(-1.8, 0, 1.0);
    this.storPokal.visible = false;
    this.scene.add(this.storPokal);
    this.turneringer = 0;
    this.pokalbord.position.set(1.9, 0, -2.3);
    this.pokalbord.rotation.y = -0.35;
    this.pokalbord.visible = false;
    this.scene.add(this.pokalbord);
    this.udstyr = { stadion: 0, tilskuere: 0, pokaler: 0, valgt: { bold: 'klassisk' } };
    this.loaded = true;
  }

  /** Skift mellem flot og let grafik. Kan kaldes før indlæsning (så hentes de rigtige modeller med det samme) eller midt i spillet. */
  async setKvalitet(lav) {
    if (this.lav === lav) return;
    this.lav = lav;
    this.renderer.setPixelRatio(lav ? 1 : Math.min(window.devicePixelRatio || 1, 2));
    this.sun.castShadow = !lav;
    this.resize();
    if (!this.loaded) return;
    const kinds = Object.keys(FIGURER).filter((k) => this.assets[k]);
    for (const k of kinds) delete this.assets[k];
    this.pending = {};
    await Promise.all(kinds.map((k) => this.loadFigur(k)));
    if (this.lav !== lav) return;
    for (const [slot, f] of Object.entries(this.slots)) {
      if (!this.assets[f.kind]) continue;
      const ny = this.nyFigur(f.kind);
      ny.root.position.copy(f.root.position);
      ny.root.rotation.copy(f.root.rotation);
      ny.root.visible = f.root.visible;
      if (f.kit) ny.setKit(f.kit);
      ny.play(f.state);
      this.scene.remove(f.root);
      this.scene.add(ny.root);
      this.slots[slot] = ny;
      for (const navn of ['player', 'defender', 'goalie']) if (this[navn] === f) this[navn] = ny;
    }
  }
  nyFigur(kind) {
    const f = new Figur(kind, this.assets[kind]);
    if (this.lav) {   // uden rigtige skygger får figuren en simpel mørk plet under sig
      const plet = new THREE.Mesh(new THREE.CircleGeometry(0.75, 20),
        new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28, depthWrite: false }));
      plet.rotation.x = -Math.PI / 2;
      plet.position.y = 0.02;
      f.root.add(plet);
    }
    return f;
  }

  /** Anvend spillerens købte opgraderinger på verdenen. */
  setUdstyr(o, kit) {
    this.udstyr = o;
    this.kitNu = kit;
    this.setStadion(o.stadion);
    // tilskuere: hvor fyldte tribunerne er (level 1-4), derefter maskot, flag, bannere, konfetti, fyrværkeri og lysshow
    const taethed = Math.min(3, o.tilskuere);
    this.stadium.traverse((m) => {
      if (!m.isMesh || m.material.name !== 'Crowd') return;
      this.fuldtHus ||= m.material.map;
      const map = taethed >= 3 ? this.fuldtHus : crowdMap(taethed);
      if (m.material.map !== map) { m.material.map = map; m.material.needsUpdate = true; }
    });
    for (const [navn, fra] of [['Tifo', 6], ['Beams', 9]]) {
      const del = this.stadium.getObjectByName(navn);
      if (del) del.visible = o.tilskuere >= fra && o.stadion >= 2;
    }
    this.beams = this.stadium.getObjectByName('Beams');
    this.beams?.traverse((m) => {
      if (!m.isMesh) return;
      Object.assign(m.material, { transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
      m.castShadow = false;
    });
    this.setAften(o.tilskuere >= 9 && o.stadion >= 2);
    this.konfetti.material.size = o.tilskuere >= 7 ? 0.36 : 0.2;
    for (const navn of ['Banners', 'Tifo']) this.stadium.getObjectByName(navn)?.traverse((m) => {
      if (!m.isMesh) return;
      if (m.material.name === 'TeamFlag1') m.material.color.set(kit.farve1);
      if (m.material.name === 'TeamFlag2') m.material.color.set(kit.farve2);
    });
    const banners = this.stadium.getObjectByName('Banners');
    if (banners) {
      banners.visible = o.tilskuere >= 5;
      banners.traverse((m) => {
        if (!m.isMesh) return;
        if (m.material.name === 'TeamFlag1') m.material.color.set(kit.farve1);
        if (m.material.name === 'TeamFlag2') m.material.color.set(kit.farve2);
      });
    }
    const b = BOLDE[o.valgt?.bold] || BOLDE.klassisk;
    this.ball.traverse((m) => {
      if (!m.isMesh) return;
      const lys = m.material.name === 'BallWhite';
      m.material.color.set(lys ? b.lys : b.moerk);
      m.material.roughness = b.ru ?? 0.4;
      m.material.emissive.set(lys && b.gloed ? b.gloed : 0x000000);
      m.material.emissiveIntensity = 0.55;
    });
    this.cups.forEach((c, i) => { c.visible = i < o.pokaler; });
    this.placerEkstra();
  }
  /** Aftenkamp: mørk himmel og dæmpet lys, så projektører og lysshow træder frem. */
  setAften(aften) {
    if (this.aften === aften) return;
    this.aften = aften;
    const himmel = aften ? 0x16224a : 0x8ec9f5;
    this.scene.background.set(himmel);
    this.scene.fog.color.set(himmel);
    this.hemi.color.set(aften ? 0x8fa6e8 : 0xe4f2ff);
    this.hemi.groundColor.set(aften ? 0x24503a : 0x3f7f45);
    this.hemi.intensity = aften ? 0.85 : 1.5;
    this.sun.color.set(aften ? 0xcfdcff : 0xfff3dc);
    this.sun.intensity = aften ? 1.25 : 2.4;
    this.lysPletter.visible = aften;
  }
  placerEkstra() {
    const o = this.udstyr, m = this.mascot;
    this.pokalbord.visible = this.mode === 'hero' && o.pokaler > 0;
    this.storPokal.visible = this.mode === 'hero' && this.turneringer > 0;
    m.visible = o.tilskuere >= 4 && this.mode !== 'match';
    if (this.mode === 'hero') { m.position.set(-3.0, 0, -1.0); m.rotation.y = 0.45; }
    else if (this.mode === 'penalty') { m.position.set(6.4, 0, GOAL_Z - 1.0); m.rotation.y = Math.PI - 0.5; }
  }

  /** Stadion-niveau: 0 = træningsbane med små tribuner, højere niveauer låser mere op. */
  setStadion(niveau) {
    const vis = { Boards: niveau >= 1, StandsSmallSides: niveau >= 2, StandsSmallEnds: niveau >= 3, Floodlights: niveau >= 4,
      StandsBigSides: niveau >= 5, StandsBigEnds: niveau >= 6, Roof: niveau >= 7, Scoreboard: niveau >= 8, Arch: niveau >= 9,
      Trees: niveau < 5, Banners: false, Tifo: false, Beams: false };
    for (const [name, v] of Object.entries(vis)) { const o = this.stadium.getObjectByName(name); if (o) o.visible = v; }
  }

  figur(slot, kind) {
    let f = this.slots[slot];
    if (!f || f.kind !== kind) {
      if (f) this.scene.remove(f.root);
      f = this.slots[slot] = this.nyFigur(kind);
      this.scene.add(f.root);
    }
    f.root.visible = true;
    f.root.rotation.set(0, 0, 0);
    f.root.position.set(0, 0, 0);
    return f;
  }
  hide(slot) { if (this.slots[slot]) this.slots[slot].root.visible = false; }

  tween(dur, fn) {
    return new Promise((res) => this.tweens.push({ t: 0, dur, fn, res }));
  }
  wait(dur) { return this.tween(dur, () => {}); }
  clearTweens() { for (const tw of this.tweens) tw.res(); this.tweens = []; }

  // ------------------------------------------------------------ omklædningsrum / menu
  showHero(kind, kit) {
    this.clearTweens();
    if (this.mode !== 'hero') this.snap = true;
    this.mode = 'hero';
    const p = this.player = this.figur('player', kind);
    p.setKit(kit);
    p.play('idle');
    this.hide('defender'); this.hide('keeper');
    this.aim.visible = false;
    this.ball.scale.setScalar(1);
    this.ball.position.set(0.75, BALL_R, 0.7);
    this.placerEkstra();
  }

  // ------------------------------------------------------------ kamp
  modstanderKit(kit) {
    const c = new THREE.Color(kit.farve1);
    const hsl = {}; c.getHSL(hsl);
    const roed = hsl.s > 0.4 && (hsl.h < 0.07 || hsl.h > 0.93);
    return roed ? { farve1: '#1E5BD8', farve2: '#F4F4F0' } : { farve1: '#C81E2C', farve2: '#15171C' };
  }
  startMatch(kind, kit, opt = {}) {
    this.clearTweens();
    this.mode = 'match';
    this.snap = true;
    this.step = 0;
    const p = this.player = this.figur('player', kind);
    p.setKit(kit);
    p.root.position.set(0, 0, START_Z);
    p.play('idle');
    const kinds = Object.keys(FIGURER).filter((k) => k !== kind && this.assets[k]);
    const d = this.defender = this.figur('defender', opt.rival || kinds[Math.floor(Math.random() * kinds.length)]);
    const mk = opt.rivalKit || this.modstanderKit(kit);
    this.ball.scale.setScalar(1);
    d.setKit({ nummer: 4, ...mk });
    d.root.position.set(0, 0, START_Z + 3.3);
    d.root.rotation.y = Math.PI;
    d.play('ready');
    this.hide('keeper');
    this.aim.visible = false;
    this.ball.position.set(0.2, BALL_R, START_Z + 0.9);
    this.placerEkstra();
  }
  async matchStep(rigtigt) {
    const p = this.player, d = this.defender, ball = this.ball;
    const z0 = p.root.position.z, dz0 = d.root.position.z;
    const side = Math.random() < 0.5 ? -1 : 1;
    if (rigtigt) {
      p.play('run'); d.play('sad');
      await this.tween(0.95, (k) => {
        const e = ease(k);
        p.root.position.set(Math.sin(Math.PI * k) * 1.3 * side, 0, lerp(z0, z0 + STEP, e));
        ball.position.set(p.root.position.x + 0.2, BALL_R, p.root.position.z + 0.9);
        ball.rotation.x += 0.35;
        d.root.position.x = -side * 2.0 * ease(Math.min(1, k * 2));
        d.root.rotation.y = Math.PI - side * 0.6 * Math.sin(Math.PI * k);
      });
      p.play('idle');
      d.play('run');
      await this.tween(0.45, (k) => {
        d.root.position.set(lerp(-side * 2.0, 0, k), 0, lerp(dz0, z0 + STEP + 3.3, k));
        d.root.rotation.y = lerp(0, Math.PI, ease(k));
      });
      d.root.rotation.y = Math.PI;
      d.play('ready');
    } else {
      d.play('run');
      await this.tween(0.4, (k) => { d.root.position.z = lerp(dz0, z0 + 1.7, ease(k)); });
      p.play('sad'); d.play('kick');
      await this.tween(0.45, (k) => {
        ball.position.set(lerp(0.2, 3.2 * side, k), BALL_R + Math.sin(Math.PI * k) * 0.5, z0 + 0.9 - k * 1.2);
        ball.rotation.z += 0.3;
      });
      d.play('cheer');
      await this.wait(0.7);
      d.play('run');
      const bx = ball.position.x, bz = ball.position.z;
      await this.tween(0.5, (k) => {
        d.root.position.z = lerp(z0 + 1.7, dz0, k);
        d.root.rotation.y = Math.PI * (1 - Math.sin(Math.PI * k) * 0.0);
        ball.position.set(lerp(bx, 0.2, ease(k)), BALL_R, lerp(bz, z0 + 0.9, ease(k)));
        ball.rotation.z -= 0.2;
      });
      d.play('ready'); p.play('idle');
    }
  }

  // ------------------------------------------------------------ straffespark
  startFinale(kind, kit, opt = {}) {
    this.keeper.klog = opt.klog ?? 0.5;   // hvor ofte målmanden gætter rigtigt
    this.clearTweens();
    this.mode = 'penalty';
    this.snap = true;
    const p = this.player = this.figur('player', kind);
    p.setKit(kit);
    this.hide('defender');
    const kinds = Object.keys(FIGURER).filter((k) => k !== kind && this.assets[k]);
    const g = this.goalie = this.figur('keeper', opt.rival || kinds[Math.floor(Math.random() * kinds.length)]);
    g.setKit(opt.keeperKit || { farve1: '#B6F000', farve2: '#15171C', nummer: 1 });
    this.friloeber = false;
    this.resetSkud();
    this.placerEkstra();
  }
  resetSkud() {
    const p = this.player, g = this.goalie;
    p.root.position.set(-1.7, 0, SPOT_Z - 2.3);
    p.root.rotation.set(0, 0.5, 0);
    p.play('idle');
    g.root.position.set(0, 0, GOAL_Z - 0.35);
    g.root.rotation.set(0, Math.PI, 0);
    g.play('ready');
    this.keeper.busy = false;
    this.keeper.fremme = 0;
    this.ball.scale.setScalar(1);
    if (this.kitNu) this.setUdstyr(this.udstyr, this.kitNu);
    this.ball.position.set(0, BALL_R, SPOT_Z);
    this.ball.rotation.set(0, 0, 0);
  }
  /** En chance midt i kampen: ét skud på mål. friloeber = målmanden løber ud, så man skal skyde hurtigt. */
  startChance(friloeber) {
    this.clearTweens();
    this.kampGemt = { pz: this.player.root.position.z, dz: this.defender.root.position.z };
    this.mode = 'penalty';
    this.snap = true;
    const g = this.goalie = this.figur('keeper', this.defender.kind);
    g.setKit({ farve1: '#B6F000', farve2: '#15171C', nummer: 1 });
    this.hide('defender');
    this.friloeber = friloeber;
    this.resetSkud();
    this.placerEkstra();
  }
  slutChance() {
    this.clearTweens();
    const s = this.kampGemt;
    this.mode = 'match';
    this.snap = true;
    this.friloeber = false;
    this.hide('keeper');
    this.aim.visible = false;
    this.player.root.position.set(0, 0, s.pz);
    this.player.root.rotation.set(0, 0, 0);
    this.player.play('idle');
    this.defender.root.visible = true;
    this.defender.root.position.set(0, 0, s.dz);
    this.defender.root.rotation.set(0, Math.PI, 0);
    this.defender.play('ready');
    this.ball.scale.setScalar(1);
    this.ball.position.set(0.2, BALL_R, s.pz + 0.9);
    this.placerEkstra();
  }
  /** Langsom gengivelse i et øjeblik (ved mål). */
  slowmo(varighed = 0.9) { this.slowT = varighed; }

  /** Punkt i målets plan ud fra en skærmposition. */
  sigtepunkt(clientX, clientY) {
    const ndc = new THREE.Vector2((clientX / window.innerWidth) * 2 - 1, -(clientY / window.innerHeight) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.camera);
    const t = (GOAL_Z - ray.ray.origin.z) / ray.ray.direction.z;
    if (!(t > 0)) return null;
    const pt = ray.ray.origin.clone().addScaledVector(ray.ray.direction, t);
    return { x: clamp(pt.x, -7.5, 7.5), y: clamp(pt.y, 0.25, 5.2) };
  }
  visSigte(pt) {
    this.aim.visible = !!pt && this.mode === 'penalty';
    if (pt) this.aim.position.set(pt.x, pt.y, GOAL_Z - 0.1);
  }
  /** Skyd mod et punkt. Giver 'maal', 'reddet', 'stolpe' eller 'forbi'. onSpark kaldes, når bolden rammes.
   *  Et superskud er en ildkugle, der altid rammer inden for målet og ikke kan reddes. */
  async skyd(pt, onSpark, superskud = false, zone = null) {
    const p = this.player, g = this.goalie, ball = this.ball;
    this.aim.visible = false;
    const a = Math.random() * Math.PI * 2, rr = superskud ? 0 : Math.random() * 0.32;
    let tx = pt.x + Math.cos(a) * rr, ty = Math.max(0.2, pt.y + Math.sin(a) * rr);
    if (superskud) { tx = clamp(tx, -GOAL_HW + 0.6, GOAL_HW - 0.6); ty = clamp(ty, 0.4, GOAL_H - 0.6); }
    p.play('run');
    const px = p.root.position.x, pz = p.root.position.z;
    await this.tween(0.38, (k) => { p.root.position.set(lerp(px, -0.42, k), 0, lerp(pz, SPOT_Z - 0.75, k)); p.root.rotation.y = lerp(0.5, 0.25, k); });
    p.play('kick');
    await this.wait(0.2);
    onSpark?.();
    if (superskud) {
      ball.scale.setScalar(1.7);
      ball.traverse((m) => { if (m.isMesh) { m.material.color.set(0xff5a00); m.material.emissive.set(0xff3000); m.material.emissiveIntensity = 1.6; } });
    }
    // målmandens valg
    this.keeper.busy = true;
    const gx0 = g.root.position.x;
    const klog = Math.random() < this.keeper.klog;
    const raekke = 3.6;   // målmanden kan nå helt ud til stolperne, når han gætter rigtigt
    const cx = clamp(klog ? gx0 + (tx - gx0) * 0.88 : (Math.random() * 2 - 1) * 3.0, -raekke, raekke);
    let cy = klog && ty > 1.7 ? Math.min(ty, 1.95) : 1.15;
    // to spillere: den anden spiller har valgt, hvilken side målmanden kaster sig til
    const cxValgt = zone === null ? cx : zone * 3.3;
    if (zone !== null) cy = 1.3;
    const tilt = clamp((cxValgt - gx0) / 2.0, -1.25, 1.25);
    const rootX = cxValgt - Math.sin(tilt) * 1.2, rootY = Math.max(0, cy - Math.cos(tilt) * 1.2);
    g.play(Math.abs(tilt) > 0.25 || cy > 1.3 ? 'dive' : 'ready');
    const inde = Math.abs(tx) < GOAL_HW - 0.2 && ty < GOAL_H - 0.2;
    const naa = this.friloeber ? 1.25 * (1 + this.keeper.fremme * 0.8) : 1.25;   // en målmand, der er løbet ud, dækker mere
    const reddet = !superskud && inde && (zone !== null ? Math.abs(tx - cxValgt) < 1.65 : Math.abs(tx - cx) < naa && Math.abs(ty - cy) < 1.0);
    const gz = g.root.position.z;
    if (superskud) this.shake = 0.6;
    const stolpe = !inde && Math.abs(tx) < GOAL_HW + 0.3 && ty < GOAL_H + 0.3;
    await this.tween(superskud ? 0.32 : 0.5, (k) => {
      ball.position.set(lerp(0, tx, k), lerp(BALL_R, ty, k) + Math.sin(Math.PI * k) * 0.45, lerp(SPOT_Z, GOAL_Z - 0.15, k));
      ball.rotation.x += 0.5;
      const e = ease(Math.min(1, k * 1.25));
      g.root.position.set(lerp(gx0, rootX, e), rootY * Math.sin(Math.PI * Math.min(1, k * 1.1) * 0.5), gz);
      g.root.rotation.z = tilt * e;
    });
    let res;
    const bx = ball.position.x, by = ball.position.y, bz = ball.position.z;
    const out = (ex, ey, ez, dur) => this.tween(dur, (k) => {
      ball.position.set(lerp(bx, ex, k), Math.max(BALL_R, lerp(by, ey, k * k) + Math.sin(Math.PI * k) * 0.3), lerp(bz, ez, k));
      ball.rotation.x += 0.2;
    });
    if (reddet) {
      res = 'reddet';
      p.play('sad');
      await out(tx + Math.sign(tx - cxValgt || 1) * 2.2, BALL_R, GOAL_Z - 3.5, 0.6);
      g.root.rotation.z = 0; g.root.position.y = 0; g.play('cheer');
    } else if (inde) {
      res = 'maal';
      p.play('cheer'); p.root.rotation.y = Math.PI;
      this.konfettiStart();
      if (this.udstyr.tilskuere >= 8) this.fyrStart();
      this.slowmo(0.9);
      this.maskotJubel = 3;
      await out(tx * 0.95, BALL_R, GOAL_Z + 1.5, 0.45);
      g.root.rotation.z = 0; g.root.position.y = 0; g.play('sad');
    } else if (stolpe) {
      res = 'stolpe';
      p.play('sad');
      await out(tx * 1.5, BALL_R, GOAL_Z - 6, 0.7);
      g.root.rotation.z = 0; g.root.position.y = 0; g.play('ready');
    } else {
      res = 'forbi';
      p.play('sad');
      await out(tx * 1.2, ty > GOAL_H ? ty + 1.5 : BALL_R, GOAL_Z + 4.5, 0.5);
      g.root.rotation.z = 0; g.root.position.y = 0; g.play('cheer');
    }
    await this.wait(1.25);
    return res;
  }

  // ------------------------------------------------------------ konfetti
  initKonfetti() {
    const n = 260;
    const geo = new THREE.BufferGeometry();
    this.kPos = new Float32Array(n * 3);
    this.kVel = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    const pal = [0xffd21f, 0xe5323b, 0xffffff, 0x35b6f0, 0x29c466].map((c) => new THREE.Color(c));
    for (let i = 0; i < n; i++) { const c = pal[i % pal.length]; col.set([c.r, c.g, c.b], i * 3); }
    geo.setAttribute('position', new THREE.BufferAttribute(this.kPos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.konfetti = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.2, vertexColors: true }));
    this.konfetti.frustumCulled = false;
    this.konfetti.visible = false;
    this.kLife = 0;
    this.scene.add(this.konfetti);
  }
  initFyr() {
    const n = 360;
    const geo = new THREE.BufferGeometry();
    this.fPos = new Float32Array(n * 3);
    this.fVel = new Float32Array(n * 3);
    this.fCol = new Float32Array(n * 3);
    geo.setAttribute('position', new THREE.BufferAttribute(this.fPos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.fCol, 3));
    this.fyr = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.5, vertexColors: true, transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false }));
    this.fyr.frustumCulled = false;
    this.fyr.visible = false;
    this.fLife = 0;
    this.scene.add(this.fyr);
  }
  fyrStart(z = GOAL_Z + 2) {
    const n = this.fPos.length / 3, bursts = 4, per = n / bursts;
    const pal = [0xffd21f, 0xff4a5a, 0x5fd0ff, 0x7dff9a, 0xffffff].map((c) => new THREE.Color(c));
    for (let b = 0; b < bursts; b++) {
      const cx = (Math.random() - 0.5) * 20, cy = 5.5 + Math.random() * 3.5, cz = z + Math.random() * 3;
      const c = pal[Math.floor(Math.random() * pal.length)];
      for (let i = b * per; i < (b + 1) * per; i++) {
        const th = Math.random() * Math.PI * 2, ph = Math.acos(Math.random() * 2 - 1), sp = 4 + Math.random() * 3;
        this.fPos.set([cx, cy, cz], i * 3);
        this.fVel.set([Math.sin(ph) * Math.cos(th) * sp, Math.cos(ph) * sp, Math.sin(ph) * Math.sin(th) * sp], i * 3);
        this.fCol.set([c.r, c.g, c.b], i * 3);
      }
    }
    this.fyr.geometry.attributes.color.needsUpdate = true;
    this.fLife = 2.2;
    this.fyr.visible = true;
  }
  konfettiStart(z = GOAL_Z - 1) {
    const n = this.kPos.length / 3;
    for (let i = 0; i < n; i++) {
      this.kPos.set([(Math.random() - 0.5) * 12, 3 + Math.random() * 5, z - Math.random() * 8], i * 3);
      this.kVel.set([(Math.random() - 0.5) * 3, Math.random() * 3, (Math.random() - 0.5) * 3], i * 3);
    }
    this.kLife = 3.2;
    this.konfetti.visible = true;
  }

  // ------------------------------------------------------------ kamera og løkke
  kamera(dt) {
    const pos = new THREE.Vector3(), look = new THREE.Vector3();
    const cam = this.camera;
    const w = window.innerWidth, h = window.innerHeight;
    if (this.mode === 'hero') {
      const a = Math.sin(this.time * 0.25) * 0.45 + 0.25;
      const R = this.portrait ? 12 : 6.6;
      pos.set(Math.sin(a) * R, 1.9, Math.cos(a) * R);
      look.set(0, 1.25, 0);
      if (this.portrait) cam.setViewOffset(w, h, 0, h * 0.3, w, h); else cam.setViewOffset(w, h, -w * 0.2, 0, w, h);
    } else {
      if (cam.view) cam.clearViewOffset();
      if (this.mode === 'match') {
        const pz = this.player.root.position.z;
        pos.set(this.portrait ? 3.4 : 4.8, this.portrait ? 5.2 : 3.9, pz - (this.portrait ? 12.5 : 7.4));
        look.set(0, this.portrait ? 1.3 : 0.9, pz + 3);
      } else if (this.mode === 'penalty') {
        const half = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)) * cam.aspect;
        const D = Math.max(11.8, 6.6 / half);
        pos.set(1.6, Math.max(4.5, 0.39 * D), GOAL_Z - D);  // højt nok til at se målet over spilleren
        look.set(0, 1.7, GOAL_Z);
      }
    }
    const k = this.snap ? 1 : 1 - Math.exp(-dt * 4);
    this.camPos.lerp(pos, k);
    this.camLook.lerp(look, k);
    this.snap = false;
    cam.position.copy(this.camPos);
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt * 1.4);
      cam.position.x += (Math.random() - 0.5) * this.shake;
      cam.position.y += (Math.random() - 0.5) * this.shake;
    }
    cam.lookAt(this.camLook);
  }

  frame() {
    const now = performance.now();
    const raa = (now - this.last) / 1000;
    // mål hastigheden de første sekunder: er enheden for langsom til flot grafik, giver vi besked
    const m = this.maal;
    if (this.onLangsom && this.loaded && !this.lav && this.mode !== 'none' && raa < 1 && m.tid < 18 && document.visibilityState === 'visible') {
      m.tid += raa;
      if (m.tid > 2) { m.vindue += raa; m.frames++; }   // de første 2 sekunder tæller ikke: der hakker alle enheder lidt
      if (m.vindue >= 4) {
        const fps = m.frames / m.vindue;
        m.vindue = 0; m.frames = 0;
        if (fps < 24) { const cb = this.onLangsom; this.onLangsom = null; cb(fps); }
      }
    }
    let dt = Math.min(0.05, raa);
    if (this.slowT > 0) { this.slowT -= dt; dt *= 0.3; }
    dt *= this.fart || 1;   // kun til test: spol animationerne frem
    this.last = now;
    this.time += dt;
    for (const tw of [...this.tweens]) {
      tw.t += dt;
      const k = Math.min(1, tw.t / tw.dur);
      tw.fn(k);
      if (k >= 1) { this.tweens.splice(this.tweens.indexOf(tw), 1); tw.res(); }
    }
    if (this.mode === 'penalty' && this.goalie && !this.keeper.busy) {
      this.goalie.root.position.x = Math.sin(this.time * 1.6) * 0.9;
      if (this.friloeber) {
        this.keeper.fremme = Math.min(1, this.keeper.fremme + dt / 4.5);
        this.goalie.root.position.z = GOAL_Z - 0.35 - this.keeper.fremme * 3.4;
      }
    }
    for (const f of Object.values(this.slots)) if (f.root.visible) f.update(dt);
    if (this.kLife > 0) {
      this.kLife -= dt;
      const n = this.kPos.length / 3;
      for (let i = 0; i < n; i++) {
        this.kVel[i * 3 + 1] -= 3.5 * dt;
        this.kPos[i * 3] += this.kVel[i * 3] * dt + Math.sin(this.time * 5 + i) * 0.01;
        this.kPos[i * 3 + 1] = Math.max(0.05, this.kPos[i * 3 + 1] + this.kVel[i * 3 + 1] * dt);
        this.kPos[i * 3 + 2] += this.kVel[i * 3 + 2] * dt;
      }
      this.konfetti.geometry.attributes.position.needsUpdate = true;
      if (this.kLife <= 0) this.konfetti.visible = false;
    }
    if (this.fLife > 0) {
      this.fLife -= dt;
      const n = this.fPos.length / 3;
      for (let i = 0; i < n * 3; i += 3) {
        this.fVel[i + 1] -= 2.2 * dt;
        this.fPos[i] += this.fVel[i] * dt; this.fPos[i + 1] += this.fVel[i + 1] * dt; this.fPos[i + 2] += this.fVel[i + 2] * dt;
      }
      this.fyr.geometry.attributes.position.needsUpdate = true;
      this.fyr.material.opacity = Math.min(1, this.fLife / 0.8);
      if (this.fLife <= 0) this.fyr.visible = false;
    }
    if (this.beams?.visible) this.beams.rotation.y = Math.sin(this.time * 0.6) * 0.22;
    if (this.lysPletter?.visible) {
      const midtZ = this.mode === 'penalty' ? GOAL_Z - 6 : this.player ? this.player.root.position.z + 3 : 0;
      this.lysPletter.children.forEach((plet, i) => {
        plet.position.x = Math.sin(this.time * (0.5 + i * 0.13) + i * 1.7) * 13;
        plet.position.z = midtZ + Math.cos(this.time * (0.4 + i * 0.11) + i * 2.3) * 9;
      });
    }
    if (this.mascot?.visible) {
      this.maskotJubel = Math.max(0, (this.maskotJubel || 0) - dt);
      const fart = this.maskotJubel > 0 ? 16 : 5, hop = this.maskotJubel > 0 ? 0.5 : 0.08;
      const s = Math.sin(this.time * fart);
      this.mascot.position.y = Math.abs(s) * hop;
      if (this.wings[0]) this.wings[0].rotation.z = 0.5 + s * 0.5 + (this.maskotJubel > 0 ? 1.2 : 0);
      if (this.wings[1]) this.wings[1].rotation.z = -0.5 - s * 0.5 - (this.maskotJubel > 0 ? 1.2 : 0);
    }
    if (this.mode !== 'none') {
      this.kamera(dt);
      const f = this.mode === 'penalty' ? this.focus.set(0, 0, GOAL_Z - 4) : this.focus.copy(this.player.root.position);
      this.sun.target.position.copy(f);
      this.sun.position.set(f.x + 14, 26, f.z - 12);
    }
    this.renderer.render(this.scene, this.camera);
  }
}
