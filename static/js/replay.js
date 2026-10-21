// In-browser replay of MuJoCo recordings exported by cube_mujoco/scripts/web_export/export_replay.py.
//
// The body tree is rebuilt once from scene.json. Each frame of a recording
// holds the model's qpos (gripper joints + the cube's free joint) and a sparse
// list of cubie poses that changed, so playback only sets joint transforms and
// a few cubie poses per frame.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const BASE = 'static/sim/';
const STEPS_PER_SECOND = 60;
const SPEEDS = [0.5, 1, 2, 4, 8];
const PRESETS = [
  { name: 'solve1', label: 'Scan and solve #1' },
  { name: 'solve2', label: '#2' },
  { name: 'solve3', label: '#3' },
  { name: 'warmup', label: "R U R' U'" },
];
const OP_LABEL = { CLAMP: 'CLAMP', RELEASE: 'RELEASE', DUAL_HOLD: 'DUAL_HOLD', ROTATE: 'ROTATE' };

const $ = (id) => document.getElementById(id);
const stage = $('stage');
const quat = (q) => new THREE.Quaternion(q[1], q[2], q[3], q[0]); // MuJoCo is w,x,y,z

// ---------------------------------------------------------------- scene ----

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
stage.prepend(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(32, 4 / 3, 0.01, 10);
camera.up.set(0, 0, 1);
camera.position.set(0.0, -0.44, 0.33);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0, 0.105);
controls.enableDamping = true;
controls.minDistance = 0.15;
controls.maxDistance = 0.9;
controls.enablePan = false;
// Plain wheel scrolls the page; ctrl/cmd + wheel (or a trackpad pinch) zooms.
controls.enableZoom = false;
stage.addEventListener('wheel', (e) => (controls.enableZoom = e.ctrlKey || e.metaKey), { capture: true });
controls.update();

scene.add(new THREE.HemisphereLight(0xffffff, 0xd8d4c6, 1.6));
const sun = new THREE.DirectionalLight(0xffffff, 1.8);
sun.position.set(-0.25, -0.35, 0.8);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -0.25, right: 0.25, top: 0.25, bottom: -0.25, near: 0.1, far: 2 });
sun.shadow.bias = -0.0004;
scene.add(sun);
const ground = new THREE.Mesh(new THREE.CircleGeometry(0.6, 64), new THREE.ShadowMaterial({ opacity: 0.16 }));
ground.receiveShadow = true;
scene.add(ground);

function resize() {
  const { clientWidth: w, clientHeight: h } = stage;
  if (!w || !h) return;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(stage);

let bodies = []; // per body: { group, joints: [{ type, axis, pos, qposadr, node }] }

function buildScene(spec, meshBuffer) {
  const geometries = spec.meshes.map((m) => {
    const verts = new Float32Array(meshBuffer, m.vertOffset, m.vertCount * 3);
    const faces = new Uint32Array(meshBuffer, m.faceOffset, m.faceCount * 3);
    let g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(verts, 3));
    g.setIndex(new THREE.BufferAttribute(faces, 1));
    g = g.toNonIndexed(); // flat normals keep the printed parts' hard edges
    g.computeVertexNormals();
    return g;
  });
  const materials = new Map();
  const material = (rgba, kind) => {
    const key = rgba.join(',') + kind;
    if (!materials.has(key)) {
      const color = new THREE.Color().setRGB(rgba[0], rgba[1], rgba[2], THREE.SRGBColorSpace);
      materials.set(key, new THREE.MeshStandardMaterial({
        color,
        roughness: kind === 'box' ? 0.45 : 0.7,
        metalness: kind === 'shaft' ? 0.4 : 0.0,
      }));
    }
    return materials.get(key);
  };

  bodies = spec.bodies.map((b, i) => {
    const group = new THREE.Group();
    group.name = b.name;
    if (i > 0) {
      group.position.fromArray(b.pos);
      group.quaternion.copy(quat(b.quat));
    }
    let tail = group;
    const joints = b.joints.map((j) => {
      const node = new THREE.Group();
      tail.add(node);
      tail = node;
      return { ...j, axisV: new THREE.Vector3().fromArray(j.axis), posV: new THREE.Vector3().fromArray(j.pos), node };
    });
    return { group, joints, content: tail, free: joints.length === 1 && joints[0].type === 'free' };
  });
  spec.bodies.forEach((b, i) => {
    if (i === 0) scene.add(bodies[0].group);
    else bodies[b.parent].content.add(bodies[i].group);
  });
  const boxCache = new Map();
  for (const g of spec.geoms) {
    let mesh;
    if (g.type === 'mesh') {
      mesh = new THREE.Mesh(geometries[g.mesh], material(g.rgba, g.name.includes('shaft') ? 'shaft' : 'mesh'));
    } else {
      const key = g.size.join(',');
      if (!boxCache.has(key)) boxCache.set(key, new THREE.BoxGeometry(g.size[0] * 2, g.size[1] * 2, g.size[2] * 2));
      mesh = new THREE.Mesh(boxCache.get(key), material(g.rgba, 'box'));
    }
    mesh.position.fromArray(g.pos);
    mesh.quaternion.copy(quat(g.quat));
    mesh.castShadow = true;
    bodies[g.body].content.add(mesh);
  }
}

