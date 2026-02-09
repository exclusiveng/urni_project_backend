import { Router } from "express";
import { deleteUser, forgotPassword, login, register, updateUser, uploadUserSignature } from "../controllers/auth.controller";
import { uploadProfilePic, uploadSignature } from "../middleware/upload.middleware";
import { protect } from "../middleware/auth.middleware";
import { UserRole } from "../entities/User";
import { restrictTo } from "../middleware/auth.middleware";

const router = Router();

// Public Routes
router.post("/register", uploadProfilePic.single("profile_pic"), register);
router.post("/login", login);


router.use(protect);
router.post("/upload-signature", uploadSignature.single("signature"), uploadUserSignature); // Allow all auth users to upload their signature
router.delete("/:id", deleteUser); // Controller handles owner/admin logic

router.use(restrictTo(UserRole.CEO, UserRole.ME_QC, UserRole.ADMIN));
router.put("/update/:id", updateUser);
router.post("/forgot-password", forgotPassword);


export default router;