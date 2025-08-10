<!-- ===================== server.js ===================== -->
// Save as server.js in same folder
// Run: npm install express socket.io
// node server.js

const serverJs = `
const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

app.use(express.static(__dirname));

let players = {}; // id -> {id,x,y,z,rotY,hp, last}
let bullets = [];

io.on('connection', (socket)=>{
  console.log('conn', socket.id);
  socket.on('join', (m)=>{
    players[m.id] = { id: m.id, x:0,y:0,z:0, rotY:0, hp:100, last: Date.now() };
  });
  socket.on('update', (p)=>{ if (players[p.id]) { players[p.id].x = p.x; players[p.id].y = p.y; players[p.id].z = p.z; players[p.id].rotY = p.rotY; players[p.id].hp = p.hp; players[p.id].last = Date.now(); } });
  socket.on('shoot', (b)=>{ bullets.push({ id: Math.random().toString(36).substr(2,6), x:b.x,y:b.y,z:b.z, vx:b.vx,vy:b.vy,vz:b.vz, t:Date.now() }); io.emit('bullet', bullets[bullets.length-1]); });
  socket.on('disconnect', ()=>{ // remove any player with socket id mapping - we only have player.id
    // cleanup stale players periodically
  });
});

// broadcast state to all clients
setInterval(()=>{
  // cleanup players inactive > 10s
  const now = Date.now();
  for (const id of Object.keys(players)) if (now - players[id].last > 15000) delete players[id];
  // step bullets server-side (simple)
  bullets = bullets.filter(b=> (now - b.t) < 20000);
  io.emit('state', { players: Object.values(players) });
}, 100);

http.listen(3000, ()=> console.log('listening on 3000'));
`;

// ===================== package.json =====================
const packageJson = `{
  "name": "tankcap-mp",
  "version": "1.0.0",
  "main": "server.js",
  "dependencies": {
    "express": "^4.18.2",
    "socket.io": "^4.7.2"
  }
}`;

// README
const readme = `Run instructions:\n1) npm install\n2) node server.js\n3) Open http://localhost:3000 in multiple browsers\n\nPlace your captured models under captured/models/ (eg tank.glb). The client will attempt to load captured/models/tank.glb and fall back to primitive tanks if not found.`;

// Append server and package to the document for user's convenience

/* NOTE: The actual server.js and package.json files are provided above as text. Copy them into files in your project folder. */