const tmpQ = new THREE.Quaternion();
const tmpV = new THREE.Vector3();

function applyQpos(qpos, offset) {
  for (const body of bodies) {
    if (body.free) {
      const a = offset + body.joints[0].qposadr;
      body.group.position.set(qpos[a], qpos[a + 1], qpos[a + 2]);
      body.group.quaternion.set(qpos[a + 4], qpos[a + 5], qpos[a + 6], qpos[a + 3]);
      continue;
    }
    for (const j of body.joints) {
      const q = qpos[offset + j.qposadr];
      if (j.type === 'hinge') {
        // Rotation about an axis through the joint anchor: x -> R x + (p - R p).
        tmpQ.setFromAxisAngle(j.axisV, q);
        j.node.quaternion.copy(tmpQ);
        tmpV.copy(j.posV).applyQuaternion(tmpQ);
        j.node.position.copy(j.posV).sub(tmpV);
      } else if (j.type === 'slide') {
        j.node.position.copy(j.axisV).multiplyScalar(q);
      }
    }
  }
}

// --------------------------------------------------------------- replay ----

const state = { rec: null, frame: 0, playing: true, speed: 2, cursor: 0, loaded: new Map() };

async function loadRecording(name) {
  if (state.loaded.has(name)) return state.loaded.get(name);
  const [meta, buf] = await Promise.all([
    fetch(`${BASE}replays/${name}.json`).then((r) => r.json()),
    fetch(`${BASE}replays/${name}.bin`).then((r) => r.arrayBuffer()),
  ]);
  const all = new Float32Array(buf);
  const rec = { ...meta, qpos: all.subarray(0, meta.frames * meta.nq), upd: all.subarray(meta.frames * meta.nq) };
  state.loaded.set(name, rec);
  return rec;
}

function setCubiePose(rec, index, src, off) {
  const g = bodies[rec.cubieBodies[index]].group;
  g.position.set(src[off], src[off + 1], src[off + 2]);
  g.quaternion.set(src[off + 4], src[off + 5], src[off + 6], src[off + 3]);
}

function resetCubies(rec) {
  rec.cubieInit.forEach((p, i) => setCubiePose(rec, i, p, 0));
  state.cursor = 0;
}

function showFrame(f) {
  const rec = state.rec;
  if (f < state.lastShown) resetCubies(rec);
  // Apply every cubie update up to and including frame f.
  const u = rec.upd;
  while (state.cursor < rec.updates && u[state.cursor * 9] <= f) {
    const o = state.cursor * 9;
    setCubiePose(rec, u[o + 1], u, o + 2);
    state.cursor++;
  }
  applyQpos(rec.qpos, f * rec.nq);
  state.lastShown = f;
  updatePanel(f);
}

