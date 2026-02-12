import { Response, Request } from "express";
import { AppDataSource } from "../../database/data-source";
import { WorkLog } from "../entities/WorkLog";
import { AuthRequest } from "../middleware/auth.middleware";
import { Between } from "typeorm";
import { User, UserRole } from "../entities/User";

const workLogRepo = AppDataSource.getRepository(WorkLog);
const userRepo = AppDataSource.getRepository(User);

// Alias createLog as createAppraisal for route consistency
export const createAppraisal = async (
  req: AuthRequest,
  res: Response,
): Promise<Response | void> => {
  return createLog(req, res);
};

export const createLog = async (
  req: AuthRequest,
  res: Response,
): Promise<Response | void> => {
  try {
    const { achievements, challenges, date, workplace } = req.body;
    const user = req.user!;

    const allowedWorkplaces = ["interstate", "home", "office"];
    if (workplace && !allowedWorkplaces.includes(workplace)) {
      return res.status(400).json({
        message: "Invalid workplace. Allowed values: interstate, home, office.",
      });
    }

    if (!achievements) {
      return res
        .status(400)
        .json({ message: "Achievements field is required." });
    }

    // Default to today if date not provided
    const logDate = date ? new Date(date) : new Date();
    // Normalize to YYYY-MM-DD
    const dateStr = logDate.toISOString().split("T")[0];

    // Normalize workplace with default
    const workplaceVal = workplace || "office";

    // Check if log exists
    let workLog = await workLogRepo.findOne({
      where: {
        user_id: user.id,
        date: dateStr,
      },
    });

    if (workLog) {
      // Update existing
      workLog.achievements = achievements;
      workLog.challenges = challenges || workLog.challenges;
      workLog.workplace = workplace ? workplace : workLog.workplace;
      await workLogRepo.save(workLog);
      return res.status(200).json({
        status: "success",
        message: "Daily log updated successfully.",
        data: workLog,
      });
    } else {
      // Create new
      workLog = workLogRepo.create({
        user: user, // Ensure relation is set properly
        user_id: user.id,
        date: dateStr,
        achievements,
        challenges,
        workplace: workplaceVal,
      });
      await workLogRepo.save(workLog);
      return res.status(201).json({
        status: "success",
        message: "Daily log submitted successfully.",
        data: workLog,
      });
    }
  } catch (error: any) {
    return res.status(500).json({ message: error.message });
  }
};

export const getMyAppraisals = async (
  req: AuthRequest,
  res: Response,
): Promise<Response | void> => {
  // Wrapper around getMonthlyAppraisal but simpler? Or just fetch recent?
  // Let's use getMonthlyAppraisal logic but default to current month if not provided
  if (!req.query.month || !req.query.year) {
    const now = new Date();
    req.query.month = (now.getMonth() + 1).toString();
    req.query.year = now.getFullYear().toString();
  }
  return getMonthlyAppraisal(req, res);
};

export const getAppraisalsByUserId = async (
  req: Request,
  res: Response,
): Promise<Response | void> => {
  // Route uses userId param, controller expects query userId or req.user
  // Extract param and inject into query or call logic directly
  const { userId } = req.params;
  if (userId) {
    req.query.userId = userId;
  }
  // Default month/year if missing?
  if (!req.query.month || !req.query.year) {
    const now = new Date();
    req.query.month = (now.getMonth() + 1).toString();
    req.query.year = now.getFullYear().toString();
  }
  // We need to cast req to AuthRequest if we use req.user inside (which getMonthly does)
  // The route protection ensures req.user is there.
  return getMonthlyAppraisal(req as AuthRequest, res);
};

export const getAllAppraisals = async (
  req: AuthRequest,
  res: Response,
): Promise<Response | void> => {
  // Admin view of ALL logs? That's huge.
  // Maybe paginated recent logs?
  try {
    const { page = 1, limit = 20 } = req.query;
    const take = parseInt(limit as string) || 20;
    const skip = (parseInt(page as string) - 1) * take;

    const [logs, total] = await workLogRepo.findAndCount({
      order: { date: "DESC" },
      take,
      skip,
      relations: ["user"],
    });

    return res.status(200).json({
      status: "success",
      data: {
        logs,
        total,
        page: parseInt(page as string),
        totalPages: Math.ceil(total / take),
      },
    });
  } catch (error: any) {
    return res.status(500).json({ message: error.message });
  }
};

