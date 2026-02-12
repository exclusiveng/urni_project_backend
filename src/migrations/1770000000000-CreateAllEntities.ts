import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateAllEntities1770000000000 implements MigrationInterface {
  name = "CreateAllEntities1770000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Ensure uuid extension
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);

    // ─── Enum types ────────────────────────────────────────────

    await queryRunner.query(`
            DO $$ BEGIN
                CREATE TYPE "users_role_enum" AS ENUM('CEO', 'MD', 'ADMIN', 'HR', 'DEPARTMENT_HEAD', 'ASST_DEPARTMENT_HEAD', 'GENERAL_STAFF');
            EXCEPTION WHEN duplicate_object THEN null;
            END $$;
        `);

    await queryRunner.query(`
            DO $$ BEGIN
                CREATE TYPE "users_position_enum" AS ENUM('FULLTIME', 'CONTRACT', 'CORPER', 'GRADUATE_INTERN', 'STUDENT_INTERN');
            EXCEPTION WHEN duplicate_object THEN null;
            END $$;
        `);

    await queryRunner.query(`
            DO $$ BEGIN
                CREATE TYPE "attendances_status_enum" AS ENUM('PRESENT', 'LATE', 'ABSENT', 'ON_LEAVE', 'EARLY_EXIT');
            EXCEPTION WHEN duplicate_object THEN null;
            END $$;
        `);

    await queryRunner.query(`
            DO $$ BEGIN
                CREATE TYPE "leave_requests_type_enum" AS ENUM('LEAVE', 'MEDICAL', 'WORK', 'EDUCATION', 'MATERNITY', 'VACATION', 'PATERNITY', 'OTHERS');
            EXCEPTION WHEN duplicate_object THEN null;
            END $$;
        `);

    await queryRunner.query(`
            DO $$ BEGIN
                CREATE TYPE "leave_requests_status_enum" AS ENUM('PENDING', 'APPROVED', 'REJECTED');
            EXCEPTION WHEN duplicate_object THEN null;
            END $$;
        `);

    await queryRunner.query(`
            DO $$ BEGIN
                CREATE TYPE "tickets_status_enum" AS ENUM('OPEN', 'RESOLVED', 'CONTESTED', 'VOIDED');
            EXCEPTION WHEN duplicate_object THEN null;
            END $$;
        `);

    await queryRunner.query(`
            DO $$ BEGIN
                CREATE TYPE "notifications_type_enum" AS ENUM('MESSAGE','TICKET','LEAVE','ATTENDANCE','GENERIC');
            EXCEPTION WHEN duplicate_object THEN null;
            END $$;
        `);

    await queryRunner.query(`
            DO $$ BEGIN
                CREATE TYPE "work_logs_workplace_enum" AS ENUM('interstate','home','office');
            EXCEPTION WHEN duplicate_object THEN null;
            END $$;
        `);

    // ─── Branches (top-level organisational unit) ──────────────

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

    // ─── Companies (belong to a branch) ────────────────────────

    await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "companies" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "name" character varying NOT NULL,
                "abbreviation" character varying NOT NULL,
                "address" character varying,
                "logo_url" character varying,
                "branch_id" uuid,
                "created_at" TIMESTAMP NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "UQ_companies_name" UNIQUE ("name"),
                CONSTRAINT "UQ_companies_abbr" UNIQUE ("abbreviation"),
                CONSTRAINT "PK_companies" PRIMARY KEY ("id"),
                CONSTRAINT "FK_companies_branch" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL
            )
        `);

    // ─── Departments (belong to a company) ─────────────────────

    await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "departments" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "name" character varying NOT NULL,
                "company_id" uuid,
                "head_id" uuid,
                "assistant_head_id" uuid,
                "created_at" TIMESTAMP NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_departments" PRIMARY KEY ("id")
            )
        `);

    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_department_company_name" ON "departments" ("company_id", "name")`,
    );

    // ─── Users ─────────────────────────────────────────────────

    await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "users" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "email" character varying NOT NULL,
                "name" character varying NOT NULL,
                "password" character varying NOT NULL,
                "profile_pic_url" character varying,
                "signature_url" character varying,
                "phone" character varying,
                "address" character varying,
                "dob" date,
                "staff_id" character varying,
                "role" "users_role_enum" NOT NULL DEFAULT 'GENERAL_STAFF',
                "position" "users_position_enum" NOT NULL DEFAULT 'FULLTIME',
                "permissions" text[] NOT NULL DEFAULT '{}',
                "stats_score" double precision NOT NULL DEFAULT 100,
                "leave_balance" integer NOT NULL DEFAULT 20,
                "is_active" boolean NOT NULL DEFAULT true,
                "department_id" uuid,
                "branch_id" uuid,
                "reports_to_id" uuid,
                "company_id" uuid,
                "created_at" TIMESTAMP NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "UQ_user_email" UNIQUE ("email"),
                CONSTRAINT "UQ_user_staff_id" UNIQUE ("staff_id"),
                CONSTRAINT "PK_users" PRIMARY KEY ("id")
            )
        `);

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_USER_EMAIL" ON "users" ("email")`,
    );

    // ─── Foreign keys (deferred because of circular deps) ──────

    // departments -> companies
    await queryRunner.query(`
            DO $$ BEGIN
                IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='FK_departments_company') THEN
                    ALTER TABLE "departments" ADD CONSTRAINT "FK_departments_company" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE;
                END IF;
            END $$;
        `);

    // departments -> users (head)
    await queryRunner.query(`
            DO $$ BEGIN
                IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='FK_departments_head') THEN
                    ALTER TABLE "departments" ADD CONSTRAINT "FK_departments_head" FOREIGN KEY ("head_id") REFERENCES "users"("id") ON DELETE SET NULL;
                END IF;
            END $$;
        `);

    // departments -> users (assistant head)
    await queryRunner.query(`
            DO $$ BEGIN
                IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='FK_departments_assistant_head') THEN
                    ALTER TABLE "departments" ADD CONSTRAINT "FK_departments_assistant_head" FOREIGN KEY ("assistant_head_id") REFERENCES "users"("id") ON DELETE SET NULL;
                END IF;
            END $$;
        `);

    // users -> departments
    await queryRunner.query(`
            DO $$ BEGIN
                IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='FK_users_department') THEN
                    ALTER TABLE "users" ADD CONSTRAINT "FK_users_department" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE SET NULL;
                END IF;
            END $$;
        `);

    // users -> branches
    await queryRunner.query(`
            DO $$ BEGIN
                IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='FK_users_branch') THEN
                    ALTER TABLE "users" ADD CONSTRAINT "FK_users_branch" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL;
                END IF;
            END $$;
        `);

    // users -> users (reports to)
    await queryRunner.query(`
            DO $$ BEGIN
                IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='FK_users_reports_to') THEN
                    ALTER TABLE "users" ADD CONSTRAINT "FK_users_reports_to" FOREIGN KEY ("reports_to_id") REFERENCES "users"("id") ON DELETE SET NULL;
                END IF;
            END $$;
        `);

    // users -> companies
    await queryRunner.query(`
            DO $$ BEGIN
                IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='FK_users_company') THEN
                    ALTER TABLE "users" ADD CONSTRAINT "FK_users_company" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE SET NULL;
                END IF;
            END $$;
        `);

    // ─── Attendances ───────────────────────────────────────────

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
                "is_weekend_work" boolean NOT NULL DEFAULT false,
                "created_at" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_attendances" PRIMARY KEY ("id"),
                CONSTRAINT "FK_attendances_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
                CONSTRAINT "FK_attendances_branch" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL,
                CONSTRAINT "FK_attendances_approved_by" FOREIGN KEY ("approved_by_id") REFERENCES "users"("id") ON DELETE SET NULL
            )
        `);

    // ─── Leave requests ────────────────────────────────────────

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
                CONSTRAINT "PK_leave_requests" PRIMARY KEY ("id"),
                CONSTRAINT "FK_leave_requests_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
                CONSTRAINT "FK_leave_requests_approver" FOREIGN KEY ("current_approver_id") REFERENCES "users"("id") ON DELETE SET NULL
            )
        `);

    // ─── Messages ──────────────────────────────────────────────

    await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "messages" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "sender_id" uuid NOT NULL,
                "receiver_id" uuid NOT NULL,
                "content" text NOT NULL,
                "is_read" boolean NOT NULL DEFAULT false,
                "created_at" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_messages" PRIMARY KEY ("id"),
                CONSTRAINT "FK_messages_sender" FOREIGN KEY ("sender_id") REFERENCES "users"("id") ON DELETE CASCADE,
                CONSTRAINT "FK_messages_receiver" FOREIGN KEY ("receiver_id") REFERENCES "users"("id") ON DELETE CASCADE
            )
        `);

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_MESSAGE_SENDER" ON "messages" ("sender_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_MESSAGE_RECEIVER" ON "messages" ("receiver_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_MESSAGE_CREATED_AT" ON "messages" ("created_at")`,
    );

    // ─── Notifications ─────────────────────────────────────────

    await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "notifications" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "user_id" uuid NOT NULL,
                "actor_id" uuid,
                "type" "notifications_type_enum" NOT NULL DEFAULT 'GENERIC',
                "title" character varying NOT NULL,
                "body" text NOT NULL,
                "payload" jsonb,
                "is_read" boolean NOT NULL DEFAULT false,
                "delivered_at" TIMESTAMP,
                "created_at" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_notifications" PRIMARY KEY ("id"),
                CONSTRAINT "FK_notifications_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
                CONSTRAINT "FK_notifications_actor" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL
            )
        `);

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_NOTIFICATION_USER_READ" ON "notifications" ("user_id", "is_read")`,
    );

    // ─── Tickets ───────────────────────────────────────────────

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
                CONSTRAINT "PK_tickets" PRIMARY KEY ("id"),
                CONSTRAINT "FK_tickets_issuer" FOREIGN KEY ("issuer_id") REFERENCES "users"("id") ON DELETE SET NULL,
                CONSTRAINT "FK_tickets_target" FOREIGN KEY ("target_user_id") REFERENCES "users"("id") ON DELETE CASCADE
            )
        `);

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_TICKET_TARGET" ON "tickets" ("target_user_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_TICKET_STATUS" ON "tickets" ("status")`,
    );

    // ─── Work logs ─────────────────────────────────────────────

    await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "work_logs" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "user_id" uuid NOT NULL,
                "date" date NOT NULL,
                "achievements" text NOT NULL,
                "challenges" text,
                "workplace" "work_logs_workplace_enum" NOT NULL DEFAULT 'office',
                "signature_url" text,
                "signed_at" TIMESTAMP,
                "created_at" TIMESTAMP NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_work_logs" PRIMARY KEY ("id"),
                CONSTRAINT "FK_work_logs_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
            )
        `);

    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_worklog_user_date" ON "work_logs" ("user_id", "date")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop in reverse order
    await queryRunner.query(
      `ALTER TABLE "work_logs" DROP CONSTRAINT IF EXISTS "FK_work_logs_user"`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_worklog_user_date"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "work_logs"`);

    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_TICKET_STATUS"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_TICKET_TARGET"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "tickets"`);

    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_NOTIFICATION_USER_READ"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "notifications"`);

    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_MESSAGE_CREATED_AT"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_MESSAGE_RECEIVER"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_MESSAGE_SENDER"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "messages"`);

    await queryRunner.query(`DROP TABLE IF EXISTS "leave_requests"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "attendances"`);

    await queryRunner.query(
      `ALTER TABLE "departments" DROP CONSTRAINT IF EXISTS "FK_departments_assistant_head"`,
    );
    await queryRunner.query(
      `ALTER TABLE "departments" DROP CONSTRAINT IF EXISTS "FK_departments_head"`,
    );

    await queryRunner.query(
      `ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "FK_users_company"`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "FK_users_reports_to"`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "FK_users_branch"`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "FK_users_department"`,
    );

    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_USER_EMAIL"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "users"`);

    await queryRunner.query(
      `ALTER TABLE "departments" DROP CONSTRAINT IF EXISTS "FK_departments_company"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "UQ_department_company_name"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "departments"`);

    await queryRunner.query(
      `ALTER TABLE "companies" DROP CONSTRAINT IF EXISTS "FK_companies_branch"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "companies"`);

    await queryRunner.query(`DROP TABLE IF EXISTS "branches"`);

    // Drop enum types
    await queryRunner.query(`DROP TYPE IF EXISTS "work_logs_workplace_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "notifications_type_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "tickets_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "leave_requests_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "leave_requests_type_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "attendances_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "users_position_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "users_role_enum"`);
  }
}
