import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from "typeorm";
import { User } from "./User";

@Entity("work_logs")
@Index(["user_id", "date"], { unique: true }) // One log per user per day
export class WorkLog {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user: User;

  @Column()
  user_id: string;

  @Column({ type: "date" })
  date: string; // Stored as YYYY-MM-DD

  @Column({ type: "text" })
  achievements: string;

  @Column({ type: "text", nullable: true })
  challenges: string;

  @Column({
    type: "enum",
    enum: ["interstate", "home", "office"],
    default: "office",
  })
  workplace: "interstate" | "home" | "office";

  // Signature - User can sign their appraisal/log
  @Column({ type: "text", nullable: true })
  signature_url: string;

  @Column({ type: "timestamp", nullable: true })
  signed_at: Date;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
