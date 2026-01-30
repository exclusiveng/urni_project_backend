import { Response } from "express";
import { NotificationService } from "../services/notification.service";
import { AuthRequest } from "../middleware/auth.middleware";

export const getNotifications = async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user!;
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(100, parseInt(req.query.limit as string) || 20);

    const { rows, total } = await NotificationService.getNotificationsForUser(user.id, page, limit);

    return res.status(200).json({ status: "success", pagination: { total, page, limit }, data: rows });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
};

export const markNotificationRead = async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user!;
    const { id } = req.params;

    const notif = await NotificationService.markAsRead(id, user.id);

    return res.status(200).json({ status: "success", data: notif });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
};

export default { getNotifications, markNotificationRead };
