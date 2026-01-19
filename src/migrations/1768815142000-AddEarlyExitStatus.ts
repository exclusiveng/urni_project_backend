import { MigrationInterface, QueryRunner } from "typeorm";

export class AddEarlyExitStatus1768815142000 implements MigrationInterface {
    name = 'AddEarlyExitStatus1768815142000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Add EARLY_EXIT to the attendance status enum
        await queryRunner.query(`
            ALTER TYPE "attendances_status_enum" 
            ADD VALUE IF NOT EXISTS 'EARLY_EXIT'
        `);
    }

    public async down(_queryRunner: QueryRunner): Promise<void> {
        // Note: PostgreSQL does not support removing enum values directly
        console.warn('Rollback of enum value addition is not supported. Please restore from backup if needed.');
    }

}
