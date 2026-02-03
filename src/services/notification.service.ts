import { Request } from "express";
import { AppDataSource } from "../../database/data-source";
import { Notification, NotificationType } from "../entities/Notification";
import { getIO } from "../socket";
import { mailService } from "./mail.service";
import { User, UserRole } from "../entities/User";

const repo = AppDataSource.getRepository(Notification);

export class NotificationService {
  static async notifyAdmins(req: Request, title: string, body: string, payload?: any) {
    try {
      const userRepo = AppDataSource.getRepository(User);
      const admins = await userRepo.find({
        where: [
          { role: UserRole.CEO },
          { role: UserRole.ME_QC }
        ]
      });

      for (const admin of admins) {
        req.notify?.(admin.id, {
          type: NotificationType.GENERIC,
          title,
          body,
          payload
        });
      }
    } catch (err) {
      console.error("Failed to notify admins:", err);
    }
  }

  static async createNotification({ userId, actorId, type = NotificationType.GENERIC, title, body, payload, emailOptions }: {
    userId: string;
    actorId?: string | null;
    type?: NotificationType;
    title: string;
    body: string;
    payload?: any;
    emailOptions?: { send?: boolean; subject?: string; template?: string; to?: string; context?: any };
  }) {
    const notification = repo.create({
      user_id: userId,
      actor_id: actorId || null,
      type,
      title,
      body,
      payload,
    });

    const saved = await repo.save(notification);

    // Try to emit to the user's socket room; swallow errors so delivery doesn't break requests
    try {
      const io = getIO();
      io.to(`user_${userId}`).emit("notification", saved);
      saved.delivered_at = new Date();
      await repo.save(saved);
    } catch (err) {
      // Log to console for now; Winston logger could be used
      // Do not throw; delivery should be best-effort
      console.error("Notification emit failed:", err);
    }

    // Optional: send an email when requested
    if (emailOptions?.send) {
      try {
        const userRepo = AppDataSource.getRepository(User);
        const user = await userRepo.findOne({ where: { id: userId } });
        const to = emailOptions.to || user?.email;
        if (to) {
          if (emailOptions.template) {
            await mailService.sendTemplate(to, emailOptions.subject || title, emailOptions.template, emailOptions.context || { name: user?.name || to.split('@')[0], body });
          } else {
            await mailService.sendMail({ to, subject: emailOptions.subject || title, text: body });
          }
        }
      } catch (err) {
        console.error("Email send failed:", err);
      }
    }

    return saved;
  }

  static async getNotificationsForUser(userId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const [rows, total] = await repo.findAndCount({
      where: { user_id: userId },
      order: { created_at: "DESC" },
      skip,
      take: limit,
    });

    return { rows, total };
  }

  static async markAsRead(notificationId: string, userId: string) {
    const notif = await repo.findOne({ where: { id: notificationId, user_id: userId } });
    if (!notif) throw new Error("Notification not found");
    notif.is_read = true;
    await repo.save(notif);
    return notif;
  }
}
