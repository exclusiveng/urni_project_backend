import { MigrationInterface, QueryRunner, TableIndex } from "typeorm";

export class AddAttendanceIndices1768825000000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        // 1. Composite Index for daily status checking (where user_id = ? AND clock_in_time >= ?)
        await queryRunner.createIndex(
            "attendances",
            new TableIndex({
                name: "IDX_ATTENDANCE_USER_TIME",
                columnNames: ["user_id", "clock_in_time"],
            })
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.dropIndex("attendances", "IDX_ATTENDANCE_USER_TIME");
    }
}
