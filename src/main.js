import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import * as CANNON from 'cannon-es';

const $ = id => document.getElementById(id);
let store = { stars: {}, sound: true };
try { store = Object.assign(store, JSON.parse(localStorage.getItem('royal-smash-3d-v1') || '{}')); } catch (e) {}
const save = () => { try { localStorage.setItem('royal-smash-3d-v1', JSON.stringify(store)); } catch (e) {} };

/* ---------------- 소리 ---------------- */
const S = {
  ac: null, out: null, lastKnock: 0, log: [],
  init() {
    if (!this.ac) { try { this.ac = new (window.AudioContext || window.webkitAudioContext)();
      const c = this.ac.createDynamicsCompressor(); c.threshold.value = -14; c.ratio.value = 6; c.connect(this.ac.destination); this.out = c; } catch (e) {} }
    if (this.ac && this.ac.state === 'suspended') this.ac.resume();
  },
  ok() { return store.sound && this.ac; },
  // 잡음 한 방 (at: 몇 초 뒤, type: lowpass/bandpass)
  noise(dur, f, vol, q = 1, at = 0, type = 'lowpass') {
    if (!this.ok()) return; const a = this.ac, n = a.createBuffer(1, Math.max(1, a.sampleRate * dur | 0), a.sampleRate), d = n.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 2);
    const s = a.createBufferSource(), fl = a.createBiquadFilter(), g = a.createGain(); s.buffer = n; fl.type = type; fl.frequency.value = f; fl.Q.value = q; g.gain.value = vol;
    s.connect(fl).connect(g).connect(this.out); s.start(a.currentTime + at);
  },
  // 음 하나: f → f2 로 미끄러짐, vib: [빠르기, 흔들림 폭]
  tone(f, dur, type, vol, f2, at = 0, vib) {
    if (!this.ok()) return; const a = this.ac, o = a.createOscillator(), g = a.createGain(), t = a.currentTime + at;
    o.type = type; o.frequency.setValueAtTime(f, t); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
    if (vib) { const l = a.createOscillator(), lg = a.createGain(); l.frequency.value = vib[0]; lg.gain.setValueAtTime(vib[1], t); lg.gain.linearRampToValueAtTime(vib[1] * .2, t + dur); l.connect(lg).connect(o.frequency); l.start(t); l.stop(t + dur); }
    g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + .012); g.gain.exponentialRampToValueAtTime(.001, t + dur);
    o.connect(g).connect(this.out); o.start(t); o.stop(t + dur + .02);
  },
  // 발사: "뽁!" + "뻥!" + 날아가는 "휘이~"
  fire(flight) {
    this.log.push('fire');
    this.tone(1500, .08, 'sine', .5, 380);
    this.noise(.38, 1200, 1.1); this.tone(240, .32, 'sine', .9, 55, .01); this.tone(120, .3, 'square', .12, 50, .01);
    this.tone(1700, Math.max(.35, flight), 'sine', .12, 900, .1, [7, 25]);
  },
  // 제대로 맞음: "펑! 펑!" + 반짝
  bang() {
    this.log.push('bang');
    [[0, 560, 95], [.14, 680, 120]].forEach(([at, f, f2]) => { this.noise(.2, 1900, .8, 1, at); this.tone(f, .18, 'sine', .6, f2, at); this.tone(f * 2, .08, 'square', .06, f2 * 2, at); });
    [1568, 2093, 2637].forEach((f, i) => this.tone(f, .22, 'triangle', .11, null, .3 + i * .06));
  },
  // 빗맞음: "띠요오옹~"
  boing() {
    this.log.push('boing');
    if (!this.ok()) return; const a = this.ac, t = a.currentTime;
    [['triangle', 1, .34], ['sine', 2, .1]].forEach(([type, m, vol]) => {
      const o = a.createOscillator(), g = a.createGain(), l = a.createOscillator(), lg = a.createGain();
      o.type = type; o.frequency.setValueAtTime(240 * m, t); o.frequency.linearRampToValueAtTime(640 * m, t + .1); o.frequency.exponentialRampToValueAtTime(330 * m, t + .85);
      l.frequency.setValueAtTime(13, t); l.frequency.linearRampToValueAtTime(6, t + .85); lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(90 * m, t + .14); lg.gain.linearRampToValueAtTime(10 * m, t + .85);
      l.connect(lg).connect(o.frequency);
      g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + .02); g.gain.setValueAtTime(vol, t + .4); g.gain.exponentialRampToValueAtTime(.001, t + .9);
      o.connect(g).connect(this.out); o.start(t); l.start(t); o.stop(t + .92); l.stop(t + .92);
    });
    this.tone(900, .05, 'sine', .25, 500);
  },
  // 아무것도 못 맞힘: "휘유우~"
  miss() { this.log.push('miss'); this.tone(1100, .9, 'sine', .3, 230, 0, [6, 30]); this.tone(2200, .9, 'sine', .05, 460, 0, [6, 60]); },
  knock(v) { const now = performance.now(); if (now - this.lastKnock < 45) return; this.lastKnock = now; const vol = Math.min(.3, v / 34); this.tone(380 + Math.random() * 260, .09, 'triangle', vol, 180); this.noise(.06, 2500, vol * .6, 2); },
  ding(n) { this.tone(660 + Math.min(n, 12) * 40, .18, 'sine', .14); },
  win() { [523, 659, 784, 1047, 1319].forEach((f, i) => this.tone(f, .32, 'triangle', .18, null, i * .11)); },
};

