import { Request, Response } from "express";
import { AppDataSource } from "../../database/data-source";
import { Company } from "../entities/Company";
import { Department } from "../entities/Department";
import { User } from "../entities/User";
import { AuthRequest } from "../middleware/auth.middleware";
import { NotificationService } from "../services/notification.service";

const companyRepo = AppDataSource.getRepository(Company);
const deptRepo = AppDataSource.getRepository(Department);
const userRepo = AppDataSource.getRepository(User);

/**
 * Generates an abbreviation from a company name
 * e.g., "Triune Built Tech Solutions" -> "TBTS"
 * @param name Company name
 * @returns Uppercase abbreviation
 */
export function generateAbbreviation(name: string): string {
    const words = name.trim().split(/\s+/);
    if (words.length === 1) {
        // Single word: take first 3 characters
        return words[0].substring(0, 3).toUpperCase();
    }
    // Multiple words: take first letter of each word
    return words.map(word => word[0]).join("").toUpperCase();
}

// 1. Create a Company (CEO/ME_QC Only)
export const createCompany = async (req: Request, res: Response): Promise<Response | void> => {
    try {
        const { name, abbreviation, address } = req.body;

        if (!name) {
            return res.status(400).json({ message: "Company name is required" });
        }

        // Generate abbreviation if not provided
        const finalAbbreviation = abbreviation || generateAbbreviation(name);

        // Check for existing company with same name
        const existingName = await companyRepo.findOne({ where: { name } });
        if (existingName) {
            return res.status(400).json({ message: "A company with this name already exists" });
        }

        // Check for existing company with same abbreviation
        const existingAbbr = await companyRepo.findOne({ where: { abbreviation: finalAbbreviation } });
        if (existingAbbr) {
            return res.status(400).json({ message: `A company with abbreviation '${finalAbbreviation}' already exists. Please provide a unique abbreviation.` });
        }

        // Handle logo file upload
        let logo_url: string | undefined = undefined;
        if (req.file) {
            const imagePath = req.file.path.replace(/\\/g, "/");
            logo_url = `${req.protocol}://${req.get("host")}/${imagePath}`;
        }

        const company = companyRepo.create({
            name,
            abbreviation: finalAbbreviation,
            address,
            logo_url
        });
        await companyRepo.save(company);

        // Notify admins
        await NotificationService.notifyAdmins(
            req,
            "New Company Created",
            `Company '${company.name}' (${company.abbreviation}) has been created by ${(req as any).user?.name || 'an admin'}.`,
            { companyId: company.id }
        );

        res.status(201).json({ status: "success", data: company });
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

// 2. Get All Companies (Paginated)
export const getAllCompanies = async (req: Request, res: Response) => {
    try {
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 10;
        const skip = (page - 1) * limit;

        const [companies, total] = await companyRepo.findAndCount({
            order: { name: "ASC" },
            take: limit,
            skip: skip,
        });

        res.status(200).json({
            status: "success",
            count: companies.length,
            total,
            currentPage: page,
            totalPages: Math.ceil(total / limit),
            data: companies,
        });
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

// 3. Get Company by ID (with departments)
export const getCompanyById = async (req: Request, res: Response): Promise<Response | void> => {
    try {
        const { id } = req.params;
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 10;
        const skip = (page - 1) * limit;

        // Find the company
        const company = await companyRepo.findOne({ where: { id } });
        if (!company) {
            return res.status(404).json({ message: "Company not found" });
        }

        // Get paginated departments
        const [departments, totalDepts] = await deptRepo.findAndCount({
            where: { company_id: id },
            relations: ["head"],
            order: { name: "ASC" },
            take: limit,
            skip: skip,
        });

        // Get employee count
        const employeeCount = await userRepo.count({ where: { company_id: id } });

        res.status(200).json({
            status: "success",
            data: {
                ...company,
                employeeCount,
                departments: {
                    count: departments.length,
                    total: totalDepts,
                    currentPage: page,
                    totalPages: Math.ceil(totalDepts / limit),
                    data: departments.map(dept => ({
                        ...dept,
                        head: dept.head ? {
                            id: dept.head.id,
                            name: dept.head.name,
                            email: dept.head.email,
                            role: dept.head.role
                        } : null
                    }))
                }
            }
        });
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

// 4. Update Company (CEO/ME_QC Only)
export const updateCompany = async (req: Request, res: Response): Promise<Response | void> => {
    try {
        const { id } = req.params;
        const { name, abbreviation, address } = req.body;

        const company = await companyRepo.findOne({ where: { id } });
        if (!company) {
            return res.status(404).json({ message: "Company not found" });
        }

        // Check for name conflict if name is being changed
        if (name && name !== company.name) {
            const existingName = await companyRepo.findOne({ where: { name } });
            if (existingName) {
                return res.status(400).json({ message: "A company with this name already exists" });
            }
            company.name = name;
        }

        // Check for abbreviation conflict if abbreviation is being changed
        if (abbreviation && abbreviation !== company.abbreviation) {
            const existingAbbr = await companyRepo.findOne({ where: { abbreviation } });
            if (existingAbbr) {
                return res.status(400).json({ message: `A company with abbreviation '${abbreviation}' already exists` });
            }
            company.abbreviation = abbreviation;
        }

        if (address !== undefined) company.address = address;

        // Handle logo file upload
        if (req.file) {
            const imagePath = req.file.path.replace(/\\/g, "/");
            company.logo_url = `${req.protocol}://${req.get("host")}/${imagePath}`;
        }

        await companyRepo.save(company);

        // Notify admins
        await NotificationService.notifyAdmins(
            req,
            "Company Updated",
            `Company '${company.name}' details were updated by ${(req as any).user?.name || 'an admin'}.`,
            { companyId: company.id }
        );

        res.status(200).json({ status: "success", data: company });
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

// 5. Delete Company (CEO Only)
export const deleteCompany = async (req: AuthRequest, res: Response): Promise<Response | void> => {
    try {
        const { id } = req.params;

        const company = await companyRepo.findOne({ where: { id } });
        if (!company) {
            return res.status(404).json({ message: "Company not found" });
        }

        // Check if company has departments
        const departmentCount = await deptRepo.count({ where: { company_id: id } });
        if (departmentCount > 0) {
            return res.status(400).json({
                message: `Cannot delete company with ${departmentCount} department(s). Please remove or reassign departments first.`
            });
        }

        // Check if company has users
        const userCount = await userRepo.count({ where: { company_id: id } });
        if (userCount > 0) {
            return res.status(400).json({
                message: `Cannot delete company with ${userCount} employee(s). Please remove or reassign employees first.`
            });
        }

        const companyName = company.name;
        await companyRepo.remove(company);

        // Notify admins
        await NotificationService.notifyAdmins(
            req,
            "Company Deleted",
            `Company '${companyName}' has been deleted by ${(req as any).user?.name || 'an admin'}.`
        );

        res.status(200).json({
            status: "success",
            message: `Company '${companyName}' has been deleted`
        });
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

// 6. Get Company Employees (Paginated)
export const getCompanyEmployees = async (req: Request, res: Response): Promise<Response | void> => {
    try {
        const { id } = req.params;
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 10;
        const skip = (page - 1) * limit;

        // Verify company exists
        const company = await companyRepo.findOne({ where: { id } });
        if (!company) {
            return res.status(404).json({ message: "Company not found" });
        }

        const [employees, total] = await userRepo.findAndCount({
            where: { company_id: id },
            relations: ["department", "branch"],
            order: { name: "ASC" },
            take: limit,
            skip: skip,
            select: ["id", "name", "email", "role", "staff_id", "department_id", "branch_id"]
        });

        res.status(200).json({
            status: "success",
            count: employees.length,
            total,
            currentPage: page,
            totalPages: Math.ceil(total / limit),
            data: employees.map(emp => ({
                id: emp.id,
                name: emp.name,
                email: emp.email,
                role: emp.role,
                staff_id: emp.staff_id,
                department: emp.department ? { id: emp.department.id, name: emp.department.name } : null,
                branch: emp.branch ? { id: emp.branch.id, name: emp.branch.name } : null
            }))
        });
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};
