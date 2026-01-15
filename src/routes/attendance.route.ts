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
import { UserRole } from "../entities/User";
import { protect, restrictTo } from "../middleware/auth.middleware";

const router = Router();

// All routes require login
router.use(protect);

// User attendance actions
router.post("/clock-in", clockIn);
router.post("/clock-out", clockOut);
router.get("/status", getAttendanceStatus);

// Get all branches (available to all authenticated users)
router.get("/branches", getAllBranches);

// User's own attendance metrics
router.get("/my-metrics", getMyAttendanceMetrics);

// Admin routes
router.post("/branches", restrictTo(UserRole.ME_QC, UserRole.CEO, UserRole.ADMIN), createBranch);

// Admin/ME_QC: Get attendance metrics (with filters)
router.get("/metrics", restrictTo(UserRole.ME_QC, UserRole.CEO, UserRole.ADMIN), getAttendanceMetrics);

// Admin/ME_QC: Get daily, weekly, and monthly metrics
router.get("/metrics/daily", restrictTo(UserRole.ME_QC, UserRole.CEO, UserRole.ADMIN), getDailyMetrics);
router.get("/metrics/weekly", restrictTo(UserRole.ME_QC, UserRole.CEO, UserRole.ADMIN), getWeeklyMetrics);
router.get("/metrics/monthly", restrictTo(UserRole.ME_QC, UserRole.CEO, UserRole.ADMIN), getMonthlyMetrics);

export default router;