/* ---------------- 3D 화면 ---------------- */
const canvas = $('gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(1.75, window.devicePixelRatio || 1));
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
{ const c = document.createElement('canvas'); c.width = 4; c.height = 256; const g = c.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, 256);
  gr.addColorStop(0, '#3f93ff'); gr.addColorStop(.55, '#9fd4ff'); gr.addColorStop(1, '#e9f7ff'); g.fillStyle = gr; g.fillRect(0, 0, 4, 256);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; scene.background = t; }
scene.fog = new THREE.Fog(0xcfeaff, 45, 120);
const camera = new THREE.PerspectiveCamera(48, 1, .1, 300);
scene.add(new THREE.HemisphereLight(0xffffff, 0x88aa66, 1.4));
const sun = new THREE.DirectionalLight(0xffffff, 2.2); sun.position.set(8, 16, 10); sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024); Object.assign(sun.shadow.camera, { left: -9, right: 9, top: 9, bottom: -9, near: 1, far: 50 }); sun.shadow.bias = -0.0005;
scene.add(sun);

const mat = (c, o = {}) => new THREE.MeshStandardMaterial(Object.assign({ color: c, roughness: .55, metalness: 0 }, o));
const GROUND_Y = -7;
// 땅
{ const g = new THREE.Mesh(new THREE.CircleGeometry(150, 48), mat(0x6cc24a, { roughness: 1 })); g.rotation.x = -Math.PI / 2; g.position.y = GROUND_Y; g.receiveShadow = true; scene.add(g); }
// 왕궁 원탁
const TABLE_R = 4.2;
{ const top = new THREE.Mesh(new THREE.CylinderGeometry(TABLE_R, TABLE_R, .35, 48), mat(0xc22a35, { roughness: .8 })); top.position.y = -.175; top.receiveShadow = true; scene.add(top);
  const skirt = new THREE.Mesh(new THREE.CylinderGeometry(TABLE_R + .05, TABLE_R - .15, 1.1, 48, 1, true), mat(0xa81f2b, { roughness: .85, side: THREE.DoubleSide })); skirt.position.y = -.9; scene.add(skirt);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(TABLE_R + .02, .09, 8, 64), mat(0xffc83d, { metalness: .6, roughness: .3 })); rim.rotation.x = Math.PI / 2; rim.position.y = -.05; scene.add(rim);
  const rim2 = rim.clone(); rim2.position.y = -1.42; rim2.scale.setScalar((TABLE_R - .12) / (TABLE_R + .02)); scene.add(rim2);
  for (let i = 0; i < 24; i++) { const a = i / 24 * Math.PI * 2, b = new THREE.Mesh(new THREE.SphereGeometry(.13, 10, 8), rim.material); b.position.set(Math.cos(a) * (TABLE_R - .1), -1.55, Math.sin(a) * (TABLE_R - .1)); scene.add(b); }
  const leg = new THREE.Mesh(new THREE.CylinderGeometry(.8, 1.3, -GROUND_Y - 1.4, 24), mat(0x8a4b24)); leg.position.y = (GROUND_Y - 1.4) / 2; leg.castShadow = true; scene.add(leg);
  const foot = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.8, .5, 32), mat(0x6f3a1a)); foot.position.y = GROUND_Y + .25; scene.add(foot);
}
// 먼 풍경: 성, 나무, 구름
{ const castle = mat(0xb7cdee, { roughness: 1 }), roof = mat(0xe8687a, { roughness: 1 }), add = (m, x, y, z) => { m.position.set(x, y, z); scene.add(m); return m; };
  add(new THREE.Mesh(new THREE.BoxGeometry(26, 10, 4), castle), 0, GROUND_Y + 5, -48);
  [-14, -5, 5, 14].forEach((x, i) => { const h = i % 3 ? 18 : 14; add(new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.6, h, 20), castle), x, GROUND_Y + h / 2, -47); add(new THREE.Mesh(new THREE.ConeGeometry(3.3, 6, 20), roof), x, GROUND_Y + h + 3, -47); });
  for (let i = 0; i < 13; i++) { const x = -26 + i * 4.3; add(new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.4, 4), castle), x, GROUND_Y + 10.7, -48); }
  const leaf = mat(0x3f9a3a, { roughness: 1 }), trunk = mat(0x7a4a24);
  for (let i = 0; i < 26; i++) { const a = (i / 26) * Math.PI * 2, r = 26 + (i * 37 % 11); const x = Math.cos(a) * r, z = Math.sin(a) * r; if (z > 14 && Math.abs(x) < 16) continue;
    const s = 1 + (i * 13 % 7) / 6; add(new THREE.Mesh(new THREE.CylinderGeometry(.3 * s, .4 * s, 2 * s, 8), trunk), x, GROUND_Y + s, z); add(new THREE.Mesh(new THREE.ConeGeometry(1.8 * s, 4.5 * s, 10), leaf), x, GROUND_Y + 2 * s + 2 * s, z); }
  const cw = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false });
  [[-30, 22, -70], [10, 28, -80], [38, 20, -66], [-55, 26, -40], [55, 24, -30]].forEach(([x, y, z], k) => { const g = new THREE.Group(); [[0, 0, 0, 4], [4, 1, 0, 5], [8.5, 0, 0, 3.6], [4, -1.5, 1, 4]].forEach(([a, b, c, r]) => { const m = new THREE.Mesh(new THREE.SphereGeometry(r, 14, 10), cw); m.position.set(a, b, c); g.add(m); }); g.position.set(x, y, z); g.scale.setScalar(.8 + k * .1); scene.add(g); });
  // 깃발줄
  const flagCols = [0xe84a5f, 0xffc83d, 0x4f8df0, 0x5cc96e];
  for (let i = 0; i < 24; i++) { const t = i / 23, x = -16 + 32 * t, y = 10 - Math.sin(t * Math.PI) * 2.2, f = new THREE.Mesh(new THREE.ConeGeometry(.45, 1.1, 3), new THREE.MeshBasicMaterial({ color: flagCols[i % 4] })); f.rotation.z = Math.PI; f.position.set(x, y - .5, -14); scene.add(f); }
}

