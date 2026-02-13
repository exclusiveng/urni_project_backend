import { Router } from "express";
import {
  createDepartment,
  getAllDepartments,
  getDepartmentById,
  setDepartmentHead,
  setAssistantHead,
  updateDepartment,
  deleteDepartment,
  addUserToDepartment,
  removeUserFromDepartment
} from "../controllers/department.controller";
import { protect } from "../middleware/auth.middleware";
import { requirePermission } from "../middleware/permission.middleware";
import { Permission } from "../entities/Permission";

const router = Router();

router.use(protect);

// 1. Specific Actions (Place BEFORE parameterized routes like /:id)
router.patch(
  "/set-head",
  requirePermission(Permission.DEPT_SET_HEAD),
  setDepartmentHead,
);
router.patch(
  "/set-assistant-head",
  requirePermission(Permission.DEPT_SET_HEAD),
  setAssistantHead,
);
router.patch(
  "/add-user",
  requirePermission(Permission.DEPT_ADD_MEMBER),
  addUserToDepartment,
);
router.patch(
  "/remove-user",
  requirePermission(Permission.DEPT_REMOVE_MEMBER),
  removeUserFromDepartment,
);

// 2. Resource Collection
router.get("/", getAllDepartments);

// 3. Resource Instance (Parameterized)
router.get("/:id", getDepartmentById);
router.post("/", requirePermission(Permission.DEPT_CREATE), createDepartment);
router.patch(
  "/:id",
  requirePermission(Permission.DEPT_UPDATE),
  updateDepartment,
);
router.delete(
  "/:id",
  requirePermission(Permission.DEPT_DELETE),
  deleteDepartment,
);

export default router;