// ----------------------------------------------------------------- panel ----

const logEl = $('log');
let logItems = [];
let lastPacket = -2;
let lastMove = -2;

function buildPanel(rec) {
  logEl.innerHTML = '';
  logItems = rec.packets.map((p) => {
    const li = document.createElement('li');
    const arg = p.op === 'ROTATE' ? `${p.side} ${fmtAngle(p.angle_rad)}` : p.side || 'both';
    li.innerHTML = `<span>#${0}</span><span class="op op-${p.op}">${OP_LABEL[p.op] || p.op}</span><span>${arg}</span>`;
    logEl.appendChild(li);
    return li;
  });
  logItems.forEach((li, i) => (li.firstChild.textContent = `#${i + 1}`));
  $('moves').innerHTML = rec.moves.map((m) => `<span class="mv">${m.move}</span>`).join('');
  const scanPhase = rec.phases.find((p) => p.label === 'scan');
  const band = $('scan-band');
  if (scanPhase) {
    band.style.left = `${(100 * scanPhase.start) / rec.frames}%`;
    band.style.width = `${(100 * (scanPhase.end - scanPhase.start)) / rec.frames}%`;
  } else band.style.width = '0';
  lastPacket = -2;
  lastMove = -2;
}

function fmtAngle(rad) {
  const deg = Math.round((rad * 180) / Math.PI);
  return `${deg > 0 ? '+' : ''}${deg}°`;
}

function lastIndexAtOrBefore(list, f, key) {
  let lo = 0, hi = list.length - 1, ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (list[mid][key] <= f) { ans = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return ans;
}

function updatePanel(f) {
  const rec = state.rec;
  const pk = lastIndexAtOrBefore(rec.packets, f, 'frame');
  if (pk !== lastPacket) {
    logItems.forEach((li, i) => {
      li.classList.toggle('past', i < pk);
      li.classList.toggle('now', i === pk);
    });
    if (pk >= 0) {
      const li = logItems[pk];
      logEl.scrollTop = li.offsetTop - logEl.clientHeight / 2 + li.offsetHeight / 2;
    } else logEl.scrollTop = 0;
    $('pk-count').textContent = `${pk + 1} / ${rec.packets.length}`;
    lastPacket = pk;
  }
  const mv = lastIndexAtOrBefore(rec.moves, f, 'start');
  const inMove = mv >= 0 && f < rec.moves[mv].end;
  const moveKey = inMove ? mv : mv + 0.5;
  if (moveKey !== lastMove) {
    [...$('moves').children].forEach((c, i) => {
      c.classList.toggle('done', i < mv || (i === mv && !inMove));
      c.classList.toggle('now', i === mv && inMove);
    });
    lastMove = moveKey;
  }
  const scanPhase = rec.phases.find((p) => p.label === 'scan');
  let phase, counter;
  if (scanPhase && f < (rec.captures[0] ?? 0)) {
    phase = 'Scrambled cube';
    counter = 'About to scan';
  } else if (scanPhase && f < scanPhase.end) {
    const pose = Math.max(0, lastIndexAtOrBefore(rec.captures.map((c) => ({ c })), f, 'c'));
    const capturing = rec.captures.some((c) => f >= c && f < c + 30);
    phase = capturing ? `Scan: camera captures pose ${pose + 1} of 5` : `Scan: rolling to pose ${Math.min(pose + 2, 5)} of 5`;
    counter = 'Reading all six faces';
  } else if (f < (rec.moves[0]?.start ?? 0)) {
    phase = rec.scramble ? 'Scrambled cube' : 'Solved cube';
    counter = `${rec.moves.length} moves to execute`;
  } else if (inMove) {
    phase = `Move ${mv + 1} of ${rec.moves.length}: ${rec.moves[mv].move}`;
    counter = rec.scramble ? 'Executing the Kociemba solution' : 'Warm-up sequence';
  } else {
    phase = rec.solvedAtEnd ? 'Solved' : 'Sequence complete';
    counter = `${rec.moves.length} moves, ${rec.packets.length} packets`;
  }
  $('phase').textContent = phase;
  $('counter').textContent = counter;
  const pct = (100 * f) / Math.max(1, rec.frames - 1);
  $('fill').style.width = `${pct}%`;
  $('knob').style.left = `${pct}%`;
  $('seek').value = Math.round(pct * 10);
  $('time').textContent = `${fmtTime(f / STEPS_PER_SECOND)} / ${fmtTime(rec.frames / STEPS_PER_SECOND)}`;
}

function fmtTime(s) {
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
}

// -------------------------------------------------------------- controls ----

function segButtons(container, items, current, onPick) {
  container.innerHTML = '';
  items.forEach((item) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = item.label;
    b.setAttribute('aria-pressed', String(item.value === current));
    b.addEventListener('click', () => {
      [...container.children].forEach((c) => c.setAttribute('aria-pressed', 'false'));
      b.setAttribute('aria-pressed', 'true');
      onPick(item.value);
    });
    container.appendChild(b);
  });
}

