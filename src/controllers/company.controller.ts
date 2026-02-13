import { Request, Response } from "express";
import { AppDataSource } from "../../database/data-source";
import { Company } from "../entities/Company";
// import { Department } from "../entities/Department"
import { User, UserRole } from "../entities/User";
import { Branch } from "../entities/Branch";
import { AuthRequest } from "../middleware/auth.middleware";

const companyRepo = AppDataSource.getRepository(Company);
const branchRepo = AppDataSource.getRepository(Branch);

// 1. Create Company (Requires Branch ID)
export const createCompany = async (
  req: Request,
  res: Response,
): Promise<Response | void> => {
  try {
    const { name, abbreviation, address, branch_id } = req.body;

    if (!branch_id) {
      return res
        .status(400)
        .json({ message: "Branch ID is required to create a company." });
    }

    const branch = await branchRepo.findOne({ where: { id: branch_id } });
    if (!branch) {
      return res.status(404).json({ message: "Branch not found." });
    }

    // Check for unique name/abbr
    const existing = await companyRepo.findOne({
      where: [{ name }, { abbreviation }],
    });
    if (existing) {
      return res.status(400).json({
        message: "Company with this name or abbreviation already exists.",
      });
    }

    const company = companyRepo.create({
      name,
      abbreviation: abbreviation.toUpperCase(),
      address,
      branch,
    });

    if (req.file) {
      const imagePath = req.file.path.replace(/\\/g, "/");
      company.logo_url = `${req.protocol}://${req.get("host")}/${imagePath}`;
    }

    await companyRepo.save(company);
    return res.status(201).json({ status: "success", data: { company } });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

// 2. Get All Companies (Scoped by user role)
export const getAllCompanies = async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user!;
    let whereClause: any = {};

    // MD can only see companies in their branch
    if (user.role === UserRole.MD && user.branch_id) {
      whereClause = { branch: { id: user.branch_id } };
    }

    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(
      100,
      Math.max(1, parseInt(req.query.limit as string) || 10),
    );
    const skip = (page - 1) * limit;

    const [companies, total] = await companyRepo.findAndCount({
      where: whereClause,
      relations: ["branch"],
      take: limit,
      skip: skip,
      order: { id: "ASC" },
    });

    const totalPages = Math.ceil(total / limit);

    return res.status(200).json({
      status: "success",
      data: {
        companies,
        pagination: {
          total,
          page,
          limit,
          totalPages,
          hasNext: page < totalPages,
          hasPrev: page > 1,
        },
      },
    });
  } catch (error: any) {
    return res.status(500).json({ message: error.message });
  }
};

export const getCompanyById = async (
  req: Request,
  res: Response,
): Promise<Response | void> => {
  try {
    const { id } = req.params;
    const company = await companyRepo.findOne({
      where: { id },
      relations: ["departments", "branch"],
    });
    if (!company) return res.status(404).json({ message: "Company not found" });
    return res.status(200).json({ status: "success", data: { company } });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const updateCompany = async (
  req: Request,
  res: Response,
): Promise<Response | void> => {
  try {
    const { id } = req.params;
    const company = await companyRepo.findOne({ where: { id } });
    if (!company) return res.status(404).json({ message: "Company not found" });

    const { name, address, branch_id } = req.body;
    if (name) company.name = name;
    if (address) company.address = address;

    if (branch_id) {
      const branch = await branchRepo.findOne({ where: { id: branch_id } });
      if (!branch) return res.status(404).json({ message: "Branch not found" });
      company.branch = branch;
    }

    if (req.file) {
      const imagePath = req.file.path.replace(/\\/g, "/");
      company.logo_url = `${req.protocol}://${req.get("host")}/${imagePath}`;
    }

    await companyRepo.save(company);
    return res.status(200).json({ status: "success", data: { company } });
  } catch (error: any) {
    return res.status(500).json({ message: error.message });
  }
};

export const deleteCompany = async (
  req: Request,
  res: Response,
): Promise<Response | void> => {
  try {
    const { id } = req.params;
    await companyRepo.delete(id);
    return res.status(200).json({ message: "Company deleted" });
  } catch (e: any) {
    return res.status(500).json({ message: e.message });
  }
};

export const getCompanyEmployees = async (
  req: Request,
  res: Response,
): Promise<Response | void> => {
  try {
    const { id } = req.params;
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(
      100,
      Math.max(1, parseInt(req.query.limit as string) || 10),
    );
    const skip = (page - 1) * limit;

    const [employees, total] = await AppDataSource.getRepository(
      User,
    ).findAndCount({
      where: { company_id: id },
      take: limit,
      skip: skip,
      order: { id: "ASC" },
    });

    const totalPages = Math.ceil(total / limit);

    return res.status(200).json({
      status: "success",
      data: {
        employees,
        pagination: {
          total,
          page,
          limit,
          totalPages,
          hasNext: page < totalPages,
          hasPrev: page > 1,
        },
      },
    });
  } catch (e: any) {
    return res.status(500).json({ message: e.message });
  }
};
