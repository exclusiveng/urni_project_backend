import { Entity, PrimaryGeneratedColumn, Column, OneToMany, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn, Index } from "typeorm";
import { User } from "./User";
import { Company } from "./Company";

@Entity("departments")
@Index("UQ_department_company_name", ["company_id", "name"], { unique: true })
export class Department {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column()
  name: string; // Unique per company, enforced by composite index above

  // Company this department belongs to
  @ManyToOne(() => Company, (company) => company.departments, { nullable: false })
  @JoinColumn({ name: "company_id" })
  company: Company;

  @Column()
  company_id: string;

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