const PLAY_ICON = '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M4 2.5v11l9-5.5z"/></svg>';
const PAUSE_ICON = '<svg viewBox="0 0 16 16" fill="currentColor"><rect x="3" y="2.5" width="3.5" height="11" rx="1"/><rect x="9.5" y="2.5" width="3.5" height="11" rx="1"/></svg>';

function setPlaying(on) {
  state.playing = on;
  $('play').innerHTML = on ? PAUSE_ICON : PLAY_ICON;
  $('play').setAttribute('aria-label', on ? 'Pause' : 'Play');
}

async function choose(name) {
  const rec = await loadRecording(name);
  state.rec = rec;
  state.frame = 0;
  state.lastShown = Infinity;
  buildPanel(rec);
  resetCubies(rec);
  showFrame(0);
}

$('play').addEventListener('click', () => {
  if (!state.rec) return;
  if (!state.playing && state.frame >= state.rec.frames - 1) state.frame = 0;
  setPlaying(!state.playing);
});
$('seek').addEventListener('input', (e) => {
  if (!state.rec) return;
  state.frame = Math.round((e.target.value / 1000) * (state.rec.frames - 1));
  showFrame(state.frame);
});

let visible = true;
new IntersectionObserver(([entry]) => (visible = entry.isIntersecting)).observe(stage);
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

let last = performance.now();
function tick(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (state.rec && visible) {
    if (state.playing) {
      state.frame += dt * STEPS_PER_SECOND * state.speed;
      if (state.frame >= state.rec.frames - 1) {
        state.frame = 0; // loop
      }
      const f = Math.floor(state.frame);
      if (f !== state.lastShown) showFrame(f);
    }
    controls.update();
    renderer.render(scene, camera);
  }
  requestAnimationFrame(tick);
}

async function init() {
  try {
    const [spec, meshBuffer] = await Promise.all([
      fetch(`${BASE}scene.json`).then((r) => r.json()),
      fetch(`${BASE}meshes.bin`).then((r) => r.arrayBuffer()),
    ]);
    buildScene(spec, meshBuffer);
    segButtons($('presets'), PRESETS.map((p) => ({ label: p.label, value: p.name })), PRESETS[0].name, choose);
    segButtons($('speeds'), SPEEDS.map((s) => ({ label: `${s}×`, value: s })), state.speed, (s) => (state.speed = s));
    await choose(PRESETS[0].name);
    setPlaying(!reduceMotion);
    $('loading').remove();
    resize();
    requestAnimationFrame(tick);
  } catch (err) {
    $('loading').textContent = 'The 3D replay needs WebGL; the rendered videos below show the same runs.';
    console.error(err);
  }
}
init();
