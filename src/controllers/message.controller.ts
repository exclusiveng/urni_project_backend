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
        
        if (contactId) {
            query.where("message.sender_id = :contactId OR message.receiver_id = :contactId", { contactId });
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

    const messages = await query.getMany();

    
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
export const getInbox = async (req: AuthRequest, res: Response) => {
    try {
        const user = req.user!;
        const userId = user.id;

        const latestMessagesSubquery = messageRepo.createQueryBuilder("msg")
            .select("MAX(msg.id)", "max_id")
            .where("msg.sender_id = :userId OR msg.receiver_id = :userId", { userId })
            .groupBy("CASE WHEN msg.sender_id = :userId THEN msg.receiver_id ELSE msg.sender_id END");

        // The main query fetches the full message and contact details for each latest message.
        const inbox = await messageRepo.createQueryBuilder("message")
            .innerJoin(
                `(${latestMessagesSubquery.getQuery()})`, 
                "latest_msg", 
                "latest_msg.max_id = message.id"
            )
            .setParameters(latestMessagesSubquery.getParameters())
            // Determine the contact (the other person in the chat)
            .innerJoinAndSelect(
                "message.sender", 
                "sender", 
                "sender.id != :userId"
            )
            .innerJoinAndSelect(
                "message.receiver", 
                "receiver",
                "receiver.id != :userId"
            )
            .orderBy("message.created_at", "DESC")
            .getMany();


        res.status(200).json({ status: "success", data: inbox });

    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};