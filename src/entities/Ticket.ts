import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn } from "typeorm";
import { User } from "./User";

export enum TicketStatus {
  OPEN = "OPEN",
  RESOLVED = "RESOLVED",   
  CONTESTED = "CONTESTED", // Employee disputed it
  VOIDED = "VOIDED"        // HR cancelled it
}

export enum TicketSeverity {
  LOW = 1,    
  MEDIUM = 5, 
  HIGH = 10, 
  CRITICAL = 20 
}

@Entity("tickets")
export class Ticket {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  // The Accuser
  @ManyToOne(() => User, { nullable: true }) // Nullable for system-generated tickets
  @JoinColumn({ name: "issuer_id" })
  issuer: User;

  @Column({ nullable: true })
  issuer_id: string;

  // The Accused
  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "target_user_id" })
  target_user: User;

  @Column()
  target_user_id: string;

  // Details
  @Column()
  title: string;

  @Column("text")
  description: string;

  @Column({
    type: "enum",
    enum: TicketSeverity,
    default: TicketSeverity.LOW
  })
  severity: TicketSeverity;

  @Column({
    type: "enum",
    enum: TicketStatus,
    default: TicketStatus.OPEN
  })
  status: TicketStatus;

  // Whistleblowing flag
  @Column({ default: false })
  is_anonymous: boolean;

  // Responses
  @Column("text", { nullable: true })
  contest_note: string;

  @Column("text", { nullable: true })
  resolution_note: string; 

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}