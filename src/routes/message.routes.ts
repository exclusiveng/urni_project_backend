import { Router } from "express";
import { sendMessage, getMessages, getInbox } from "../controllers/message.controller";
import { protect } from "../middleware/auth.middleware";

const router = Router();

router.use(protect);

// 1. Send a message
router.post("/", sendMessage);

// 2. Get list of people I have chatted with
router.get("/inbox", getInbox);

// 3. Get specific conversation (CEO can use this to audit specific users)
// Usage: /api/messages/history/USER_ID_OF_OTHER_PERSON
router.get("/history/:contactId?", getMessages);

export default router;