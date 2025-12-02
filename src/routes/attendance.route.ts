import { Router } from "express";
import { 
  clockIn, 
  clockOut, 
  createBranch, 
  getAllBranches,
  getMyAttendanceMetrics,
  getAttendanceMetrics
} from "../controllers/attendance.controller";
import { protect, restrictTo } from "../middleware/auth.middleware";
import { UserRole } from "../entities/User";

const router = Router();

// All routes require login
router.use(protect);

// User attendance actions
router.post("/clock-in", clockIn);
router.post("/clock-out", clockOut);

// Get all branches (available to all authenticated users)
router.get("/branches", getAllBranches);

// User's own attendance metrics
router.get("/my-metrics", getMyAttendanceMetrics);

// Admin routes
router.post("/branches", restrictTo(UserRole.ME_QC, UserRole.CEO, UserRole.ADMIN), createBranch);

// Admin: Get attendance metrics (with filters)
router.get("/metrics", restrictTo(UserRole.ME_QC, UserRole.CEO, UserRole.ADMIN, UserRole.DEPARTMENT_HEAD), getAttendanceMetrics);

export default router;