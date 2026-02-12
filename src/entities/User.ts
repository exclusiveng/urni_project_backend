import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn, OneToMany, Index, BeforeInsert } from "typeorm";
import { Department } from "./Department";
import { Branch } from "./Branch";
import { Company } from "./Company";

// Login roles — determines the user's access tier.
// DEPARTMENT_HEAD and ASST_DEPARTMENT_HEAD are promotion-only (never assigned at registration).
export enum UserRole {
  CEO = "CEO",                              // God mode — controls entire system
  MD = "MD",                                // Manages companies within their branch
  ADMIN = "ADMIN",                          // Central overseer across the system
  HR = "HR",                                // Human resources management
  DEPARTMENT_HEAD = "DEPARTMENT_HEAD",       // Controls their department (promotion only)
  ASST_DEPARTMENT_HEAD = "ASST_DEPARTMENT_HEAD", // Assists department head (promotion only)
  GENERAL_STAFF = "GENERAL_STAFF",          // Default registration role
}

// Staff position — describes employment type, separate from login role.
export enum UserPosition {
  FULLTIME = "FULLTIME",
  CONTRACT = "CONTRACT",
  CORPER = "CORPER",
  GRADUATE_INTERN = "GRADUATE_INTERN",
  STUDENT_INTERN = "STUDENT_INTERN",
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
  signature_url: string;

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

  @Column({
    type: "enum",
    enum: UserPosition,
    default: UserPosition.FULLTIME,
  })
  position: UserPosition;

  // Granular, addable/removable permission strings (e.g. "company:create").
  // These supplement the default permissions granted by the user's role.
  @Column("text", { array: true, default: [] })
  permissions: string[];

  @Column({ type: "float", default: 100.0 })
  stats_score: number;

  @Column({ type: "int", default: 20 })
  leave_balance: number;

  @Column({ default: true })
  is_active: boolean;

  // --- Relationships ---

  // 1. Company Link (required except for bootstrap user)
  @ManyToOne(() => Company, (company) => company.employees, { nullable: true })
  @JoinColumn({ name: "company_id" })
  company: Company;

  @Column({ nullable: true })
  company_id: string;

  // 2. Department Link
  @ManyToOne(() => Department, (dept) => dept.employees, { nullable: true })
  @JoinColumn({ name: "department_id" })
  department: Department;

  @Column({ nullable: true })
  department_id: string;

  // 3. Branch Link
  @ManyToOne(() => Branch, (branch) => branch.employees, { nullable: true })
  @JoinColumn({ name: "branch_id" })
  branch: Branch;

  @Column({ nullable: true })
  branch_id: string;

  // 4. Hierarchy (The "Reports To" Logic)
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

  // Temporary field to hold abbreviation for staff_id generation (not persisted)
  // This must be set before insert if company is set
  private _companyAbbreviation?: string;

  setCompanyAbbreviation(abbreviation: string) {
    this._companyAbbreviation = abbreviation;
  }

  @BeforeInsert()
  async generateStaffId() {
    // 1. Get the current year
    const year = new Date().getFullYear();

    // 2. Generate a random suffix
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);

    // 3. Use company abbreviation if available, otherwise fallback to "TBG"
    const prefix = this._companyAbbreviation || "TBG";

    // 4. Set the uniform format: ABBR-YEAR-RANDOM
    // Result: TBS-2026-4821
    this.staff_id = `${prefix}-${year}-${randomSuffix}`;
  }
}
