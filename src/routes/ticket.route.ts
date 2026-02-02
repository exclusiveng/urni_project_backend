import { Router } from "express";
import { issueTicket, respondToTicket, getTickets, deleteTicket } from "../controllers/ticket.controller";
import { protect } from "../middleware/auth.middleware";

const router = Router();

router.use(protect);

// List tickets (Context aware: Managers see all, Staff see theirs)
router.get("/", getTickets);

// Create a ticket (Manager -> Staff OR Whistleblowing)
router.post("/", issueTicket);

// Respond (Acknowledge / Contest)
router.put("/:ticketId/respond", respondToTicket);

router.delete("/:ticketId", deleteTicket);

export default router