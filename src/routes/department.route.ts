import { Router } from "express";
import { createDepartment, getAllDepartments, getDepartmentById } from "../controllers/department.controller";
import { protect, restrictTo } from "../middleware/auth.middleware";
import { UserRole } from "../entities/User";

const router = Router();

// Protect all routes
router.use(protect);

// Public (Authenticated): View departments
router.get("/", getAllDepartments);
router.get("/:id", getDepartmentById);

// Admin Only: Create departments
router.post("/", restrictTo(UserRole.CEO, UserRole.ADMIN, UserRole.ME_QC), createDepartment);

export default router;