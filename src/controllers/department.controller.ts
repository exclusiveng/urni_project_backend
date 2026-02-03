import { Request, Response } from "express";
import { AppDataSource } from "../../database/data-source";
import { Department } from "../entities/Department";
import { User, UserRole } from "../entities/User";
import { Company } from "../entities/Company";
import { AuthRequest } from "../middleware/auth.middleware";
import { NotificationService } from "../services/notification.service";

const deptRepo = AppDataSource.getRepository(Department);
const userRepo = AppDataSource.getRepository(User);
const companyRepo = AppDataSource.getRepository(Company);

// 1. Create a Department (Admin Only)
export const createDepartment = async (req: Request, res: Response): Promise<Response | void> => {
  try {
    const { name, company_id } = req.body;

    if (!name) {
      return res.status(400).json({ message: "Department name is required" });
    }

    if (!company_id) {
      return res.status(400).json({ message: "Company ID is required" });
    }

    // Verify company exists
    const company = await companyRepo.findOne({ where: { id: company_id } });
    if (!company) {
      return res.status(404).json({ message: "Company not found" });
    }

    // Check for existing department with same name in the same company
    const existing = await deptRepo.findOne({ where: { name, company_id } });
    if (existing) {
      return res.status(400).json({ message: `Department '${name}' already exists in ${company.name}` });
    }

    const department = deptRepo.create({ name, company_id });
    await deptRepo.save(department);

    // Notify admins
    await NotificationService.notifyAdmins(
      req,
      "New Department Created",
      `Department '${department.name}' has been created in ${company.name} by ${(req as any).user?.name || 'an admin'}.`,
      { departmentId: department.id, companyId: company.id }
    );

    res.status(201).json({
      status: "success",
      data: { ...department, company: { id: company.id, name: company.name } }
    });
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
    const company_id = req.query.company_id as string;

    // Build where clause
    const whereClause: any = {};
    if (company_id) {
      whereClause.company_id = company_id;
    }

    const [departments, total] = await deptRepo.findAndCount({
      where: whereClause,
      relations: ["head", "company"],
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
        company: dept.company ? { id: dept.company.id, name: dept.company.name } : null,
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
export const getDepartmentById = async (req: Request, res: Response): Promise<Response | void> => {
  try {
    const { id } = req.params;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const skip = (page - 1) * limit;

    // Step 1: Find the department itself with head and company relations
    const department = await deptRepo.findOne({
      where: { id },
      relations: ["head", "company"]
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
        company: department.company ? { id: department.company.id, name: department.company.name } : null,
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

    const previousHeadId = department.head_id;

    // Update user's role to DEPARTMENT_HEAD
    user.role = UserRole.DEPARTMENT_HEAD;
    await userRepo.save(user);

    // Set the department head
    department.head_id = userId;
    await deptRepo.save(department);

    // Notify the new head
    req.notify?.(userId, {
      type: "GENERIC",
      title: "You have been set as Department Head",
      body: `You are now the head of ${department.name} department.`,
      payload: { departmentId }
    });

    // Notify previous head if different
    if (previousHeadId && previousHeadId !== userId) {
      req.notify?.(previousHeadId, {
        type: "GENERIC",
        title: "You were removed as Department Head",
        body: `${user.name} has been set as the new head of ${department.name}.`,
        payload: { departmentId }
      });
    }

    // Notify admins
    await NotificationService.notifyAdmins(
      req,
      "Department Head Changed",
      `${user.name} has been set as the head of ${department.name} department by ${(req as any).user?.name || 'an admin'}.`,
      { departmentId: department.id, headId: user.id }
    );

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

      // Notify the user they were removed
      req.notify?.(currentHead.id, {
        type: "GENERIC",
        title: "You were removed as Department Head",
        body: `You have been removed as the head of ${department.name}.`,
        payload: { departmentId }
      });

      // Notify admins
      await NotificationService.notifyAdmins(
        req,
        "Department Head Removed",
        `${currentHead.name} was removed as the head of ${department.name} department by ${(req as any).user?.name || 'an admin'}.`,
        { departmentId: department.id }
      );
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

    // Notify the user
    req.notify?.(userId, {
      type: "GENERIC",
      title: "Added to department",
      body: `You have been added to ${department.name} department.`,
      payload: { departmentId }
    });

    // Notify admins
    await NotificationService.notifyAdmins(
      req,
      "User Added to Department",
      `${user.name} was added to department '${department.name}' by ${(req as any).user?.name || 'an admin'}.`,
      { userId: user.id, departmentId: department.id }
    );

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

    // Notify the user
    req.notify?.(userId, {
      type: "GENERIC",
      title: "Removed from department",
      body: `You have been removed from ${oldDepartment?.name || 'your department'}.`,
      payload: { departmentId: oldDepartment?.id }
    });

    // Notify admins
    await NotificationService.notifyAdmins(
      req,
      "User Removed from Department",
      `${user.name} was removed from department '${oldDepartment?.name}' by ${(req as any).user?.name || 'an admin'}.`,
      { userId: user.id, departmentId: oldDepartment?.id }
    );

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

// 8. Update Department (Admin Only)
export const updateDepartment = async (req: Request, res: Response): Promise<Response | void> => {
  try {
    const { id } = req.params;
    const { name, company_id } = req.body;

    const department = await deptRepo.findOne({ where: { id } });
    if (!department) {
      return res.status(404).json({ message: "Department not found" });
    }

    if (name && name !== department.name) {
      // Check for uniqueness in the company
      const targetCompanyId = company_id || department.company_id;
      const existing = await deptRepo.findOne({ where: { name, company_id: targetCompanyId } });
      if (existing && existing.id !== id) {
        return res.status(400).json({ message: `Department '${name}' already exists in that company` });
      }
      department.name = name;
    }

    if (company_id && company_id !== department.company_id) {
      const company = await companyRepo.findOne({ where: { id: company_id } });
      if (!company) {
        return res.status(404).json({ message: "Target company not found" });
      }
      department.company_id = company_id;
    }

    await deptRepo.save(department);

    // Notify admins
    await NotificationService.notifyAdmins(
      req,
      "Department Updated",
      `Department '${department.name}' details were updated by ${(req as any).user?.name || 'an admin'}.`,
      { departmentId: department.id, companyId: department.company_id }
    );

    res.status(200).json({ status: "success", data: department });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

// 9. Delete Department (Admin Only)
export const deleteDepartment = async (req: Request, res: Response): Promise<Response | void> => {
  try {
    const { id } = req.params;

    const department = await deptRepo.findOne({ where: { id } });
    if (!department) {
      return res.status(404).json({ message: "Department not found" });
    }

    // Check if department has users
    const userCount = await userRepo.count({ where: { department_id: id } });
    if (userCount > 0) {
      return res.status(400).json({
        message: `Cannot delete department with ${userCount} employee(s). Please move employees first.`
      });
    }

    const deptName = department.name;
    const companyId = department.company_id;
    await deptRepo.remove(department);

    // Notify admins
    await NotificationService.notifyAdmins(
      req,
      "Department Deleted",
      `Department '${deptName}' has been deleted by ${(req as any).user?.name || 'an admin'}.`,
      { companyId }
    );

    res.status(200).json({
      status: "success",
      message: `Department '${deptName}' has been deleted`
    });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};
