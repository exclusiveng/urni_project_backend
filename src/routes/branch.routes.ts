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


router.get("/", getAllBranches); 
router.get("/:id", getBranchById);

// Manage branches
router.post("/", requirePermission(Permission.BRANCH_CREATE), createBranch);
router.patch("/:id", requirePermission(Permission.BRANCH_UPDATE), updateBranch);
router.delete("/:id", requirePermission(Permission.BRANCH_DELETE), deleteBranch);

export default router;