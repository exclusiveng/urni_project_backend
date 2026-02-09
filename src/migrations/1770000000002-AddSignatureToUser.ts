import { MigrationInterface, QueryRunner, TableColumn } from "typeorm";

export class AddSignatureToUser1770000000002 implements MigrationInterface {

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.addColumn("users", new TableColumn({
            name: "signature_url",
            type: "varchar",
            isNullable: true
        }));
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.dropColumn("users", "signature_url");
    }

}
