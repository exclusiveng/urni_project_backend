import { Router } from "express";
import { getNotifications, markNotificationRead } from "../controllers/notification.controller";
import { protect } from "../middleware/auth.middleware";

const router = Router();

router.use(protect);

router.get("/", getNotifications);
router.patch("/:id/read", markNotificationRead);

export default router;
