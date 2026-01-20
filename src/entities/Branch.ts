import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToMany } from "typeorm";
import { User } from "./User";

@Entity("branches")
export class Branch {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column()
  name: string;

  @Column({ nullable: true })
  location_city: string;

  @Column()
  address: string;

  // Geolocation Data
  @Column("decimal", { precision: 10, scale: 7 }) // High precision for GPS
  gps_lat: number;

  @Column("decimal", { precision: 10, scale: 7 })
  gps_long: number;

  @Column("int", { default: 100 }) // Default radius in meters (e.g., 100m)
  radius_meters: number;

  @OneToMany(() => User, (user) => user.branch)
  employees: User[];

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}