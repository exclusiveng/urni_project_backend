import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, Index } from "typeorm";
import { User } from "./User";

@Index("IDX_MESSAGE_SENDER", ["sender_id"])
@Index("IDX_MESSAGE_RECEIVER", ["receiver_id"])
@Index("IDX_MESSAGE_CREATED_AT", ["created_at"])
@Entity("messages")
export class Message {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "sender_id" })
  sender: User;

  @Column()
  sender_id: string;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "receiver_id" })
  receiver: User;

  @Column()
  receiver_id: string;

  @Column("text")
  content: string;

  @Column({ default: false })
  is_read: boolean;

  @CreateDateColumn()
  created_at: Date;
}