export const getMonthlyAppraisal = async (
  req: AuthRequest,
  res: Response,
): Promise<Response | void> => {
  try {
    const { userId, month, year } = req.query;

    const targetUserId = (userId as string) || req.user!.id; // Default to self if not provided

    // Security Check: Ensure user has permission to view others
    if (targetUserId !== req.user!.id) {
      const allowedRoles = [
        UserRole.CEO,
        UserRole.ADMIN,
        UserRole.MD,
        UserRole.HR,
        UserRole.DEPARTMENT_HEAD,
      ];
      // Expanded roles slightly to include HR/Dept Head as they might need to see reports
      if (!allowedRoles.includes(req.user!.role)) {
        return res.status(403).json({
          message:
            "You do not have permission to view other users' appraisals.",
        });
      }
    }

    if (!month || !year) {
      return res
        .status(400)
        .json({ message: "Please provide month (1-12) and year." });
    }

    const m = parseInt(month as string, 10);
    const y = parseInt(year as string, 10);

    const startDate = new Date(y, m - 1, 1); // Month is 0-indexed in JS Date/
    const endDate = new Date(y, m, 0); // Last day of month

    const dateStartStr = startDate.toISOString().split("T")[0];
    const dateEndStr = endDate.toISOString().split("T")[0];

    const logs = await workLogRepo.find({
      where: {
        user_id: targetUserId,
        date: Between(dateStartStr, dateEndStr) as any, // TypeORM date string comparison
      },
      order: { date: "ASC" },
    });

    const user = await userRepo.findOne({ where: { id: targetUserId } });

    return res.status(200).json({
      status: "success",
      data: {
        user: {
          id: user?.id,
          name: user?.name,
          email: user?.email,
          role: user?.role,
          signature_url: user?.signature_url,
        },
        period: `${y}-${m}`,
        totalLogs: logs.length,
        logs: logs.map((l) => ({
          id: l.id,
          date: l.date,
          achievements: l.achievements,
          challenges: l.challenges,
          workplace: l.workplace,
          signature_url: l.signature_url,
          signed_at: l.signed_at,
          createdAt: l.created_at,
        })),
      },
    });
  } catch (error: any) {
    return res.status(500).json({ message: error.message });
  }
};

export const addOwnerSignature = async (
  req: AuthRequest,
  res: Response,
): Promise<Response | void> => {
  try {
    const { id } = req.params; // Log ID
    const user = req.user!;

    // Find the log
    const log = await workLogRepo.findOne({ where: { id, user_id: user.id } }); // Only owner can sign
    if (!log) {
      return res
        .status(404)
        .json({ message: "Appraisal log not found or you are not the owner." });
    }

    if (!req.file) {
      // If no file uploaded, maybe check if user has a default signature profile_pic?
      // But usually signature needs to be explicitly applied.
      // If user has signature_url in profile, use that?
      // Let's assume the user uploaded a fresh signature image for this specific log OR
      // we can use the stored user.signature_url if provided in body "useStoredSignature".
      // For now, let's stick to the file upload pattern since route uses `uploadSignature.single`.
      return res.status(400).json({ message: "No signature file uploaded." });
    }

    const imagePath = req.file.path.replace(/\\/g, "/");
    const signatureUrl = `${req.protocol}://${req.get("host")}/${imagePath}`;

    log.signature_url = signatureUrl;
    log.signed_at = new Date();

    await workLogRepo.save(log);

    return res.status(200).json({
      status: "success",
      message: "Appraisal signed successfully",
      data: {
        signature_url: signatureUrl,
        signed_at: log.signed_at,
      },
    });
  } catch (error: any) {
    return res.status(500).json({ message: error.message });
  }
};
