const express = require("express");
const app = express();
const http = require("http").createServer(app);
const io = require("socket.io")(http);
const PORT = 3000;

app.use(express.static(__dirname));

let players = {};

io.on("connection", (socket) => {
    console.log(`Player connected: ${socket.id}`);
    players[socket.id] = { x: 100, y: 100 };

    socket.emit("currentPlayers", players);
    socket.broadcast.emit("newPlayer", { id: socket.id, ...players[socket.id] });

    socket.on("move", (data) => {
        if (players[socket.id]) {
            players[socket.id].x = data.x;
            players[socket.id].y = data.y;
            io.emit("playerMoved", { id: socket.id, x: data.x, y: data.y });
        }
    });

    socket.on("disconnect", () => {
        console.log(`Player disconnected: ${socket.id}`);
        delete players[socket.id];
        io.emit("removePlayer", socket.id);
    });
});

http.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
