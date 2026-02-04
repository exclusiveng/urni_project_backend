import { Router } from "express";
import {
    createDepartment,
    getAllDepartments,
    getDepartmentById,
    setDepartmentHead,
    removeDepartmentHead,
    addUserToDepartment,
    removeUserFromDepartment,
    updateDepartment,
    deleteDepartment
} from "../controllers/department.controller";
import { protect, restrictTo } from "../middleware/auth.middleware";
import { UserRole } from "../entities/User";

const router = Router();

// Protect all routes
router.use(protect);

// Public (Authenticated): View departments
router.get("/", getAllDepartments);

// Admin Only: Manage department heads (must come before /:id routes)
router.patch("/set-head", restrictTo(UserRole.CEO, UserRole.ME_QC), setDepartmentHead);
router.patch("/remove-head", restrictTo(UserRole.CEO, UserRole.ME_QC), removeDepartmentHead);

// Admin Only: Manage department members (must come before /:id routes)
router.patch("/add-user", restrictTo(UserRole.CEO, UserRole.ME_QC, UserRole.DEPARTMENT_HEAD, UserRole.ADMIN), addUserToDepartment);
router.patch("/remove-user", restrictTo(UserRole.CEO, UserRole.ME_QC, UserRole.DEPARTMENT_HEAD, UserRole.ADMIN), removeUserFromDepartment);

// Parametric routes (must come after specific routes)
router.get("/:id", getDepartmentById);
router.patch("/:id", restrictTo(UserRole.CEO, UserRole.ME_QC), updateDepartment);
router.delete("/:id", restrictTo(UserRole.CEO, UserRole.ME_QC), deleteDepartment);

// Admin Only: Create
router.post("/", restrictTo(UserRole.CEO, UserRole.ME_QC), createDepartment);

export default router;
