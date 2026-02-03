import { Router } from "express";
import {
    createCompany,
    getAllCompanies,
    getCompanyById,
    updateCompany,
    deleteCompany,
    getCompanyEmployees
} from "../controllers/company.controller";
import { protect, restrictTo } from "../middleware/auth.middleware";
import { uploadCompanyLogo } from "../middleware/upload.middleware";
import { UserRole } from "../entities/User";

const router = Router();

// Protect all routes
router.use(protect);

// Authenticated: View companies
router.get("/", getAllCompanies);
router.get("/:id", getCompanyById);
router.get("/:id/employees", getCompanyEmployees);

// CEO/ME_QC: Create and update companies (with logo upload support)
router.post("/", restrictTo(UserRole.CEO, UserRole.ME_QC), uploadCompanyLogo.single("logo"), createCompany);
router.patch("/:id", restrictTo(UserRole.CEO, UserRole.ME_QC), uploadCompanyLogo.single("logo"), updateCompany);

// CEO Only: Delete company
router.delete("/:id", restrictTo(UserRole.CEO), deleteCompany);

export default router;