/* ---------------- 물리 ---------------- */
let world, blocks = [], balls = [];
const blockMat = new CANNON.Material('block'), tableMat = new CANNON.Material('table');
function newWorld() {
  for (const b of blocks) scene.remove(b.mesh); for (const b of balls) scene.remove(b.mesh);
  blocks = []; balls = [];
  world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.82, 0), allowSleep: true });
  world.broadphase = new CANNON.SAPBroadphase(world);
  world.solver.iterations = 18; world.solver.tolerance = 1e-4;
  world.addContactMaterial(new CANNON.ContactMaterial(blockMat, blockMat, { friction: .55, restitution: .05 }));
  world.addContactMaterial(new CANNON.ContactMaterial(blockMat, tableMat, { friction: .45, restitution: .05 }));
  const top = new CANNON.Body({ mass: 0, material: tableMat, shape: new CANNON.Cylinder(TABLE_R, TABLE_R, .35, 32), position: new CANNON.Vec3(0, -.175, 0) });
  world.addBody(top);
  const ground = new CANNON.Body({ mass: 0, material: tableMat, shape: new CANNON.Plane() }); ground.quaternion.setFromEuler(-Math.PI / 2, 0, 0); ground.position.y = GROUND_Y; world.addBody(ground);
  const leg = new CANNON.Body({ mass: 0, shape: new CANNON.Cylinder(1, 1.3, -GROUND_Y, 16), position: new CANNON.Vec3(0, GROUND_Y / 2, 0) }); world.addBody(leg);
}

/* ---------------- 블록 ---------------- */
const COLORS = [0xff5a5f, 0xffc83d, 0x4f8df0, 0x5cc96e, 0xa66bff, 0xff8a3d, 0xff7ac6, 0x3fd0d4];
const geoCache = new Map(), matCache = new Map();
const getMat = c => { if (!matCache.has(c)) matCache.set(c, mat(c, { roughness: .45 })); return matCache.get(c); };
function geo(key, make) { if (!geoCache.has(key)) geoCache.set(key, make()); return geoCache.get(key); }
let ci = 0;
const nextC = () => COLORS[(ci++) % COLORS.length];
function addBlock(spec) {
  const { t, x, y, z } = spec, c = spec.c ?? nextC();
  let shape, mesh, h;
  if (t === 'box') {
    const { w, d } = spec; h = spec.h;
    shape = new CANNON.Box(new CANNON.Vec3(w / 2, h / 2, d / 2));
    mesh = new THREE.Mesh(geo(`b${w},${h},${d}`, () => new RoundedBoxGeometry(w, h, d, 2, Math.min(.08, w / 6, h / 6, d / 6))), getMat(c));
  } else {
    const r = spec.r, rt = spec.rt ?? r; h = spec.h;
    shape = new CANNON.Cylinder(Math.max(rt, .02), r, h, 14);
    mesh = new THREE.Mesh(geo(`c${r},${rt},${h}`, () => new THREE.CylinderGeometry(Math.max(rt, .02), r, h, 14)), getMat(c));
  }
  const vol = t === 'box' ? spec.w * spec.h * spec.d : Math.PI * spec.r * spec.r * h * (spec.rt === 0 ? .4 : 1);
  const body = new CANNON.Body({ mass: Math.max(.25, vol * .8), material: blockMat, shape, position: new CANNON.Vec3(x, y + h / 2 + .002, z), linearDamping: .05, angularDamping: .08 });
  body.sleepSpeedLimit = .12; body.sleepTimeLimit = .5;
  if (spec.ry) body.quaternion.setFromEuler(0, spec.ry, 0);
  body.addEventListener('collide', e => { const v = Math.abs(e.contact.getImpactVelocityAlongNormal()); if (v > 1.5 && playing) S.knock(v); });
  body.isBlock = true;
  world.addBody(body); body.sleep();
  mesh.castShadow = mesh.receiveShadow = true; scene.add(mesh);
  const b = { body, mesh, fallen: false }; body.blockRef = b; blocks.push(b); sync(b); return y + h;
}
const sync = o => { o.mesh.position.copy(o.body.position); o.mesh.quaternion.copy(o.body.quaternion); };

