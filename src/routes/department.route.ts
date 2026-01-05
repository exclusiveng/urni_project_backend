import { Router } from "express";
import { createDepartment, getAllDepartments, getDepartmentById, setDepartmentHead, removeDepartmentHead, addUserToDepartment, removeUserFromDepartment } from "../controllers/department.controller";
import { protect, restrictTo } from "../middleware/auth.middleware";
import { UserRole } from "../entities/User";

const router = Router();

// Protect all routes
router.use(protect);

// Public (Authenticated): View departments
router.get("/", getAllDepartments);
router.get("/:id", getDepartmentById);

// Admin Only: Create departments
router.post("/", restrictTo(UserRole.CEO, UserRole.ME_QC), createDepartment);

// Admin Only: Manage department heads
router.patch("/set-head", restrictTo(UserRole.CEO, UserRole.ME_QC), setDepartmentHead);
router.patch("/remove-head", restrictTo(UserRole.CEO, UserRole.ME_QC), removeDepartmentHead);

// Admin Only: Manage department members
router.patch("/add-user", restrictTo(UserRole.CEO, UserRole.ME_QC, UserRole.DEPARTMENT_HEAD, UserRole.ADMIN), addUserToDepartment);
router.patch("/remove-user", restrictTo(UserRole.CEO, UserRole.ME_QC, UserRole.DEPARTMENT_HEAD, UserRole.ADMIN), removeUserFromDepartment);

export default router;