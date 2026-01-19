import { Router } from "express";
import { forgotPassword, login, register, updateUser } from "../controllers/auth.controller";
import { uploadProfilePic } from "../middleware/upload.middleware";
// import { protect } from "../middleware/auth.middleware";

const router = Router();

// Public Routes
router.post("/register", uploadProfilePic.single("profile_pic"), register);
router.post("/login", login);
router.put("/update/:id", updateUser);
router.post("/forgot-password", forgotPassword);


export default router;