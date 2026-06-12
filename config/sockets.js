"use strict";

const { Server } = require("socket.io");
const { createAdapter } = require("@socket.io/redis-adapter");
const { createClient } = require("redis");
const jwt = require("jsonwebtoken");
const config = require("./config");
const logger = require("./logger");

let io;

async function init(httpServer) {
  // Redis adapter is OPTIONAL. With a single fork-mode instance
  // (ecosystem.config.js) the in-memory adapter is fully functional, so a
  // Redis outage must never take realtime down — previously a failed
  // connect() rejected init() (io never attached → clients saw errors on
  // /socket.io) and a post-boot 'error' event had no handler, which
  // crashes the node process.
  let adapter;
  try {
    const pubClient = createClient({ url: config.redis.url });
    const subClient = pubClient.duplicate();
    pubClient.on("error", (err) =>
      logger.error("Socket.io Redis pub client error", err),
    );
    subClient.on("error", (err) =>
      logger.error("Socket.io Redis sub client error", err),
    );
    await Promise.all([pubClient.connect(), subClient.connect()]);
    adapter = createAdapter(pubClient, subClient);
  } catch (err) {
    logger.error(
      "Socket.io Redis adapter unavailable — falling back to in-memory adapter",
      err,
    );
  }

  io = new Server(httpServer, {
    cors: { origin: config.app.allowedOrigins, credentials: true },
    ...(adapter ? { adapter } : {}),
  });

  // ── Auth middleware ───────────────────────────────────────
  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) return next(new Error("No token"));
      const decoded = jwt.verify(token, config.app.jwtSecret);
      socket.userId = decoded.user_id;
      socket.business = decoded.current_business;
      socket.roleId = decoded.role_id;
      next();
    } catch {
      next(new Error("Invalid token"));
    }
  });

  io.on("connection", (socket) => {
    // Join personal room and business room
    socket.join(`user:${socket.userId}`);
    socket.join(`business:${socket.business}`);
    logger.debug(
      `Socket connected: user=${socket.userId} business=${socket.business}`,
    );

    // ── Presence ──────────────────────────────────────────
    // Announce online to the business room; last_seen_at is stamped on
    // disconnect so "last seen" survives restarts.
    socket.to(`business:${socket.business}`).emit("presence:online", {
      userId: socket.userId,
    });

    // Client asks "who's online?" — answered via ack with user ids.
    socket.on("presence:list", async (ack) => {
      if (typeof ack !== "function") return;
      try {
        const sockets = await io.fetchSockets();
        ack([...new Set(sockets.map((s) => s.userId).filter(Boolean))]);
      } catch {
        ack([]);
      }
    });

    // ── Channel rooms (typing indicators) ─────────────────
    // Joining is gated on membership so typing events never leak to
    // non-members.
    socket.on("channel:join", async (channelId) => {
      if (typeof channelId !== "string") return;
      try {
        const { pool } = require("./db");
        const { rows } = await pool.query(
          `SELECT 1 FROM shared.channel_members
           WHERE channel_id = $1 AND user_id = $2`,
          [channelId, socket.userId],
        );
        if (rows.length) socket.join(`channel:${channelId}`);
      } catch {
        /* invalid uuid or db hiccup — just don't join */
      }
    });

    socket.on("channel:leave", (channelId) => {
      if (typeof channelId === "string") {
        socket.leave(`channel:${channelId}`);
      }
    });

    socket.on("typing", ({ channelId } = {}) => {
      if (typeof channelId !== "string") return;
      // Membership was verified on channel:join — only relay typing
      // events for rooms this socket actually joined.
      if (!socket.rooms.has(`channel:${channelId}`)) return;
      socket.to(`channel:${channelId}`).emit("typing", {
        channelId,
        userId: socket.userId,
      });
    });

    socket.on("switch_business", (business) => {
      if (require("./businesses").isValidBusiness(business)) {
        socket.leave(`business:${socket.business}`);
        socket.business = business;
        socket.join(`business:${business}`);
      }
    });

    socket.on("disconnect", async () => {
      logger.debug(`Socket disconnected: user=${socket.userId}`);
      try {
        // Only mark offline when this was the user's last open socket.
        const remaining = await io.in(`user:${socket.userId}`).fetchSockets();
        if (remaining.length === 0) {
          const { pool } = require("./db");
          await pool.query(
            `UPDATE shared.users SET last_seen_at = now() WHERE user_id = $1`,
            [socket.userId],
          );
          io.to(`business:${socket.business}`).emit("presence:offline", {
            userId: socket.userId,
            lastSeenAt: new Date().toISOString(),
          });
        }
      } catch {
        /* presence is best-effort */
      }
    });
  });

  logger.info(
    `Socket.io initialised with ${adapter ? "Redis" : "in-memory"} adapter`,
  );
}

// ── Emit helpers ──────────────────────────────────────────
function emitToUser(userId, event, data) {
  io?.to(`user:${userId}`).emit(event, data);
}

function emitToBusiness(business, event, data) {
  io?.to(`business:${business}`).emit(event, data);
}

function emitToChannel(channelId, event, data) {
  io?.to(`channel:${channelId}`).emit(event, data);
}

function emitToAll(event, data) {
  io?.emit(event, data);
}

module.exports = { init, emitToUser, emitToBusiness, emitToChannel, emitToAll };
