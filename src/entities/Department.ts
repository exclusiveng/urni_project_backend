import { Entity, PrimaryGeneratedColumn, Column, OneToMany, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from "typeorm";
import { User } from "./User";

@Entity("departments")
export class Department {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ unique: true })
  name: string;

  // Department Head
  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: "head_id" })
  head: User;

  @Column({ nullable: true })
  head_id: string;

  // Employees in this department
  @OneToMany(() => User, (user) => user.department)
  employees: User[];

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}