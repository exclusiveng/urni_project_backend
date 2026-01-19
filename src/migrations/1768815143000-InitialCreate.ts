import { MigrationInterface, QueryRunner } from "typeorm";

export class InitialCreate1768815143000 implements MigrationInterface {
    name = 'InitialCreate1768815143000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // 1. Extensions
        await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);

        // 2. Enums
        await queryRunner.query(`
            DO $$ BEGIN
                CREATE TYPE "users_role_enum" AS ENUM('CEO', 'ME_QC', 'ADMIN', 'DEPARTMENT_HEAD', 'GENERAL_STAFF', 'CORPER', 'INTERN');
            EXCEPTION
                WHEN duplicate_object THEN null;
            END $$;
        `);

        await queryRunner.query(`
            DO $$ BEGIN
                CREATE TYPE "attendances_status_enum" AS ENUM('PRESENT', 'LATE', 'ABSENT', 'ON_LEAVE', 'EARLY_EXIT');
            EXCEPTION
                WHEN duplicate_object THEN null;
            END $$;
        `);

        await queryRunner.query(`
            DO $$ BEGIN
                CREATE TYPE "leave_requests_type_enum" AS ENUM('LEAVE', 'MEDICAL', 'WORK', 'EDUCATION', 'MATERNITY', 'VACATION', 'PATERNITY', 'OTHERS');
            EXCEPTION
                WHEN duplicate_object THEN null;
            END $$;
        `);

        await queryRunner.query(`
            DO $$ BEGIN
                CREATE TYPE "leave_requests_status_enum" AS ENUM('PENDING', 'APPROVED', 'REJECTED');
            EXCEPTION
                WHEN duplicate_object THEN null;
            END $$;
        `);

        await queryRunner.query(`
            DO $$ BEGIN
                CREATE TYPE "tickets_status_enum" AS ENUM('OPEN', 'RESOLVED', 'CONTESTED', 'VOIDED');
            EXCEPTION
                WHEN duplicate_object THEN null;
            END $$;
        `);

        // 3. Tables (No Foreign Keys yet to avoid dependency errors)
        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "branches" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "name" character varying NOT NULL,
                "location_city" character varying,
                "address" character varying NOT NULL,
                "gps_lat" numeric(10,7) NOT NULL,
                "gps_long" numeric(10,7) NOT NULL,
                "radius_meters" integer NOT NULL DEFAULT 100,
                "created_at" TIMESTAMP NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_branches" PRIMARY KEY ("id")
            )
        `);

        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "departments" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "name" character varying NOT NULL,
                "head_id" uuid,
                "created_at" TIMESTAMP NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "UQ_department_name" UNIQUE ("name"),
                CONSTRAINT "PK_departments" PRIMARY KEY ("id")
            )
        `);

        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "users" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "email" character varying NOT NULL,
                "name" character varying NOT NULL,
                "password" character varying NOT NULL,
                "profile_pic_url" character varying,
                "phone" character varying,
                "address" character varying,
                "dob" date,
                "staff_id" character varying,
                "role" "users_role_enum" NOT NULL DEFAULT 'GENERAL_STAFF',
                "stats_score" double precision NOT NULL DEFAULT 100,
                "leave_balance" integer NOT NULL DEFAULT 20,
                "is_active" boolean NOT NULL DEFAULT true,
                "department_id" uuid,
                "branch_id" uuid,
                "reports_to_id" uuid,
                "created_at" TIMESTAMP NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "UQ_user_email" UNIQUE ("email"),
                CONSTRAINT "UQ_user_staff_id" UNIQUE ("staff_id"),
                CONSTRAINT "PK_users" PRIMARY KEY ("id")
            )
        `);

        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "attendances" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "user_id" uuid NOT NULL,
                "branch_id" uuid,
                "clock_in_time" TIMESTAMP NOT NULL,
                "clock_out_time" TIMESTAMP,
                "status" "attendances_status_enum" NOT NULL DEFAULT 'PRESENT',
                "is_manual_override" boolean NOT NULL DEFAULT false,
                "override_reason" text,
                "approved_by_id" uuid,
                "hours_worked" numeric(5,2),
                "created_at" TIMESTAMP NOT NULL DEFAULT now(),
                "CONSTRAINT" "PK_attendances" PRIMARY KEY ("id")
            )
        `);

        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "leave_requests" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "user_id" uuid NOT NULL,
                "current_approver_id" uuid,
                "type" "leave_requests_type_enum" NOT NULL DEFAULT 'OTHERS',
                "reason" text NOT NULL,
                "start_date" date NOT NULL,
                "end_date" date NOT NULL,
                "status" "leave_requests_status_enum" NOT NULL DEFAULT 'PENDING',
                "approval_history" text[] NOT NULL DEFAULT '{}',
                "created_at" TIMESTAMP NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_leave_requests" PRIMARY KEY ("id")
            )
        `);

        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "messages" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "sender_id" uuid NOT NULL,
                "receiver_id" uuid NOT NULL,
                "content" text NOT NULL,
                "is_read" boolean NOT NULL DEFAULT false,
                "created_at" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_messages" PRIMARY KEY ("id")
            )
        `);

        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "tickets" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "issuer_id" uuid,
                "target_user_id" uuid NOT NULL,
                "title" character varying NOT NULL,
                "description" text NOT NULL,
                "severity" integer NOT NULL DEFAULT 1,
                "status" "tickets_status_enum" NOT NULL DEFAULT 'OPEN',
                "is_anonymous" boolean NOT NULL DEFAULT false,
                "contest_note" text,
                "resolution_note" text,
                "created_at" TIMESTAMP NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_tickets" PRIMARY KEY ("id")
            )
        `);

        // 4. Foreign Keys
        await queryRunner.query(`ALTER TABLE "departments" ADD CONSTRAINT "FK_departments_head" FOREIGN KEY ("head_id") REFERENCES "users"("id") ON DELETE SET NULL`);

        await queryRunner.query(`ALTER TABLE "users" ADD CONSTRAINT "FK_users_department" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE SET NULL`);
        await queryRunner.query(`ALTER TABLE "users" ADD CONSTRAINT "FK_users_branch" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL`);
        await queryRunner.query(`ALTER TABLE "users" ADD CONSTRAINT "FK_users_reports_to" FOREIGN KEY ("reports_to_id") REFERENCES "users"("id") ON DELETE SET NULL`);

        await queryRunner.query(`ALTER TABLE "attendances" ADD CONSTRAINT "FK_attendances_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE`);
        await queryRunner.query(`ALTER TABLE "attendances" ADD CONSTRAINT "FK_attendances_branch" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL`);
        await queryRunner.query(`ALTER TABLE "attendances" ADD CONSTRAINT "FK_attendances_approved_by" FOREIGN KEY ("approved_by_id") REFERENCES "users"("id") ON DELETE SET NULL`);

        await queryRunner.query(`ALTER TABLE "leave_requests" ADD CONSTRAINT "FK_leave_requests_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE`);
        await queryRunner.query(`ALTER TABLE "leave_requests" ADD CONSTRAINT "FK_leave_requests_approver" FOREIGN KEY ("current_approver_id") REFERENCES "users"("id") ON DELETE SET NULL`);

        await queryRunner.query(`ALTER TABLE "messages" ADD CONSTRAINT "FK_messages_sender" FOREIGN KEY ("sender_id") REFERENCES "users"("id") ON DELETE CASCADE`);
        await queryRunner.query(`ALTER TABLE "messages" ADD CONSTRAINT "FK_messages_receiver" FOREIGN KEY ("receiver_id") REFERENCES "users"("id") ON DELETE CASCADE`);

        await queryRunner.query(`ALTER TABLE "tickets" ADD CONSTRAINT "FK_tickets_issuer" FOREIGN KEY ("issuer_id") REFERENCES "users"("id") ON DELETE SET NULL`);
        await queryRunner.query(`ALTER TABLE "tickets" ADD CONSTRAINT "FK_tickets_target" FOREIGN KEY ("target_user_id") REFERENCES "users"("id") ON DELETE CASCADE`);

        // 5. Indices
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_USER_EMAIL" ON "users" ("email")`);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_USER_STAFF_ID" ON "users" ("staff_id")`);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_MESSAGE_SENDER" ON "messages" ("sender_id")`);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_MESSAGE_RECEIVER" ON "messages" ("receiver_id")`);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_MESSAGE_CREATED_AT" ON "messages" ("created_at")`);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_TICKET_TARGET" ON "tickets" ("target_user_id")`);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_TICKET_STATUS" ON "tickets" ("status")`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Drop tables in reverse order of dependencies if not using CASCADE, or just drop all
        await queryRunner.query(`DROP TABLE IF EXISTS "tickets"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "messages"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "leave_requests"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "attendances"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "users"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "departments"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "branches"`);

        await queryRunner.query(`DROP TYPE IF EXISTS "tickets_status_enum"`);
        await queryRunner.query(`DROP TYPE IF EXISTS "leave_requests_status_enum"`);
        await queryRunner.query(`DROP TYPE IF EXISTS "leave_requests_type_enum"`);
        await queryRunner.query(`DROP TYPE IF EXISTS "attendances_status_enum"`);
        await queryRunner.query(`DROP TYPE IF EXISTS "users_role_enum"`);
    }

}
