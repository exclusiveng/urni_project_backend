import { MigrationInterface, QueryRunner, TableColumn } from "typeorm";

export class AddWeekendWorkFlag1737975000000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        const tableExists = await queryRunner.hasTable("attendances");
        if (!tableExists) {
            // If base table doesn't exist yet, skip this migration safely.
            return;
        }

        const has = await queryRunner.hasColumn("attendances", "is_weekend_work");
        if (!has) {
            await queryRunner.addColumn(
                "attendances",
                new TableColumn({
                    name: "is_weekend_work",
                    type: "boolean",
                    default: "false",
                    isNullable: false
                })
            );
        }
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        const tableExists = await queryRunner.hasTable("attendances");
        if (!tableExists) return;

        const has = await queryRunner.hasColumn("attendances", "is_weekend_work");
        if (has) {
            await queryRunner.dropColumn("attendances", "is_weekend_work");
        }
    }
}
