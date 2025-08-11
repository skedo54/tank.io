// client.js
// Client-side Three.js multiplayer client. Uses socket.io served from server.
// Place GLTF models in captured/models/ named tank.glb or player.glb to auto-load.

import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.156.0/build/three.module.js';
import { OrbitControls } from 'https://cdn.jsdelivr.net/npm/three@0.156.0/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'https://cdn.jsdelivr.net/npm/three@0.156.0/examples/jsm/loaders/GLTFLoader.js';

const canvas = document.getElementById('c');
const hpEl = document.getElementById('hp');
const pingEl = document.getElementById('ping');
const spawnBotBtn = document.getElementById('spawnBot');
const toggleAudioBtn = document.getElementById('toggleAudio');

spawnBotBtn.addEventListener('click', () => spawnBot());
toggleAudioBtn.addEventListener('click', () => {
  sfxEnabled = !sfxEnabled;
  toggleAudioBtn.innerText = sfxEnabled ? 'SFX: On' : 'SFX: Off';
});

let renderer, scene, camera, controls;
let localId = Math.random().toString(36).slice(2,9);
let player = null;
let remotePlayers = {};
let bullets = [];
let bots = [];
let socket = null;
let lastSent = 0;
let keys = {};
let sfxEnabled = true;
const loader = new GLTFLoader();

window.addEventListener('keydown', e => keys[e.key.toLowerCase()] = true);
window.addEventListener('keyup', e => keys[e.key.toLowerCase()] = false);
window.addEventListener('resize', onResize);

async function fileExists(path){
  try {
    const r = await fetch(path, { method: 'HEAD' });
    return r.ok;
  } catch(e){ return false; }
}

function setupThree(){
  renderer = new THREE.WebGLRenderer({canvas, antialias:true, powerPreference:'high-performance'});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0a0a10);
  camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 2000);
  camera.position.set(0,30,55);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enablePan = false;
  controls.enableDamping = true;
  controls.maxPolarAngle = Math.PI * 0.49;

  const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 0.6);
  scene.add(hemi);
  const dir = new THREE.DirectionalLight(0xffffff, 0.85);
  dir.position.set(50,80,40);
  dir.castShadow = true;
  scene.add(dir);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(600,600),
    new THREE.MeshStandardMaterial({color:0x2f3f35, roughness:1})
  );
  ground.rotation.x = -Math.PI/2;
  ground.receiveShadow = true;
  scene.add(ground);
}

function primitiveTank(color=0x2b8cff){
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(6,2,9), new THREE.MeshStandardMaterial({color}));
  body.position.y = 2; body.castShadow = true; g.add(body);
  const turret = new THREE.Mesh(new THREE.CylinderGeometry(2,2,1.2,8), new THREE.MeshStandardMaterial({color:0x263244}));
  turret.rotation.x = Math.PI/2; turret.position.y = 3.0; g.add(turret);
  const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.6,0.6,6), new THREE.MeshStandardMaterial({color:0x111111}));
  barrel.position.set(0,3.0,3.2); barrel.castShadow = true; g.add(barrel);
  return g;
}

async function createPlayer(){
  const candidates = [
    'captured/models/tank.glb','captured/models/tank.gltf',
    'captured/models/player.glb','captured/models/player.gltf'
  ];
  for (const c of candidates){
    if (await fileExists(c)){
      try {
        const gltf = await new Promise((res, rej) => loader.load(c, res, undefined, rej));
        const root = gltf.scene.clone();
        root.traverse(m => { if (m.isMesh){ m.castShadow = true; m.receiveShadow = true; } });
        root.position.set((Math.random()-0.5)*30, 0, (Math.random()-0.5)*30);
        root.userData = { id: localId, hp: 100, isModel: true };
        scene.add(root);
        player = root;
        hpEl.innerText = Math.round(player.userData.hp);
        return;
      } catch(e){
        console.warn('GLTF load failed', e);
      }
    }
  }
  // fallback
  player = primitiveTank(0x2b8cff);
  player.position.set((Math.random()-0.5)*30,0,(Math.random()-0.5)*30);
  player.userData = { id: localId, hp: 100 };
  scene.add(player);
  hpEl.innerText = Math.round(player.userData.hp);
}

function spawnBot(){
  const b = primitiveTank(0xcc3333);
  b.position.set((Math.random()-0.5)*80,0,(Math.random()-0.5)*80);
  b.userData = { id: 'bot_' + Math.random().toString(36).slice(2,6), hp:40, tick: Math.random()*1.2 };
  scene.add(b); bots.push(b);
}

function spawnBullet(pos, dir, owner){
  const m = new THREE.Mesh(new THREE.SphereGeometry(0.28,8,8), new THREE.MeshStandardMaterial({metalness:0.2}));
  m.position.copy(pos);
  m.userData = { vel: dir.clone().multiplyScalar(45), born: performance.now(), owner };
  m.castShadow = true;
  scene.add(m); bullets.push(m);

  if (socket && socket.connected) socket.emit('shoot', {
    x: m.position.x, y: m.position.y, z: m.position.z,
    vx: m.userData.vel.x, vy: m.userData.vel.y, vz: m.userData.vel.z,
    owner
  });
  if (sfxEnabled) playSfx('shot');
}