// 짓기 도구 (y는 바닥 높이)
const box = (w, h, d, x, y, z, ry = 0, c) => addBlock({ t: 'box', w, h, d, x, y, z, ry, c });
const cube = (s, x, y, z, c) => box(s, s, s, x, y, z, 0, c);
const cyl = (r, h, x, y, z, c, rt) => addBlock({ t: 'cyl', r, h, x, y, z, c, rt });
const cone = (r, h, x, y, z, c = 0xe84a5f) => addBlock({ t: 'cyl', r, rt: 0, h, x, y, z, c });

const LEVELS = [
  { n: '첫 탑', par: 2, b() { let y = 0; for (let i = 0; i < 5; i++) y = cube(1.1, 0, y, 0); } },
  { n: '알록달록 벽', par: 3, b() { for (let r = 0; r < 4; r++) for (let i = 0; i < 5; i++) box(1.2, .7, .8, (i - 2) * 1.22 + (r % 2 ? .3 : -.3), r * .7, 0); } },
  { n: '세모 벽', par: 3, b() { for (let r = 0; r < 5; r++) for (let i = 0; i < 5 - r; i++) cube(1, (i - (4 - r) / 2) * 1.02, r, 0); } },
  { n: '돌다리', par: 3, b() { let y = 0; for (let i = 0; i < 3; i++) { cube(1, -1.6, y, 0); y = cube(1, 1.6, y, 0); } y = box(4.6, .45, 1.2, 0, y, 0); cube(.8, -1.2, y, 0); cube(.8, 1.2, y, 0); const t = cyl(.45, 1, 0, y, 0); cone(.6, .9, 0, t, 0); } },
  { n: '네모 피라미드', par: 3, b() { for (let l = 0; l < 3; l++) { const n = 3 - l; for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) cube(1, (i - (n - 1) / 2) * 1.02, l, (j - (n - 1) / 2) * 1.02); } } },
  { n: '젠가 탑', par: 4, b() { for (let l = 0; l < 9; l++) for (let i = -1; i <= 1; i++) l % 2 ? box(.95, .55, 3, i, l * .55, 0) : box(3, .55, .95, 0, l * .55, i); } },
  { n: '네 기둥 성', par: 4, b() { [[-1.8, -1.8], [1.8, -1.8], [-1.8, 1.8], [1.8, 1.8]].forEach(([x, z]) => { let y = 0; for (let i = 0; i < 3; i++) y = cyl(.55, 1, x, y, z); cone(.75, 1.1, x, y, z); });
      for (let r = 0; r < 2; r++) { [-1.8, 1.8].forEach(z => { box(1, .8, .5, -.55, r * .8, z); box(1, .8, .5, .55, r * .8, z); }); } cube(.9, 0, 0, 0); cube(.9, 0, .9, 0); } },
  { n: '돌 동그라미', par: 4, b() { const n = 8; for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; box(.6, 2, .6, Math.cos(a) * 2.6, 0, Math.sin(a) * 2.6, -a); }
      for (let i = 0; i < n; i += 2) { const a = (i + .5) / n * Math.PI * 2; box(2.3, .45, .7, Math.cos(a) * 2.55, 2, Math.sin(a) * 2.55, -a + Math.PI / 2); } let y = cube(1, 0, 0, 0); cube(.8, 0, y, 0); } },
  { n: '하늘 탑', par: 4, b() { let y = 0; for (let l = 0; l < 5; l++) { [[-.7, -.7], [.7, -.7], [-.7, .7], [.7, .7]].forEach(([x, z]) => box(.35, 1.1, .35, x, y, z)); y = box(2.1, .3, 2.1, 0, y + 1.1, 0); } cone(1, 1.4, 0, y, 0); } },
  { n: '도미노 원', par: 3, b() { const n = 18; for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; box(.25, 1.6, .9, Math.cos(a) * 3.3, 0, Math.sin(a) * 3.3, -a + Math.PI / 2); } let y = 0; for (let i = 0; i < 4; i++) y = cube(.9, 0, y, 0); } },
  { n: '큰 피라미드', par: 5, b() { for (let l = 0; l < 4; l++) { const n = 4 - l; for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) cube(.9, (i - (n - 1) / 2) * .92, l * .9, (j - (n - 1) / 2) * .92); } } },
  { n: '대왕의 성', par: 6, b() { const s = 2.4; for (let r = 0; r < 2; r++) for (let i = -2; i <= 2; i++) { box(.95, .7, .5, i * 1, r * .7, -s); box(.95, .7, .5, i * 1, r * .7, s); if (Math.abs(i) < 2) { box(.5, .7, .95, -s, r * .7, i * 1.05); box(.5, .7, .95, s, r * .7, i * 1.05); } }
      let y = 0; for (let i = 0; i < 4; i++) y = cyl(.8, .9, 0, y, 0); cone(1.1, 1.4, 0, y, 0); } },
];
function randomBuild() {
  const kind = Math.random() * 5 | 0;
  if (kind === 0) { for (let r = 0; r < 4 + (Math.random() * 3 | 0); r++) for (let i = 0; i < 5; i++) box(1.1, .7, .8, (i - 2) * 1.12 + (r % 2 ? .28 : -.28), r * .7, 0); }
  else if (kind === 1) { [-2, 0, 2].forEach(x => { let y = 0; const n = 3 + (Math.random() * 4 | 0); for (let i = 0; i < n; i++) y = Math.random() < .5 ? cube(.9, x, y, 0) : cyl(.45, .9, x, y, 0); if (Math.random() < .6) cone(.6, .8, x, y, 0); }); }
  else if (kind === 2) { const L = 3 + (Math.random() * 2 | 0); for (let l = 0; l < L; l++) { const n = L - l; for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) cube(.85, (i - (n - 1) / 2) * .87, l * .85, (j - (n - 1) / 2) * .87); } }
  else if (kind === 3) { const L = 6 + (Math.random() * 5 | 0); for (let l = 0; l < L; l++) for (let i = -1; i <= 1; i++) l % 2 ? box(.95, .55, 3, i, l * .55, 0) : box(3, .55, .95, 0, l * .55, i); }
  else { for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2, x = Math.cos(a) * 2.4, z = Math.sin(a) * 2.4; let y = 0; for (let i = 0; i < 2 + (Math.random() * 3 | 0); i++) y = cube(.8, x, y, z); } let y = 0; for (let i = 0; i < 3; i++) y = cyl(.6, .9, 0, y, 0); cone(.8, 1, 0, y, 0); }
}

