import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn } from "typeorm";
import { User } from "./User";
import { Branch } from "./Branch";

export enum AttendanceStatus {
  PRESENT = "PRESENT",
  LATE = "LATE",
  ABSENT = "ABSENT",
  ON_LEAVE = "ON_LEAVE",
  EARLY_EXIT = "EARLY_EXIT"
}

@Entity("attendances")
export class Attendance {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  // Link to User
  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user: User;

  @Column()
  user_id: string;

  // Link to Branch (Where they clocked in)
  @ManyToOne(() => Branch, { nullable: true })
  @JoinColumn({ name: "branch_id" })
  branch: Branch;

  @Column({ nullable: true })
  branch_id: string | null;

  // Time Logs
  @Column({ type: "timestamp" })
  clock_in_time: Date;

  @Column({ type: "timestamp", nullable: true })
  clock_out_time: Date;

  @Column({
    type: "enum",
    enum: AttendanceStatus,
    default: AttendanceStatus.PRESENT
  })
  status: AttendanceStatus;

  // Manual Override Fields (For when GPS fails)
  @Column({ default: false })
  is_manual_override: boolean;

  @Column({ type: "text", nullable: true })
  override_reason: string;

  // If override, who approved it?
  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: "approved_by_id" })
  approved_by: User;

  // Hours worked (calculated on clock-out)
  @Column({ type: "decimal", precision: 5, scale: 2, nullable: true })
  hours_worked: number;

  @CreateDateColumn()
  created_at: Date;
}