window.addEventListener('pointerdown', () => {
  if (!player) return;
  const barrel = new THREE.Vector3(0,3.0,3.2).applyMatrix4(player.matrixWorld);
  const dir = new THREE.Vector3(0,0,1).applyQuaternion(player.quaternion).normalize();
  spawnBullet(barrel, dir, localId);
});

function connectSocket(){
  try {
    socket = io();
  } catch(e){
    socket = null; return;
  }
  socket.on('connect', () => console.log('socket connected'));
  socket.on('state', msg => {
    const present = new Set();
    for (const p of msg.players){
      present.add(p.id);
      if (p.id === localId) continue;
      if (!remotePlayers[p.id]){
        const ent = primitiveTank(0xcc6666);
        ent.userData = { id: p.id, hp: p.hp };
        scene.add(ent);
        remotePlayers[p.id] = ent;
      }
      const ent = remotePlayers[p.id];
      ent.position.set(p.x, p.y, p.z);
      ent.rotation.y = p.rotY;
      ent.userData.hp = p.hp;
    }
    for (const id of Object.keys(remotePlayers)){
      if (!present.has(id)){
        scene.remove(remotePlayers[id]); delete remotePlayers[id];
      }
    }
  });

  socket.on('bullet', b => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.28,6,6), new THREE.MeshStandardMaterial({}));
    m.position.set(b.x,b.y,b.z);
    m.userData = { vel: new THREE.Vector3(b.vx,b.vy,b.vz), born: performance.now(), owner: b.owner };
    scene.add(m); bullets.push(m);
    if (sfxEnabled) playSfx('shot_remote');
  });

  socket.on('pong', ms => { pingEl.innerText = Math.round(ms) + 'ms'; });
}

let lastTime = performance.now();
function animate(now = performance.now()){
  const dt = Math.min((now - lastTime) / 1000, 0.05);
  lastTime = now;

  if (player){
    const speed = 12;
    if (keys['w']) player.translateZ(-speed * dt);
    if (keys['s']) player.translateZ(speed * dt);
    if (keys['a']) player.rotation.y += 2.2 * dt;
    if (keys['d']) player.rotation.y -= 2.2 * dt;

    if (socket && socket.connected && performance.now() - lastSent > 90){
      socket.emit('update', {
        id: localId,
        x: player.position.x, y: player.position.y, z: player.position.z,
        rotY: player.rotation.y, hp: player.userData.hp
      });
      lastSent = performance.now();
    }
  }

  // bots AI
  for (const b of bots){
    b.userData.tick += dt;
    if (b.userData.tick > 0.6){
      b.userData.tick = 0;
      const toPlayer = player.position.clone().sub(b.position);
      if (toPlayer.length() < 40){
        const dir = toPlayer.normalize(); b.position.add(dir.multiplyScalar(1.8));
        if (Math.random() < 0.4){
          const barrel = new THREE.Vector3(0,3.0,3.2).applyMatrix4(b.matrixWorld);
          spawnBullet(barrel, player.position.clone().sub(barrel).normalize(), b.userData.id);
        }
      } else {
        b.position.x += (Math.random()-0.5) * 2;
        b.position.z += (Math.random()-0.5) * 2;
      }
    }
  }

  // bullets: move & collisions
  for (let i = bullets.length - 1; i >= 0; --i){
    const bl = bullets[i];
    bl.position.add(bl.userData.vel.clone().multiplyScalar(dt));
    if (performance.now() - bl.userData.born > 12000){ scene.remove(bl); bullets.splice(i,1); continue; }

    // hit player
    if (player && bl.userData.owner !== localId && bl.position.distanceTo(player.position) < 3.8){
      player.userData.hp -= 12;
      hpEl.innerText = Math.max(0, Math.round(player.userData.hp));
      scene.remove(bl); bullets.splice(i,1); continue;
    }
    // hit bots
    for (const b of bots){
      if (bl.userData.owner !== b.userData.id && bl.position.distanceTo(b.position) < 3.6){
        b.userData.hp -= 12;
        if (b.userData.hp <= 0){ scene.remove(b); bots = bots.filter(x => x !== b); }
        scene.remove(bl); bullets.splice(i,1); break;
      }
    }
    // remote players (visual only)
    for (const id in remotePlayers){
      const rp = remotePlayers[id];
      if (bl.userData.owner !== id && bl.position.distanceTo(rp.position) < 3.6){
        scene.remove(bl); bullets.splice(i,1); break;
      }
    }
  }

  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

function onResize(){
  if (!camera || !renderer) return;
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

// Simple SFX (placeholders)
const audioMap = {};
function loadSfx(){
  // placeholders, use your own audio files if you want
  audioMap['shot'] = new Audio(); // silent placeholder
  audioMap['shot_remote'] = new Audio();
}
function playSfx(name){
  if (!sfxEnabled) return;
  const a = audioMap[name];
  if (!a) return;
  try { a.currentTime = 0; a.play(); } catch(e){}
}

// bootstrap
setupThree();
createPlayer(); // will attempt to load model or fall back
for (let i=0;i<2;i++) spawnBot();
connectSocket();
requestAnimationFrame(animate);
loadSfx();
