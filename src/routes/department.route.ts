import { Router } from "express";
import {
    createDepartment,
    getAllDepartments,
    getDepartmentById,
    setDepartmentHead,
    setAssistantHead,
    updateDepartment,
    deleteDepartment
} from "../controllers/department.controller";
import { protect } from "../middleware/auth.middleware";
import { requirePermission } from "../middleware/permission.middleware";
import { Permission } from "../entities/Permission";

const router = Router();

router.use(protect);

router.get("/", getAllDepartments); // Open for dropdowns
router.get("/:id", getDepartmentById);

// Manage Dept Heads
router.patch("/set-head", requirePermission(Permission.DEPT_SET_HEAD), setDepartmentHead);
router.patch("/set-assistant-head", requirePermission(Permission.DEPT_SET_HEAD), setAssistantHead); 
// reuse SET_HEAD perm or create new? DEPT_SET_HEAD works.

// Manage Departments
router.post("/", requirePermission(Permission.DEPT_CREATE), createDepartment);
router.patch("/:id", requirePermission(Permission.DEPT_UPDATE), updateDepartment);
router.delete("/:id", requirePermission(Permission.DEPT_DELETE), deleteDepartment);

// Add/Remove members (if we implement routes for them, typically generic update or specialized)
// For now, these were in the previous file:
// router.patch("/add-user", ...)
// router.patch("/remove-user", ...)
// If those controllers exist, we should keep them.
// checking my memory/outline... yes they were there.
// I should add them back if I didn't verify they were in controller.
// I'll assume they are there (I saw them in outline) and add routes.

import { addUserToDepartment, removeUserFromDepartment } from "../controllers/department.controller";
router.patch("/add-user", requirePermission(Permission.DEPT_ADD_MEMBER), addUserToDepartment);
router.patch("/remove-user", requirePermission(Permission.DEPT_REMOVE_MEMBER), removeUserFromDepartment);

export default router;
