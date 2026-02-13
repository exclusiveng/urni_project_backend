import { Response } from "express";
import { AppDataSource } from "../../database/data-source";
import { Department } from "../entities/Department";
import { LeaveRequest, LeaveStatus } from "../entities/LeaveRequest";
import { User, UserRole } from "../entities/User";
import { AuthRequest } from "../middleware/auth.middleware";
import { NotificationService } from "../services/notification.service";
import { NotificationType } from "../entities/Notification";

const leaveRepo = AppDataSource.getRepository(LeaveRequest);
const userRepo = AppDataSource.getRepository(User);
const deptRepo = AppDataSource.getRepository(Department);

const getNextApprover = async (currentUser: User): Promise<User | null> => {
  // 1. Staff and Assistant Heads report to Department Head
  if (
    currentUser.role === UserRole.GENERAL_STAFF ||
    currentUser.role === UserRole.ASST_DEPARTMENT_HEAD
  ) {
    const dept = await deptRepo.findOne({
      where: { id: currentUser.department_id },
      relations: ["head"],
    });
    if (dept?.head) return dept.head;

    // Fallback: if no Dept Head, escalate to HR
    return await userRepo.findOne({ where: { role: UserRole.HR } });
  }

  // 2. Department Head reports to HR
  if (currentUser.role === UserRole.DEPARTMENT_HEAD) {
    return await userRepo.findOne({ where: { role: UserRole.HR } });
  }

  // 3. HR reports to MD
  if (currentUser.role === UserRole.HR) {
    const md = await userRepo.findOne({ where: { role: UserRole.MD } });
    if (md) return md;
    // Fallback to Admin if no MD
    return await userRepo.findOne({ where: { role: UserRole.ADMIN } });
  }

  // 4. MD reports to Admin
  if (currentUser.role === UserRole.MD) {
    return await userRepo.findOne({ where: { role: UserRole.ADMIN } });
  }

  // Admin and CEO are terminal or review-only.
  return null;
};

export const requestLeave = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const { type, reason, start_date, end_date } = req.body;
    const user = req.user!;

    const nextApprover = await getNextApprover(user);

    const leave = leaveRepo.create({
      user,
      type,
      reason,
      start_date,
      end_date,
      current_approver: nextApprover || undefined,
      status: LeaveStatus.PENDING,
      approval_history: [],
    });

    await leaveRepo.save(leave);

    // Notify approver logic
    if (nextApprover) {
      await NotificationService.createNotification({
        userId: nextApprover.id,
        actorId: user.id,
        title: "New Leave Request",
        body: `${user.name} has requested leave from ${new Date(start_date).toLocaleDateString()} to ${new Date(end_date).toLocaleDateString()}.`,
        type: NotificationType.LEAVE,
        payload: { leaveId: leave.id },
      });
    }

    res.status(201).json({ status: "success", data: { leave } });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const respondToLeave = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const { id } = req.params;
    const { status, remarks } = req.body; // Approved or Rejected
    const approver = req.user!;

    const leave = await leaveRepo.findOne({
      where: { id },
      relations: ["user", "current_approver"],
    });
    if (!leave) {
      res.status(404).json({ message: "Leave request not found" });
      return;
    }

    if (
      leave.current_approver_id !== approver.id &&
      approver.role !== UserRole.CEO
    ) {
      res.status(403).json({
        message: "You are not the current approver for this request.",
      });
      return;
    }

    if (status === LeaveStatus.REJECTED) {
      leave.status = LeaveStatus.REJECTED;
      leave.approval_history.push(
        `Rejected by ${approver.name} (${approver.role}): ${remarks}`,
      );
      leave.current_approver = null as any;
      leave.current_approver_id = null;
      await leaveRepo.save(leave);
      res.status(200).json({ message: "Leave rejected" });
      return;
    }

    // Approval Logic
    leave.approval_history.push(
      `Approved by ${approver.name} (${approver.role}): ${remarks || ""}`,
    );

    // Final Approval Roles: Logic depends on the hierarchy.
    // MD and Admin are typically the final stops.
    const terminalRoles = [UserRole.MD, UserRole.ADMIN];

    // If the CURRENT approver is one of these roles, it's final.
    if (terminalRoles.includes(approver.role)) {
      leave.status = LeaveStatus.APPROVED;
      leave.current_approver_id = null;

      // Deduct balance logic
      const requester = await userRepo.findOne({
        where: { id: leave.user_id },
      });
      if (requester) {
        requester.leave_balance -= 1; // Simplified: should ideally calculate work days
        await userRepo.save(requester);
      }
    } else {
      // Escalate
      const next = await getNextApprover(approver);
      if (next) {
        leave.current_approver_id = next.id;

        // Notify next approver
        await NotificationService.createNotification({
          userId: next.id,
          actorId: approver.id,
          title: "Leave Request Escalated",
          body: `A leave request from ${leave.user.name} has been approved by ${approver.name} and now requires your attention.`,
          type: NotificationType.LEAVE,
          payload: { leaveId: leave.id },
        });
      } else {
        // No higher authority found -> Treat as final approval
        leave.status = LeaveStatus.APPROVED;
        leave.current_approver_id = null;
      }
    }

    await leaveRepo.save(leave);

    // Notify Requester of final decision (or rejection)
    await NotificationService.createNotification({
      userId: leave.user_id,
      actorId: approver.id,
      title: `Leave Request ${leave.status}`,
      body: `Your leave request has been ${leave.status.toLowerCase()} by ${approver.name}.`,
      type: NotificationType.LEAVE,
      payload: { leaveId: leave.id, status: leave.status },
    });

    res.status(200).json({ status: "success", data: { leave } });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const getPendingApprovals = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const user = req.user!;
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(
      100,
      Math.max(1, parseInt(req.query.limit as string) || 10),
    );
    const skip = (page - 1) * limit;

    const [requests, total] = await leaveRepo.findAndCount({
      where: {
        current_approver_id: user.id,
        status: LeaveStatus.PENDING,
      },
      relations: ["user"],
      take: limit,
      skip: skip,
      order: { created_at: "DESC" },
    });

    const totalPages = Math.ceil(total / limit);

    res.status(200).json({
      status: "success",
      data: {
        requests,
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
    res.status(500).json({ message: error.message });
  }
};

export const getMyRequests = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const user = req.user!;
    const { status } = req.query;
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(
      100,
      Math.max(1, parseInt(req.query.limit as string) || 10),
    );
    const skip = (page - 1) * limit;

    const where: any = { user_id: user.id };
    if (status) {
      where.status = status;
    }

    const [requests, total] = await leaveRepo.findAndCount({
      where,
      relations: ["current_approver"],
      take: limit,
      skip: skip,
      order: { created_at: "DESC" },
    });

    const totalPages = Math.ceil(total / limit);

    res.status(200).json({
      status: "success",
      data: {
        requests,
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
    res.status(500).json({ message: error.message });
  }
};

// Admin view all
export const getAllRequests = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(
      100,
      Math.max(1, parseInt(req.query.limit as string) || 10),
    );
    const skip = (page - 1) * limit;

    const [requests, total] = await leaveRepo.findAndCount({
      relations: ["user", "current_approver"],
      take: limit,
      skip: skip,
      order: { created_at: "DESC" },
    });

    const totalPages = Math.ceil(total / limit);

    res.status(200).json({
      status: "success",
      data: {
        requests,
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
    res.status(500).json({ message: e.message });
  }
};
