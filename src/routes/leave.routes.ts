import { Router } from "express";
import { getMyRequests, getPendingApprovals, requestLeave, respondToLeave } from "../controllers/leave.controller";
import { protect } from "../middleware/auth.middleware";

const router = Router();

router.use(protect);

// Staff: Request leave
router.post("/", requestLeave);

// Staff: Get my leaves (History)
router.get("/", getMyRequests);

// Managers: See what I need to approve
router.get("/pending", getPendingApprovals);

// Managers: Approve/Reject
router.post("/:requestId/respond", respondToLeave);

export default router;