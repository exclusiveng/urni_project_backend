import { Router } from "express";
import { getMyRequests, getPendingApprovals, getUserRequests, requestLeave, respondToLeave } from "../controllers/leave.controller";
import { protect } from "../middleware/auth.middleware";

const router = Router();

router.use(protect);

// Staff: Request leave
router.post("/", requestLeave);

// Staff: Get my leaves (History)
router.get("/", getMyRequests);

// Managers: See what I need to approve
router.get("/pending", getPendingApprovals);

// Admin: Get specific user's leaves
router.get("/user/:userId", getUserRequests);

// Managers: Approve/Reject
router.post("/:requestId/respond", respondToLeave);

export default router;