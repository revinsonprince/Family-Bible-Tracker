import express from "express";
import { createServer } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const db = new Database("bible_tracker.db");

// Initialize Database
db.exec(`
  CREATE TABLE IF NOT EXISTS rooms (
    code TEXT PRIMARY KEY,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    room_code TEXT,
    name TEXT,
    last_read_at DATETIME,
    FOREIGN KEY(room_code) REFERENCES rooms(code)
  );

  CREATE TABLE IF NOT EXISTS logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    member_id INTEGER,
    room_code TEXT,
    book TEXT,
    chapter INTEGER,
    read_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    confirmed_by_id INTEGER,
    FOREIGN KEY(member_id) REFERENCES members(id),
    FOREIGN KEY(room_code) REFERENCES rooms(code)
  );
`);

async function startServer() {
  const app = express();
  const server = createServer(app);
  const wss = new WebSocketServer({ server });
  const PORT = 3000;

  app.use(express.json());

  // Room management
  app.post("/api/rooms/join", (req, res) => {
    const { code, name } = req.body;
    let room = db.prepare("SELECT * FROM rooms WHERE code = ?").get(code);
    
    if (!room) {
      db.prepare("INSERT INTO rooms (code) VALUES (?)").run(code);
    }

    let member = db.prepare("SELECT * FROM members WHERE room_code = ? AND name = ?").get(code, name);
    if (!member) {
      const result = db.prepare("INSERT INTO members (room_code, name) VALUES (?, ?)").run(code, name);
      member = { id: result.lastInsertRowid, room_code: code, name };
    }

    res.json({ member, room_code: code });
  });

  app.get("/api/rooms/:code/state", (req, res) => {
    const { code } = req.params;
    const members = db.prepare("SELECT * FROM members WHERE room_code = ?").all(code);
    const logs = db.prepare(`
      SELECT l.*, m.name as member_name, c.name as confirmer_name
      FROM logs l
      JOIN members m ON l.member_id = m.id
      LEFT JOIN members c ON l.confirmed_by_id = c.id
      WHERE l.room_code = ?
      ORDER BY l.read_at DESC
      LIMIT 50
    `).all(code);
    
    res.json({ members, logs });
  });

  app.post("/api/logs", (req, res) => {
    const { memberId, roomCode, book, chapter } = req.body;
    const result = db.prepare("INSERT INTO logs (member_id, room_code, book, chapter) VALUES (?, ?, ?, ?)").run(memberId, roomCode, book, chapter);
    db.prepare("UPDATE members SET last_read_at = CURRENT_TIMESTAMP WHERE id = ?").run(memberId);
    
    const log = db.prepare(`
      SELECT l.*, m.name as member_name
      FROM logs l
      JOIN members m ON l.member_id = m.id
      WHERE l.id = ?
    `).get(result.lastInsertRowid);

    broadcast(roomCode, { type: "NEW_LOG", log });
    res.json(log);
  });

  app.post("/api/logs/:id/confirm", (req, res) => {
    const { id } = req.params;
    const { confirmerId, roomCode } = req.body;
    db.prepare("UPDATE logs SET confirmed_by_id = ? WHERE id = ?").run(confirmerId, id);
    
    const log = db.prepare(`
      SELECT l.*, m.name as member_name, c.name as confirmer_name
      FROM logs l
      JOIN members m ON l.member_id = m.id
      LEFT JOIN members c ON l.confirmed_by_id = c.id
      WHERE l.id = ?
    `).get(id);

    broadcast(roomCode, { type: "LOG_CONFIRMED", log });
    res.json(log);
  });

  // WebSocket logic
  const clients = new Map<string, Set<WebSocket>>();

  wss.on("connection", (ws, req) => {
    const url = new URL(req.url || "", `http://${req.headers.host}`);
    const roomCode = url.searchParams.get("roomCode");

    if (roomCode) {
      if (!clients.has(roomCode)) clients.set(roomCode, new Set());
      clients.get(roomCode)!.add(ws);

      ws.on("close", () => {
        clients.get(roomCode)?.delete(ws);
      });
    }
  });

  function broadcast(roomCode: string, data: any) {
    const roomClients = clients.get(roomCode);
    if (roomClients) {
      const message = JSON.stringify(data);
      roomClients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(message);
        }
      });
    }
  }

  // Vite middleware
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
