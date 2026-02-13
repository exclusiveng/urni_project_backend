import { Request, Response } from "express";
import { AppDataSource } from "../../database/data-source";
import { Department } from "../entities/Department";
import { User, UserRole } from "../entities/User";
import { Company } from "../entities/Company";
import { AuthRequest } from "../middleware/auth.middleware";
import { NotificationService } from "../services/notification.service";
import { NotificationType } from "../entities/Notification";

const deptRepo = AppDataSource.getRepository(Department);
const userRepo = AppDataSource.getRepository(User);
const companyRepo = AppDataSource.getRepository(Company);

// 1. Create a Department (Admin/MD Only)
export const createDepartment = async (
  req: Request,
  res: Response,
): Promise<Response | void> => {
  try {
    const { name, company_id, head_id } = req.body;

    const company = await companyRepo.findOne({ where: { id: company_id } });
    if (!company) {
      return res.status(404).json({ message: "Company not found" });
    }

    // Check uniqueness
    const existing = await deptRepo.findOne({ where: { name, company_id } });
    if (existing) {
      return res
        .status(400)
        .json({ message: "Department already exists in this company" });
    }

    const dept = deptRepo.create({ name, company_id });

    if (head_id) {
      const headUser = await userRepo.findOne({ where: { id: head_id } });
      if (headUser) {
        dept.head = headUser;
        // Auto-promote
        headUser.role = UserRole.DEPARTMENT_HEAD;
        await userRepo.save(headUser);
      }
    }

    await deptRepo.save(dept);

    // Notify Head if assigned
    if (head_id) {
      await NotificationService.createNotification({
        userId: head_id,
        title: "New Assignment",
        body: `You have been appointed as the Head of ${name} Department.`,
        type: NotificationType.GENERIC,
        payload: { departmentId: dept.id },
      });
    }

    return res
      .status(201)
      .json({ status: "success", data: { department: dept } });
  } catch (error: any) {
    return res.status(500).json({ message: error.message });
  }
};

