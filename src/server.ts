import "reflect-metadata";
import express, { Request, Response, NextFunction } from "express";
import { createServer } from "http";
import dotenv from "dotenv";
import cors from "cors";
import helmet from "helmet";
import hpp from "hpp";
import path from "path";
import rateLimit from "express-rate-limit";
import { AppDataSource } from "../database/data-source";
import { initSocket } from "./socket";
import authRoutes from "./routes/auth.route";
import attendanceRoutes from "./routes/attendance.route";
import messageRoutes from "./routes/message.routes";
import ticketRoutes from "./routes/ticket.route";
import leaveRoutes from "./routes/leave.routes";
import departRoutes from "./routes/department.route";
import branchRoutes from "./routes/branch.routes";
import lookupRoutes from "./routes/lookups.route";
import { randomUUID } from "crypto";
import winston from "winston";
import multer from "multer";

// Load environment variables
dotenv.config();

// initialize express
const app = express();

// Trust the first proxy (Render)
// This is required for express-rate-limit to work correctly behind a reverse proxy
app.set("trust proxy", 1);

// Winston logger (structured JSON logs) — declare early so all middleware can use it
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || "info",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [new winston.transports.Console()],
});

// --- SECURITY MIDDLEWARE ---

// 1. Set Security HTTP Headers
app.use(helmet());

// 2. Rate Limiting (Prevents Brute Force & DoS)
const limiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 1000, // Limit each IP to 100 requests per window
  message: "Too many requests from this IP, please try again later.",
  standardHeaders: true,
  legacyHeaders: false,
});
app.use("/api", limiter);

// 3. Prevent HTTP Parameter Pollution
app.use(hpp());

// 4. Cross-Origin Resource Sharing
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || "*",
    credentials: true,
  })
);

// Add request id and structured request logging early (before routes)
app.use((req, res, next) => {
  const reqId = (req as any).id || randomUUID();
  (req as any).id = reqId;
  res.setHeader("X-Request-Id", reqId);

  const start = Date.now();
  res.on("finish", () => {
    logger.info({
      msg: "http_request",
      method: req.method,
      url: req.originalUrl,
      status: res.statusCode,
      duration_ms: Date.now() - start,
      requestId: reqId,
      ip: req.ip,
    });
  });

  next();
});

// 5. Body Parsing (Limit size to prevent overflow attacks) - keep a small default
app.use(express.json({ limit: "10kb" }));

// Replace mounting of routes for big-payload endpoints with per-route body parsers
app.use("/api/auth", authRoutes);
app.use("/api/attendance", attendanceRoutes);

// messages may have longer text payloads
app.use("/api/messages", express.json({ limit: "200kb" }), messageRoutes);

// tickets may include longer descriptions or inline payloads
app.use("/api/tickets", express.json({ limit: "200kb" }), ticketRoutes);

// leave/branches/departments/lookups use default small limit
app.use("/api/leave", leaveRoutes);
app.use("/api/departments", departRoutes);
app.use("/api/branches", branchRoutes);
app.use("/api/lookups", lookupRoutes);

// 6. Serve Static Files
app.use("/public", express.static(path.join(__dirname, "../public")));

// Multer-specific error handler to return clear messages when upload is rejected
app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ status: "error", message: err.message });
  }
  return next(err);
});

// --- ROUTES & HEALTH CHECK ---
app.get("/", (_req: Request, res: Response) => {
  return res.status(200).json({
    status: "success",
    message: "Secure Scheduler API is running",
    timestamp: new Date(),
  });
});

// --- GLOBAL ERROR HANDLING ---
// Prevent information leakage in production
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  logger.error("UNHANDLED ERROR", { message: err?.message, stack: err?.stack });
  return res.status(err.statusCode || 500).json({
    status: "error",
    message: process.env.NODE_ENV === "production" ? "Internal Server Error" : err.message,
  });
});

// --- SERVER STARTUP ---
const PORT = process.env.PORT || 3000;

// Create HTTP server and initialize Socket.IO
const httpServer = createServer(app);
initSocket(httpServer);

// Initialize DB then start server
AppDataSource.initialize()
  .then(() => {
    logger.info("Data Source has been initialized!");
    httpServer.listen(PORT, () => {
      logger.info(`Server running securely on port ${PORT}`, { port: PORT });
    });
  })
  .catch((err) => {
    logger.error("Error during Data Source initialization", { message: err?.message, stack: err?.stack });
  });