import { Response } from "express";
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
    const { contactId } = req.params; // Optional: If provided, get chat with specific person

    const query = messageRepo.createQueryBuilder("message")
      .leftJoinAndSelect("message.sender", "sender")
      .leftJoinAndSelect("message.receiver", "receiver")
      .orderBy("message.created_at", "ASC");

    // --- SCENARIO A: CEO (GOD MODE) ---
    if (user.role === UserRole.CEO) {
        // CEO can see EVERYTHING.
        // If they provide a contactId, we can filter to show messages involving that person
        if (contactId) {
            query.where("message.sender_id = :contactId OR message.receiver_id = :contactId", { contactId });
        }
        // If no contactId, they get the entire company firehose (maybe paginate this in frontend)
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

    const messages = await query.getMany();

    // Sanitize: We don't need full user objects, just names/avatars usually
    // But TypeORM returns what we asked. Frontend can filter.
    
    res.status(200).json({ 
        status: "success", 
        count: messages.length, 
        data: messages 
    });

  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

// 3. Get Inbox (List of people I've talked to)
// This is a complex query to get "Latest message per contact"
export const getInbox = async (req: AuthRequest, res: Response) => {
    try {
        const user = req.user!;
        // This is a simplified version. In production, you'd use a DISTINCT ON query or similar.
        // Logic: Find all messages where I am sender OR receiver.
        
        // Use a raw query for performance if necessary, but here is logic:
        // Fetch unique user IDs involved in chats with me.
        
        const messages = await messageRepo.find({
            where: [
                { sender_id: user.id },
                { receiver_id: user.id }
            ],
            order: { created_at: "DESC" },
            take: 50 // Limit to recent history
        });

        // Extract unique contacts
        const contactIds = new Set<string>();
        messages.forEach(m => {
            if (m.sender_id !== user.id) contactIds.add(m.sender_id);
            if (m.receiver_id !== user.id) contactIds.add(m.receiver_id);
        });

        // Fetch contact details
        const contacts = await userRepo.findByIds(Array.from(contactIds));
        
        res.status(200).json({ status: "success", data: contacts });

    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};