/* ---------------- 대포 (내 앞) ---------------- */
const cannon = new THREE.Group(); cannon.scale.setScalar(.72); scene.add(cannon);
const barrel = new THREE.Group(); cannon.add(barrel);
{ const navy = mat(0x22336b, { metalness: .5, roughness: .35 }), gold = mat(0xffc83d, { metalness: .7, roughness: .25 });
  const tube = new THREE.Mesh(new THREE.CylinderGeometry(.32, .42, 2.2, 24), navy); tube.rotation.x = -Math.PI / 2; tube.position.z = -.9; barrel.add(tube);
  [-.15, -1.85].forEach(z => { const r = new THREE.Mesh(new THREE.TorusGeometry(z < -1 ? .34 : .43, .07, 8, 24), gold); r.position.z = z; barrel.add(r); });
  const mouth = new THREE.Mesh(new THREE.CircleGeometry(.27, 20), new THREE.MeshBasicMaterial({ color: 0x0a0d1c })); mouth.position.z = -2.005; mouth.rotation.y = Math.PI; barrel.add(mouth);
  const back = new THREE.Mesh(new THREE.SphereGeometry(.42, 20, 14), navy); back.position.z = .2; barrel.add(back);
  const wood = mat(0x8a4b24);
  [-.55, .55].forEach(x => { const w = new THREE.Mesh(new THREE.CylinderGeometry(.55, .55, .16, 20), wood); w.rotation.z = Math.PI / 2; w.position.set(x, -.35, .1); cannon.add(w);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(.16, .16, .2, 12), gold); hub.rotation.z = Math.PI / 2; hub.position.set(x, -.35, .1); cannon.add(hub); });
}
const flash = new THREE.PointLight(0xffaa44, 0, 8); scene.add(flash);

/* ---------------- 카메라·조준 ---------------- */
let camAng = 0, camTarget = 0, camR = 13, recoil = 0, shake = 0;
const LOOK = new THREE.Vector3(0, 1.7, 0);
function placeCamera() {
  const sx = (Math.random() - .5) * shake, sy = (Math.random() - .5) * shake;
  camera.position.set(Math.sin(camAng) * camR + sx, 4.8 + sy, Math.cos(camAng) * camR);
  camera.lookAt(LOOK);
  // 대포: 카메라 아래 앞쪽
  const fwd = new THREE.Vector3(); camera.getWorldDirection(fwd);
  const flat = new THREE.Vector3(fwd.x, 0, fwd.z).normalize();
  cannon.position.copy(camera.position).addScaledVector(flat, 3.4); cannon.position.y = camera.position.y - 2.75;
  cannon.rotation.y = Math.atan2(-flat.x, -flat.z);
}
let aimDir = new THREE.Vector3(0, 0, -1);
function muzzleWorld() { const p = new THREE.Vector3(0, 0, -2.1); barrel.localToWorld(p); return p; }
// Object3D.lookAt 은 +z 를 대상으로 돌리므로, 포신(-z가 앞)은 한 번 뒤집어 줌
function aimBarrel(target) { cannon.updateMatrixWorld(true); barrel.lookAt(target); barrel.rotateY(Math.PI); }

