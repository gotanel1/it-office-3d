import * as THREE from 'three';
import { eventsUrl } from '/chrome.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

// The IT department: ten desks in two rows, in rough pipeline order (back row left to right, then front).
// Ids match the server's roles (src/rules.js). Each person has their own chibi look.
const COLUMNS = [-7.2, -3.6, 0, 3.6, 7.2];
const FRONT_ROW = 4.6;
const ROLES = [
  { id: 'BA', label: 'BA', title: 'Business Analyst', color: 0xe0559a, skin: 0xf6d3b3, hair: 0x3b2417, hairStyle: 'bun', outfit: 'collar' },
  { id: 'SA', label: 'SA', title: 'System Analyst', color: 0x4a7dff, skin: 0xf1c9a5, hair: 0x2b1d14, hairStyle: 'short', accessory: 'glasses' },
  { id: 'Architect', label: 'Architect', title: 'Solution Architect', color: 0xf2b134, skin: 0xc68c63, hair: 0x1b1b1b, hairStyle: 'short', accessory: 'hardhat' },
  { id: 'UX', label: 'UX/UI', title: 'UX/UI Designer', color: 0xa66ee8, skin: 0xf6d3b3, hair: 0xf29bc2, hairStyle: 'bob', accessory: 'beret' },
  { id: 'Dev', label: 'Dev', title: 'Developer', color: 0x20a7a0, skin: 0xd9a77f, hair: 0x15151a, hairStyle: 'spiky', accessory: 'headphones', outfit: 'hoodie' },
  { id: 'DBA', label: 'DBA', title: 'Database Admin', color: 0x2f9e5b, skin: 0xe8b894, hair: 0x6b4423, hairStyle: 'curly', accessory: 'beanie' },
  { id: 'QA', label: 'QA', title: 'QA Tester', color: 0xef8a2e, skin: 0xf1c9a5, hair: 0x7a4b1f, hairStyle: 'ponytail', accessory: 'cap' },
  { id: 'DevOps', label: 'DevOps', title: 'DevOps Engineer', color: 0x5b6f99, skin: 0xb07a52, hair: 0x2a1a12, hairStyle: 'short', accessory: 'headset' },
  { id: 'Security', label: 'Security', title: 'Security Engineer', color: 0xd9473b, skin: 0xe8b894, hair: 0x101014, hairStyle: 'short', accessory: 'shades', outfit: 'suit' },
  { id: 'Writer', label: 'Writer', title: 'Tech Writer', color: 0x2fb3c9, skin: 0xf6d3b3, hair: 0x8a5a2b, hairStyle: 'long', accessory: 'pencil' },
].map((role, i) => ({ ...role, css: `#${role.color.toString(16).padStart(6, '0')}`, x: COLUMNS[i % 5], rowZ: i < 5 ? 0 : FRONT_ROW }));
const WRITER = 'Writer';

const DONE_GREEN = 0x3fbf74;
// Desk and seat positions inside a station; the front row is the same station moved FRONT_ROW forward.
const DESK_Z = -2.9;
const PERSON_Z = -3.7;
// Chibi proportions: short legs, so the hips sit low.
const STAND_HIP = 0.5;
const SEAT_HIP = 0.7;
const HEAD_TOP = 2.0;

// Room extents. The front wall is left out so the camera can see inside.
const ROOM_W = 19;
const ROOM_Z_BACK = -6;
const ROOM_Z_FRONT = 5;
const ROOM_H = 5.2;
const ROOM_CENTER_Z = (ROOM_Z_BACK + ROOM_Z_FRONT) / 2;

// The PM (team lead): where they wait by the task board, and how fast they walk. The corridor runs
// between the two rows of desks.
const HOME = new THREE.Vector3(-8.6, 0, -0.9);
const HOME_YAW = 1.2;
const WALK_SPEED = 2.6;
const CORRIDOR_Z = -0.9;
const TALK_SECONDS = 2.8;
const MAX_QUEUE = 3;

const container = document.getElementById('scene');
const tagLayer = document.getElementById('tags');

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
container.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const FOV = 40;
const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 120);
const target = new THREE.Vector3(0, 1.7, 0.1);

// Soft reflections from a generic room environment make materials feel less flat.
{
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.45;
}

// ---------- helpers ----------

const material = (color, opts = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.75, metalness: 0.05, ...opts });

function addMesh(parent, geometry, mat, [x, y, z] = [0, 0, 0], { cast = true, receive = true } = {}) {
  const mesh = new THREE.Mesh(geometry, mat);
  mesh.position.set(x, y, z);
  mesh.castShadow = cast;
  mesh.receiveShadow = receive;
  parent.add(mesh);
  return mesh;
}

const box = (parent, size, color, pos, opts) =>
  addMesh(parent, new THREE.BoxGeometry(...size), material(color), pos, opts);

// Box with softened edges, used for furniture.
const rbox = (parent, size, color, pos, radius = 0.04, opts) =>
  addMesh(
    parent,
    new RoundedBoxGeometry(size[0], size[1], size[2], 3, Math.min(radius, Math.min(...size) / 2 - 0.001)),
    material(color),
    pos,
    opts,
  );

const cylinder = (parent, rTop, rBottom, h, color, pos, segments = 20) =>
  addMesh(parent, new THREE.CylinderGeometry(rTop, rBottom, h, segments), material(color), pos);

const sphere = (parent, r, color, pos, opts) =>
  addMesh(parent, new THREE.SphereGeometry(r, 20, 14), material(color, opts), pos);

// Deterministic pseudo random so the decoration looks the same on every load.
const seeded = (n) => {
  const v = Math.sin(n * 127.1) * 43758.5453;
  return v - Math.floor(v);
};

function makeCanvas(w, h) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  return canvas;
}

function canvasTexture(canvas) {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return texture;
}

const FONT = 'system-ui, "Segoe UI", "Noto Sans Thai", sans-serif';

// Speech and screen text in English or Thai: ?lang= (VS Code passes its setting), else the browser's language.
const LANG = (new URLSearchParams(location.search).get('lang') || navigator.language || 'en').toLowerCase().startsWith('th') ? 'th' : 'en';
const TEXT = {
  en: {
    phrases: {
      'Reading prompt': 'New request in. Gather the requirements first, please.',
      AskUserQuestion: 'Please check with the client what they need.',
      Read: 'Please read this file.',
      Grep: 'Please search the code for this.',
      Glob: 'Please list these files.',
      WebSearch: 'Please look this up on the web.',
      WebFetch: 'Please pull the details from this page.',
      TodoWrite: 'Please break this into steps.',
      EnterPlanMode: 'Let us plan before we build.',
      ExitPlanMode: 'The plan is ready, show it to the client.',
      NotebookEdit: 'Please update this notebook.',
    },
    desks: {
      BA: 'Please talk to the client.',
      SA: 'Please analyse this part of the system.',
      Architect: 'Please design the structure.',
      UX: 'Please polish how this looks.',
      Dev: 'Please write the code for this.',
      DBA: 'Please check the database.',
      QA: 'Please test this, I need results fast.',
      DevOps: 'Please handle the repo and the machines.',
      Security: 'Please check that this is secure.',
      Writer: 'Please write this up.',
    },
    fallback: 'Please take care of this.',
    ask: (name, phrase) => `${name}, ${phrase[0].toLowerCase()}${phrase.slice(1)}`,
    praise: (name) => `${name}, great work, thank you!`,
    wrapUp: (name) => `${name}, send the summary to the client!`,
    finished: 'All done',
    waiting: 'Waiting for Claude Code',
  },
  th: {
    phrases: {
      'Reading prompt': 'งานใหม่เข้ามาแล้ว ช่วยเก็บ requirement ก่อนนะ',
      AskUserQuestion: 'ช่วยถามลูกค้าให้ชัดหน่อย',
      Read: 'ช่วยอ่านไฟล์นี้หน่อย',
      Grep: 'ช่วยค้นหาในโค้ดให้หน่อย',
      Glob: 'ช่วยหารายชื่อไฟล์ให้หน่อย',
      WebSearch: 'ช่วยค้นข้อมูลบนเว็บหน่อย',
      WebFetch: 'ช่วยดึงข้อมูลจากหน้าเว็บนี้หน่อย',
      TodoWrite: 'ช่วยแตกงานเป็นขั้นตอนหน่อย',
      EnterPlanMode: 'ช่วยวางแผนก่อนลงมือนะ',
      ExitPlanMode: 'แผนพร้อมแล้ว ส่งให้ลูกค้าดูเลย',
      NotebookEdit: 'ช่วยแก้ notebook ตัวนี้ที',
    },
    desks: {
      BA: 'ช่วยคุยกับลูกค้าหน่อย',
      SA: 'ช่วยวิเคราะห์ระบบตรงนี้หน่อย',
      Architect: 'ช่วยออกแบบโครงสร้างหน่อย',
      UX: 'ช่วยปรับหน้าตาตรงนี้ที',
      Dev: 'ช่วยเขียนโค้ดตรงนี้ที',
      DBA: 'ช่วยดูฐานข้อมูลหน่อย',
      QA: 'ช่วยทดสอบให้หน่อย ขอผลด่วน',
      DevOps: 'ช่วยจัดการ repo กับเครื่องหน่อย',
      Security: 'ช่วยเช็กความปลอดภัยหน่อย',
      Writer: 'ช่วยเขียนเอกสารนี้หน่อย',
    },
    fallback: 'ช่วยจัดการงานนี้หน่อย',
    ask: (name, phrase) => `${name} ${phrase}`,
    praise: (name) => `${name} เยี่ยมมาก ขอบคุณนะ`,
    wrapUp: (name) => `${name} สรุปคำตอบส่งให้ลูกค้าได้เลย!`,
    finished: 'งานเสร็จแล้ว',
    waiting: 'รอรับงานจาก Claude Code',
  },
}[LANG];

