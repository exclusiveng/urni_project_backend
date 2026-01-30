import { MigrationInterface, QueryRunner, Table, TableIndex, TableForeignKey } from "typeorm";

export class AddWorkLog1768820000000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        const has = await queryRunner.hasTable("work_logs");
        if (!has) {
            await queryRunner.createTable(
                new Table({
                    name: "work_logs",
                    columns: [
                        {
                            name: "id",
                            type: "uuid",
                            isPrimary: true,
                            isGenerated: true,
                            generationStrategy: "uuid",
                        },
                        {
                            name: "user_id",
                            type: "uuid",
                        },
                        {
                            name: "date",
                            type: "date",
                        },
                        {
                            name: "achievements",
                            type: "text",
                        },
                        {
                            name: "challenges",
                            type: "text",
                            isNullable: true,
                        },
                        {
                            name: "created_at",
                            type: "timestamp",
                            default: "now()",
                        },
                        {
                            name: "updated_at",
                            type: "timestamp",
                            default: "now()",
                        },
                    ],
                }),
                true
            );
        }

        const table = await queryRunner.getTable("work_logs");
        const hasIndex = !!table?.indices.find(i => i.name === "IDX_WORK_LOG_USER_DATE");
        if (!hasIndex) {
            await queryRunner.createIndex(
                "work_logs",
                new TableIndex({
                    name: "IDX_WORK_LOG_USER_DATE",
                    columnNames: ["user_id", "date"],
                    isUnique: true,
                })
            );
        }

        const hasFK = !!table?.foreignKeys.find(fk => fk.columnNames.indexOf("user_id") !== -1);
        if (!hasFK) {
            await queryRunner.createForeignKey(
                "work_logs",
                new TableForeignKey({
                    columnNames: ["user_id"],
                    referencedColumnNames: ["id"],
                    referencedTableName: "users",
                    onDelete: "CASCADE",
                })
            );
        }
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        const table = await queryRunner.getTable("work_logs");
        const foreignKey = table?.foreignKeys.find(fk => fk.columnNames.indexOf("user_id") !== -1);
        if (foreignKey) {
            await queryRunner.dropForeignKey("work_logs", foreignKey);
        }
        if (table?.indices.find(i => i.name === "IDX_WORK_LOG_USER_DATE")) {
            await queryRunner.dropIndex("work_logs", "IDX_WORK_LOG_USER_DATE");
        }
        if (table) {
            await queryRunner.dropTable("work_logs");
        }
    }
}
