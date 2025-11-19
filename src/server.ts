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

// Load environment variables
dotenv.config();

const app = express();

// --- SECURITY MIDDLEWARE ---

// 1. Set Security HTTP Headers
app.use(helmet());

// 2. Rate Limiting (Prevents Brute Force & DoS)
const limiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 100, // Limit each IP to 100 requests per window
  message: "Too many requests from this IP, please try again later.",
  standardHeaders: true,
  legacyHeaders: false,
});
app.use("/api", limiter);

// 3. Prevent HTTP Parameter Pollution
app.use(hpp());

// 4. Cross-Origin Resource Sharing
// In production, replace '*' with specific frontend domains
app.use(cors({
    origin: process.env.CORS_ORIGIN || "*", 
    credentials: true 
}));

// 5. Body Parsing (Limit size to prevent overflow attacks)
app.use(express.json({ limit: "10kb" }));

// 6. Serve Static Files
app.use("/public", express.static(path.join(__dirname, "../public")));


// --- ROUTES & HEALTH CHECK ---
app.get("/", (_req: Request, res: Response) => {
  res.status(200).json({ 
    status: "success", 
    message: "Secure Scheduler API is running",
    timestamp: new Date()
  });
});

// --- GLOBAL ERROR HANDLING ---
// Prevent information leakage in production
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  console.error("UNHANDLED ERROR:", err);
  res.status(err.statusCode || 500).json({
    status: "error",
    message: process.env.NODE_ENV === "production" ? "Internal Server Error" : err.message,
  });
});

app.use("/api/auth", authRoutes);
app.use("/api/attendance", attendanceRoutes);
app.use("/api/messages", messageRoutes);
app.use("/api/tickets", ticketRoutes);
app.use ("api/leave", leaveRoutes);
app.use("/api/departments", departRoutes);
app.use("/api/branches", branchRoutes);

// --- SERVER STARTUP ---
const PORT = process.env.PORT || 3000;

// Create HTTP server and initialize Socket.IO
const httpServer = createServer(app);
initSocket(httpServer);

AppDataSource.initialize()
  .then(() => {
    console.log("Data Source has been initialized!");
    httpServer.listen(PORT, () => {
      console.log(`Server running securely on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error("Error during Data Source initialization:", err);
  });