function truncate(text, max) {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function turnToward(current, goal, maxStep) {
  const diff = ((goal - current + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
  return current + THREE.MathUtils.clamp(diff, -maxStep, maxStep);
}

// ---------- lights ----------

scene.add(new THREE.HemisphereLight(0xfff4e0, 0x7b7466, 0.95));

const sun = new THREE.DirectionalLight(0xfff0d6, 2.2);
sun.position.set(-5, 14, 9);
sun.target.position.set(0, 0, -1);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -14;
sun.shadow.camera.right = 14;
sun.shadow.camera.top = 12;
sun.shadow.camera.bottom = -12;
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 40;
sun.shadow.bias = -0.0005;
sun.shadow.normalBias = 0.03;
scene.add(sun, sun.target);

// ---------- room ----------

function makeFloorTexture() {
  const canvas = makeCanvas(512, 512);
  const g = canvas.getContext('2d');
  const rows = 8;
  const plankH = canvas.height / rows;
  for (let row = 0; row < rows; row++) {
    const offset = seeded(row + 1) * 256;
    for (let k = -1; k < 3; k++) {
      const x = offset + k * 256;
      const light = 58 + seeded(row * 7 + k + 3) * 9;
      g.fillStyle = `hsl(32, 38%, ${light}%)`;
      g.fillRect(x, row * plankH, 256, plankH);
      g.fillStyle = 'rgba(60, 35, 15, 0.35)';
      g.fillRect(x, row * plankH, 2, plankH);
    }
    g.fillStyle = 'rgba(60, 35, 15, 0.35)';
    g.fillRect(0, row * plankH, 512, 2);
  }
  const texture = canvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(ROOM_W / 4, (ROOM_Z_FRONT - ROOM_Z_BACK) / 4);
  return texture;
}

const room = new THREE.Group();
scene.add(room);

// Dark base plate so the room reads as a diorama. Its top sits just below the floor.
box(room, [ROOM_W + 0.8, 0.5, ROOM_Z_FRONT - ROOM_Z_BACK + 0.8], 0x2a2c34, [0, -0.27, ROOM_CENTER_Z], { cast: false });

const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(ROOM_W, ROOM_Z_FRONT - ROOM_Z_BACK),
  new THREE.MeshStandardMaterial({ map: makeFloorTexture(), roughness: 0.6 }),
);
floor.rotation.x = -Math.PI / 2;
floor.position.set(0, 0, ROOM_CENTER_Z);
floor.receiveShadow = true;
room.add(floor);

const WALL_BACK = 0xece6da;
const WALL_SIDE = 0xe2dccd;
const SKIRTING = 0xb9ae98;
const wallDepth = ROOM_Z_FRONT - ROOM_Z_BACK + 0.3;
const wallCenterZ = ROOM_Z_BACK - 0.15 + wallDepth / 2;

box(room, [ROOM_W + 0.6, ROOM_H, 0.3], WALL_BACK, [0, ROOM_H / 2, ROOM_Z_BACK - 0.15], { cast: false });
box(room, [0.3, ROOM_H, wallDepth], WALL_SIDE, [-ROOM_W / 2 - 0.15, ROOM_H / 2, wallCenterZ], { cast: false });
box(room, [0.3, ROOM_H, wallDepth], WALL_SIDE, [ROOM_W / 2 + 0.15, ROOM_H / 2, wallCenterZ], { cast: false });

box(room, [ROOM_W, 0.18, 0.06], SKIRTING, [0, 0.09, ROOM_Z_BACK + 0.03], { cast: false });
box(room, [0.06, 0.18, ROOM_Z_FRONT - ROOM_Z_BACK], SKIRTING, [-ROOM_W / 2 + 0.03, 0.09, ROOM_CENTER_Z], { cast: false });
box(room, [0.06, 0.18, ROOM_Z_FRONT - ROOM_Z_BACK], SKIRTING, [ROOM_W / 2 - 0.03, 0.09, ROOM_CENTER_Z], { cast: false });
// Crown moulding along the back wall.
box(room, [ROOM_W, 0.12, 0.08], 0xffffff, [0, ROOM_H - 0.06, ROOM_Z_BACK + 0.04], { cast: false });

// Windows on the left wall.
for (const z of [-2.9, 2.2]) {
  const x = -ROOM_W / 2;
  box(room, [0.1, 2.2, 1.9], 0xffffff, [x + 0.05, 2.6, z], { cast: false });
  const pane = new THREE.Mesh(
    new THREE.PlaneGeometry(1.6, 1.9),
    new THREE.MeshBasicMaterial({ color: 0xc6e6ff, toneMapped: false }),
  );
  pane.rotation.y = Math.PI / 2;
  pane.position.set(x + 0.11, 2.6, z);
  room.add(pane);
  box(room, [0.04, 1.9, 0.07], 0xffffff, [x + 0.12, 2.6, z], { cast: false });
  box(room, [0.04, 0.07, 1.6], 0xffffff, [x + 0.12, 2.6, z], { cast: false });
  box(room, [0.2, 0.06, 2.1], 0xffffff, [x + 0.1, 1.5, z], { cast: false });
}

// Department sign on the left of the back wall; the middle holds the status screen.
{
  const canvas = makeCanvas(1024, 160);
  const g = canvas.getContext('2d');
  g.fillStyle = '#2b2e36';
  g.beginPath();
  g.roundRect(0, 0, 1024, 160, 28);
  g.fill();
  const stripe = g.createLinearGradient(0, 0, 1024, 0);
  ROLES.forEach((role, i) => stripe.addColorStop(i / (ROLES.length - 1), role.css));
  g.fillStyle = stripe;
  g.fillRect(40, 128, 944, 10);
  g.fillStyle = '#ffffff';
  g.font = `800 76px ${FONT}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('IT DEPARTMENT', 512, 66);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(4.0, 0.625), new THREE.MeshBasicMaterial({ map: canvasTexture(canvas), transparent: true, toneMapped: false }));
  sign.position.set(-6.1, 4.15, ROOM_Z_BACK + 0.02);
  room.add(sign);
}

// Wall clock on the right of the screen. Hands follow real time.
const clockGroup = new THREE.Group();
clockGroup.position.set(5.6, 4.0, ROOM_Z_BACK + 0.05);
room.add(clockGroup);
{
  const ring = addMesh(clockGroup, new THREE.CylinderGeometry(0.4, 0.4, 0.08, 32), material(0x2b2e36), [0, 0, 0], { cast: false });
  ring.rotation.x = Math.PI / 2;
  const face = addMesh(clockGroup, new THREE.CylinderGeometry(0.34, 0.34, 0.09, 32), material(0xf8f5ee), [0, 0, 0.005], { cast: false });
  face.rotation.x = Math.PI / 2;
}
const hourHand = new THREE.Group();
const minuteHand = new THREE.Group();
clockGroup.add(hourHand, minuteHand);
box(hourHand, [0.035, 0.2, 0.02], 0x20232b, [0, 0.1, 0.06], { cast: false });
box(minuteHand, [0.025, 0.3, 0.02], 0x20232b, [0, 0.15, 0.075], { cast: false });

function plant(x, z, scale = 1) {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  group.scale.setScalar(scale);
  room.add(group);
  cylinder(group, 0.38, 0.28, 0.6, 0xb5694a, [0, 0.3, 0]);
  const leaves = [0x3f8f4f, 0x4aa05a, 0x358045];
  const spots = [[0, 1.05, 0, 0.5], [0.3, 1.4, 0.1, 0.38], [-0.28, 1.35, -0.1, 0.4], [0.05, 1.7, 0.05, 0.3]];
  spots.forEach(([lx, ly, lz, r], i) => sphere(group, r, leaves[i % leaves.length], [lx, ly, lz]));
}
plant(-8.6, -5.2, 1.1);
plant(8.6, -5.2, 1.1);
plant(8.7, 4.4, 0.9);

// Runner rug along the corridor the PM walks.
rbox(room, [17.2, 0.02, 1.3], 0x4b5a78, [0, 0.011, CORRIDOR_Z], 0.008, { cast: false });
rbox(room, [16.8, 0.025, 1.0], 0xcdbf9f, [0, 0.013, CORRIDOR_Z], 0.008, { cast: false });

// Floor lamp in the front-left corner.
{
  const x = -8.6;
  const z = 4.3;
  cylinder(room, 0.2, 0.22, 0.04, 0x2b2e36, [x, 0.02, z], 20);
  cylinder(room, 0.025, 0.025, 1.6, 0x2b2e36, [x, 0.85, z], 8);
  const shade = addMesh(
    room,
    new THREE.CylinderGeometry(0.26, 0.34, 0.36, 24, 1, true),
    material(0xfff0cf, { emissive: 0xffd9a0, emissiveIntensity: 0.9, side: THREE.DoubleSide }),
    [x, 1.78, z],
    { cast: false },
  );
  shade.receiveShadow = false;
  const glow = new THREE.PointLight(0xffd9a0, 6, 6, 2);
  glow.position.set(x, 1.7, z);
  scene.add(glow);
}

// Water cooler and bin on the right wall.
{
  const x = 8.85;
  rbox(room, [0.55, 1.0, 0.55], 0xe8ecef, [x, 0.5, 3.0], 0.05);
  addMesh(room, new THREE.CylinderGeometry(0.2, 0.2, 0.5, 24), material(0x7fc4ff, { transparent: true, opacity: 0.7, roughness: 0.2 }), [x, 1.3, 3.0], { cast: false });
  box(room, [0.1, 0.06, 0.1], 0x2b2e36, [x - 0.28, 0.82, 3.0], { cast: false });
  cylinder(room, 0.2, 0.17, 0.5, 0x3a3d46, [x, 0.25, 3.9], 16);
}

// Framed art on the right wall.
function makePosterTexture(seed) {
  const canvas = makeCanvas(256, 192);
  const g = canvas.getContext('2d');
  g.fillStyle = '#f4efe2';
  g.fillRect(0, 0, 256, 192);
  for (let i = 0; i < 6; i++) {
    const hue = Math.floor(seeded(seed * 10 + i) * 360);
    g.fillStyle = `hsl(${hue}, 55%, 55%)`;
    g.beginPath();
    g.arc(30 + seeded(seed + i * 3) * 196, 30 + seeded(seed + i * 5) * 132, 18 + seeded(seed + i * 7) * 34, 0, Math.PI * 2);
    g.fill();
  }
  return canvasTexture(canvas);
}
for (const [z, seed] of [[-3.9, 3], [3.9, 8]]) {
  const x = ROOM_W / 2;
  box(room, [0.06, 1.2, 1.6], 0x2b2e36, [x - 0.03, 2.9, z], { cast: false });
  const art = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.0), new THREE.MeshBasicMaterial({ map: makePosterTexture(seed), toneMapped: false }));
  art.rotation.y = -Math.PI / 2;
  art.position.set(x - 0.07, 2.9, z);
  room.add(art);
}

// ---------- people ----------

const BLUSH = 0xff9aa2;
const SHOE = 0x2a2c33;

// Top of the head covered by hair, tilted back a little so the fringe sits on the forehead.
function hairCap(head, color, r = 0.425) {
  const cap = addMesh(head, new THREE.SphereGeometry(r, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.56), material(color), [0, 0.02, -0.02]);
  cap.rotation.x = -0.32;
  return cap;
}

function addHair(head, style, color) {
  if (style === 'bald') return;
  hairCap(head, color);
  if (style === 'bob') {
    for (const side of [-1, 1]) sphere(head, 0.2, color, [side * 0.33, -0.12, -0.05]).scale.set(0.7, 1.35, 1);
    sphere(head, 0.4, color, [0, -0.06, -0.1]).scale.set(1.02, 0.9, 0.95);
  } else if (style === 'long') {
    rbox(head, [0.78, 0.9, 0.22], color, [0, -0.32, -0.24], 0.1);
    for (const side of [-1, 1]) rbox(head, [0.16, 0.7, 0.22], color, [side * 0.36, -0.28, 0.02], 0.07);
  } else if (style === 'bun') {
    sphere(head, 0.4, color, [0, -0.02, -0.08]).scale.set(1.03, 0.95, 0.98);
    sphere(head, 0.16, color, [0, 0.4, -0.2]);
  } else if (style === 'ponytail') {
    sphere(head, 0.4, color, [0, -0.02, -0.08]).scale.set(1.03, 0.95, 0.98);
    sphere(head, 0.12, color, [0, 0.18, -0.44]);
    const tail = addMesh(head, new THREE.CapsuleGeometry(0.1, 0.36, 4, 10), material(color), [0, -0.08, -0.52]);
    tail.rotation.x = 0.35;
  } else if (style === 'spiky') {
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      const spike = addMesh(head, new THREE.ConeGeometry(0.11, 0.26, 8), material(color), [Math.cos(a) * 0.22, 0.38, Math.sin(a) * 0.2 - 0.05]);
      spike.rotation.set(Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5);
    }
  } else if (style === 'curly') {
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      sphere(head, 0.13, color, [Math.cos(a) * 0.36, 0.12 + Math.sin(i * 1.7) * 0.06, Math.sin(a) * 0.3 - 0.06]);
    }
  }
}

function addAccessory(head, accessory, color) {
  if (accessory === 'glasses') {
    for (const side of [-1, 1]) {
      addMesh(head, new THREE.TorusGeometry(0.095, 0.016, 8, 24), material(0x1a1a1a), [side * 0.15, -0.02, 0.385], { cast: false });
    }
    box(head, [0.1, 0.016, 0.016], 0x1a1a1a, [0, -0.01, 0.395], { cast: false });
  } else if (accessory === 'shades') {
    rbox(head, [0.62, 0.13, 0.05], 0x101014, [0, -0.01, 0.39], 0.04, { cast: false });
  } else if (accessory === 'headphones' || accessory === 'headset') {
    const band = addMesh(head, new THREE.TorusGeometry(0.45, 0.03, 8, 28, Math.PI), material(0x22242b), [0, 0.02, -0.02], { cast: false });
    band.rotation.y = 0;
    const cup = accessory === 'headphones' ? 0.13 : 0.09;
    for (const side of [-1, 1]) {
      const c = cylinder(head, cup, cup, 0.1, accessory === 'headphones' ? color : 0x22242b, [side * 0.44, -0.02, 0]);
      c.rotation.z = Math.PI / 2;
    }
    if (accessory === 'headset') {
      const mic = box(head, [0.02, 0.02, 0.3], 0x22242b, [0.4, -0.16, 0.16], { cast: false });
      mic.rotation.y = -0.35;
      sphere(head, 0.04, 0x22242b, [0.32, -0.18, 0.3]).castShadow = false;
    }
  } else if (accessory === 'hardhat') {
    addMesh(head, new THREE.SphereGeometry(0.45, 24, 14, 0, Math.PI * 2, 0, Math.PI / 2), material(0xffc928, { roughness: 0.4 }), [0, 0.1, -0.02]);
    cylinder(head, 0.52, 0.52, 0.04, 0xffc928, [0, 0.11, 0.03], 28);
    box(head, [0.06, 0.12, 0.6], 0xf0b400, [0, 0.5, -0.02], { cast: false });
  } else if (accessory === 'beret') {
    const beret = sphere(head, 0.36, 0xc0392b, [0.06, 0.36, -0.04]);
    beret.scale.set(1.1, 0.35, 1.1);
    beret.rotation.z = -0.25;
    sphere(head, 0.04, 0xc0392b, [0.1, 0.5, -0.04]);
  } else if (accessory === 'beanie') {
    addMesh(head, new THREE.SphereGeometry(0.44, 24, 14, 0, Math.PI * 2, 0, Math.PI / 2), material(color, { roughness: 0.95 }), [0, 0.08, -0.02]);
    const rim = addMesh(head, new THREE.TorusGeometry(0.42, 0.06, 10, 28), material(0xf4f1e8, { roughness: 0.95 }), [0, 0.1, -0.02]);
    rim.rotation.x = Math.PI / 2;
    sphere(head, 0.1, 0xf4f1e8, [0, 0.55, -0.02]);
  } else if (accessory === 'cap') {
    addMesh(head, new THREE.SphereGeometry(0.44, 24, 14, 0, Math.PI * 2, 0, Math.PI / 2), material(color), [0, 0.1, -0.02]);
    const brim = rbox(head, [0.5, 0.03, 0.3], color, [0, 0.12, 0.42], 0.015);
    brim.rotation.x = 0.12;
  } else if (accessory === 'pencil') {
    const pencil = cylinder(head, 0.025, 0.025, 0.34, 0xffc928, [0.4, 0.12, 0.05], 6);
    pencil.rotation.set(0.3, 0, 0.9);
    const tip = addMesh(head, new THREE.ConeGeometry(0.025, 0.07, 6), material(0x2b2e36), [0.27, 0.02, 0.1]);
    tip.rotation.set(0.3, 0, 0.9 + Math.PI);
  }
}

function addOutfit(pelvis, outfit, color) {
  if (outfit === 'collar') {
    for (const side of [-1, 1]) {
      const flap = box(pelvis, [0.14, 0.02, 0.1], 0xffffff, [side * 0.08, 0.5, 0.17], { cast: false });
      flap.rotation.set(0.6, 0, side * -0.4);
    }
  } else if (outfit === 'hoodie') {
    const hood = addMesh(pelvis, new THREE.TorusGeometry(0.17, 0.07, 10, 20), material(color), [0, 0.5, -0.12], { cast: false });
    hood.rotation.x = Math.PI / 2 - 0.3;
    for (const side of [-1, 1]) cylinder(pelvis, 0.012, 0.012, 0.14, 0xffffff, [side * 0.05, 0.4, 0.2], 6);
  } else if (outfit === 'suit' || outfit === 'tie') {
    if (outfit === 'suit') box(pelvis, [0.16, 0.28, 0.03], 0xf4f4f4, [0, 0.36, 0.2], { cast: false });
    box(pelvis, [0.06, 0.24, 0.03], outfit === 'suit' ? color : 0xb02a37, [0, 0.35, 0.215], { cast: false });
  }
}

// One chibi rig for every worker and the PM: big round head, small body, short arms and two-segment legs.
// The parts the animation code moves are the same as before: pelvis, torso, head, arms, hips and knees.
function createPerson({ shirt, pants = 0x2c3140, skin, hair, hairStyle = 'short', accessory = null, outfit = null }) {
  const root = new THREE.Group();
  const pelvis = new THREE.Group();
  pelvis.position.y = STAND_HIP;
  root.add(pelvis);

  const torso = addMesh(pelvis, new THREE.CapsuleGeometry(0.22, 0.16, 6, 16), material(outfit === 'suit' ? 0x23262f : shirt), [0, 0.28, 0]);
  torso.scale.set(1.08, 1, 0.95);
  addOutfit(pelvis, outfit, shirt);

  const legs = [-1, 1].map((side) => {
    const hip = new THREE.Group();
    hip.position.set(side * 0.11, 0.04, 0);
    pelvis.add(hip);
    addMesh(hip, new THREE.CapsuleGeometry(0.08, 0.08, 4, 10), material(pants), [0, -0.1, 0]);
    const knee = new THREE.Group();
    knee.position.y = -0.2;
    hip.add(knee);
    addMesh(knee, new THREE.CapsuleGeometry(0.07, 0.08, 4, 10), material(pants), [0, -0.1, 0]);
    rbox(knee, [0.15, 0.1, 0.24], SHOE, [0, -0.24, 0.04], 0.04);
    return { hip, knee };
  });

  const arms = [-1, 1].map((side) => {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.27, 0.42, 0);
    pelvis.add(pivot);
    addMesh(pivot, new THREE.CapsuleGeometry(0.068, 0.14, 4, 10), material(outfit === 'suit' ? 0x23262f : shirt), [0, -0.13, 0]);
    sphere(pivot, 0.075, skin, [0, -0.28, 0]);
    return pivot;
  });

  const head = new THREE.Group();
  head.position.set(0, 0.86, 0);
  pelvis.add(head);
  sphere(head, 0.4, skin, [0, 0, 0]).scale.set(1, 0.94, 0.96);
  for (const side of [-1, 1]) {
    sphere(head, 0.07, skin, [side * 0.39, -0.03, 0]).castShadow = false;
    const eye = sphere(head, 0.065, 0x1d1a24, [side * 0.15, -0.03, 0.34]);
    eye.scale.set(0.85, 1.2, 0.5);
    eye.castShadow = false;
    sphere(head, 0.02, 0xffffff, [side * 0.15 + 0.02, 0.02, 0.37], { emissive: 0xffffff, emissiveIntensity: 0.6 }).castShadow = false;
    const cheek = sphere(head, 0.055, BLUSH, [side * 0.25, -0.14, 0.3], { transparent: true, opacity: 0.55 });
    cheek.scale.set(1, 0.55, 0.35);
    cheek.castShadow = false;
  }
  const mouth = addMesh(head, new THREE.TorusGeometry(0.045, 0.012, 6, 14, Math.PI), material(0x8a3f36), [0, -0.15, 0.36], { cast: false });
  mouth.rotation.z = Math.PI;
  addHair(head, hairStyle, hair);
  addAccessory(head, accessory, shirt);

  return { root, pelvis, torso, head, armL: arms[0], armR: arms[1], legL: legs[0], legR: legs[1] };
}

function poseSeated(person) {
  person.pelvis.position.y = SEAT_HIP;
  for (const leg of [person.legL, person.legR]) {
    leg.hip.rotation.x = -Math.PI / 2;
    leg.knee.rotation.x = Math.PI / 2;
  }
}

function poseStanding(person) {
  person.pelvis.position.y = STAND_HIP;
  for (const leg of [person.legL, person.legR]) {
    leg.hip.rotation.x = 0;
    leg.knee.rotation.x = 0;
  }
}

// ---------- stations ----------

const checkTexture = (() => {
  const canvas = makeCanvas(128, 128);
  const g = canvas.getContext('2d');
  g.fillStyle = '#3fbf74';
  g.beginPath();
  g.arc(64, 64, 56, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = '#ffffff';
  g.lineWidth = 14;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.beginPath();
  g.moveTo(36, 66);
  g.lineTo(56, 86);
  g.lineTo(92, 44);
  g.stroke();
  return canvasTexture(canvas);
})();

function makeNameplateTexture(role) {
  const canvas = makeCanvas(256, 64);
  const g = canvas.getContext('2d');
  g.fillStyle = '#1c1e24';
  g.fillRect(0, 0, 256, 64);
  g.fillStyle = role.css;
  g.fillRect(0, 0, 10, 64);
  g.fillStyle = '#ffffff';
  g.font = `700 34px ${FONT}`;
  g.textBaseline = 'middle';
  g.textAlign = 'center';
  g.fillText(role.label.toUpperCase(), 138, 34);
  return canvasTexture(canvas);
}

function buildStation(role, index) {
  const station = new THREE.Group();
  station.position.set(role.x, 0, role.rowZ);
  scene.add(station);

  // Desk, laptop, mug, plant, lamp, nameplate and the task ticket the PM hands over.
  rbox(station, [2.5, 0.08, 1.1], 0xc2a27a, [0, 0.8, DESK_Z], 0.03);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      box(station, [0.08, 0.76, 0.08], 0x3a3d46, [sx * 1.15, 0.38, DESK_Z + sz * 0.48]);
    }
  }
  // The laptop sits to the side, turned toward the person, so it never hides their face from the camera.
  const laptop = new THREE.Group();
  laptop.position.set(-0.72, 0, DESK_Z + 0.05);
  laptop.rotation.y = -0.7;
  station.add(laptop);
  box(laptop, [0.8, 0.04, 0.55], 0x9aa0ab, [0, 0.86, 0]);
  const lid = new THREE.Group();
  lid.position.set(0, 0.88, 0.27);
  lid.rotation.x = -0.22;
  laptop.add(lid);
  box(lid, [0.8, 0.5, 0.03], 0x80858f, [0, 0.25, 0]);
  const logo = addMesh(
    lid,
    new THREE.SphereGeometry(0.07, 16, 12),
    material(0xcccccc, { emissive: 0x000000, emissiveIntensity: 1.4 }),
    [0, 0.26, 0.03],
    { cast: false },
  );
  logo.scale.z = 0.3;

  cylinder(station, 0.09, 0.08, 0.14, 0xffffff, [0.85, 0.91, DESK_Z + 0.15], 16);

  cylinder(station, 0.11, 0.11, 0.03, 0x2b2e36, [1.0, 0.85, DESK_Z - 0.3], 16);
  cylinder(station, 0.015, 0.015, 0.5, 0x2b2e36, [1.0, 1.1, DESK_Z - 0.3], 8);
  addMesh(station, new THREE.ConeGeometry(0.17, 0.2, 20), material(role.color), [1.0, 1.4, DESK_Z - 0.3]);
  const bulb = sphere(station, 0.05, 0xdddddd, [1.0, 1.28, DESK_Z - 0.3], { emissive: 0x000000, emissiveIntensity: 1.6 });
  bulb.castShadow = false;

  box(station, [0.7, 0.1, 0.05], 0x1c1e24, [0.62, 0.88, DESK_Z + 0.5], { cast: false });
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.66, 0.165), new THREE.MeshBasicMaterial({ map: makeNameplateTexture(role), toneMapped: false }));
  plate.position.set(0.62, 0.88, DESK_Z + 0.53);
  plate.rotation.x = -0.25;
  station.add(plate);

  const ticket = new THREE.Group();
  ticket.position.set(0.4, 0.855, DESK_Z + 0.05);
  ticket.rotation.y = 0.25;
  ticket.visible = false;
  station.add(ticket);
  box(ticket, [0.34, 0.012, 0.25], 0xffffff, [0, 0, 0], { cast: false });
  box(ticket, [0.34, 0.014, 0.05], role.color, [0, 0, -0.1], { cast: false });
  for (let i = 0; i < 3; i++) box(ticket, [0.24 - i * 0.04, 0.014, 0.012], 0x9aa0ab, [-0.04, 0, -0.03 + i * 0.045], { cast: false });

  // Chair.
  const chair = new THREE.Group();
  chair.position.set(0, 0, PERSON_Z - 0.05);
  station.add(chair);
  rbox(chair, [0.8, 0.1, 0.8], 0x30343f, [0, 0.62, 0], 0.04);
  rbox(chair, [0.8, 0.75, 0.1], 0x30343f, [0, 1.05, -0.4], 0.04);
  for (const sx of [-1, 1]) rbox(chair, [0.08, 0.06, 0.5], 0x1c1e24, [sx * 0.44, 0.85, 0.05], 0.02);
  cylinder(chair, 0.05, 0.05, 0.56, 0x1c1e24, [0, 0.33, 0], 10);
  cylinder(chair, 0.38, 0.38, 0.05, 0x1c1e24, [0, 0.06, 0], 5);

  // Person.
  const person = createPerson({
    shirt: role.color,
    skin: role.skin,
    hair: role.hair,
    hairStyle: role.hairStyle,
    accessory: role.accessory,
    outfit: role.outfit,
  });
  person.root.position.set(0, 0, PERSON_Z);
  poseSeated(person);
  station.add(person.root);

  // Check mark that floats over the head when the role is done.
  const check = new THREE.Sprite(new THREE.SpriteMaterial({ map: checkTexture, transparent: true, depthTest: false }));
  check.scale.setScalar(0.6);
  check.position.set(0, HEAD_TOP + 0.2, PERSON_Z);
  check.visible = false;
  station.add(check);

  // Coloured glow over the desk while the role works.
  const light = new THREE.PointLight(role.color, 0, 6, 2);
  light.position.set(0, 2.4, DESK_Z - 0.6);
  station.add(light);

  const tagEl = document.createElement('div');
  tagEl.className = 'tag';
  tagEl.style.borderColor = role.css;
  tagLayer.appendChild(tagEl);

  const obj = {
    role,
    index,
    person,
    logo,
    bulb,
    check,
    light,
    ticket,
    tagEl,
    handed: false,
    nodUntil: 0,
    phase: index * 1.7,
    state: 'waiting',
    finished: false,
    anchor: new THREE.Vector3(role.x, HEAD_TOP + 0.5, PERSON_Z + role.rowZ),
  };
  return obj;
}

const objects = ROLES.map(buildStation);

// ---------- task board on the left wall ----------

const BOARD_W = 832;
const BOARD_H = 512;
const boardCanvas = makeCanvas(BOARD_W, BOARD_H);
const boardTexture = canvasTexture(boardCanvas);
{
  const x = -ROOM_W / 2;
  box(room, [0.1, 1.85, 2.9], 0xd8d4c8, [x + 0.05, 2.65, -0.3], { cast: false });
  const board = new THREE.Mesh(new THREE.PlaneGeometry(2.7, 1.66), new THREE.MeshBasicMaterial({ map: boardTexture, toneMapped: false }));
  board.rotation.y = Math.PI / 2;
  board.position.set(x + 0.11, 2.65, -0.3);
  room.add(board);
}

function drawBoard() {
  const g = boardCanvas.getContext('2d');
  g.fillStyle = '#f7f5ee';
  g.fillRect(0, 0, BOARD_W, BOARD_H);
  g.fillStyle = '#2b2e36';
  g.fillRect(0, 0, BOARD_W, 84);
  g.fillStyle = '#ffffff';
  g.font = `700 42px ${FONT}`;
  g.textBaseline = 'middle';
  g.textAlign = 'left';
  g.fillText('TASK BOARD', 32, 44);

  // Two columns of five cards, in desk order.
  const cardW = (BOARD_W - 72) / 2;
  ROLES.forEach((role, i) => {
    const r = roleState(role.id);
    const x = 24 + Math.floor(i / 5) * (cardW + 24);
    const y = 100 + (i % 5) * 80;
    g.fillStyle = '#ffffff';
    g.fillRect(x, y, cardW, 70);
    g.strokeStyle = '#e0dccf';
    g.lineWidth = 2;
    g.strokeRect(x, y, cardW, 70);
    g.fillStyle = role.css;
    g.fillRect(x, y, 12, 70);
    g.fillStyle = '#1d1d1b';
    g.font = `700 26px ${FONT}`;
    g.fillText(role.label, x + 26, y + 24);
    g.font = `500 18px ${FONT}`;
    g.fillStyle = '#5c5c55';
    const detail = r.state === 'working' ? r.note ?? `${r.tool}${r.detail ? ` · ${r.detail}` : ''}` : r.state === 'done' || r.done ? 'Finished' : role.title;
    g.fillText(truncate(detail, 24), x + 26, y + 52);

    const chip = r.state === 'working' ? ['DOING', role.css] : r.state === 'done' || r.done ? ['DONE', '#3fbf74'] : ['TO DO', '#9aa0ab'];
    g.fillStyle = chip[1];
    g.beginPath();
    g.roundRect(x + cardW - 104, y + 8, 92, 28, 14);
    g.fill();
    g.fillStyle = '#ffffff';
    g.font = `700 16px ${FONT}`;
    g.textAlign = 'center';
    g.fillText(chip[0], x + cardW - 58, y + 23);
    g.textAlign = 'left';
  });
  boardTexture.needsUpdate = true;
}

// ---------- status screen on the back wall ----------

// One big screen for what is happening now, so the panel in VS Code (which hides the top bar) still
// says it in words: the busy desk, Claude's summary of the call, and the file or command.
const SCREEN_W = 1024;
const SCREEN_H = 400;
const screenCanvas = makeCanvas(SCREEN_W, SCREEN_H);
const screenTexture = canvasTexture(screenCanvas);
{
  rbox(room, [6.65, 2.85, 0.12], 0x1b1d23, [0, 3.55, ROOM_Z_BACK + 0.06], 0.05, { cast: false });
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 2.5), new THREE.MeshBasicMaterial({ map: screenTexture, toneMapped: false }));
  screen.position.set(0, 3.55, ROOM_Z_BACK + 0.125);
  room.add(screen);
}

function formatTokens(n) {
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}k`;
  return String(Math.round(n));
}

function drawScreen() {
  const g = screenCanvas.getContext('2d');
  const session = currentSession();
  const busy = ROLES.filter((role) => roleState(role.id).state === 'working');
  const role = busy[0];
  const r = role ? roleState(role.id) : null;
  const ended = Boolean(session?.endedAt);
  const elapsed = session?.startedAt ? formatElapsed((session.endedAt ?? Date.now()) - session.startedAt) : '00:00';

  const [accent, title, chip] = role
    ? [role.css, `${role.label} · ${role.title}`, 'WORKING']
    : ended
      ? ['#3fbf74', 'Task finished', 'DONE']
      : ['#5b6170', 'IT-Office-3D', 'WAITING'];

  g.fillStyle = '#0f1116';
  g.fillRect(0, 0, SCREEN_W, SCREEN_H);
  g.fillStyle = accent;
  g.fillRect(0, 0, SCREEN_W, 86);
  g.textBaseline = 'middle';
  g.textAlign = 'left';
  g.fillStyle = '#ffffff';
  g.font = `800 44px ${FONT}`;
  g.fillText(truncate(title, 30), 32, 44);
  g.textAlign = 'right';
  g.font = `700 30px ${FONT}`;
  g.fillText(`${chip}  ${elapsed}`, SCREEN_W - 32, 44);
  g.textAlign = 'left';

  if (role) {
    // Claude's own summary when it gave one, otherwise the tool name.
    g.fillStyle = '#ffffff';
    g.font = `700 58px ${FONT}`;
    g.fillText(truncate(r.note ?? r.tool, 30), 32, 152);
    g.fillStyle = '#9aa3b5';
    g.font = `500 32px ui-monospace, Consolas, monospace`;
    g.fillText(truncate(`${r.tool}${r.detail ? ` · ${r.detail}` : ''}`, 46), 32, 214);
    if (busy.length > 1) {
      g.textAlign = 'right';
      g.fillText(`+${busy.length - 1} more`, SCREEN_W - 32, 202);
      g.textAlign = 'left';
    }
    // Lines of "code" that scroll while the desk works.
    const shift = Math.floor(performance.now() / 350);
    for (let i = 0; i < 5; i++) {
      const width = 160 + seeded(i + shift) * 520;
      g.fillStyle = i === 4 ? accent : 'rgba(255,255,255,0.16)';
      g.fillRect(32 + (i % 2) * 40, 262 + i * 26, width, 11);
    }
  } else {
    g.fillStyle = '#ffffff';
    g.font = `700 58px ${FONT}`;
    g.fillText(ended ? TEXT.finished : TEXT.waiting, 32, 160);
    const t = session?.tokens;
    if (ended && t) {
      g.fillStyle = '#9aa3b5';
      g.font = `500 30px ${FONT}`;
      g.fillText(`${formatTokens(t.input + t.cacheWrite)} tokens in · ${formatTokens(t.output)} out`, 32, 222);
    }
  }
  screenTexture.needsUpdate = true;
}

// ---------- PM (team lead) ----------

const lead = createPerson({
  shirt: 0x1f3a5f,
  pants: 0x23262f,
  skin: 0xe8b894,
  hair: 0x4a4a52,
  hairStyle: 'short',
  accessory: 'glasses',
  outfit: 'tie',
});
scene.add(lead.root);
poseStanding(lead);

// Task card the lead carries to a desk.
const leadCard = new THREE.Group();
lead.armR.add(leadCard);
leadCard.position.set(0, -0.32, 0.08);
box(leadCard, [0.22, 0.28, 0.015], 0xffffff, [0, 0, 0], { cast: false });
box(leadCard, [0.22, 0.05, 0.017], 0xe0553a, [0, 0.11, 0], { cast: false });
for (let i = 0; i < 3; i++) box(leadCard, [0.15, 0.014, 0.017], 0x9aa0ab, [0, 0.03 - i * 0.05, 0], { cast: false });
leadCard.visible = false;

const leadTag = document.createElement('div');
leadTag.className = 'tag lead';
tagLayer.appendChild(leadTag);

const bubble = document.createElement('div');
bubble.className = 'bubble';
bubble.innerHTML = '<div class="line1"></div><div class="line2"></div>';
tagLayer.appendChild(bubble);
const bubbleLine1 = bubble.querySelector('.line1');
const bubbleLine2 = bubble.querySelector('.line2');

const leadState = {
  mode: 'idle',
  yaw: HOME_YAW,
  faceYaw: HOME_YAW,
  path: [],
  task: null,
  talkT: 0,
  handedOver: false,
  phase: 0,
  queue: [],
};
lead.root.position.copy(HOME);
lead.root.rotation.y = HOME_YAW;

// What the PM says when handing a task over: tool-specific lines first, then one per desk.
const PHRASES = TEXT.phrases;
const DESK_PHRASES = TEXT.desks;

const roleById = (id) => ROLES.find((r) => r.id === id);

// The PM stands in the gap to the right of a desk, on the corridor side of its row.
const spotFor = (roleId) => {
  const role = roleById(roleId);
  return new THREE.Vector3(role.x + 1.8, 0, role.rowZ + DESK_Z);
};

// Every trip goes through the corridor between the two rows, so the PM never cuts through furniture.
function buildPath(from, to) {
  const points = [];
  if (Math.abs(from.x - to.x) > 0.3 || Math.abs(from.z - to.z) > 0.3) {
    if (Math.abs(from.z - CORRIDOR_Z) > 0.2) points.push(new THREE.Vector3(from.x, 0, CORRIDOR_Z));
    if (Math.abs(to.z - CORRIDOR_Z) > 0.2) points.push(new THREE.Vector3(to.x, 0, CORRIDOR_Z));
  }
  points.push(to.clone());
  return points;
}

function bubbleTextFor(task) {
  const name = roleById(task.role).label;
  if (task.type === 'praise') return [TEXT.praise(name), ''];
  if (task.type === 'wrapUp') return [TEXT.wrapUp(name), ''];
  const line2 = task.tool === 'Reading prompt' ? '' : `${task.tool}${task.detail ? ` · ${truncate(task.detail, 34)}` : ''}`;
  // Claude's own summary of the call says what is really being done; the stock phrase is only a fallback.
  if (task.note) return [`${name}: ${truncate(task.note, 70)}`, line2];
  const phrase = PHRASES[task.tool] ?? DESK_PHRASES[task.role] ?? TEXT.fallback;
  return [TEXT.ask(name, phrase), line2];
}

function goHome() {
  leadState.task = null;
  leadState.path = buildPath(lead.root.position, HOME);
  leadState.mode = 'walking';
}

function startNext() {
  const task = leadState.queue.shift();
  if (!task) {
    goHome();
    return;
  }
  leadState.task = task;
  leadState.handedOver = false;
  leadCard.visible = task.type === 'assign';
  leadState.path = buildPath(lead.root.position, spotFor(task.role));
  leadState.mode = 'walking';
}

function enqueue(task) {
  leadState.queue.push(task);
  while (leadState.queue.length > MAX_QUEUE) leadState.queue.shift();
  // Idle, or already walking back to the board with nothing to deliver: go straight to the new task.
  if (leadState.mode === 'idle' || (leadState.mode === 'walking' && !leadState.task)) startNext();
}

function resetLead() {
  leadState.queue.length = 0;
  leadCard.visible = false;
  bubble.classList.remove('show');
  for (const obj of objects) obj.handed = false;
  if (leadState.mode !== 'idle') goHome();
}

function arrive() {
  if (leadState.task) {
    leadState.mode = 'talking';
    leadState.talkT = 0;
    // Face the worker, turned a little toward the camera so the face stays visible.
    leadState.faceYaw = -Math.PI / 2 + 0.55;
    const [line1, line2] = bubbleTextFor(leadState.task);
    bubbleLine1.textContent = line1;
    bubbleLine2.textContent = line2;
    bubbleLine2.style.display = line2 ? '' : 'none';
    bubble.style.borderColor = roleById(leadState.task.role).css;
    bubble.classList.add('show');
  } else {
    leadState.mode = 'idle';
    leadState.faceYaw = HOME_YAW;
    if (leadState.queue.length) startNext();
  }
}

function handOver(task) {
  leadCard.visible = false;
  const obj = objects.find((o) => o.role.id === task.role);
  obj.handed = true;
  obj.ticket.visible = true;
  obj.nodUntil = performance.now() + 900;
}

function updateLead(dt, t) {
  const S = leadState;
  const pos = lead.root.position;
  let walking = false;

  if (S.mode === 'walking') {
    const goal = S.path[0];
    const dx = goal.x - pos.x;
    const dz = goal.z - pos.z;
    const dist = Math.hypot(dx, dz);
    const step = WALK_SPEED * dt;
    if (dist <= step) {
      pos.x = goal.x;
      pos.z = goal.z;
      S.path.shift();
      if (!S.path.length) arrive();
    } else {
      pos.x += (dx / dist) * step;
      pos.z += (dz / dist) * step;
      S.yaw = turnToward(S.yaw, Math.atan2(dx, dz), 9 * dt);
      walking = true;
    }
  } else if (S.mode === 'talking') {
    S.yaw = turnToward(S.yaw, S.faceYaw, 6 * dt);
    S.talkT += dt;
    if (S.task.type === 'assign' && !S.handedOver && S.talkT > 1.3) {
      S.handedOver = true;
      handOver(S.task);
    }
    if (S.talkT >= TALK_SECONDS) {
      bubble.classList.remove('show');
      if (S.queue.length) startNext();
      else goHome();
    }
  } else {
    S.yaw = turnToward(S.yaw, HOME_YAW + Math.sin(t * 0.4) * 0.45, 2 * dt);
  }
  lead.root.rotation.y = S.yaw;

  // Pose.
  if (walking) S.phase += dt * 9;
  const swing = walking ? Math.sin(S.phase) : 0;
  lead.legL.hip.rotation.x = swing * 0.6;
  lead.legR.hip.rotation.x = -swing * 0.6;
  lead.legL.knee.rotation.x = walking ? Math.max(0, Math.sin(S.phase + 1.2)) * 0.9 : 0;
  lead.legR.knee.rotation.x = walking ? Math.max(0, Math.sin(S.phase + 1.2 + Math.PI)) * 0.9 : 0;
  lead.pelvis.position.y = STAND_HIP + (walking ? Math.abs(Math.sin(S.phase)) * 0.04 : 0);

  const carrying = leadCard.visible;
  const allDone = objects.find((o) => o.role.id === WRITER).finished;
  if (S.mode === 'talking') {
    const reach = THREE.MathUtils.smoothstep(S.talkT, 0.4, 1.0) * (S.handedOver ? 0 : 1);
    lead.armR.rotation.x = carrying ? -0.5 - reach * 0.9 : -0.9 + Math.sin(t * 4) * 0.15;
    lead.armL.rotation.x = -0.7 + Math.sin(t * 5) * 0.25;
    lead.head.rotation.x = 0.05 + Math.sin(t * 6) * 0.04;
  } else if (walking) {
    lead.armL.rotation.x = -swing * 0.5;
    lead.armR.rotation.x = carrying ? -0.9 : swing * 0.5;
    lead.head.rotation.x = 0;
  } else if (allDone && S.mode === 'idle') {
    lead.armL.rotation.x = Math.sin(t * 1.2) * 0.04;
    lead.armR.rotation.x = Math.PI - 0.4;
    lead.armR.rotation.z = Math.sin(t * 8) * 0.4;
    lead.head.rotation.x = 0;
  } else {
    lead.armL.rotation.x = Math.sin(t * 1.2) * 0.04;
    lead.armR.rotation.x = Math.sin(t * 1.2 + 1) * 0.04;
    lead.head.rotation.x = 0;
  }
  if (!(allDone && S.mode === 'idle')) lead.armR.rotation.z = 0;
  lead.head.rotation.y = S.mode === 'idle' ? Math.sin(t * 0.7) * 0.2 : 0;

  const roleName = S.task ? roleById(S.task.role).label : '';
  leadTag.textContent =
    S.mode === 'walking' && S.task ? `PM · Heading to ${roleName}`
    : S.mode === 'talking' ? `PM · Briefing ${roleName}`
    : S.mode === 'walking' ? 'PM · Back to the board'
    : 'PM · Overseeing';
}

// ---------- state ----------

// Snapshot from the server. Only the active session is shown.
let snapshot = { active: null, sessions: {} };

function currentSession() {
  return snapshot.active ? snapshot.sessions[snapshot.active] : null;
}

const EMPTY_ROLE = { state: 'waiting', tool: null, detail: null, done: false };

function roleState(id) {
  return currentSession()?.roles[id] ?? EMPTY_ROLE;
}

const isFinished = (r) => r.done || r.state === 'done';

// Short on purpose: ten tags share the screen.
function tagText(role, r) {
  if (r.state === 'working') return `${role.label} · ${truncate(r.note ?? r.tool, 34)}`;
  if (r.state === 'done') return `${role.label} · Done`;
  return role.label;
}

// The pipeline bar at the top: one step per desk, in desk order.
const pipeline = document.getElementById('pipeline');
const steps = ROLES.map((role, i) => {
  if (i > 0) {
    const arrow = document.createElement('span');
    arrow.className = 'arrow';
    arrow.textContent = '›';
    pipeline.append(arrow);
  }
  const step = document.createElement('div');
  step.className = 'step';
  step.style.color = role.css;
  step.title = role.title;
  const name = document.createElement('span');
  name.className = 'name';
  name.textContent = role.label;
  const state = document.createElement('span');
  state.className = 'state';
  step.append(name, state);
  pipeline.append(step);
  return { role, step, state };
});

// Desks that have worked during the current turn, for the progress bar.
const worked = new Set();

function applyState() {
  for (const obj of objects) {
    const r = roleState(obj.role.id);
    const working = r.state === 'working';
    const finished = isFinished(r);
    obj.state = r.state;
    obj.finished = finished;
    obj.check.visible = finished;
    obj.ticket.visible = obj.handed || finished;

    obj.tagEl.textContent = tagText(obj.role, r);
    if (r.done) {
      const mark = document.createElement('span');
      mark.className = 'done-tick';
      mark.textContent = '✓';
      obj.tagEl.appendChild(mark);
    }

    const glow = working ? obj.role.color : finished ? DONE_GREEN : 0x000000;
    for (const part of [obj.logo, obj.bulb]) {
      part.material.color.set(working || finished ? glow : 0xcccccc);
      part.material.emissive.set(glow);
    }
  }

  for (const { role, step, state } of steps) {
    const r = roleState(role.id);
    const finished = isFinished(r);
    if (r.state === 'working') worked.add(role.id);
    step.classList.toggle('working', r.state === 'working');
    step.classList.toggle('done', finished);
    state.textContent = r.state === 'working' ? r.note ?? r.tool : finished ? 'Done' : 'Waiting';
    step.title = r.state === 'working' && r.note ? `${role.title}: ${r.note}` : role.title;
  }

  // Nothing says how long a turn will take, so the bar fills a little more with each desk that joins in
  // and completes when the turn ends.
  const session = currentSession();
  const progress = session?.endedAt ? 1 : worked.size / (worked.size + 1);
  document.getElementById('progress-bar').style.width = `${progress * 100}%`;
  drawBoard();
  drawScreen();
}

// Compare the new snapshot with the previous one and queue work for the lead.
let previous = null;

function remember(next, session) {
  previous = {
    active: next.active,
    startedAt: session?.startedAt ?? null,
    roles: session ? structuredClone(session.roles) : null,
  };
}

function planLeadWork(next) {
  const session = next.active ? next.sessions[next.active] : null;

  // First snapshot after load: show the current state, but do not replay old assignments.
  if (!previous) {
    if (session) {
      for (const obj of objects) {
        const r = session.roles[obj.role.id];
        obj.handed = r.state === 'working' || r.done || r.state === 'done';
      }
    }
    remember(next, session);
    return;
  }

  if (!session) {
    resetLead();
    remember(next, session);
    return;
  }

  const newTask = next.active !== previous.active || session.startedAt !== previous.startedAt;
  if (newTask) {
    resetLead();
    worked.clear();
  }

  for (const role of ROLES) {
    const r = session.roles[role.id];
    const p = (!newTask && previous.roles?.[role.id]) || EMPTY_ROLE;
    if (r.state === 'working' && r.tool !== 'Thinking' && (p.state !== 'working' || p.tool !== r.tool || p.detail !== r.detail || p.note !== r.note)) {
      enqueue({ type: 'assign', role: role.id, tool: r.tool, detail: r.detail, note: r.note });
    } else if (role.id === WRITER && r.state === 'done' && p.state !== 'done') {
      enqueue({ type: 'wrapUp', role: role.id });
    } else if (role.id !== WRITER && r.done && !p.done) {
      enqueue({ type: 'praise', role: role.id });
    }
  }
  remember(next, session);
}

const pad = (n) => String(n).padStart(2, '0');

function formatElapsed(ms) {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

function updateTimer() {
  drawScreen();
  const session = currentSession();
  const el = document.getElementById('elapsed');
  if (!session?.startedAt) {
    el.textContent = '00:00';
    return;
  }
  el.textContent = formatElapsed((session.endedAt ?? Date.now()) - session.startedAt);
}

// ---------- camera ----------

// The view is fitted to the room width, then the user can orbit and zoom a little.
const HALF_W = 11.2;
const HALF_H = 5.4;
const DEFAULT_VIEW = { azimuth: 0, elevation: 0.56, zoom: 1 };
const view = { ...DEFAULT_VIEW };

function placeCamera() {
  const tanV = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
  const aspect = camera.aspect;
  const dist = Math.max(HALF_H / tanV, HALF_W / (tanV * aspect)) * view.zoom;
  const horizontal = dist * Math.cos(view.elevation);
  camera.position.set(
    target.x + horizontal * Math.sin(view.azimuth),
    target.y + dist * Math.sin(view.elevation),
    target.z + horizontal * Math.cos(view.azimuth),
  );
  camera.lookAt(target);
}

const canvasEl = renderer.domElement;
let drag = null;
canvasEl.addEventListener('pointerdown', (e) => {
  drag = { x: e.clientX, y: e.clientY };
  canvasEl.setPointerCapture(e.pointerId);
});
canvasEl.addEventListener('pointermove', (e) => {
  if (!drag) return;
  if (e.buttons === 0) {
    drag = null;
    return;
  }
  view.azimuth = THREE.MathUtils.clamp(view.azimuth - (e.clientX - drag.x) * 0.005, -0.7, 0.7);
  view.elevation = THREE.MathUtils.clamp(view.elevation + (e.clientY - drag.y) * 0.004, 0.35, 1.1);
  drag = { x: e.clientX, y: e.clientY };
  placeCamera();
});
for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
  canvasEl.addEventListener(type, () => {
    drag = null;
  });
}
canvasEl.addEventListener('wheel', (e) => {
  e.preventDefault();
  view.zoom = THREE.MathUtils.clamp(view.zoom * Math.exp(e.deltaY * 0.001), 0.55, 1.3);
  placeCamera();
}, { passive: false });
canvasEl.addEventListener('dblclick', () => {
  Object.assign(view, DEFAULT_VIEW);
  placeCamera();
});

const projected = new THREE.Vector3();

// Overlays sit above their anchor by default, or below it when `below` is set.
function placeOverlay(el, worldPoint, offsetY = 0, below = false) {
  projected.copy(worldPoint).project(camera);
  const x = (projected.x * 0.5 + 0.5) * window.innerWidth;
  const y = (-projected.y * 0.5 + 0.5) * window.innerHeight + offsetY;
  el.style.transform = `translate(${x}px, ${y}px) translate(-50%, ${below ? '0' : '-100%'})`;
}

const leadAnchor = new THREE.Vector3();

function updateOverlays() {
  for (const obj of objects) placeOverlay(obj.tagEl, obj.anchor);
  const p = lead.root.position;
  // The PM's tag and speech bubble go under their feet so they do not hide the desk tags.
  leadAnchor.set(p.x, 0, p.z);
  placeOverlay(leadTag, leadAnchor, 8, true);
  placeOverlay(bubble, leadAnchor, 46, true);
}

// ---------- animation ----------

const startedAt = performance.now();
const ARM_REST = -0.85;
let lastFrame = performance.now();

function animateWorker(obj, t) {
  const working = obj.state === 'working';
  const { armL, armR, head, torso, pelvis } = obj.person;
  const ph = obj.phase;
  const now = performance.now();

  if (working) {
    armL.rotation.x = ARM_REST - 0.05 + Math.sin(t * 14 + ph) * 0.1;
    armR.rotation.x = ARM_REST - 0.05 + Math.sin(t * 14 + ph + Math.PI) * 0.1;
    armR.rotation.z = 0;
    head.rotation.x = 0.12 + Math.sin(t * 3 + ph) * 0.03;
    head.rotation.y = Math.sin(t * 1.2 + ph) * 0.08;
    pelvis.position.y = SEAT_HIP + Math.sin(t * 6 + ph) * 0.008;
  } else if (obj.finished) {
    armL.rotation.x = ARM_REST;
    armR.rotation.x = Math.PI - 0.35;
    armR.rotation.z = Math.sin(t * 9 + ph) * 0.45;
    head.rotation.x = 0;
    head.rotation.y = Math.sin(t * 1.5 + ph) * 0.1;
    pelvis.position.y = SEAT_HIP;
  } else {
    armL.rotation.x = ARM_REST + Math.sin(t * 0.9 + ph) * 0.02;
    armR.rotation.x = ARM_REST + Math.sin(t * 0.9 + ph + 1) * 0.02;
    armR.rotation.z = 0;
    head.rotation.x = 0;
    head.rotation.y = Math.sin(t * 0.6 + ph) * 0.25;
    pelvis.position.y = SEAT_HIP;
  }
  // A short nod when the lead hands over a task card.
  if (now < obj.nodUntil) {
    head.rotation.x += Math.sin((obj.nodUntil - now) / 900 * Math.PI * 3) * 0.2;
  }
  torso.scale.y = 1 + Math.sin(t * 1.6 + ph) * 0.012;

  const glowTarget = working ? 14 : 0;
  obj.light.intensity += (glowTarget - obj.light.intensity) * 0.1;
  obj.bulb.scale.setScalar(working ? 1 + Math.sin(t * 6 + ph) * 0.15 : 1);
  obj.check.position.y = HEAD_TOP + 0.2 + Math.sin(t * 2 + ph) * 0.06;
}

function frame() {
  frameQueued = false;
  const now = performance.now();
  const dt = Math.min((now - lastFrame) / 1000, 0.1);
  lastFrame = now;
  const t = (now - startedAt) / 1000;

  for (const obj of objects) animateWorker(obj, t);
  updateLead(dt, t);

  const date = new Date();
  const minutes = date.getMinutes() + date.getSeconds() / 60;
  minuteHand.rotation.z = -(minutes / 60) * Math.PI * 2;
  hourHand.rotation.z = -(((date.getHours() % 12) + minutes / 60) / 12) * Math.PI * 2;

  renderer.render(scene, camera);
  updateOverlays();
  scheduleFrame();
}

// Full speed only while something moves; a quiet office redraws a few times a second, and a hidden one
// (browser tab in the background, or the VS Code panel behind another tab) not at all.
const IDLE_FRAME_MS = 125;
let hiddenByHost = false;
let frameTimer = null; // the idle wait before the next frame
let frameQueued = false; // a requestAnimationFrame is pending
let lastInput = 0;

function queueFrame() {
  frameTimer = null;
  frameQueued = true;
  requestAnimationFrame(frame);
}

function scheduleFrame() {
  if (hiddenByHost || document.hidden) return;
  const busy = leadState.mode !== 'idle' || objects.some((o) => o.state === 'working') || drag || performance.now() - lastInput < 1000;
  if (busy) queueFrame();
  else frameTimer = setTimeout(queueFrame, IDLE_FRAME_MS);
}

// Called on any input or new state, so the next frame comes at full speed.
function wake() {
  lastInput = performance.now();
  if (frameQueued) return;
  clearTimeout(frameTimer);
  scheduleFrame();
}

for (const type of ['pointerdown', 'pointermove', 'wheel']) canvasEl.addEventListener(type, wake, { passive: true });
document.addEventListener('visibilitychange', wake);
// The VS Code extension says when its panel is shown or hidden: the page keeps running behind a hidden
// panel, so the browser alone cannot tell. The message only pauses drawing, so any sender is harmless.
window.addEventListener('message', (e) => {
  if (e.data?.type !== 'it-office-3d:visible') return;
  hiddenByHost = !e.data.visible;
  wake();
});

function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  placeCamera();
}

window.addEventListener('resize', resize);
window.addEventListener('resize', wake);
resize();
drawBoard();
drawScreen();
wake();

const source = new EventSource(eventsUrl());
source.onmessage = (msg) => {
  const next = JSON.parse(msg.data);
  planLeadWork(next);
  snapshot = next;
  applyState();
  updateTimer();
  wake();
};

setInterval(updateTimer, 250);

document.getElementById('reset').addEventListener('click', () => {
  fetch('/reset', { method: 'POST' });
});
