"use strict";

const { Server } = require("socket.io");
const { createAdapter } = require("@socket.io/redis-adapter");
const { createClient } = require("redis");
const jwt = require("jsonwebtoken");
const config = require("./config");
const logger = require("./logger");

let io;

async function init(httpServer) {
  const pubClient = createClient({ url: config.redis.url });
  const subClient = pubClient.duplicate();
  await Promise.all([pubClient.connect(), subClient.connect()]);

  io = new Server(httpServer, {
    cors: { origin: config.app.allowedOrigins, credentials: true },
    adapter: createAdapter(pubClient, subClient),
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

    socket.on("switch_business", (business) => {
      if (require("./businesses").isValidBusiness(business)) {
        socket.leave(`business:${socket.business}`);
        socket.business = business;
        socket.join(`business:${business}`);
      }
    });

    socket.on("disconnect", () => {
      logger.debug(`Socket disconnected: user=${socket.userId}`);
    });
  });

  logger.info("Socket.io initialised with Redis adapter");
}

// ── Emit helpers ──────────────────────────────────────────
function emitToUser(userId, event, data) {
  io?.to(`user:${userId}`).emit(event, data);
}

function emitToBusiness(business, event, data) {
  io?.to(`business:${business}`).emit(event, data);
}

function emitToAll(event, data) {
  io?.emit(event, data);
}

module.exports = { init, emitToUser, emitToBusiness, emitToAll };
