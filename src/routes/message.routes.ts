import { Router } from "express";
import {
  sendMessage,
  getMessages,
  getConversation,
  getInbox,
  markMessageAsRead,
} from "../controllers/message.controller";
import { protect } from "../middleware/auth.middleware";

const router = Router();

router.use(protect);

// Messaging is usually open to all staff
router.post("/", sendMessage);
router.get("/", getMessages); // Was getMyMessages, changed to getMessages which handles logic
router.get("/inbox", getInbox); // New route
router.get("/conversation/:userId", getConversation);
router.patch("/:id/read", markMessageAsRead);

export default router;
