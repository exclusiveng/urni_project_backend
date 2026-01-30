import { AppDataSource } from "../../database/data-source";
import { Notification, NotificationType } from "../entities/Notification";
import { getIO } from "../socket";

const repo = AppDataSource.getRepository(Notification);

export class NotificationService {
  static async createNotification({ userId, actorId, type = NotificationType.GENERIC, title, body, payload }: {
    userId: string;
    actorId?: string | null;
    type?: NotificationType;
    title: string;
    body: string;
    payload?: any;
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
