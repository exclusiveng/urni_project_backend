import { Router } from "express";
import {
  clockIn,
  clockOut,
  createBranch,
  getAllBranches,
  getAttendanceMetrics,
  getAttendanceStatus,
  getDailyMetrics,
  getMonthlyMetrics,
  getMyAttendanceMetrics,
  getWeeklyMetrics
} from "../controllers/attendance.controller";
import { protect } from "../middleware/auth.middleware";
import { requirePermission } from "../middleware/permission.middleware";
import { Permission } from "../entities/Permission";

const router = Router();

// Apply auth middleware
router.use(protect);

// --- User Actions ---
router.post("/clock-in", clockIn);
router.post("/clock-out", clockOut);
router.get("/status", getAttendanceStatus);
router.get("/my-metrics", getMyAttendanceMetrics);

// --- Branch Management (often overlapping with Branch routes) ---
// If the attendance controller has createBranch logic, we gate it:
router.post("/branches", requirePermission(Permission.BRANCH_CREATE), createBranch);
router.get("/branches", getAllBranches); 

// --- Metrics & Reporting (Managerial) ---
router.get("/metrics", requirePermission(Permission.ATTENDANCE_METRICS), getAttendanceMetrics);
router.get("/metrics/daily", requirePermission(Permission.ATTENDANCE_METRICS), getDailyMetrics);
router.get("/metrics/weekly", requirePermission(Permission.ATTENDANCE_METRICS), getWeeklyMetrics);
router.get("/metrics/monthly", requirePermission(Permission.ATTENDANCE_METRICS), getMonthlyMetrics);

export default router;