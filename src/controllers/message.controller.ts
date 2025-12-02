import { Request, Response } from "express";
import { AppDataSource } from "../../database/data-source";
import { Message } from "../entities/Message";
import { User, UserRole } from "../entities/User";
import { AuthRequest } from "../middleware/auth.middleware";
import { Brackets } from "typeorm";
import { getIO } from "../socket";

const messageRepo = AppDataSource.getRepository(Message);
const userRepo = AppDataSource.getRepository(User);

// 1. Send a Message
export const sendMessage = async (req: AuthRequest, res: Response): Promise<Response | void> => {
  try {
    const { receiver_id, content } = req.body;
    const sender = req.user!;

    if (sender.id === receiver_id) {
        return res.status(400).json({ message: "You cannot message yourself." });
    }

    const receiver = await userRepo.findOne({ where: { id: receiver_id } });
    if (!receiver) {
        return res.status(404).json({ message: "Receiver not found." });
    }

    const message = messageRepo.create({
      sender_id: sender.id,
      receiver_id,
      content
    });

    await messageRepo.save(message);

    // Emit a Socket.io event to the receiver's room
    getIO().to(receiver_id).emit("new_message", message);

    res.status(201).json({ status: "success", data: message });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

// 2. Get Conversation (or All Messages for CEO)
export const getMessages = async (req: AuthRequest, res: Response): Promise<Response | void> => {
  try {
    const user = req.user!;
    const { contactId } = req.params; 

    // --- PAGINATION ---
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 15;
    const skip = (page - 1) * limit;

    const query = messageRepo.createQueryBuilder("message")
      .leftJoinAndSelect("message.sender", "sender")
      .leftJoinAndSelect("message.receiver", "receiver")
      .orderBy("message.created_at", "ASC");

    // --- SCENARIO A: CEO (GOD MODE) ---
    if (user.role === UserRole.CEO) {
        
        if (contactId) {
            // For CEO, filter by a specific user's conversations if contactId is provided
            query.where("message.sender_id = :contactId OR message.receiver_id = :contactId", { contactId })
                 .orWhere("message.sender_id = :contactId AND message.receiver_id = :contactId", { contactId });
        }
    } 
    
    // --- SCENARIO B: STANDARD USER ---
    else {
        if (!contactId) {
            return res.status(400).json({ message: "Please specify a user ID to fetch the conversation." });
        }

        // Standard users can ONLY see messages they sent OR received
        query.where(
            new Brackets((qb) => {
                qb.where(
                    "(message.sender_id = :userId AND message.receiver_id = :contactId)",
                    { userId: user.id, contactId }
                ).orWhere(
                    "(message.sender_id = :contactId AND message.receiver_id = :userId)",
                    { userId: user.id, contactId }
                );
            })
        );
    }

    const [messages, total] = await query
        .skip(skip)
        .take(limit)
        .getManyAndCount();

    
    res.status(200).json({ 
        status: "success", 
        pagination: {
          totalItems: total,
          totalPages: Math.ceil(total / limit),
          currentPage: page,
          limit: limit,
        },
        data: messages 
    });

  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

// 3. Get Inbox (List of people I've talked to)
export const getInbox = async (req: AuthRequest, res: Response) => {
    try {
        const user = req.user!;
        const userId = user.id;

        // --- PAGINATION ---
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 15;
        const skip = (page - 1) * limit;

        // This subquery identifies the latest message ID for each conversation.
        const latestMessageIdsSubquery = `
            SELECT id FROM (
                SELECT 
                    id,
                    ROW_NUMBER() OVER(
                        PARTITION BY CASE WHEN sender_id = :userId THEN receiver_id ELSE sender_id END 
                        ORDER BY created_at DESC
                    ) as rn
                FROM messages
                WHERE sender_id = :userId OR receiver_id = :userId
            ) AS ranked_messages
            WHERE rn = 1
        `;


        // The main query fetches the full message and contact details for each latest message.
        const [inbox, total] = await messageRepo.createQueryBuilder("message")
            // Use the subquery to find the latest message IDs
            .where(`message.id IN (${latestMessageIdsSubquery})`)
            // Pass parameters as an object for named parameters like :userId
            .setParameters({ userId })
            // Eagerly load both the sender and receiver for each message
            .innerJoinAndSelect("message.sender", "sender")
            .innerJoinAndSelect("message.receiver", "receiver")
            .orderBy("message.created_at", "DESC")
            .skip(skip)
            .take(limit)
            .getManyAndCount();

        res.status(200).json({ 
            status: "success", 
            pagination: {
                totalItems: total,
                totalPages: Math.ceil(total / limit),
                currentPage: page,
                limit: limit
            },
            data: inbox 
        });

    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

/**
 * GET /api/messages/conversation/:userId?limit=20&cursor=<base64>
 * Returns messages between req.user and :userId using cursor pagination.
 */
export const getConversation = async (req: Request, res: Response) => {
  try {
    const userId = req.params.userId;
    const pageLimit = Math.max(1, Math.min(100, Number(req.query.limit) || 20));
    const cursor = req.query.cursor as string | undefined;

    // decode cursor if provided: expected format base64("createdAtIso::id")
    let cursorCreatedAt: string | undefined;
    let cursorId: string | undefined;
    if (cursor) {
      try {
        const decoded = Buffer.from(cursor, "base64").toString("utf8");
        [cursorCreatedAt, cursorId] = decoded.split("::");
      } catch {
        return res.status(400).json({ status: "error", message: "Invalid cursor" });
      }
    }

    const repo = AppDataSource.getRepository(Message);
    // Build query: messages where (sender=user AND receiver=userId) OR vice-versa
    const qb = repo.createQueryBuilder("m")
      .where("(m.sender_id = :me AND m.receiver_id = :other) OR (m.sender_id = :other AND m.receiver_id = :me)", {
        me: (req as any).user?.id,
        other: userId,
      });

    // apply cursor: (created_at < :cursorCreatedAt) OR (created_at = :cursorCreatedAt AND m.id < :cursorId)
    if (cursorCreatedAt && cursorId) {
      qb.andWhere(
        " (m.created_at < :cursorCreatedAt) OR (m.created_at = :cursorCreatedAt AND m.id < :cursorId) ",
        { cursorCreatedAt, cursorId }
      );
    }

    qb.orderBy("m.created_at", "DESC").addOrderBy("m.id", "DESC").take(pageLimit + 1);

    const rows = await qb.getMany();

    // Determine next cursor
    let nextCursor: string | null = null;
    if (rows.length > pageLimit) {
      const last = rows[pageLimit];
      const token = `${last.created_at.toISOString()}::${last.id}`;
      nextCursor = Buffer.from(token).toString("base64");
      rows.splice(pageLimit); // trim extra item
    }

    return res.status(200).json({
      status: "success",
      results: rows.length,
      data: rows,
      nextCursor,
    });
  } catch (err: any) {
    return res.status(500).json({ status: "error", message: err.message });
  }
};