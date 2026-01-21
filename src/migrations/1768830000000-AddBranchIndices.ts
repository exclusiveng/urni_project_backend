import { MigrationInterface, QueryRunner, TableIndex } from "typeorm";

export class AddBranchIndices1768830000000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.createIndex(
            "branches",
            new TableIndex({
                name: "IDX_BRANCH_GPS",
                columnNames: ["gps_lat", "gps_long"],
            })
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.dropIndex("branches", "IDX_BRANCH_GPS");
    }
}
