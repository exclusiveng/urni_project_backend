import { MigrationInterface, QueryRunner } from "typeorm";

export class AddWorkplaceToWorkLogs1770000000001 implements MigrationInterface {
    name = 'AddWorkplaceToWorkLogs1770000000001'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            DO $$ BEGIN
                CREATE TYPE "work_logs_workplace_enum" AS ENUM('interstate','home','office');
            EXCEPTION WHEN duplicate_object THEN null;
            END $$;
        `);

        await queryRunner.query(`ALTER TABLE "work_logs" ADD COLUMN IF NOT EXISTS "workplace" "work_logs_workplace_enum" NOT NULL DEFAULT 'office'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "work_logs" DROP COLUMN IF EXISTS "workplace"`);
        await queryRunner.query(`DROP TYPE IF EXISTS "work_logs_workplace_enum"`);
    }
}
