import { Response } from "express";
import { AppDataSource } from "../../database/data-source";
import { LeaveRequest, LeaveStatus } from "../entities/LeaveRequest";
import { User, UserRole } from "../entities/User";
import { AuthRequest } from "../middleware/auth.middleware";

const leaveRepo = AppDataSource.getRepository(LeaveRequest);
const userRepo = AppDataSource.getRepository(User);

// Helper: Determine next approver based on current user role
const getNextApprover = async (currentUser: User): Promise<User | null> => {
  // 1. If user is General Staff/Intern/etc -> Reports To (which should be Asst Head or Head)
  // 2. If user is Asst Head -> Head
  // 3. If user is Head -> HR
  // 4. If user is HR -> MD/Admin

  if (currentUser.reportsTo) return currentUser.reportsTo;

  // Fallback logic if reportsTo is not set explicitly (based on hierarchy)
  const dept = currentUser.department;
  if (!dept) return null;

  if (currentUser.role === UserRole.ASST_DEPARTMENT_HEAD) {
    // Find Dept Head
    if (dept.head) return dept.head;
    // If no head, escalate to HR/Admin?
    // Query for an HR
    return await userRepo.findOne({ where: { role: UserRole.HR as any } });
  }

  if (currentUser.role === UserRole.DEPARTMENT_HEAD) {
    // Escalate to HR
    return await userRepo.findOne({ where: { role: UserRole.HR as any } });
  }

  if (currentUser.role === UserRole.HR) {
    // Escalate to MD or Admin
    return await userRepo.findOne({ where: { role: UserRole.MD as any } });
  }

  // Default for staff: try finding Asst Head, then Head
  if (dept.assistantHead) return dept.assistantHead;
  if (dept.head) return dept.head;

  return null;
};

export const requestLeave = async (
  req: AuthRequest,
  res: Response,
): Promise<Response | void> => {
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

    // Notify approver logic here...

    return res.status(201).json({ status: "success", data: { leave } });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const respondToLeave = async (
  req: AuthRequest,
  res: Response,
): Promise<Response | void> => {
  try {
    const { id } = req.params;
    const { status, remarks } = req.body; // Approved or Rejected
    const approver = req.user!;

    const leave = await leaveRepo.findOne({
      where: { id },
      relations: ["user", "current_approver"],
    });
    if (!leave)
      return res.status(404).json({ message: "Leave request not found" });

    if (
      leave.current_approver_id !== approver.id &&
      approver.role !== UserRole.CEO
    ) {
      return res
        .status(403)
        .json({
          message: "You are not the current approver for this request.",
        });
    }

    if (status === LeaveStatus.REJECTED) {
      leave.status = LeaveStatus.REJECTED;
      leave.approval_history.push(
        `Rejected by ${approver.name} (${approver.role}): ${remarks}`,
      );
      leave.current_approver = null as any;
      await leaveRepo.save(leave);
      return res.status(200).json({ message: "Leave rejected" });
    }

    // Approval Logic
    leave.approval_history.push(
      `Approved by ${approver.name} (${approver.role}): ${remarks || ""}`,
    );

    // Define final approval roles (e.g. HR or MD/CEO)
    // If Approved by HR/MD/CEO/Admin -> Final Approval
    const finalApprovers = [
      UserRole.HR,
      UserRole.MD,
      UserRole.ADMIN,
      UserRole.CEO,
    ];
    if (finalApprovers.includes(approver.role)) {
      leave.status = LeaveStatus.APPROVED;
      leave.current_approver = null as any;
      // deduct balance logic
      const requester = await userRepo.findOne({
        where: { id: leave.user_id },
      });
      if (requester) {
        requester.leave_balance -= 1; // Simplify calculation for now
        await userRepo.save(requester);
      }
    } else {
      // Escalate
      const next = await getNextApprover(approver);
      if (next) {
        leave.current_approver = next;
      } else {
        // No one higher? Auto-approve? Or wait?
        // Let's mark approved if no higher authority found (edge case)
        leave.status = LeaveStatus.APPROVED;
      }
    }

    await leaveRepo.save(leave);
    return res.status(200).json({ status: "success", data: { leave } });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const getPendingApprovals = async (
  req: AuthRequest,
  res: Response,
): Promise<Response | void> => {
  try {
    const user = req.user!;
    const requests = await leaveRepo.find({
      where: { current_approver: { id: user.id }, status: LeaveStatus.PENDING },
      relations: ["user"],
    });
    return res.status(200).json({ status: "success", data: { requests } });
  } catch (error: any) {
    return res.status(500).json({ message: error.message });
  }
};

export const getMyRequests = async (
  req: AuthRequest,
  res: Response,
): Promise<Response | void> => {
  try {
    const user = req.user!;
    const requests = await leaveRepo.find({ where: { user: { id: user.id } } });
    return res.status(200).json({ status: "success", data: { requests } });
  } catch (error: any) {
    return res.status(500).json({ message: error.message });
  }
};

// Admin view all
export const getAllRequests = async (
  _req: AuthRequest,
  res: Response,
): Promise<Response | void> => {
  try {
    const requests = await leaveRepo.find({
      relations: ["user", "current_approver"],
    });
    return res.status(200).json({ status: "success", data: { requests } });
  } catch (e: any) {
    return res.status(500).json({ message: e.message });
  }
};
