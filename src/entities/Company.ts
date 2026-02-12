import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToMany, ManyToOne, JoinColumn } from "typeorm";
import { Department } from "./Department";
import { User } from "./User";
import { Branch } from "./Branch";

@Entity("companies")
export class Company {
    @PrimaryGeneratedColumn("uuid")
    id: string;

    @Column({ unique: true })
    name: string;

    @Column({ unique: true })
    abbreviation: string; // Used for staff_id generation (e.g., "TBS" for "Triune Built Tech Solutions")

    @Column({ nullable: true })
    address: string;

    @Column({ nullable: true })
    logo_url: string;

    // Branch this company belongs to
    @ManyToOne(() => Branch, (branch) => branch.companies, { nullable: true })
    @JoinColumn({ name: "branch_id" })
    branch: Branch;

    @Column({ nullable: true })
    branch_id: string;

    // Departments in this company
    @OneToMany(() => Department, (dept) => dept.company)
    departments: Department[];

    // Employees in this company
    @OneToMany(() => User, (user) => user.company)
    employees: User[];

    @CreateDateColumn()
    created_at: Date;

    @UpdateDateColumn()
    updated_at: Date;
}
