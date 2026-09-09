using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Billing.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class UpdateCustomerStatusField : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(@"
DROP PROCEDURE IF EXISTS AlterCustomersStatusMigration;
CREATE PROCEDURE AlterCustomersStatusMigration()
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.statistics 
        WHERE table_schema = DATABASE() AND table_name = 'Customers' AND index_name = 'IX_Customers_TenantId_IsActive'
    ) THEN
        ALTER TABLE Customers DROP INDEX IX_Customers_TenantId_IsActive;
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = DATABASE() AND table_name = 'Customers' AND column_name = 'IsActive'
    ) THEN
        ALTER TABLE Customers DROP COLUMN IsActive;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = DATABASE() AND table_name = 'Customers' AND column_name = 'Status'
    ) THEN
        ALTER TABLE Customers ADD Status varchar(32) CHARACTER SET utf8mb4 NOT NULL DEFAULT 'Active';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.statistics 
        WHERE table_schema = DATABASE() AND table_name = 'Customers' AND index_name = 'IX_Customers_TenantId_Status'
    ) THEN
        CREATE INDEX IX_Customers_TenantId_Status ON Customers (TenantId, Status);
    END IF;
END;
");
            migrationBuilder.Sql("CALL AlterCustomersStatusMigration();");
            migrationBuilder.Sql("DROP PROCEDURE IF EXISTS AlterCustomersStatusMigration;");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Customers_TenantId_Status",
                table: "Customers");

            migrationBuilder.DropColumn(
                name: "Status",
                table: "Customers");

            migrationBuilder.AddColumn<bool>(
                name: "IsActive",
                table: "Customers",
                type: "tinyint(1)",
                nullable: false,
                defaultValue: false);

            migrationBuilder.CreateIndex(
                name: "IX_Customers_TenantId_IsActive",
                table: "Customers",
                columns: new[] { "TenantId", "IsActive" });
        }
    }
}
