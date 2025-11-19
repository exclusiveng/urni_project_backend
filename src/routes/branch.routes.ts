import { Router } from "express";
import { 
    createBranch, 
    getAllBranches, 
    getBranchById, 
    updateBranch,
    deleteBranch
} from "../controllers/branch.controller";
import { protect, restrictTo } from "../middleware/auth.middleware";
import { UserRole } from "../entities/User";

const router = Router();

// Protect all routes
router.use(protect);

// Public (Authenticated): View branches
router.get("/", getAllBranches);
router.get("/:id", getBranchById);

// Admin Only: Create, Update, Delete branches
router.use(restrictTo(UserRole.CEO, UserRole.ME_QC));

router.post("/", createBranch);
router.patch("/:id", updateBranch);
router.delete("/:id", deleteBranch);

export default router;