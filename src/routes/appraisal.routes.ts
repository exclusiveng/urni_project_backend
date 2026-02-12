import { Router } from "express";
import { 
    createAppraisal, 
    getAllAppraisals, 
    getMyAppraisals, 
    getAppraisalsByUserId,
    addOwnerSignature
} from "../controllers/appraisal.controller";
import { protect } from "../middleware/auth.middleware";
import { requirePermission } from "../middleware/permission.middleware";
import { Permission } from "../entities/Permission";
import { uploadSignature } from "../middleware/upload.middleware";

const router = Router();

router.use(protect);

// Usually employees create self-appraisals or managers create them?
// Let's assume anyone can create a draft, or maybe only specific roles.
// For now, let's say create is open (it's often self-reflection).
// Or maybe it requires permission?
// Let's stick to restricting viewing others.

router.post("/", requirePermission(Permission.APPRAISAL_CREATE), createAppraisal);
router.get("/my-appraisals", getMyAppraisals);

// Manager view
router.get("/user/:userId", requirePermission(Permission.APPRAISAL_VIEW_ALL), getAppraisalsByUserId);
router.get("/", requirePermission(Permission.APPRAISAL_VIEW_ALL), getAllAppraisals);

// Add signature
router.patch("/:id/sign", uploadSignature.single("signature"), addOwnerSignature);

export default router;
