import { MigrationInterface, QueryRunner } from "typeorm";

export class UpdateUserSchema1768815141000 implements MigrationInterface {
    name = 'UpdateUserSchema1768815141000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // 1. Add new roles to the users_role_enum
        await queryRunner.query(`ALTER TYPE "users_role_enum" ADD VALUE IF NOT EXISTS 'CORPER'`);
        await queryRunner.query(`ALTER TYPE "users_role_enum" ADD VALUE IF NOT EXISTS 'INTERN'`);

        // 2. Add staff_id column to users table
        // We add it as nullable first, then we can populate it if needed, or keep it nullable as per entity
        await queryRunner.query(`ALTER TABLE "users" ADD "staff_id" character varying`);

        // 3. Add unique constraint/index for staff_id
        await queryRunner.query(`ALTER TABLE "users" ADD CONSTRAINT "UQ_user_staff_id" UNIQUE ("staff_id")`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_USER_STAFF_ID" ON "users" ("staff_id")`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // 1. Drop index and constraint
        await queryRunner.query(`DROP INDEX "IDX_USER_STAFF_ID"`);
        await queryRunner.query(`ALTER TABLE "users" DROP CONSTRAINT "UQ_user_staff_id"`);

        // 2. Drop staff_id column
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "staff_id"`);

        // 3. Removing enum values is not supported directly in Postgres
        // This part is intentionally left as is (non-destructive)
    }

}
