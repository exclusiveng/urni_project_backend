import { Request, Response } from "express";
import { AppDataSource } from "../../database/data-source";
import { Branch } from "../entities/Branch";
import { AuthRequest } from "../middleware/auth.middleware";
import { User } from "../entities/User";

const branchRepo = AppDataSource.getRepository(Branch);
const userRepo = AppDataSource.getRepository(User);

// 1. Create a Branch (Admin/CEO Only)
export const createBranch = async (req: Request, res: Response): Promise<Response | void>=> {
  try {
    const { name, location_city, address, gps_lat, gps_long, radius_meters} = req.body;

    if (!name || !location_city) {
      return res.status(400).json({ message: "Branch name and location city are required" });
    }

    const existing = await branchRepo.findOne({ where: { name } });
    if (existing) {
      return res.status(400).json({ message: "Branch with this name already exists" });
    }

    const branch = branchRepo.create({ name, location_city, address, gps_lat, gps_long, radius_meters });
    await branchRepo.save(branch);

    res.status(201).json({ status: "success", data: branch });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

// 2. Get All Branches (For Dropdowns/UI)
export const getAllBranches = async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const skip = (page - 1) * limit;

    const [branches, total] = await branchRepo.findAndCount({
      order: { location_city: "ASC", name: "ASC" },
      take: limit,
      skip: skip,
    });
    res.status(200).json({
      status: "success",
      count: branches.length,
      total,
      currentPage: page,
      totalPages: Math.ceil(total / limit),
      data: branches,
    });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

// 3. Get Branch Details (with Employee List)
export const getBranchById = async (req: Request, res: Response): Promise<Response | void>=> {
  try {
    const { id } = req.params;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const skip = (page - 1) * limit;

    // Step 1: Find the branch itself
    const branch = await branchRepo.findOneBy({ id });

    if (!branch) {
      return res.status(404).json({ message: "Branch not found" });
    }

    // Step 2: Find and paginate the employees belonging to that branch
    const [employees, totalEmployees] = await userRepo.findAndCount({
      where: { branch_id: id },
      order: { name: "ASC" },
      take: limit,
      skip: skip,
      select: ["id", "name", "email", "role"], // Select only the fields you need
    });

    res.status(200).json({ 
        status: "success", 
        data: { 
          ...branch, 
          employees: {
            count: employees.length,
            total: totalEmployees,
            currentPage: page,
            totalPages: Math.ceil(totalEmployees / limit),
            data: employees
          }
        } 
    });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

// 4. Update a Branch (Admin/CEO Only)
export const updateBranch = async (req: Request, res: Response): Promise<Response | void>=> {
  try {
    const { id } = req.params;
    const { name, location_city, address, gps_lat, gps_long, radius_meters, br  } = req.body;

    const branch = await branchRepo.findOneBy({ id });
    if (!branch) {
      return res.status(404).json({ message: "Branch not found for update" });
    }

    // Check if the new name conflicts with another existing branch
    if (name && name !== branch.name) {
        const existing = await branchRepo.findOne({ where: { name } });
        if (existing) {
            return res.status(400).json({ message: "Another branch with this name already exists" });
        }
    }

    branch.name = name ?? branch.name;
    branch.location_city = location_city ?? branch.location_city;
    branch.address = address ?? branch.address;
    branch.gps_lat = gps_lat ?? branch.gps_lat;
    branch.gps_long = gps_long ?? branch.gps_long
    branch.radius_meters = radius_meters ?? branch.radius_meters;
    
    await branchRepo.save(branch);

    res.status(200).json({ status: "success", data: branch });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

// 5. Delete a Branch (Admin/CEO Only)
export const deleteBranch = async (req: AuthRequest, res: Response): Promise<Response | void>=> {
    try {
        const { id } = req.params;

        // NOTE: Deleting a branch will fail if there are users still referencing it
        const result = await branchRepo.delete(id);

        if (result.affected === 0) {
            return res.status(404).json({ message: "Branch not found or could not be deleted." });
        }

        res.status(204).json({ status: "success", data: null });
    } catch (error: any) {
        // This is likely hit if a foreign key constraint (employees referencing this branch) fails
        res.status(500).json({ message: "Cannot delete branch. Ensure all employees are moved to another branch first.", error: error.message });
    }
};