const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
function pickTarget(cx, cy) {
  ndc.set(cx / innerWidth * 2 - 1, -(cy / innerHeight) * 2 + 1); ray.setFromCamera(ndc, camera);
  const hits = ray.intersectObjects(blocks.filter(b => !b.fallen).map(b => b.mesh), false);
  if (hits.length) return hits[0].point;
  // 블록이 없으면 탁자 중심을 지나는 세로 평면에 맞춤
  const n = new THREE.Vector3(Math.sin(camAng), 0, Math.cos(camAng)), plane = new THREE.Plane(n, 0), p = new THREE.Vector3();
  return ray.ray.intersectPlane(plane, p) ? p : null;
}

/* ---------------- 발사 ---------------- */
const ballGeo = new THREE.SphereGeometry(.38, 24, 16), ballMat = mat(0x1d2440, { metalness: .6, roughness: .25 });
let shots = 0, lastFire = 0;
function fireAt(target) {
  if (!playing || ended) return;
  const now = performance.now(); if (now - lastFire < 160) return; lastFire = now;
  aimBarrel(target); barrel.updateMatrixWorld(true);
  const o = muzzleWorld(), D = target.clone().sub(o), dist = D.length(), t = Math.min(1.1, Math.max(.28, dist / 26));
  const v = D.divideScalar(t); v.y += 4.91 * t;
  const body = new CANNON.Body({ mass: 9, shape: new CANNON.Sphere(.38), material: blockMat, position: new CANNON.Vec3(o.x, o.y, o.z), linearDamping: 0 });
  body.velocity.set(v.x, v.y, v.z); body.allowSleep = false;
  body.addEventListener('collide', e => {
    if (body.hit || !e.body.isBlock) return;
    body.hit = true; wakeAll();
    // 정면으로 맞았는지: 구슬이 날아온 방향과 맞닿은 면이 마주 보는 정도
    const vel = body.velocity, sp = vel.length(), n = e.contact.ni, cos = sp > 0 ? Math.abs(vel.dot(n)) / sp : 0;
    const p = new THREE.Vector3().copy(body.position), col = e.body.blockRef ? e.body.blockRef.mesh.material.color.getHex() : 0xffffff;
    if (cos > .72 && sp > 7) { S.bang(); popText(p, '펑펑!', 'bang'); puff(p, 7); puff(p, 5, col); shake = Math.max(shake, .1); try { navigator.vibrate && navigator.vibrate(30); } catch (_) {} }
    else { S.boing(); popText(p, '띠요옹~', 'boing'); puff(p, 4); }
  });
  world.addBody(body);
  const mesh = new THREE.Mesh(ballGeo, ballMat); mesh.castShadow = true; scene.add(mesh);
  balls.push({ body, mesh, born: now });
  if (balls.length > 14) removeBall(balls[0]);
  shots++; recoil = 1; shake = .12; flash.position.copy(o); flash.intensity = 30;
  S.fire(t); puff(o.clone().addScaledVector(v.clone().normalize(), 1.6), 3, 0xffffff); updHud();
  const m = document.createElement('div'); m.className = 'mark'; const sp = target.clone().project(camera);
  m.style.left = (sp.x + 1) / 2 * innerWidth + 'px'; m.style.top = (1 - sp.y) / 2 * innerHeight + 'px'; document.body.appendChild(m); setTimeout(() => m.remove(), 520);
  hint(false);
}
function removeBall(b) { world.removeBody(b.body); scene.remove(b.mesh); balls.splice(balls.indexOf(b), 1); }
function wakeAll() { for (const b of blocks) if (!b.fallen) b.body.wakeUp(); }

/* 연기 */
const puffs = [], puffGeo = new THREE.SphereGeometry(.3, 10, 8);
function puff(p, n, col = 0xf4ecdf) { for (let i = 0; i < n; i++) { const m = new THREE.Mesh(puffGeo, new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: .8, depthWrite: false })); m.position.copy(p).add(new THREE.Vector3((Math.random() - .5) * .6, (Math.random() - .5) * .6, (Math.random() - .5) * .6)); scene.add(m); puffs.push({ m, v: new THREE.Vector3((Math.random() - .5) * 1.5, Math.random() * 1.2, (Math.random() - .5) * 1.5), life: 1 }); } }

