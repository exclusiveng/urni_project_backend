import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn, OneToMany, Index, BeforeInsert } from "typeorm";
import { Department } from "./Department";
import { Branch } from "./Branch";

// The UserRole enum has been updated to use more descriptive and professional role names.
export enum UserRole {
  CEO = "CEO",
  ME_QC = "ME_QC", 
  ADMIN = "ADMIN",
  DEPARTMENT_HEAD = "DEPARTMENT_HEAD",
  GENERAL_STAFF = "GENERAL_STAFF",
  CORPER= "CORPER",
  INTERN = "INTERN",
}

@Index("IDX_USER_EMAIL", ["email"])
@Entity("users")
export class User {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Index({ unique: true })
  @Column()
  email: string;

  @Column()
  name: string;

  @Column({ select: false })
  password: string;

  @Column({ nullable: true })
  profile_pic_url: string;

  @Column({ nullable: true })
  phone: string;

  @Column({ nullable: true })
  address: string;

  @Column({ type: "date", nullable: true })
  dob: Date;

  @Index({ unique: true })
  @Column({ unique: true, nullable: true })
  staff_id: string;

  // --- Professional Details ---
  @Column({
    type: "enum",
    enum: UserRole,
    default: UserRole.GENERAL_STAFF,
  })
  role: UserRole;

  @Column({ type: "float", default: 100.0 })
  stats_score: number;

  @Column({ type: "int", default: 20 })
  leave_balance: number;

  @Column({ default: true })
  is_active: boolean;

  // --- Relationships ---

  // 1. Department Link
  @ManyToOne(() => Department, (dept) => dept.employees, { nullable: true })
  @JoinColumn({ name: "department_id" })
  department: Department;

  @Column({ nullable: true })
  department_id: string;

  // 2. Branch Link
  @ManyToOne(() => Branch, (branch) => branch.employees, { nullable: true })
  @JoinColumn({ name: "branch_id" })
  branch: Branch;

  @Column({ nullable: true })
  branch_id: string;

  // 2. Hierarchy (The "Reports To" Logic)
  // A user reports to ONE manager
  @ManyToOne(() => User, (user) => user.subordinates, { nullable: true })
  @JoinColumn({ name: "reports_to_id" })
  reportsTo: User;

  @Column({ nullable: true })
  reports_to_id: string;

  // A manager has MANY subordinates
  @OneToMany(() => User, (user) => user.reportsTo)
  subordinates: User[];

  // --- Meta ---
  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @BeforeInsert()
  async generateStaffId() {
    // 1. Get the current year
    const year = new Date().getFullYear();
    
    // 2. Generate a random or sequence-based suffix
    // For a simple random suffix:
    const randomSuffix = Math.floor(1000 + Math.random() * 9000); 
    
    // 3. Set the uniform format: STF-YEAR-RANDOM
    // Result: STF-2026-4821
    this.staff_id = `URNI-${year}-${randomSuffix}`;
  }
}