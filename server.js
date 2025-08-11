// server.js
// Minimal Node.js server (Express + Socket.IO)
// Authoritative-ish: stores player positions and relays bullets.

const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, { cors: { origin: '*' } });

const PORT = process.env.PORT || 3000;

app.use(express.static(__dirname)); // serve index.html, client.js, captured/, etc.

let players = {}; // socket.id -> { id, x,y,z,rotY,hp,last }
let bullets = []; // transient bullets for echo to clients

io.on('connection', socket => {
  console.log('connect', socket.id);

  // create player if not exists
  players[socket.id] = players[socket.id] || {
    id: socket.id,
    x: (Math.random()-0.5)*30,
    y: 0,
    z: (Math.random()-0.5)*30,
    rotY: 0,
    hp: 100,
    last: Date.now()
  };

  // send current state quickly to new client
  socket.emit('state', { players: Object.values(players) });

  socket.on('update', p => {
    if (!players[socket.id]) return;
    players[socket.id].x = p.x;
    players[socket.id].y = p.y;
    players[socket.id].z = p.z;
    players[socket.id].rotY = p.rotY;
    players[socket.id].hp = p.hp;
    players[socket.id].last = Date.now();
  });

  socket.on('shoot', b => {
    const bb = {
      id: Math.random().toString(36).slice(2,8),
      x: b.x, y: b.y, z: b.z,
      vx: b.vx, vy: b.vy, vz: b.vz,
      owner: b.owner,
      t: Date.now()
    };
    bullets.push(bb);
    io.emit('bullet', bb);
  });

  socket.on('disconnect', () => {
    console.log('disconnect', socket.id);
    delete players[socket.id];
  });
});

// broadcast world state at 10Hz
setInterval(() => {
  const now = Date.now();
  for (const id of Object.keys(players)){
    if (now - players[id].last > 15000) delete players[id]; // remove stale
  }
  bullets = bullets.filter(b => now - b.t < 20000);
  io.emit('state', { players: Object.values(players) });
}, 100);

// ping for latency display
setInterval(() => {
  io.emit('pong', Date.now());
}, 2000);

http.listen(PORT, () => console.log('listening on', PORT));
