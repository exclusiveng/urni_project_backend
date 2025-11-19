import { Server as HttpServer } from "http";
import { Server, Socket } from "socket.io";

let io: Server;

export const initSocket = (httpServer: HttpServer) => {
  io = new Server(httpServer, {
    cors: {
      origin: process.env.CORS_ORIGIN || "*",
      methods: ["GET", "POST"],
      credentials: true
    }
  });

  io.on("connection", (socket: Socket) => {
    // When a user connects, they must provide their userId
    // Frontend Example: io("...", { query: { userId: "123" } })
    const userId = socket.handshake.query.userId as string;

    if (userId) {
      socket.join(userId);
      console.log(`🔌 User connected and joined room: ${userId}`);
    }

    socket.on("disconnect", () => {
      console.log(`🔌 User disconnected: ${socket.id}`);
    });
  });

  return io;
};

export const getIO = () => {
  if (!io) {
    throw new Error("Socket.io is not initialized!");
  }
  return io;
};