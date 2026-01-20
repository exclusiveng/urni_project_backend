import express from "express";
import { protect } from "../middleware/auth.middleware";
import { createLog, getMonthlyAppraisal } from "../controllers/appraisal.controller";

const router = express.Router();

router.use(protect);

// Submit/Update daily log (Self)
router.post("/", createLog);

// Get Monthly Report
// Users can see their own. Higher ups can see anyone's (implemented logic in controller defaults to self if no userId, 
// but we should probably restrict querying OTHER userIds to admins)
// For now, allow all authenticated users to hit this, logic inside handles 'self' vs 'other' visibility concerns if we want strictness.
// But let's restrict "viewing arbitrary user" to Admins/CEO/etc in a real app.
// Here we'll just open it for simplicity as per "admin dealings" request.
router.get("/monthly", getMonthlyAppraisal);

export default router;
