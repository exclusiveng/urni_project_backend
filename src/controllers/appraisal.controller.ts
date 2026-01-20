import { Response } from "express";
import { AppDataSource } from "../../database/data-source";
import { WorkLog } from "../entities/WorkLog";
import { AuthRequest } from "../middleware/auth.middleware";
import { Between } from "typeorm";
import { User, UserRole } from "../entities/User";

const workLogRepo = AppDataSource.getRepository(WorkLog);
const userRepo = AppDataSource.getRepository(User);

export const createLog = async (req: AuthRequest, res: Response): Promise<Response | void> => {
    try {
        const { achievements, challenges, date } = req.body;
        const user = req.user!;

        if (!achievements) {
            return res.status(400).json({ message: "Achievements field is required." });
        }

        // Default to today if date not provided
        const logDate = date ? new Date(date) : new Date();
        // Normalize to YYYY-MM-DD
        const dateStr = logDate.toISOString().split('T')[0];

        // Check if log exists
        let workLog = await workLogRepo.findOne({
            where: {
                user_id: user.id,
                date: dateStr
            }
        });

        if (workLog) {
            // Update existing
            workLog.achievements = achievements;
            workLog.challenges = challenges || workLog.challenges;
            await workLogRepo.save(workLog);
            return res.status(200).json({ status: "success", message: "Daily log updated successfully.", data: workLog });
        } else {
            // Create new
            workLog = workLogRepo.create({
                user_id: user.id,
                date: dateStr,
                achievements,
                challenges
            });
            await workLogRepo.save(workLog);
            return res.status(201).json({ status: "success", message: "Daily log submitted successfully.", data: workLog });
        }

    } catch (error: any) {
        return res.status(500).json({ message: error.message });
    }
};

export const getMonthlyAppraisal = async (req: AuthRequest, res: Response): Promise<Response | void> => {
    try {
        const { userId, month, year } = req.query;

        const targetUserId = (userId as string) || req.user!.id; // Default to self if not provided

        // Security Check: Ensure user has permission to view others
        if (targetUserId !== req.user!.id) {
            const allowedRoles = [UserRole.CEO, UserRole.ADMIN, UserRole.ME_QC];
            if (!allowedRoles.includes(req.user!.role)) {
                return res.status(403).json({ message: "You do not have permission to view other users' appraisals." });
            }
        }

        // If viewing others, strictly check role (RBAC checks are usually in routes, but good to be safe)
        // Here we assume the route is protected properly or we check relationship
        // For simplicity: Admin/CEO/HOD/ME_QC can view others. Peers cannot.
        // We'll leave strict RBAC to middleware, but ensure User exists.

        if (!month || !year) {
            return res.status(400).json({ message: "Please provide month (1-12) and year." });
        }

        const m = parseInt(month as string, 10);
        const y = parseInt(year as string, 10);

        const startDate = new Date(y, m - 1, 1); // Month is 0-indexed in JS Date
        const endDate = new Date(y, m, 0); // Last day of month

        const dateStartStr = startDate.toISOString().split('T')[0];
        const dateEndStr = endDate.toISOString().split('T')[0];

        const logs = await workLogRepo.find({
            where: {
                user_id: targetUserId,
                date: Between(dateStartStr, dateEndStr) as any // TypeORM date string comparison
            },
            order: { date: "ASC" }
        });

        const user = await userRepo.findOne({ where: { id: targetUserId } });

        return res.status(200).json({
            status: "success",
            data: {
                user: {
                    id: user?.id,
                    name: user?.name,
                    email: user?.email,
                    role: user?.role
                },
                period: `${y}-${m}`,
                totalLogs: logs.length,
                logs: logs.map(l => ({
                    date: l.date,
                    achievements: l.achievements,
                    challenges: l.challenges,
                    createdAt: l.created_at
                }))
            }
        });

    } catch (error: any) {
        return res.status(500).json({ message: error.message });
    }
};