/* ---------------- 색종이·글자 (2D 겹 캔버스) ---------------- */
const fx = $('fx'), fg = fx.getContext('2d'); let conf = [];
function confetti() { const c = ['#e84a5f', '#ffc83d', '#4f8df0', '#5cc96e', '#ff8ad8', '#a66bff']; for (let i = 0; i < 160; i++) conf.push({ x: Math.random() * innerWidth, y: -20 - Math.random() * innerHeight * .5, vx: (Math.random() - .5) * 3, vy: 2 + Math.random() * 3, r: Math.random() * 6, vr: (Math.random() - .5) * .3, c: c[i % 6], s: 10 + Math.random() * 8 }); }
function drawFx() { fg.setTransform(1, 0, 0, 1, 0, 0); fg.clearRect(0, 0, fx.width, fx.height); if (!conf.length) return; const d = fx.width / innerWidth; fg.scale(d, d);
  for (const p of conf) { p.x += p.vx; p.y += p.vy; p.r += p.vr; p.vy += .03; fg.save(); fg.translate(p.x, p.y); fg.rotate(p.r); fg.fillStyle = p.c; fg.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2); fg.restore(); }
  conf = conf.filter(p => p.y < innerHeight + 30); }
function popText(pos3, text, cls = '') { const sp = pos3.clone().project(camera); if (sp.z > 1) return; const d = document.createElement('div'); d.className = 'pop ' + cls; d.textContent = text;
  d.style.left = Math.max(40, Math.min(innerWidth - 40, (sp.x + 1) / 2 * innerWidth)) + 'px'; d.style.top = Math.max(90, (1 - sp.y) / 2 * innerHeight) + 'px'; document.body.appendChild(d); setTimeout(() => d.remove(), 1000); }

/* ---------------- 진행 ---------------- */
let level = 0, mode = 'stage', playing = false, ended = false, fallenN = 0, menuSpin = true;
const leftN = () => blocks.length - fallenN;
function updHud() {
  $('stageLbl').textContent = mode === 'free' ? '무한 블록' : `${level + 1}단계 · ${LEVELS[level].n}`;
  $('shotTxt').textContent = `${shots}발`;
  $('leftTxt').textContent = `남은 블록 ${leftN()}개`;
  $('barIn').style.width = (blocks.length ? fallenN / blocks.length * 100 : 0) + '%';
}
function setup(build) { newWorld(); ci = Math.random() * 8 | 0; build(); fallenN = 0; shots = 0; ended = false; camAng = 0; camTarget = 0; updHud(); }
function show(id) { ['ovMenu', 'ovLevels', 'ovResult'].forEach(o => $(o).hidden = o !== id); $('hud').hidden = !!id && id !== 'ovResult'; }
function startLevel(i) { mode = 'stage'; level = i; setup(LEVELS[i].b); playing = true; menuSpin = false; show(null); $('bRetry').hidden = false; hint(true); }
function startFree() { mode = 'free'; setup(randomBuild); playing = true; menuSpin = false; show(null); $('bRetry').hidden = false; hint(true); }
// 별: 블록 수에 비해 적게 쏠수록 (5개 탑이면 4발 이하 ★3, 7발 이하 ★2)
const starsFor = () => { const n = blocks.length; return shots <= Math.ceil(n * .6) + 1 ? 3 : shots <= n + 2 ? 2 : 1; };
function finish() {
  ended = true; S.win(); confetti();
  if (mode === 'free') { setTimeout(() => { if (mode === 'free' && playing) setup(randomBuild); }, 2200); return; }
  const st = starsFor(); if (st > (store.stars[level] || 0)) { store.stars[level] = st; save(); }
  setTimeout(() => {
    $('resTitle').textContent = st === 3 ? '완벽해요!' : st === 2 ? '와르르 성공!' : '모두 떨어뜨렸어요!';
    $('resStars').innerHTML = [0, 1, 2].map(i => i < st ? '<b>★</b>' : '★').join('');
    $('resSub').textContent = `구슬 ${shots}발로 블록 ${blocks.length}개를 모두 떨어뜨렸어요`;
    $('bNext').hidden = level >= LEVELS.length - 1;
    show('ovResult'); $('hud').hidden = false;
  }, 1100);
}
function levelGrid() { $('lvGrid').innerHTML = LEVELS.map((L, i) => { const s = store.stars[i] || 0, open = i === 0 || (store.stars[i - 1] || 0) > 0;
  return `<button class="lv" data-i="${i}" ${open ? '' : 'disabled'} aria-label="${i + 1}단계 ${L.n}">${i + 1}<small>${'★'.repeat(s)}${'☆'.repeat(3 - s)}</small></button>`; }).join(''); }
let hintT = 0; function hint(on) { clearTimeout(hintT); $('hint').classList.toggle('off', !on); if (on) hintT = setTimeout(() => $('hint').classList.add('off'), 6000); }
function sndIcon() { $('snd1').style.display = $('snd2').style.display = store.sound ? '' : 'none'; }

/* ---------------- 입력: 톡 = 발사, 옆으로 밀기 = 돌아보기 ---------------- */
let ptr = null;
canvas.addEventListener('pointerdown', e => { S.init(); if (ptr) return; ptr = { id: e.pointerId, x: e.clientX, y: e.clientY, lx: e.clientX, drag: false }; try { canvas.setPointerCapture(e.pointerId); } catch (_) {} });
canvas.addEventListener('pointermove', e => { if (!ptr || e.pointerId !== ptr.id) return; if (!ptr.drag && Math.abs(e.clientX - ptr.x) > 18) ptr.drag = true;
  if (ptr.drag && playing) { camTarget -= (e.clientX - ptr.lx) * .009; } ptr.lx = e.clientX; });
