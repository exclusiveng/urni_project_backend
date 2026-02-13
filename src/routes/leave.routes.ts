import { Router } from "express";
import {
  requestLeave,
  respondToLeave,
  getPendingApprovals,
  getMyRequests,
  getAllRequests,
} from "../controllers/leave.controller";
import { protect } from "../middleware/auth.middleware";
import { requirePermission } from "../middleware/permission.middleware";
import { Permission } from "../entities/Permission";

const router = Router();

router.use(protect);

router.post("/request", requestLeave as any);
router.get("/my-requests", getMyRequests as any);
router.get("/pending", getPendingApprovals as any);

// Respond (Approve/Reject)
router.patch(
  "/:id/respond",
  requirePermission(Permission.LEAVE_APPROVE),
  respondToLeave as any,
);

// Admin view all
router.get(
  "/all",
  requirePermission(Permission.LEAVE_VIEW_ALL),
  getAllRequests as any,
);

export default router;
