import { Router } from "express";
import {
    createCompany,
    getAllCompanies,
    getCompanyById,
    updateCompany,
    deleteCompany,
    getCompanyEmployees
} from "../controllers/company.controller";
import { protect } from "../middleware/auth.middleware";
import { requirePermission } from "../middleware/permission.middleware";
import { Permission } from "../entities/Permission";
import { uploadCompanyLogo } from "../middleware/upload.middleware";

const router = Router();

router.use(protect);

// View companies - (MD sees branch-scoped, others might see all or none depending on logic)
// Let's require basic view permission
router.get("/", requirePermission(Permission.COMPANY_VIEW_ALL), getAllCompanies);
router.get("/:id", requirePermission(Permission.COMPANY_VIEW_ALL), getCompanyById);
router.get("/:id/employees", requirePermission(Permission.COMPANY_VIEW_ALL), getCompanyEmployees);

// Create/Update/Delete - restricted permissions
router.post("/", requirePermission(Permission.COMPANY_CREATE), uploadCompanyLogo.single("logo"), createCompany);
router.patch("/:id", requirePermission(Permission.COMPANY_UPDATE), uploadCompanyLogo.single("logo"), updateCompany);
router.delete("/:id", requirePermission(Permission.COMPANY_DELETE), deleteCompany);

export default router;
