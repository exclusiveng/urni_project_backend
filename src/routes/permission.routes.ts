import { Router } from "express";
import {
  addPermissionToUser,
  removePermissionFromUser,
  getUserPermissions,
  listAllSystemPermissions
} from "../controllers/permission.controller";
import { protect } from "../middleware/auth.middleware";
import { requirePermission } from "../middleware/permission.middleware";
import { Permission } from "../entities/Permission";

const router = Router();

router.use(protect);

// View all available permissions
router.get("/system", listAllSystemPermissions);

// View a user's permissions
// Allowed if you have USER_UPDATE or USER_MANAGE_PERMISSIONS
router.get("/:userId", requirePermission(Permission.USER_VIEW_ALL, Permission.USER_UPDATE, Permission.USER_MANAGE_PERMISSIONS), getUserPermissions);

// Manage permissions (Super Admin / CEO logic typically)
router.patch("/:userId/add", requirePermission(Permission.USER_MANAGE_PERMISSIONS), addPermissionToUser);
router.patch("/:userId/remove", requirePermission(Permission.USER_MANAGE_PERMISSIONS), removePermissionFromUser);

export default router;
