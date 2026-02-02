import { Router } from "express";
import { forgotPassword, login, register, updateUser } from "../controllers/auth.controller";
import { uploadProfilePic } from "../middleware/upload.middleware";
import { protect } from "../middleware/auth.middleware";
import { UserRole } from "src/entities/User";
import { restrictTo } from "../middleware/auth.middleware";

const router = Router();

// Public Routes
router.post("/register", uploadProfilePic.single("profile_pic"), register);
router.post("/login", login);


router.use(protect);
router.use(restrictTo(UserRole.CEO, UserRole.ME_QC, UserRole.ADMIN));
router.put("/update/:id", updateUser);
router.post("/forgot-password", forgotPassword);


export default router;