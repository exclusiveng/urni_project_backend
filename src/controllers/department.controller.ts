import { Request, Response } from "express";
import { AppDataSource } from "../../database/data-source";
import { Department } from "../entities/Department";
import { User, UserRole } from "../entities/User";
import { AuthRequest } from "../middleware/auth.middleware";

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
      relations: ["head"],
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
      data: departments.map(dept => ({
        ...dept,
        head: dept.head ? {
          id: dept.head.id,
          name: dept.head.name,
          email: dept.head.email,
          role: dept.head.role
        } : null
      })),
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

    // Step 1: Find the department itself with head relation
    const department = await deptRepo.findOne({
      where: { id },
      relations: ["head"]
    });

    if (!department) {
      return res.status(404).json({ message: "Department not found" });
    }

    // Step 2: Find and paginate the employees belonging to that department
    const [employees, totalEmployees] = await userRepo.findAndCount({
      where: { department_id: id },
      order: { name: "ASC" },
      take: limit,
      skip: skip,
      select: ["id", "name", "email", "role"],
    });

    res.status(200).json({ 
        status: "success", 
        data: { 
          ...department, 
          head: department.head ? {
            id: department.head.id,
            name: department.head.name,
            email: department.head.email,
            role: department.head.role
          } : null,
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

// 4. Set Department Head (Admin/CEO Only)
export const setDepartmentHead = async (req: AuthRequest, res: Response): Promise<Response | void> => {
  try {
    const { departmentId, userId } = req.body;

    // Validate required fields
    if (!departmentId || !userId) {
      return res.status(400).json({ message: "Department ID and User ID are required" });
    }

    // Find the department
    const department = await deptRepo.findOne({ where: { id: departmentId } });
    if (!department) {
      return res.status(404).json({ message: "Department not found" });
    }

    // Find the user
    const user = await userRepo.findOne({ where: { id: userId } });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Check if user is in the department
    if (user.department_id !== departmentId) {
      return res.status(400).json({ message: "User must be a member of the department to be set as head" });
    }

    // Update user's role to DEPARTMENT_HEAD
    user.role = UserRole.DEPARTMENT_HEAD;
    await userRepo.save(user);

    // Set the department head
    department.head_id = userId;
    await deptRepo.save(department);

    res.status(200).json({
      status: "success",
      message: `${user.name} has been set as the head of ${department.name} department`,
      data: {
        department: {
          id: department.id,
          name: department.name,
          head: {
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role
          }
        }
      }
    });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

// 5. Remove Department Head (Admin/CEO Only)
export const removeDepartmentHead = async (req: AuthRequest, res: Response): Promise<Response | void> => {
  try {
    const { departmentId } = req.body;

    if (!departmentId) {
      return res.status(400).json({ message: "Department ID is required" });
    }

    // Find the department
    const department = await deptRepo.findOne({
      where: { id: departmentId },
      relations: ["head"]
    });
    if (!department) {
      return res.status(404).json({ message: "Department not found" });
    }

    if (!department.head_id) {
      return res.status(400).json({ message: "Department has no head to remove" });
    }

    // Get the current head user
    const currentHead = department.head;

    // Remove department head
    department.head_id = null as any;
    await deptRepo.save(department);

    // Optionally downgrade the user's role back to GENERAL_STAFF
    // (You might want to make this configurable)
    if (currentHead) {
      currentHead.role = UserRole.GENERAL_STAFF;
      await userRepo.save(currentHead);
    }

    res.status(200).json({
      status: "success",
      message: `Department head removed from ${department.name}`,
      data: {
        department: {
          id: department.id,
          name: department.name,
          head: null
        }
      }
    });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

// 6. Add User to Department (Admin Only)
export const addUserToDepartment = async (req: AuthRequest, res: Response): Promise<Response | void> => {
  try {
    const { departmentId, userId } = req.body;

    // Validate required fields
    if (!departmentId || !userId) {
      return res.status(400).json({ message: "Department ID and User ID are required" });
    }

    // Find the department
    const department = await deptRepo.findOne({ where: { id: departmentId } });
    if (!department) {
      return res.status(404).json({ message: "Department not found" });
    }

    // Find the user
    const user = await userRepo.findOne({ where: { id: userId } });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Check if user is already in this department
    if (user.department_id === departmentId) {
      return res.status(400).json({ message: "User is already in this department" });
    }

    // If user was department head of another department, remove that assignment
    if (user.role === UserRole.DEPARTMENT_HEAD) {
      const oldDepartment = await deptRepo.findOne({ where: { head_id: userId } });
      if (oldDepartment) {
        oldDepartment.head_id = null as any;
        await deptRepo.save(oldDepartment);
      }
      // Keep the DEPARTMENT_HEAD role since they're being moved to head another department
    }

    // Update user's department
    user.department_id = departmentId;
    await userRepo.save(user);

    res.status(200).json({
      status: "success",
      message: `${user.name} has been added to ${department.name} department`,
      data: {
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          department: {
            id: department.id,
            name: department.name
          }
        }
      }
    });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

// 7. Remove User from Department (Admin Only)
export const removeUserFromDepartment = async (req: AuthRequest, res: Response): Promise<Response | void> => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ message: "User ID is required" });
    }

    // Find the user
    const user = await userRepo.findOne({
      where: { id: userId },
      relations: ["department"]
    });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Check if user is in a department
    if (!user.department_id) {
      return res.status(400).json({ message: "User is not assigned to any department" });
    }

    // If user is department head, remove that assignment
    if (user.role === UserRole.DEPARTMENT_HEAD) {
      const department = await deptRepo.findOne({ where: { head_id: userId } });
      if (department) {
        department.head_id = null as any;
        await deptRepo.save(department);
      }
      // Downgrade role to GENERAL_STAFF
      user.role = UserRole.GENERAL_STAFF;
    }

    const oldDepartment = user.department;

    // Remove user from department
    user.department_id = null as any;
    await userRepo.save(user);

    res.status(200).json({
      status: "success",
      message: `${user.name} has been removed from ${oldDepartment?.name || 'their department'}`,
      data: {
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          department: null
        }
      }
    });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};