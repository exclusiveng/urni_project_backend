import express from "express";
import {
  getDepartments,
  getBranches,
  getUsers,
  getRoles,
  getTicketSeverities,
  getTicketStatuses,
  getAttendanceStatuses,
} from "../controllers/lookups.controller";
import { protect } from "../middleware/auth.middleware";



const router = express.Router();


router.use(protect); // Protect all routes below
// Protected endpoints returning only { id, name } (or similar) and paginated where applicable.
// Query params: ?page=1&limit=10&q=search
router.get("/departments",  getDepartments);
router.get("/branches",  getBranches);
router.get("/users",  getUsers);

// Enum/lookups
router.get("/roles",  getRoles);
router.get("/ticket-severities",  getTicketSeverities);
router.get("/ticket-statuses",  getTicketStatuses);
router.get("/attendance-statuses",  getAttendanceStatuses);

export default router;