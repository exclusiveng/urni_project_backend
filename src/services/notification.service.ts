import { Request } from "express";
import { AppDataSource } from "../../database/data-source";
import { Notification, NotificationType } from "../entities/Notification";
import { getIO } from "../socket";
import { mailService } from "./mail.service";
import { User, UserRole } from "../entities/User";

const repo = AppDataSource.getRepository(Notification);

export class NotificationService {
  static async notifyAdmins(
    req: Request,
    title: string,
    body: string,
    payload?: any,
  ) {
    try {
      const userRepo = AppDataSource.getRepository(User);
      const admins = await userRepo.find({
        where: [{ role: UserRole.CEO }, { role: UserRole.MD }],
      });

      for (const admin of admins) {
        req.notify?.(admin.id, {
          type: NotificationType.GENERIC,
          title,
          body,
          payload,
        });
      }
    } catch (err) {
      console.error("Failed to notify admins:", err);
    }
  }

  static async createNotification({
    userId,
    actorId,
    type = NotificationType.GENERIC,
    title,
    body,
    payload,
    emailOptions,
  }: {
    userId: string;
    actorId?: string | null;
    type?: NotificationType;
    title: string;
    body: string;
    payload?: any;
    emailOptions?: {
      send?: boolean;
      subject?: string;
      template?: string;
      to?: string;
      context?: any;
    };
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
            await mailService.sendTemplate(
              to,
              emailOptions.subject || title,
              emailOptions.template,
              emailOptions.context || {
                name: user?.name || to.split("@")[0],
                body,
              },
            );
          } else {
            await mailService.sendMail({
              to,
              subject: emailOptions.subject || title,
              text: body,
            });
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
    const notif = await repo.findOne({
      where: { id: notificationId, user_id: userId },
    });
    if (!notif) throw new Error("Notification not found");
    notif.is_read = true;
    await repo.save(notif);
    return notif;
  }

  static async markAllAsRead(userId: string) {
    // efficient update
    await repo.update({ user_id: userId, is_read: false }, { is_read: true });
  }

  static async sendBroadcast({
    title,
    body,
    role,
    actorId,
    payload,
  }: {
    title: string;
    body: string;
    role?: UserRole;
    actorId?: string;
    payload?: any;
  }) {
    const userRepo = AppDataSource.getRepository(User);

    // Find target users
    const query = userRepo
      .createQueryBuilder("user")
      .where("user.is_active = :active", { active: true });

    if (role) {
      query.andWhere("user.role = :role", { role });
    }

    const users = await query.getMany();

    if (users.length === 0) return { count: 0 };

    // Batch create notifications
    const notifications = users.map((user) =>
      repo.create({
        user_id: user.id,
        actor_id: actorId || null,
        type: NotificationType.GENERIC,
        title,
        body,
        payload,
      }),
    );

    // Save in chunks to avoid massive insert issues if thousands of users
    // TypeORM save can handle arrays, but let's be safe with chunking if needed.
    // For now, standard save is likely fine for < 10k users.
    await repo.save(notifications);

    // Socket Emission
    const io = getIO();

    // Efficiency: If broadcasting to all, maybe we can emit to a global room?
    // But currently we only have `user_<id>` rooms.
    // If we have a "global" room logic in socket.ts we could use it.
    // Assuming we don't, we might need to loop interactively or just rely on next fetch.
    // Iterating emits for 1000+ users might be slow.
    // Optimized approach: Emit to specific rooms in parallel (non-blocking).

    // Fire and forget socket events
    setImmediate(() => {
      notifications.forEach((n) => {
        io.to(`user_${n.user_id}`).emit("notification", n);
      });
    });

    return { count: notifications.length };
  }
}
