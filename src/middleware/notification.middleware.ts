import { Request, Response, NextFunction } from "express";
import { NotificationService } from "../services/notification.service";

// Extend Request to include notify helper
declare global {
  namespace Express {
    interface Request {
      notify?: (to: string, payload: { type?: string; title: string; body: string; payload?: any; actorId?: string | null }) => void;
    }
  }
}

export const attachNotifier = (req: Request, res: Response, next: NextFunction) => {
  // Buffer notifications on res.locals
  (res as any).locals = (res as any).locals || {};
  (res as any).locals.notifications = (res as any).locals.notifications || [];

  req.notify = (to, payload) => {
    (res as any).locals.notifications.push({ to, payload, actorId: payload.actorId || (req as any).user?.id || null });
  };

  // Flush after response is finished (best-effort delivery)
  res.on("finish", async () => {
    const buffered = (res as any).locals.notifications || [];
    if (!buffered.length) return;

    for (const n of buffered) {
      try {
        await NotificationService.createNotification({
          userId: n.to,
          actorId: n.actorId,
          type: n.payload.type,
          title: n.payload.title,
          body: n.payload.body,
          payload: n.payload.payload,
        });
      } catch (err) {
        console.error("Failed to persist/emit notification", err);
      }
    }
  });

  next();
};

export default attachNotifier;
