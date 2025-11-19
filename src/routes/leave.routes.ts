import { Router } from "express";
import { requestLeave, respondToLeave, getPendingApprovals } from "../controllers/leave.controller";
import { protect } from "../middleware/auth.middleware";

const router = Router();

router.use(protect);

// Staff: Request leave
router.post("/", requestLeave);

// Managers: See what I need to approve
router.get("/pending", getPendingApprovals);

// Managers: Approve/Reject
router.put("/:requestId/respond", respondToLeave);

export default router;