const up = e => { if (!ptr || e.pointerId !== ptr.id) return; const p = ptr; ptr = null; if (!p.drag && playing && e.type === 'pointerup') { const t = pickTarget(p.x, p.y); if (t) fireAt(t); } };
canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
document.addEventListener('gesturestart', e => e.preventDefault());
document.addEventListener('contextmenu', e => e.preventDefault());

$('bPlay').onclick = () => { S.init(); levelGrid(); show('ovLevels'); };
$('bFree').onclick = () => { S.init(); startFree(); };
$('bFull').onclick = () => { const d = document.documentElement; try { const r = (d.requestFullscreen || d.webkitRequestFullscreen).call(d); if (r && r.catch) r.catch(() => {}); } catch (_) {} };
$('bBack').onclick = () => show('ovMenu');
$('lvGrid').onclick = e => { const b = e.target.closest('.lv'); if (b && !b.disabled) startLevel(+b.dataset.i); };
$('bHome').onclick = () => { playing = false; menuSpin = true; show('ovMenu'); };
$('bRetry').onclick = () => mode === 'free' ? startFree() : startLevel(level);
$('bSound').onclick = () => { store.sound = !store.sound; save(); sndIcon(); };
$('bAgain').onclick = () => startLevel(level);
$('bNext').onclick = () => startLevel(level + 1);
$('bList').onclick = () => { levelGrid(); show('ovLevels'); };

function resize() {
  const w = innerWidth, h = innerHeight, a = w / h; renderer.setSize(w, h, false);
  camera.aspect = a; camR = a >= 1.2 ? 13 : 13 * Math.min(1.9, 1.25 / a); camera.updateProjectionMatrix();
  fx.width = w * Math.min(2, devicePixelRatio || 1); fx.height = h * Math.min(2, devicePixelRatio || 1);
}
addEventListener('resize', resize);

/* ---------------- 반복 ---------------- */
let last = performance.now();
function frame(now) {
  const dt = Math.min(.05, (now - last) / 1000); last = now;
  if (menuSpin) camTarget += dt * .12;
  camAng += (camTarget - camAng) * Math.min(1, dt * 10);
  if (playing || menuSpin) world.step(1 / 120, dt, 8);
  for (const b of blocks) {
    sync(b);
    if (!b.fallen && b.body.position.y < -1.3) { b.fallen = true; fallenN++; if (playing && !ended) { S.ding(fallenN); if (fallenN % 5 === 0 || leftN() === 0) popText(b.mesh.position, leftN() === 0 ? '와르르!' : `${fallenN}개!`); } updHud(); wakeAll(); }
    if (b.body.position.y < GROUND_Y - 5 && b.mesh.visible) { b.mesh.visible = false; world.removeBody(b.body); }
  }
  for (const b of balls.slice()) { sync(b); if (!b.body.hit && !b.missed && (b.body.position.y < -1.5 || b.body.position.x * Math.sin(camAng) + b.body.position.z * Math.cos(camAng) < -TABLE_R - .5)) { b.missed = true; if (playing && !ended) S.miss(); } if (now - b.born > 7000 || b.body.position.y < GROUND_Y - 3) removeBall(b); }
  if (playing && !ended && blocks.length && leftN() === 0) finish();
  for (const p of puffs) { p.life -= dt * 1.4; p.m.position.addScaledVector(p.v, dt); p.m.scale.setScalar(.7 + (1 - p.life) * 1.4); p.m.material.opacity = Math.max(0, p.life * .6); }
  for (let i = puffs.length - 1; i >= 0; i--) if (puffs[i].life <= 0) { scene.remove(puffs[i].m); puffs[i].m.material.dispose(); puffs.splice(i, 1); }
  recoil *= .86; shake *= .85; if (shake < .005) shake = 0; flash.intensity *= .8;
  placeCamera();
  if (!ptr) { /* 쉬는 동안 대포는 탑 가운데를 봄 */ }
  barrel.position.z = recoil * .5;
  renderer.render(scene, camera); drawFx();
  requestAnimationFrame(frame);
}
resize(); sndIcon();
setup(LEVELS[0].b); placeCamera(); aimBarrel(LOOK.clone());
requestAnimationFrame(frame);
window.__RS = { sfx: S.log, snd: S, startLevel, startFree, get state() { return { left: leftN(), total: blocks.length, shots, ended, playing, awake: blocks.filter(b => b.body.sleepState === 0).length }; },
  tapAt(x, y) { const t = pickTarget(x, y); if (t) fireAt(t); return !!t; },
  screenOfBlocks() { return blocks.filter(b => !b.fallen).map(b => { const s = b.mesh.position.clone().project(camera); return [(s.x + 1) / 2 * innerWidth, (1 - s.y) / 2 * innerHeight]; }); } };
