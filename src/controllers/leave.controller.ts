import { Response } from "express";
import { AppDataSource } from "../../database/data-source";
import { LeaveRequest, LeaveStatus } from "../entities/LeaveRequest";
import { User, UserRole } from "../entities/User";
import { AuthRequest } from "../middleware/auth.middleware";

const leaveRepo = AppDataSource.getRepository(LeaveRequest);
const userRepo = AppDataSource.getRepository(User);

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

    if (!user.reports_to_id && user.role !== UserRole.CEO) {
      return res.status(400).json({ message: "You do not have a manager assigned to approve this request." });
    }

    const initialApprover = user.reports_to_id || user.id; 

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

    res.status(201).json({ status: "success", data: leave });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

// 2. Approve / Reject Logic (Recursive)
export const respondToLeave = async (req: AuthRequest, res: Response): Promise<Response | void> => {
  try {
    const { requestId } = req.params;
    const { action } = req.body; // "APPROVE" or "REJECT"
    const approver = req.user!;

    const leave = await leaveRepo.findOne({ 
      where: { id: requestId },
      relations: ["user", "current_approver"] 
    });

    if (!leave) return res.status(404).json({ message: "Leave request not found" });

    // Security: Ensure the person acting is the assigned current_approver
    if (leave.current_approver_id !== approver.id && approver.role !== UserRole.CEO) {
      return res.status(403).json({ message: "You are not the current approver for this request." });
    }

    if (action === "REJECT") {
      leave.status = LeaveStatus.REJECTED;
      leave.approval_history.push(`Rejected by ${approver.name} (${approver.role})`);
      leave.current_approver_id = null;
      await leaveRepo.save(leave);
      return res.status(200).json({ status: "success", message: "Leave request rejected.", data: leave });
    }

    // --- APPROVAL FLOW ---
    leave.approval_history.push(`Approved by ${approver.name} (${approver.role})`);

    // Check if Approver is a "Major Head"
    const isMajorHead = [UserRole.CEO, UserRole.ME_QC, UserRole.ADMIN].includes(approver.role);

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
      return res.status(200).json({ status: "success", message: "Leave request fully approved.", data: leave });

    } else {
      
      if (!approver.reports_to_id) {
         leave.status = LeaveStatus.APPROVED;
         await leaveRepo.save(leave);
         return res.status(200).json({ message: "Approved (No superior found to escalate to)." });
      }

      leave.current_approver_id = approver.reports_to_id;
      await leaveRepo.save(leave);
      
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
            relations: ["user"] // See who is asking
        });
        res.status(200).json({ status: "success", data: requests });
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};