import { Router } from "express";
import { 
    createBranch, 
    getAllBranches, 
    getBranchById, 
    updateBranch,
    deleteBranch
} from "../controllers/branch.controller";
import { protect } from "../middleware/auth.middleware";
import { requirePermission } from "../middleware/permission.middleware";
import { Permission } from "../entities/Permission";

const router = Router();

router.use(protect);

// View branches - usually needed for dropdowns, so maybe open to all auth users?
// Or we can require a basic permission. Let's stick to no specific permission for reading lists
// if we want general staff to pick a branch?
// Actually, `getAllBranches` is often public-ish for authenticated users.
router.get("/", getAllBranches); 
router.get("/:id", getBranchById);

// Manage branches
router.post("/", requirePermission(Permission.BRANCH_CREATE), createBranch);
router.patch("/:id", requirePermission(Permission.BRANCH_UPDATE), updateBranch);
router.delete("/:id", requirePermission(Permission.BRANCH_DELETE), deleteBranch);

export default router;