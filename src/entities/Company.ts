import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToMany } from "typeorm";
import { Department } from "./Department";
import { User } from "./User";

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