export const getAllDepartments = async (
  req: Request,
  res: Response,
): Promise<Response | void> => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(
      100,
      Math.max(1, parseInt(req.query.limit as string) || 10),
    );
    const skip = (page - 1) * limit;

    const [depts, total] = await deptRepo.findAndCount({
      relations: ["head", "company"],
      take: limit,
      skip: skip,
      order: { id: "ASC" },
    });

    const totalPages = Math.ceil(total / limit);

    return res.status(200).json({
      status: "success",
      data: {
        departments: depts.map((d) => ({
          ...d,
          head: d.head
            ? { id: d.head.id, name: d.head.name, email: d.head.email }
            : null,
          company: d.company
            ? { id: d.company.id, name: d.company.name }
            : null,
        })),
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

export const getDepartmentById = async (
  req: Request,
  res: Response,
): Promise<Response | void> => {
  try {
    const { id } = req.params;
    const dept = await deptRepo.findOne({
      where: { id },
      relations: ["head", "assistantHead", "employees"],
    });
    if (!dept) return res.status(404).json({ message: "Department not found" });
    return res.status(200).json({
      status: "success",
      data: {
        department: {
          ...dept,
          head: dept.head
            ? { id: dept.head.id, name: dept.head.name, email: dept.head.email }
            : null,
          assistantHead: dept.assistantHead
            ? {
                id: dept.assistantHead.id,
                name: dept.assistantHead.name,
                email: dept.assistantHead.email,
              }
            : null,
          employees: dept.employees?.map((e) => ({
            id: e.id,
            name: e.name,
            email: e.email,
            role: e.role,
          })),
        },
      },
    });
  } catch (error: any) {
    return res.status(500).json({ message: error.message });
  }
};

// 4. Set Department Head
export const setDepartmentHead = async (
  req: AuthRequest,
  res: Response,
): Promise<Response | void> => {
  try {
    const { department_id, user_id } = req.body;

    const dept = await deptRepo.findOne({
      where: { id: department_id },
      relations: ["head"],
    });
    if (!dept) return res.status(404).json({ message: "Department not found" });

    const user = await userRepo.findOne({ where: { id: user_id } });
    if (!user) return res.status(404).json({ message: "User not found" });

    // Demote old head if exists
    if (dept.head) {
      const oldHead = await userRepo.findOne({ where: { id: dept.head.id } });
      if (oldHead && oldHead.role === UserRole.DEPARTMENT_HEAD) {
        oldHead.role = UserRole.GENERAL_STAFF; // Demote to staff
        await userRepo.save(oldHead);
      }
    }

    // Assign new head
    dept.head = user;

    // Update user role
    user.role = UserRole.DEPARTMENT_HEAD;
    user.department = dept;
    user.permissions = []; // Reset granular permissions or keep them? Resetting safe for role change.

    await userRepo.save(user);
    await deptRepo.save(dept);

    // Notify User
    await NotificationService.createNotification({
      userId: user.id,
      title: "New Assignment",
      body: `You have been appointed as the Head of ${dept.name} Department.`,
      type: NotificationType.GENERIC,
      payload: { departmentId: dept.id },
    });

    return res.status(200).json({
      message: "Department Head set successfully",
      data: {
        department: {
          ...dept,
          head: { id: user.id, name: user.name, email: user.email },
        },
      },
    });
  } catch (error: any) {
    return res.status(500).json({ message: error.message });
  }
};

// 5. Set Assistant Department Head
export const setAssistantHead = async (
  req: AuthRequest,
  res: Response,
): Promise<Response | void> => {
  try {
    const { department_id, user_id } = req.body;

    const dept = await deptRepo.findOne({
      where: { id: department_id },
      relations: ["assistantHead"],
    });
    if (!dept) return res.status(404).json({ message: "Department not found" });

    const user = await userRepo.findOne({ where: { id: user_id } });
    if (!user) return res.status(404).json({ message: "User not found" });

    // Demote old assistant if exists
    if (dept.assistantHead) {
      const oldAsst = await userRepo.findOne({
        where: { id: dept.assistantHead.id },
      });
      if (oldAsst && oldAsst.role === UserRole.ASST_DEPARTMENT_HEAD) {
        oldAsst.role = UserRole.GENERAL_STAFF;
        await userRepo.save(oldAsst);
      }
    }

    dept.assistantHead = user;

    // Update user role
    user.role = UserRole.ASST_DEPARTMENT_HEAD;
    user.department = dept;

    await userRepo.save(user);
    await deptRepo.save(dept);

    // Notify User
    await NotificationService.createNotification({
      userId: user.id,
      title: "New Assignment",
      body: `You have been appointed as the Assistant Head of ${dept.name} Department.`,
      type: NotificationType.GENERIC,
      payload: { departmentId: dept.id },
    });

    return res.status(200).json({
      message: "Assistant Department Head set successfully",
      data: {
        department: {
          ...dept,
          assistantHead: { id: user.id, name: user.name, email: user.email },
        },
      },
    });
  } catch (error: any) {
    return res.status(500).json({ message: error.message });
  }
};

export const updateDepartment = async (
  req: Request,
  res: Response,
): Promise<Response | void> => {
  // ... standard update logic
  try {
    const { id } = req.params;
    const { name } = req.body;
    await deptRepo.update(id, { name });
    return res.status(200).json({ message: "Department updated" });
  } catch (e: any) {
    return res.status(500).json({ message: e.message });
  }
};

export const deleteDepartment = async (
  req: Request,
  res: Response,
): Promise<Response | void> => {
  try {
    const { id } = req.params;
    await deptRepo.delete(id);
    return res.status(200).json({ message: "Department deleted" });
  } catch (e: any) {
    return res.status(500).json({ message: e.message });
  }
};

// ... add/remove member utils if needed

export const addUserToDepartment = async (
  req: Request,
  res: Response,
): Promise<Response | void> => {
  try {
    const { department_id, user_id } = req.body;
    const dept = await deptRepo.findOne({ where: { id: department_id } });
    if (!dept) return res.status(404).json({ message: "Department not found" });

    const user = await userRepo.findOne({ where: { id: user_id } });
    if (!user) return res.status(404).json({ message: "User not found" });

    user.department = dept;
    await userRepo.save(user);

    // Notify User
    await NotificationService.createNotification({
      userId: user.id,
      title: "Department Updated",
      body: `You have been added to the ${dept.name} Department.`,
      type: NotificationType.GENERIC,
      payload: { departmentId: dept.id },
    });

    return res.status(200).json({
      message: "User added to department",
      data: {
        user: {
          ...user,
          department: { id: dept.id, name: dept.name },
        },
      },
    });
  } catch (e: any) {
    return res.status(500).json({ message: e.message });
  }
};

export const removeUserFromDepartment = async (
  req: Request,
  res: Response,
): Promise<Response | void> => {
  try {
    const { department_id, user_id } = req.body;
    // Verify user is in dept?
    const user = await userRepo.findOne({
      where: { id: user_id },
      relations: ["department"],
    });
    if (!user) return res.status(404).json({ message: "User not found" });

    if (user.department?.id !== department_id) {
      return res
        .status(400)
        .json({ message: "User is not in this department" });
    }

    user.department = null as any;
    await userRepo.save(user);

    return res.status(200).json({ message: "User removed from department" });
  } catch (e: any) {
    return res.status(500).json({ message: e.message });
  }
};
