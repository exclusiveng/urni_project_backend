import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, Index } from "typeorm";
import { User } from "./User";

export enum NotificationType {
  MESSAGE = "MESSAGE",
  TICKET = "TICKET",
  LEAVE = "LEAVE",
  ATTENDANCE = "ATTENDANCE",
  GENERIC = "GENERIC",
}

@Index("IDX_NOTIFICATION_USER_READ", ["user_id", "is_read"])
@Entity("notifications")
export class Notification {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user: User;

  @Column()
  user_id: string;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: "actor_id" })
  actor: User | null;

  @Column({ nullable: true })
  actor_id: string | null;

  @Column({
    type: "enum",
    enum: NotificationType,
    default: NotificationType.GENERIC,
  })
  type: NotificationType;

  @Column()
  title: string;

  @Column("text")
  body: string;

  @Column({ type: "jsonb", nullable: true })
  payload: any;

  @Column({ default: false })
  is_read: boolean;

  @Column({ type: "timestamp", nullable: true })
  delivered_at: Date | null;

  @CreateDateColumn()
  created_at: Date;
}
