import { Request, Response } from "express";
import { AppDataSource } from "../../database/data-source";
import { Department } from "../entities/Department";
import { User } from "../entities/User";

const deptRepo = AppDataSource.getRepository(Department);
const userRepo = AppDataSource.getRepository(User);

// 1. Create a Department (Admin Only)
export const createDepartment = async (req: Request, res: Response): Promise<Response | void>=> {
  try {
    const { name } = req.body;

    if (!name) {
      return res.status(400).json({ message: "Department name is required" });
    }

    const existing = await deptRepo.findOne({ where: { name } });
    if (existing) {
      return res.status(400).json({ message: "Department already exists" });
    }

    const department = deptRepo.create({ name });
    await deptRepo.save(department);

    res.status(201).json({ status: "success", data: department });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

// 2. Get All Departments (For Dropdowns/UI)
export const getAllDepartments = async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const skip = (page - 1) * limit;

    const [departments, total] = await deptRepo.findAndCount({
      order: { name: "ASC" },
      take: limit,
      skip: skip,
    });

    res.status(200).json({
      status: "success",
      count: departments.length,
      total,
      currentPage: page,
      totalPages: Math.ceil(total / limit),
      data: departments,
    });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

// 3. Get Department Details (with Employee List)
export const getDepartmentById = async (req: Request, res: Response) : Promise<Response | void>=> {
  try {
    const { id } = req.params;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const skip = (page - 1) * limit;

    // Step 1: Find the department itself
    const department = await deptRepo.findOneBy({ id });

    if (!department) {
      return res.status(404).json({ message: "Department not found" });
    }

    // Step 2: Find and paginate the employees belonging to that department
    const [employees, totalEmployees] = await userRepo.findAndCount({
      where: { department_id: id },
      order: { name: "ASC" },
      take: limit,
      skip: skip,
      select: ["id", "name", "email", "role"], // Select only the fields you need
    });

    res.status(200).json({ 
        status: "success", 
        data: { 
          ...department, 
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