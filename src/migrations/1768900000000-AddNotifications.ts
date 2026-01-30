import { MigrationInterface, QueryRunner, Table, TableIndex } from "typeorm";

export class AddNotifications1768900000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: "notifications",
        columns: [
          { name: "id", type: "uuid", isPrimary: true, isGenerated: true, generationStrategy: "uuid" },
          { name: "user_id", type: "uuid", isNullable: false },
          { name: "actor_id", type: "uuid", isNullable: true },
          { name: "type", type: "varchar", isNullable: false },
          { name: "title", type: "varchar", isNullable: false },
          { name: "body", type: "text", isNullable: false },
          { name: "payload", type: "jsonb", isNullable: true },
          { name: "is_read", type: "boolean", default: false },
          { name: "delivered_at", type: "timestamp", isNullable: true },
          { name: "created_at", type: "timestamp", default: "now()" },
        ],
      })
    );

    await queryRunner.createIndex(
      "notifications",
      new TableIndex({ name: "IDX_NOTIFICATION_USER_READ", columnNames: ["user_id", "is_read"] })
    );

    // Foreign key constraint for user_id and actor_id can be added if desired (skip for simplicity/recovery)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropIndex("notifications", "IDX_NOTIFICATION_USER_READ");
    await queryRunner.dropTable("notifications");
  }
}
