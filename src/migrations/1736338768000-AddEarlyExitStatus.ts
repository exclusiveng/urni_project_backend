import { MigrationInterface, QueryRunner } from "typeorm";

export class AddEarlyExitStatus1736338768000 implements MigrationInterface {
    name = 'AddEarlyExitStatus1736338768000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Add EARLY_EXIT to the attendance status enum
        await queryRunner.query(`
            ALTER TYPE "attendances_status_enum" 
            ADD VALUE IF NOT EXISTS 'EARLY_EXIT'
        `);
    }

    public async down(_queryRunner: QueryRunner): Promise<void> {
        // Note: PostgreSQL does not support removing enum values directly
        // To rollback, you would need to:
        // 1. Create a new enum without EARLY_EXIT
        // 2. Alter the column to use the new enum
        // 3. Drop the old enum
        // For simplicity, this migration is not reversible
        // If you need to rollback, you should restore from a backup

        console.warn('Rollback of enum value addition is not supported. Please restore from backup if needed.');
    }

}
