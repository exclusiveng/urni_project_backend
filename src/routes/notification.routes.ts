import { Router } from "express";
import {
  getNotifications,
  markNotificationRead,
  markAllAsRead,
  sendBroadcastNotification,
} from "../controllers/notification.controller";
import { protect } from "../middleware/auth.middleware";
import { requirePermission } from "../middleware/permission.middleware";
import { Permission } from "../entities/Permission";

const router = Router();

router.use(protect);

router.get("/", getNotifications); // Own notifications
router.patch("/:id/read", markNotificationRead);
router.patch("/read-all", markAllAsRead);

// Admin broadcast
router.post(
  "/broadcast",
  requirePermission(Permission.NOTIFICATION_BROADCAST),
  sendBroadcastNotification,
);

export default router;
