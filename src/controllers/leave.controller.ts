import { Response } from "express";
import { AppDataSource } from "../../database/data-source";
import { Department } from "../entities/Department";
import { LeaveRequest, LeaveStatus } from "../entities/LeaveRequest";
import { User, UserRole } from "../entities/User";
import { AuthRequest } from "../middleware/auth.middleware";

const leaveRepo = AppDataSource.getRepository(LeaveRequest);
const userRepo = AppDataSource.getRepository(User);
const deptRepo = AppDataSource.getRepository(Department);

// 1. Submit a Request
export const requestLeave = async (req: AuthRequest, res: Response): Promise<Response | void> => {
  try {
    const { type, reason, start_date, end_date } = req.body;
    const user = req.user!;

    // Validation: Check balance
    const start = new Date(start_date);
    const end = new Date(end_date);
    const daysRequested = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;

    if (daysRequested > user.leave_balance) {
      return res.status(400).json({ message: `Insufficient leave balance. You have ${user.leave_balance} days left.` });
    }

    let initialApprover = user.reports_to_id;

    // Logic: If no direct manager, check if department has a head
    if (!initialApprover && user.role !== UserRole.CEO) {
      if (user.department_id) {
        const dept = await deptRepo.findOne({ where: { id: user.department_id } });

        if (dept && dept.head_id) {
          // If the requester is the department head, they must report to someone else (e.g., CEO)
          if (dept.head_id !== user.id) {
            initialApprover = dept.head_id;
          }
        }
      }
    }

    // Final validation before creating
    if ((!initialApprover || initialApprover === user.id) && user.role !== UserRole.CEO) {
      return res.status(400).json({
        message: "No valid approval path found. Your profile might be incorrectly configured (e.g., reporting to yourself). Please contact HR."
      });
    }

    // CEO reports to themselves but gets auto-approved
    if (user.role === UserRole.CEO) {
      initialApprover = user.id;
    }

    const leave = leaveRepo.create({
      user_id: user.id,
      current_approver_id: initialApprover,
      type,
      reason,
      start_date,
      end_date,
      status: user.role === UserRole.CEO ? LeaveStatus.APPROVED : LeaveStatus.PENDING,
      approval_history: [`Request initiated by ${user.name}`]
    });

    // If CEO, deduct immediately
    if (user.role === UserRole.CEO) {
      user.leave_balance -= daysRequested;
      await userRepo.save(user);
    }

    await leaveRepo.save(leave);

    // Notify the initial approver (if pending)
    if (leave.status === LeaveStatus.PENDING && leave.current_approver_id) {
      req.notify?.(leave.current_approver_id, {
        type: "LEAVE",
        title: "Permissions approval required",
        body: `${user.name} has requested permissions (${leave.type}) from ${leave.start_date} to ${leave.end_date}.`,
        payload: { requestId: leave.id },
        emailOptions: { send: true, subject: `Permissions approval required: ${user.name}`, template: "permissions", context: { body: `A permissions request requires your review.`, cta_text: "Review Request", cta_url: `${process.env.FRONTEND_URL || process.env.MAIL_BRAND_URL || ""}/permissions/${leave.id}` } }
      });
    }

    // Notify requester (confirmation)
    req.notify?.(leave.user_id, {
      type: "LEAVE",
      title: `Permissions request submitted`,
      body: `Your permissions request is ${leave.status.toLowerCase()}.`,
      payload: { requestId: leave.id },
      emailOptions: { send: true, subject: `Permissions request ${leave.status.toLowerCase()}`, template: "permissions", context: { body: `Your request has been ${leave.status.toLowerCase()}.`, cta_text: "View Request", cta_url: `${process.env.FRONTEND_URL || process.env.MAIL_BRAND_URL || ""}/permissions/${leave.id}` } }
    });

    res.status(201).json({ status: "success", data: leave });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

// 2. Approve / Reject Logic (Recursive)
export const respondToLeave = async (req: AuthRequest, res: Response): Promise<Response | void> => {
  try {
    const requestId = req.params.requestId;
    const action = req.body.action?.toUpperCase(); // Normalize to "APPROVE" or "REJECT"
    const approver = req.user!;

    if (!action || !["APPROVE", "REJECT"].includes(action)) {
      return res.status(400).json({ message: "Invalid action. Use APPROVE or REJECT." });
    }

    const leave = await leaveRepo.findOne({
      where: { id: requestId },
      relations: ["user"]
    });

    if (!leave) return res.status(404).json({ message: "Leave request not found" });

    if (leave.status !== LeaveStatus.PENDING) {
      return res.status(400).json({ message: `This request has already been ${leave.status.toLowerCase()}.` });
    }

    // Security: Ensure the person acting is the assigned current_approver
    if (leave.current_approver_id !== approver.id && approver.role !== UserRole.CEO) {
      return res.status(403).json({ message: "You are not the current approver for this request." });
    }

    if (action === "REJECT") {
      leave.status = LeaveStatus.REJECTED;
      leave.approval_history.push(`Rejected by ${approver.name} (${approver.role})`);
      leave.current_approver_id = null;
      await leaveRepo.save(leave);

      // Notify requester
      req.notify?.(leave.user_id, {
        type: "LEAVE",
        title: "Permissions request rejected",
        body: `Your permissions request was rejected by ${approver.name}.`,
        payload: { requestId: leave.id },
        emailOptions: { send: true, subject: `Permissions request rejected`, template: "permissions", context: { body: `Your permissions request was rejected by ${approver.name}.`, cta_text: "View Request", cta_url: `${process.env.FRONTEND_URL || process.env.MAIL_BRAND_URL || ""}/permissions/${leave.id}` } }
      });

      return res.status(200).json({ status: "success", message: "Leave request rejected.", data: leave });
    }

    // --- APPROVAL FLOW ---
    leave.approval_history.push(`Approved by ${approver.name} (${approver.role})`);

    // Check if Approver is a "Major Head"
    const isMajorHead = [UserRole.CEO, UserRole.ME_QC, UserRole.ADMIN, UserRole.DEPARTMENT_HEAD].includes(approver.role);

    if (isMajorHead) {
      // FINAL APPROVAL
      leave.status = LeaveStatus.APPROVED;
      leave.current_approver_id = null;

      // Deduct Balance from Requester
      const requester = await userRepo.findOne({ where: { id: leave.user_id } });
      if (requester) {
        const start = new Date(leave.start_date);
        const end = new Date(leave.end_date);
        const days = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
        requester.leave_balance -= days;
        await userRepo.save(requester);
      }

      await leaveRepo.save(leave);

      // Notify requester about final approval
      req.notify?.(leave.user_id, {
        type: "LEAVE",
        title: "Permissions approved",
        body: `Your permissions request has been approved by ${approver.name}.`,
        payload: { requestId: leave.id },
        emailOptions: { send: true, subject: `Permissions approved`, template: "permissions", context: { body: `Your permissions request has been approved by ${approver.name}.`, cta_text: "View Request", cta_url: `${process.env.FRONTEND_URL || process.env.MAIL_BRAND_URL || ""}/permissions/${leave.id}` } }
      });

      return res.status(200).json({ status: "success", message: "Leave request fully approved.", data: leave });

    } else {

      if (!approver.reports_to_id) {
        leave.status = LeaveStatus.APPROVED;
        await leaveRepo.save(leave);
        return res.status(200).json({ message: "Approved (No superior found to escalate to)." });
      }

      leave.current_approver_id = approver.reports_to_id;
      await leaveRepo.save(leave);

      // Notify requester about escalation
      req.notify?.(leave.user_id, {
        type: "LEAVE",
        title: "Permissions approved (pending final approval)",
        body: `${approver.name} approved your permissions request and escalated it for final approval.`,
        payload: { requestId: leave.id },
        emailOptions: { send: true, subject: `Permissions pending final approval`, template: "permissions", context: { body: `${approver.name} approved your permissions request and escalated it for final approval.`, cta_text: "View Request", cta_url: `${process.env.FRONTEND_URL || process.env.MAIL_BRAND_URL || ""}/permissions/${leave.id}` } }
      });

      // Notify next approver
      if (approver.reports_to_id) {
        req.notify?.(approver.reports_to_id, {
          type: "LEAVE",
          title: "Permissions approval required",
          body: `A permissions request has been escalated to you for final approval.`,
          payload: { requestId: leave.id },
          emailOptions: { send: true, subject: `Permissions approval required`, template: "permissions", context: { body: `A permissions request has been escalated to you for final approval.`, cta_text: "Review Request", cta_url: `${process.env.FRONTEND_URL || process.env.MAIL_BRAND_URL || ""}/permissions/${leave.id}` } }
        });
      }

      return res.status(200).json({
        status: "success",
        message: "Approved by you. Escalated to your superior for final approval.",
        data: leave
      });
    }

  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

// 3. Get Requests for Me (To Approve)
export const getPendingApprovals = async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user!;
    const requests = await leaveRepo.find({
      where: { current_approver_id: user.id, status: LeaveStatus.PENDING },
      relations: ["user"]
    });
    res.status(200).json({ status: "success", data: requests });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

// 4. Get My Requests (History)
export const getMyRequests = async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user!;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const skip = (page - 1) * limit;

    const [requests, total] = await leaveRepo.findAndCount({
      where: { user_id: user.id },
      order: { created_at: "DESC" },
      skip,
      take: limit
    });

    res.status(200).json({
      status: "success",
      data: requests,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

// 5. Get a Specific User's Requests (For Admin God-view)
export const getUserRequests = async (req: AuthRequest, res: Response) => {
  try {
    const { userId } = req.params;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const skip = (page - 1) * limit;

    const [requests, total] = await leaveRepo.findAndCount({
      where: { user_id: userId },
      order: { created_at: "DESC" },
      skip,
      take: limit
    });

    res.status(200).json({
      status: "success",
      data: requests,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};