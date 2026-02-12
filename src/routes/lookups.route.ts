import express from "express";
import {
  getAttendanceStatuses,
  getBranches,
  getBranchLocations,
  getCompanies,
  getDepartments,
  getMe,
  getRoles,
  getTicketSeverities,
  getTicketStatuses,
  getUserById,
  getUsers,
} from "../controllers/lookups.controller"; // Assuming this file exists and exports these
import { protect } from "../middleware/auth.middleware";
// Removed unused imports: requirePermission, Permission

const router = express.Router();

router.use(protect);

// Protected endpoints returning only { id, name } etc.
// Generally open to all authenticated users for dropdowns/forms.

router.get("/departments", getDepartments);
router.get("/companies", getCompanies);
router.get("/branches", getBranches);
router.get("/branches/locations", getBranchLocations);
router.get("/users", getUsers);
router.get("/users/me", getMe);
router.get("/users/:id", getUserById);

// Enum/lookups
router.get("/roles", getRoles);
router.get("/ticket-severities", getTicketSeverities);
router.get("/ticket-statuses", getTicketStatuses);
router.get("/attendance-statuses", getAttendanceStatuses);

export default router;
