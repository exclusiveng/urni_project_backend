import { Router } from "express";
import { deleteUser, forgotPassword, login, register, updateUser, uploadUserSignature, promoteUser } from "../controllers/auth.controller";
import { uploadProfilePic, uploadSignature } from "../middleware/upload.middleware";
import { protect } from "../middleware/auth.middleware";
import { requirePermission } from "../middleware/permission.middleware";
import { Permission } from "../entities/Permission";

const router = Router();

// Public Routes
router.post("/register", uploadProfilePic.single("profile_pic"), register);
router.post("/login", login);
router.post("/forgot-password", forgotPassword);

// Protected Routes
router.use(protect);

router.post("/upload-signature", uploadSignature.single("signature"), uploadUserSignature);

// Update own profile or Admin updates user
// We can use a permission like USER_UPDATE.
// However, users should always be able to update themselves. 
// The controller handles "self or admin" check.
// So we just need to ensure they are logged in (protect).
// But for *promoting* or changing roles, we need high-level permission.
router.put("/update/:id", updateUser); 

// Delete user: self or admin. Controller handles logic.
router.delete("/:id", requirePermission(Permission.USER_DELETE), deleteUser);

// Promotion endpoint (New)
router.patch("/promote/:userId", requirePermission(Permission.USER_PROMOTE), promoteUser);

export default router;