import express from "express";
import {
  getAttendanceStatuses,
  getBranches,
  getBranchLocations,
  getDepartments,
  getMe,
  getRoles,
  getTicketSeverities,
  getTicketStatuses,
  getUserById,
  getUsers,
} from "../controllers/lookups.controller";
import { protect } from "../middleware/auth.middleware";



const router = express.Router();


router.use(protect); // Protect all routes below
// Protected endpoints returning only { id, name } (or similar) and paginated where applicable.
// Query params: ?page=1&limit=10&q=search
router.get("/departments", getDepartments);
router.get("/branches", getBranches);
router.get("/branches/locations", getBranchLocations); // Optimized for geofencing/caching
router.get("/users", getUsers);
router.get("/users/me", getMe);
router.get("/users/:id", getUserById);

// Enum/lookups
router.get("/roles", getRoles);
router.get("/ticket-severities", getTicketSeverities);
router.get("/ticket-statuses", getTicketStatuses);
router.get("/attendance-statuses", getAttendanceStatuses);

export default router;