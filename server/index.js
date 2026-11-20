const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
require("dotenv").config();

const app = express();
const port = process.env.PORT || 3001;

// Allowed CORS origins (e.g. "https://virtual-ground.vercel.app,http://localhost:3000")
const rawOrigins = process.env.ALLOWED_ORIGINS || "*";
const origin = rawOrigins === "*" ? "*" : rawOrigins.split(",").map((s) => s.trim());

app.use(cors({ origin }));
app.use(express.json());

// Basic health check endpoint
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    onlinePlayers: players.size,
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin,
    methods: ["GET", "POST"],
  },
  pingInterval: 10000,
  pingTimeout: 5000,
});

/**
 * In-memory room state:
 * socketId -> { id: string (access code), characterId: string, x: number, y: number, direction: string, moving: boolean }
 */
const players = new Map();

io.on("connection", (socket) => {
  console.log(`[Connect] Socket connected: ${socket.id}`);

  // Handle joining the ground
  socket.on("join-ground", (data) => {
    if (!data || !data.code || !data.characterId) {
      console.warn(`[Join rejected] Invalid join payload from ${socket.id}`, data);
      return;
    }

    const playerId = String(data.code).trim().toUpperCase();

    // If this code was already connected from an older socket, clean up previous connection
    for (const [sId, p] of players.entries()) {
      if (p.id === playerId && sId !== socket.id) {
        players.delete(sId);
        socket.broadcast.emit("player-left", { id: playerId });
      }
    }

    const playerState = {
      id: playerId,
      characterId: data.characterId,
      x: typeof data.x === "number" ? data.x : 432,
      y: typeof data.y === "number" ? data.y : 350,
      direction: data.direction || "up",
      moving: Boolean(data.moving),
      lastSeen: Date.now(),
    };

    players.set(socket.id, playerState);
    console.log(`[Join] ${playerState.id} (${playerState.characterId}) joined. Total online: ${players.size}`);

    // 1. Send all existing other players to the newly joined player
    const otherPlayers = [];
    for (const [sId, p] of players.entries()) {
      if (sId !== socket.id) {
        otherPlayers.push({
          id: p.id,
          characterId: p.characterId,
          x: p.x,
          y: p.y,
          direction: p.direction,
          moving: p.moving,
        });
      }
    }
    socket.emit("current-players", otherPlayers);

    // 2. Broadcast this new player to all other connected clients
    socket.broadcast.emit("player-joined", {
      id: playerState.id,
      characterId: playerState.characterId,
      x: playerState.x,
      y: playerState.y,
      direction: playerState.direction,
      moving: playerState.moving,
    });
  });

  // Handle player movement relay
  socket.on("player-move", (data) => {
    const player = players.get(socket.id);
    if (!player) return;

    if (typeof data.x === "number" && typeof data.y === "number") {
      player.x = data.x;
      player.y = data.y;
    }
    if (data.direction) {
      player.direction = data.direction;
    }
    player.moving = Boolean(data.moving);
    player.lastSeen = Date.now();

    // Broadcast movement to all other players in real-time
    socket.broadcast.emit("player-moved", {
      id: player.id,
      x: player.x,
      y: player.y,
      direction: player.direction,
      moving: player.moving,
    });
  });

  // Handle player emote broadcast
  socket.on("player-emote", (data) => {
    const player = players.get(socket.id);
    if (!player || !data || !data.emote) return;

    socket.broadcast.emit("player-emoted", {
      id: player.id,
      emote: String(data.emote).slice(0, 30),
    });
  });

  // Handle player speaking status (for visual wave indicator over character)
  socket.on("player-speaking", (data) => {
    const player = players.get(socket.id);
    if (!player) return;

    socket.broadcast.emit("player-speaking", {
      id: player.id,
      speaking: Boolean(data.speaking),
    });
  });

  // WebRTC Voice Signaling (P2P Mesh with Proximity Audio)
  socket.on("voice-signal", (data) => {
    const player = players.get(socket.id);
    if (!player || !data || !data.toId) return;

    // Relay to the target player's socket
    for (const [targetSocketId, targetPlayer] of players.entries()) {
      if (targetPlayer.id === data.toId && targetSocketId !== socket.id) {
        io.to(targetSocketId).emit("voice-signal", {
          fromId: player.id,
          type: data.type, // "offer" | "answer" | "candidate"
          signal: data.signal,
        });
        break;
      }
    }
  });

  // Handle player disconnect
  socket.on("disconnect", (reason) => {
    const player = players.get(socket.id);
    if (player) {
      players.delete(socket.id);
      console.log(`[Leave] ${player.id} disconnected (${reason}). Total online: ${players.size}`);
      socket.broadcast.emit("player-left", { id: player.id });
    } else {
      console.log(`[Disconnect] Unregistered socket ${socket.id} closed (${reason})`);
    }
  });
});

server.listen(port, () => {
  console.log(`===============================================`);
  console.log(`Virtual Ramlila Ground WebSocket Server`);
  console.log(`Listening on http://localhost:${port}`);
  console.log(`CORS allowed origins: ${rawOrigins}`);
  console.log(`===============================================`);
});
