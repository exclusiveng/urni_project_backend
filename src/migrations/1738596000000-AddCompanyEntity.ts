import { MigrationInterface, QueryRunner } from "typeorm";

export class AddCompanyEntity1738596000000 implements MigrationInterface {
    name = 'AddCompanyEntity1738596000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // 1. Create companies table
        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "companies" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "name" character varying NOT NULL,
                "abbreviation" character varying NOT NULL,
                "address" character varying,
                "logo_url" character varying,
                "created_at" TIMESTAMP NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "UQ_company_name" UNIQUE ("name"),
                CONSTRAINT "UQ_company_abbreviation" UNIQUE ("abbreviation"),
                CONSTRAINT "PK_companies" PRIMARY KEY ("id")
            )
        `);

        // 2. Add company_id column to departments table
        await queryRunner.query(`ALTER TABLE "departments" ADD COLUMN "company_id" uuid`);

        // 3. Add company_id column to users table
        await queryRunner.query(`ALTER TABLE "users" ADD COLUMN "company_id" uuid`);

        // 4. Drop the old unique constraint on department name
        await queryRunner.query(`ALTER TABLE "departments" DROP CONSTRAINT IF EXISTS "UQ_department_name"`);

        // 5. Add composite unique constraint on (company_id, name) for departments
        await queryRunner.query(`CREATE UNIQUE INDEX "UQ_department_company_name" ON "departments" ("company_id", "name")`);

        // 6. Add foreign key constraints
        await queryRunner.query(`ALTER TABLE "departments" ADD CONSTRAINT "FK_departments_company" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE`);
        await queryRunner.query(`ALTER TABLE "users" ADD CONSTRAINT "FK_users_company" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE SET NULL`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Remove foreign keys
        await queryRunner.query(`ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "FK_users_company"`);
        await queryRunner.query(`ALTER TABLE "departments" DROP CONSTRAINT IF EXISTS "FK_departments_company"`);

        // Remove composite unique index
        await queryRunner.query(`DROP INDEX IF EXISTS "UQ_department_company_name"`);

        // Restore original unique constraint on department name
        await queryRunner.query(`ALTER TABLE "departments" ADD CONSTRAINT "UQ_department_name" UNIQUE ("name")`);

        // Remove company_id columns
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "company_id"`);
        await queryRunner.query(`ALTER TABLE "departments" DROP COLUMN IF EXISTS "company_id"`);

        // Drop companies table
        await queryRunner.query(`DROP TABLE IF EXISTS "companies"`);
    }
}
