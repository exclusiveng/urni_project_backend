import { Response } from "express";
import { AppDataSource } from "../../database/data-source";
import { Ticket, TicketStatus, TicketSeverity } from "../entities/Ticket";
import { User, UserRole } from "../entities/User";
import { AuthRequest } from "../middleware/auth.middleware";

const ticketRepo = AppDataSource.getRepository(Ticket);
const userRepo = AppDataSource.getRepository(User);

// 1. Issue a Ticket
export const issueTicket = async (req: AuthRequest, res: Response): Promise<Response | void> => {
  try {
    const { target_user_id, title, description, severity, is_anonymous } = req.body;
    const issuer = req.user!;


    const target = await userRepo.findOne({ where: { id: target_user_id } });
    if (!target) {
      return res.status(404).json({ message: "Target user not found" });
    }


    if (!is_anonymous) {
        // For non-anonymous tickets, we enforce a stricter hierarchy check.
        
        // 1. General Staff cannot issue non-anonymous disciplinary tickets.
        if (issuer.role === UserRole.GENERAL_STAFF) {
            return res.status(403).json({ message: "General Staff cannot issue disciplinary tickets directly. Please use the anonymous whistleblowing feature if you need to report an issue." });
        }

        // 2. For other roles, check their authority:
        // CEO, ADMIN, and ME_QC roles have broad authority and can issue tickets to anyone.
        if (![UserRole.CEO, UserRole.ME_QC].includes(issuer.role)) {
            // For roles like DEPARTMENT_HEAD, they can only issue tickets to their direct subordinates.
            // This check ensures the target user reports directly to the issuer.
            if (target.reports_to_id !== issuer.id) {
                return res.status(403).json({ 
                    message: "You can only issue disciplinary tickets to users who directly report to you." 
                });
            }
        }
    }

    const ticket = ticketRepo.create({
      issuer_id: issuer.id,
      target_user_id,
      title,
      description,
      severity: severity || TicketSeverity.LOW,
      is_anonymous: !!is_anonymous
    });

    await ticketRepo.save(ticket);

    res.status(201).json({ status: "success", message: "Ticket issued successfully.", data: ticket });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

// 2. Respond (Acknowledge or Contest)
export const respondToTicket = async (req: AuthRequest, res: Response): Promise<Response | void> => {
  try {
    const { ticketId } = req.params;
    const { action, contest_note } = req.body; // "ACKNOWLEDGE" or "CONTEST"
    const user = req.user!;

    // Use a transaction for multi-step operations (update ticket + update user stats)
    await AppDataSource.transaction(async (manager) => {
      const txTicketRepo = manager.getRepository(Ticket);
      const txUserRepo = manager.getRepository(User);

      const ticket = await txTicketRepo.findOne({ where: { id: ticketId } });

      if (!ticket) {
        // throw to be caught below and return appropriate status
        throw { statusCode: 404, message: "Ticket not found" };
      }

      // Only the accused can respond
      if (ticket.target_user_id !== user.id) {
        throw { statusCode: 403, message: "This ticket is not addressed to you." };
      }

      if (ticket.status !== TicketStatus.OPEN) {
        throw { statusCode: 400, message: "This ticket has already been processed." };
      }

      // ACTION A: ACKNOWLEDGE (Accept Fault)
      if (action === "ACKNOWLEDGE") {
        ticket.status = TicketStatus.RESOLVED;

        // Fetch fresh user row within transaction
        const targetUser = await txUserRepo.findOne({ where: { id: user.id } });
        if (!targetUser) {
          throw { statusCode: 404, message: "Target user not found" };
        }

        // DEDUCT SCORE (ensure not below 0)
        const severityVal = (ticket.severity as unknown as number) || 0;
        targetUser.stats_score = Math.max(0, (targetUser.stats_score || 0) - severityVal);

        // Persist both updates inside the same transaction
        await txUserRepo.save(targetUser);
        await txTicketRepo.save(ticket);

        // Attach the updated score to the result by returning it from transaction
        (res as any).__txResult = { current_score: targetUser.stats_score };
        return;
      }

      // ACTION B: CONTEST
      if (action === "CONTEST") {
        if (!contest_note) {
          throw { statusCode: 400, message: "You must provide a reason/note to contest a ticket." };
        }

        ticket.status = TicketStatus.CONTESTED;
        ticket.contest_note = contest_note;
        await txTicketRepo.save(ticket);

        (res as any).__txResult = null;
        return;
      }

      throw { statusCode: 400, message: "Invalid action" };
    });

    // Transaction completed successfully. Read tx result (if any)
    const txResult = (res as any).__txResult;

    if (req.body.action === "ACKNOWLEDGE") {
      return res.status(200).json({
        status: "success",
        message: "Ticket acknowledged. Score updated.",
        current_score: txResult?.current_score,
      });
    }

    if (req.body.action === "CONTEST") {
      return res.status(200).json({
        status: "success",
        message: "Ticket contested. HR has been notified.",
      });
    }

    // Fallback
    return res.status(200).json({ status: "success" });
  } catch (error: any) {
    const status = error?.statusCode || 500;
    const message = error?.message || error?.detail || "Internal Server Error";
    return res.status(status).json({ message });
  }
};

// 3. Get Tickets
export const getTickets = async (req: AuthRequest, res: Response): Promise<Response | void> => {
    try {
        const user = req.user!;
        const page = parseInt(req.query.page as string) || 1; // Default to page 1
        const limit = parseInt(req.query.limit as string) || 10; // Default to 10 items per page
        const skip = (page - 1) * limit;
        
        // Scenario A: CEO/SuperAdmin (God Mode - See Contested or All)
        if ([UserRole.CEO, UserRole.ME_QC].includes(user.role)) {
             // Show all, specifically highlighting contested ones
             const [tickets, total] = await ticketRepo.findAndCount({
                order: { created_at: "DESC" },
                relations: ["target_user", "issuer"],
                skip,
                take: limit
             });
             // Hide issuer name if anonymous
             const sanitized = tickets.map(t => ({
                 ...t,
                 issuer: t.is_anonymous ? null : t.issuer
             }));
             return res.status(200).json({ 
                status: "success", 
                data: sanitized,
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit)
            });
        }

        // Scenario B: Staff (See tickets against ME)
        const [myTickets, total] = await ticketRepo.findAndCount({
            where: { target_user_id: user.id },
            order: { created_at: "DESC" },
            relations: ["issuer"],
            skip,
            take: limit
        });
        
        const sanitized = myTickets.map(t => ({
             ...t,
             issuer: t.is_anonymous ? { name: "Anonymous" } : t.issuer
        }));
        const totalPages = Math.ceil(total / limit);

        res.status(200).json({ 
            status: "success", 
            data: sanitized,
            page,
            limit,
            total,
            totalPages
        });

    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};