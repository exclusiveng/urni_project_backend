import { Router } from "express";
import express from "express";
import {
  deleteUser,
  forgotPassword,
  showResetForm,
  resetPassword,
  login,
  register,
  updateUser,
  uploadUserSignature,
  promoteUser,
} from "../controllers/auth.controller";
import {
  uploadProfilePic,
  uploadSignature,
} from "../middleware/upload.middleware";
import { protect } from "../middleware/auth.middleware";
import { requirePermission } from "../middleware/permission.middleware";
import { Permission } from "../entities/Permission";

const router = Router();

// Public Routes
router.post("/register", uploadProfilePic.single("profile_pic"), register);
router.post("/login", login);

// Backend-rendered password reset flow
router.get("/reset-password", showResetForm);
router.post(
  "/reset-password",
  express.urlencoded({ extended: false }),
  resetPassword,
);

// Protected Routes
router.use(protect);

router.post("/forgot-password", forgotPassword);

router.post(
  "/upload-signature",
  uploadSignature.single("signature"),
  uploadUserSignature,
);

// Self-update or users with USER_UPDATE permission (controller enforces the check)
router.put("/update/:id", updateUser);

// Delete user: self or admin. Controller handles logic.
router.delete("/:id", requirePermission(Permission.USER_DELETE), deleteUser);

// Promotion endpoint (New)
router.patch(
  "/promote/:userId",
  requirePermission(Permission.USER_PROMOTE),
  promoteUser,
);

export default router;
