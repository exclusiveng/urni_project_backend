import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn } from "typeorm";
import { User } from "./User";

export enum LeaveType {
  ANNUAL = "ANNUAL",
  SICK = "SICK",
  OTHERS = "OTHERS",
}

export enum LeaveStatus {
  PENDING = "PENDING",
  APPROVED = "APPROVED",
  REJECTED = "REJECTED",
}

@Entity("leave_requests")
export class LeaveRequest {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  // The Employee asking for leave
  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user: User;

  @Column()
  user_id: string;

  // The person who CURRENTLY needs to approve this
  // This changes as it escalates up the chain
  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: "current_approver_id" })
  current_approver: User;

  @Column({ nullable: true })
  current_approver_id: string | null;

  @Column({
    type: "enum",
    enum: LeaveType,
    default: LeaveType.OTHERS,
  })
  type: LeaveType;

  @Column("text")
  reason: string;

  @Column({ type: "date" })
  start_date: Date;

  @Column({ type: "date" })
  end_date: Date;

  @Column({
    type: "enum",
    enum: LeaveStatus,
    default: LeaveStatus.PENDING,
  })
  status: LeaveStatus;

  // Log the history of approvals (e.g., "Approved by John -> Approved by Sarah")
  @Column("text", { array: true, default: [] }) // Postgres Array
  approval_history: string[]; 

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}