// 3D-verdenen: stadion, figurer, bold, kamp-forløb og straffespark.
// Koordinater: banen ligger i x/z-planet, målet man skyder på står ved z = +29, og figurerne kigger mod +z.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export const FIGURER = { rhino: 'Næsehorn', lion: 'Løve', croc: 'Krokodille', panda: 'Panda' };
const GOAL_Z = 29, SPOT_Z = 23, GOAL_HW = 5, GOAL_H = 3.4, BALL_R = 0.17;
const START_Z = -18, STEP = 3.6;
const lerp = (a, b, k) => a + (b - a) * k;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ease = (k) => k * k * (3 - 2 * k);

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
      else if (['Jersey', 'Shorts', 'Socks', 'Trim'].includes(name)) {
        this.mats[name] ||= o.material.clone();
        o.material = this.mats[name];
      }
    });
    this.state = 'idle';
    this.t = Math.random() * 10;
    this.st = 0;
  }
  setKit(farve1, farve2, nummer) {
    const c1 = new THREE.Color(farve1), c2 = new THREE.Color(farve2);
    this.mats.Jersey?.color.copy(c1);
    this.mats.Socks?.color.copy(c1);
    this.mats.Shorts?.color.copy(c2);
    this.mats.Trim?.color.copy(c2);
    const lum = (c) => 0.3 * c.r + 0.6 * c.g + 0.1 * c.b;
    let ink = farve2;
    if (Math.abs(lum(c1) - lum(c2)) < 0.25) ink = lum(c1) > 0.5 ? '#10151f' : '#ffffff';
    const g = this.canvas.getContext('2d');
    g.clearRect(0, 0, 256, 256);
    g.fillStyle = ink;
    g.font = '800 190px "Barlow Condensed", "Arial Narrow", Impact, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
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
        m.position.y = Math.abs(Math.sin(st * 7)) * 0.45;
        ArmL.rotation.z = 2.5 + Math.sin(st * 14) * 0.2; ArmR.rotation.z = -2.5 - Math.sin(st * 14) * 0.2;
        Head.rotation.x = -0.25;
        m.rotation.y = Math.sin(st * 3.5) * 0.5;
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
    this.scene.add(new THREE.HemisphereLight(0xe4f2ff, 0x3f7f45, 1.5));
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
    this.keeper = { baseX: 0, busy: false };
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

  async load(onProgress) {
    const loader = new GLTFLoader();
    const files = { stadium: 'stadium.glb', ball: 'ball.glb' };
    for (const k of Object.keys(FIGURER)) files[k] = `char_${k}.glb`;
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
  }

  /** Stadion-niveau: 0 = træningsbane med små tribuner, højere niveauer låser mere op. */
  setStadion(niveau) {
    const vis = { Trees: niveau < 2, StandsSmall: true, StandsBig: niveau >= 2, Roof: niveau >= 3, Floodlights: niveau >= 1 };
    for (const [name, v] of Object.entries(vis)) { const o = this.stadium.getObjectByName(name); if (o) o.visible = v; }
  }

  figur(slot, kind) {
    let f = this.slots[slot];
    if (!f || f.kind !== kind) {
      if (f) this.scene.remove(f.root);
      f = this.slots[slot] = new Figur(kind, this.assets[kind]);
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
    p.setKit(kit.farve1, kit.farve2, kit.nummer);
    p.play('idle');
    this.hide('defender'); this.hide('keeper');
    this.aim.visible = false;
    this.ball.position.set(0.75, BALL_R, 0.7);
  }

  // ------------------------------------------------------------ kamp
  modstanderKit(kit) {
    const c = new THREE.Color(kit.farve1);
    const hsl = {}; c.getHSL(hsl);
    const roed = hsl.s > 0.4 && (hsl.h < 0.07 || hsl.h > 0.93);
    return roed ? { farve1: '#1E5BD8', farve2: '#F4F4F0' } : { farve1: '#C81E2C', farve2: '#15171C' };
  }
  startMatch(kind, kit) {
    this.clearTweens();
    this.mode = 'match';
    this.snap = true;
    this.step = 0;
    const p = this.player = this.figur('player', kind);
    p.setKit(kit.farve1, kit.farve2, kit.nummer);
    p.root.position.set(0, 0, START_Z);
    p.play('idle');
    const kinds = Object.keys(FIGURER).filter((k) => k !== kind);
    this.rivalKinds = kinds;
    const d = this.defender = this.figur('defender', kinds[0]);
    const mk = this.modstanderKit(kit);
    d.setKit(mk.farve1, mk.farve2, 4);
    d.root.position.set(0, 0, START_Z + 3.3);
    d.root.rotation.y = Math.PI;
    d.play('ready');
    this.hide('keeper');
    this.aim.visible = false;
    this.ball.position.set(0.2, BALL_R, START_Z + 0.9);
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
  startFinale(kind, kit) {
    this.clearTweens();
    this.mode = 'penalty';
    this.snap = true;
    const p = this.player = this.figur('player', kind);
    p.setKit(kit.farve1, kit.farve2, kit.nummer);
    this.hide('defender');
    const kinds = Object.keys(FIGURER).filter((k) => k !== kind);
    const g = this.goalie = this.figur('keeper', kinds[kinds.length - 1]);
    g.setKit('#B6F000', '#15171C', 1);
    this.resetSkud();
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
    this.ball.position.set(0, BALL_R, SPOT_Z);
    this.ball.rotation.set(0, 0, 0);
  }
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
  /** Skyd mod et punkt. Giver 'maal', 'reddet', 'stolpe' eller 'forbi'. onSpark kaldes, når bolden rammes. */
  async skyd(pt, onSpark) {
    const p = this.player, g = this.goalie, ball = this.ball;
    this.aim.visible = false;
    const a = Math.random() * Math.PI * 2, rr = Math.random() * 0.32;
    const tx = pt.x + Math.cos(a) * rr, ty = Math.max(0.2, pt.y + Math.sin(a) * rr);
    p.play('run');
    const px = p.root.position.x, pz = p.root.position.z;
    await this.tween(0.38, (k) => { p.root.position.set(lerp(px, -0.42, k), 0, lerp(pz, SPOT_Z - 0.75, k)); p.root.rotation.y = lerp(0.5, 0.25, k); });
    p.play('kick');
    await this.wait(0.2);
    onSpark?.();
    // målmandens valg
    this.keeper.busy = true;
    const gx0 = g.root.position.x;
    const klog = Math.random() < 0.5;
    const cx = clamp(klog ? gx0 + (tx - gx0) * 0.88 : (Math.random() * 2 - 1) * 3.0, -3.0, 3.0);
    const cy = klog && ty > 1.7 ? Math.min(ty, 1.95) : 1.15;
    const tilt = clamp((cx - gx0) / 2.0, -1.25, 1.25);
    const rootX = cx - Math.sin(tilt) * 1.2, rootY = Math.max(0, cy - Math.cos(tilt) * 1.2);
    g.play(Math.abs(tilt) > 0.25 || cy > 1.3 ? 'dive' : 'ready');
    const inde = Math.abs(tx) < GOAL_HW - 0.2 && ty < GOAL_H - 0.2;
    const reddet = inde && Math.abs(tx - cx) < 1.25 && Math.abs(ty - cy) < 1.0;
    const stolpe = !inde && Math.abs(tx) < GOAL_HW + 0.3 && ty < GOAL_H + 0.3;
    await this.tween(0.5, (k) => {
      ball.position.set(lerp(0, tx, k), lerp(BALL_R, ty, k) + Math.sin(Math.PI * k) * 0.45, lerp(SPOT_Z, GOAL_Z - 0.15, k));
      ball.rotation.x += 0.5;
      const e = ease(Math.min(1, k * 1.25));
      g.root.position.set(lerp(gx0, rootX, e), rootY * Math.sin(Math.PI * Math.min(1, k * 1.1) * 0.5), GOAL_Z - 0.35);
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
      await out(tx + Math.sign(tx - cx || 1) * 2.2, BALL_R, GOAL_Z - 3.5, 0.6);
      g.root.rotation.z = 0; g.root.position.y = 0; g.play('cheer');
    } else if (inde) {
      res = 'maal';
      p.play('cheer'); p.root.rotation.y = Math.PI;
      this.konfettiStart();
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
  konfettiStart() {
    const n = this.kPos.length / 3;
    for (let i = 0; i < n; i++) {
      this.kPos.set([(Math.random() - 0.5) * 12, 3 + Math.random() * 5, GOAL_Z - 1 - Math.random() * 8], i * 3);
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
        pos.set(0.7, Math.max(4.5, 0.39 * D), GOAL_Z - D);  // højt nok til at se målet over spilleren
        look.set(0, 1.7, GOAL_Z);
      }
    }
    const k = this.snap ? 1 : 1 - Math.exp(-dt * 4);
    this.camPos.lerp(pos, k);
    this.camLook.lerp(look, k);
    this.snap = false;
    cam.position.copy(this.camPos);
    cam.lookAt(this.camLook);
  }

  frame() {
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.last) / 1000);
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
    if (this.mode !== 'none') {
      this.kamera(dt);
      const f = this.mode === 'penalty' ? this.focus.set(0, 0, GOAL_Z - 4) : this.focus.copy(this.player.root.position);
      this.sun.target.position.copy(f);
      this.sun.position.set(f.x + 14, 26, f.z - 12);
    }
    this.renderer.render(this.scene, this.camera);
  }
}
