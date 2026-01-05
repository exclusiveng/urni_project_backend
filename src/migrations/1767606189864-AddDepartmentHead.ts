import { MigrationInterface, QueryRunner } from "typeorm";

export class AddDepartmentHead1767606189864 implements MigrationInterface {
    name = 'AddDepartmentHead1767606189864'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "departments" ADD "head_id" uuid`);
        await queryRunner.query(`ALTER TABLE "departments" ADD CONSTRAINT "FK_departments_head" FOREIGN KEY ("head_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "departments" DROP CONSTRAINT "FK_departments_head"`);
        await queryRunner.query(`ALTER TABLE "departments" DROP COLUMN "head_id"`);
    }

}
