import { Router } from "express";
import {
  issueTicket,
  getTickets,
  getTicketById,
  respondToTicket,
  deleteTicket,
} from "../controllers/ticket.controller";
import { protect } from "../middleware/auth.middleware";
import { requirePermission } from "../middleware/permission.middleware";
import { Permission } from "../entities/Permission";

const router = Router();

router.use(protect);

router.post("/", issueTicket); // Any user can create (restricted logic inside controller)
// getTickets handles both "my tickets" and "admin all tickets"
router.get("/", requirePermission(Permission.TICKET_MANAGE), getTickets);
router.get("/my-tickets", getTickets); // Alias for now, or client can just use /?my=true if controller supported it, but controller uses role check.
// Actually, controller logic for getTickets checks role.
// If I want a separate route for "my tickets" for non-admins to avoid 403?
// The controller `getTickets` has two scenarios:
// A: CEO/MD -> See all.
// B: Staff -> See OWN tickets.
// So calling `getTickets` is safe for everyone.
// BUT `requirePermission(Permission.TICKET_MANAGE)` on `/` blocks staff!
// I should split the route or remove the middleware and let controller handle it.
// `getTickets` implementation is safe for all.

router.get("/all", requirePermission(Permission.TICKET_MANAGE), getTickets); // Explicit admin view
router.get("/my", getTickets); // General view (controller auto-scopes if not admin)

// Let's keep it simple:
router.get("/", getTickets); // Controller scopes it.

router.get("/:id", getTicketById);

// Management
router.patch("/:ticketId/respond", respondToTicket); // Logic inside checks permissions (Target vs Admin)
router.delete(
  "/:ticketId",
  requirePermission(Permission.TICKET_DELETE),
  deleteTicket,
);

export default router;
