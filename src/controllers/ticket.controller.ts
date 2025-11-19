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

    // Validation: Does target exist?
    const target = await userRepo.findOne({ where: { id: target_user_id } });
    if (!target) {
      return res.status(404).json({ message: "Target user not found" });
    }

    // Logic: Who can issue to whom?
    // 1. Whistleblowing (Any Staff -> Any Manager/Staff)
    if (is_anonymous) {
        // Allow it, but mark anonymous
    } 
    // 2. Standard Disciplinary (Manager -> Subordinate)
    else {
        // Simple check: Is issuer a manager?
        if (issuer.role === UserRole.STAFF) {
            return res.status(403).json({ message: "Staff cannot issue disciplinary tickets. Use anonymous whistleblowing instead." });
        }
        // In a stricter system, we would check if target.reports_to_id === issuer.id
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

    const ticket = await ticketRepo.findOne({ where: { id: ticketId } });

    if (!ticket) return res.status(404).json({ message: "Ticket not found" });

    // Only the accused can respond
    if (ticket.target_user_id !== user.id) {
      return res.status(403).json({ message: "This ticket is not addressed to you." });
    }

    if (ticket.status !== TicketStatus.OPEN) {
      return res.status(400).json({ message: "This ticket has already been processed." });
    }

    // ACTION A: ACKNOWLEDGE (Accept Fault)
    if (action === "ACKNOWLEDGE") {
        ticket.status = TicketStatus.RESOLVED;
        
        // DEDUCT SCORE
        // Fetch user fresh to ensure accuracy
        const targetUser = await userRepo.findOne({ where: { id: user.id } });
        if (targetUser) {
            targetUser.stats_score = Math.max(0, targetUser.stats_score - ticket.severity); // Don't go below 0
            await userRepo.save(targetUser);
        }

        await ticketRepo.save(ticket);
        return res.status(200).json({ 
            status: "success", 
            message: "Ticket acknowledged. Score updated.", 
            current_score: targetUser?.stats_score 
        });
    }

    // ACTION B: CONTEST
    if (action === "CONTEST") {
        if (!contest_note) {
            return res.status(400).json({ message: "You must provide a reason/note to contest a ticket." });
        }
        
        ticket.status = TicketStatus.CONTESTED;
        ticket.contest_note = contest_note;
        await ticketRepo.save(ticket);

        return res.status(200).json({ 
            status: "success", 
            message: "Ticket contested. HR has been notified." 
        });
    }

  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

// 3. Get Tickets
export const getTickets = async (req: AuthRequest, res: Response): Promise<Response | void> => {
    try {
        const user = req.user!;
        
        // Scenario A: CEO/SuperAdmin (God Mode - See Contested or All)
        if ([UserRole.CEO, UserRole.SUPERADMIN].includes(user.role)) {
             // Show all, specifically highlighting contested ones
             const tickets = await ticketRepo.find({
                order: { created_at: "DESC" },
                relations: ["target_user", "issuer"]
             });
             // Hide issuer name if anonymous
             const sanitized = tickets.map(t => ({
                 ...t,
                 issuer: t.is_anonymous ? null : t.issuer
             }));
             return res.status(200).json({ status: "success", data: sanitized });
        }

        // Scenario B: Staff (See tickets against ME)
        const myTickets = await ticketRepo.find({
            where: { target_user_id: user.id },
            order: { created_at: "DESC" },
            relations: ["issuer"]
        });
        
        const sanitized = myTickets.map(t => ({
             ...t,
             issuer: t.is_anonymous ? { name: "Anonymous" } : t.issuer
        }));

        res.status(200).json({ status: "success", data: sanitized });

    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};