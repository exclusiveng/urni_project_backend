import { Router } from "express";
import { clockIn, clockOut, createBranch } from "../controllers/attendance.controller";
import { protect, restrictTo } from "../middleware/auth.middleware";
import { UserRole } from "../entities/User";

const router = Router();

// All routes require login
router.use(protect);

router.post("/clock-in", clockIn);
router.post("/clock-out", clockOut);

// Admin only: Manage Branches
router.post("/branches", restrictTo(UserRole.SUPERADMIN, UserRole.CEO), createBranch);

export default router;