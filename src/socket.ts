import { Server as HTTPServer } from "http";
import { Server as IOServer, Socket } from "socket.io";
import jwt from "jsonwebtoken";
import { AppDataSource } from "../database/data-source";
import { User } from "./entities/User";

let io: IOServer | null = null;

/**
 * Initialize Socket.IO with JWT handshake authentication.
 * Clients must connect with: io(url, { auth: { token: "Bearer <jwt>" } })
 * After verification the socket will join a room named `user_<id>`.
 */
export const initSocket = (httpServer: HTTPServer) => {
  io = new IOServer(httpServer, {
    cors: {
      origin: process.env.CORS_ORIGIN || "*",
      methods: ["GET", "POST"],
      credentials: true,
    },
  });

  // Auth middleware for all incoming socket connections
  io.use(async (socket: Socket, next) => {
    try {
      const tokenRaw = socket.handshake.auth?.token as string | undefined;
      if (!tokenRaw) return next(new Error("Authentication error: token required"));

      // Accept tokens with or without Bearer prefix
      const token = tokenRaw.startsWith("Bearer ") ? tokenRaw.split(" ")[1] : tokenRaw;

      if (!process.env.JWT_SECRET) {
        console.error("JWT_SECRET not configured");
        return next(new Error("Server configuration error"));
      }

      let payload: any;
      try {
        payload = jwt.verify(token, process.env.JWT_SECRET);
      } catch (err) {
        return next(new Error("Authentication error: invalid token"));
      }

      const userId = payload?.id;
      if (!userId) return next(new Error("Authentication error: invalid token payload"));

      // Ensure DB is ready
      if (!(AppDataSource as any).isInitialized) {
        console.error("AppDataSource not initialized yet");
        return next(new Error("Server not ready"));
      }

      const userRepo = AppDataSource.getRepository(User);
      const user = await userRepo.findOne({ where: { id: userId } });
      if (!user) return next(new Error("Authentication error: user not found"));

      // Attach minimal user info to socket.data and join a room for direct messages/notifications
      socket.data.user = { id: user.id, name: user.name, role: (user as any).role };
      socket.join(`user_${user.id}`);

      return next();
    } catch (err) {
      console.error("Socket auth middleware error:", err);
      return next(new Error("Authentication error"));
    }
  });

  io.on("connection", (socket: Socket) => {
    console.log(`Socket connected: ${socket.id} (user=${socket.data?.user?.id || "unknown"})`);

    socket.on("disconnect", (reason) => {
      console.log(`Socket disconnected: ${socket.id} reason=${reason}`);
    });

    // Example: handle a ping event
    socket.on("ping", (cb: (ack: string) => void) => {
      if (typeof cb === "function") cb("pong");
    });
  });
};

export const getIO = (): IOServer => {
  if (!io) throw new Error("Socket.IO not initialized");
  return io;
};