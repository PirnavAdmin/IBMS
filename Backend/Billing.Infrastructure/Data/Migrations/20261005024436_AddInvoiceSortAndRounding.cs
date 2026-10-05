using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Billing.Infrastructure.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddInvoiceSortAndRounding : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_Payments_CustomerAddresses_BranchId",
                table: "Payments");

            migrationBuilder.DropIndex(
                name: "IX_Payments_BranchId",
                table: "Payments");

            migrationBuilder.UpdateData(
                table: "Payments",
                keyColumn: "IdempotencyKey",
                keyValue: null,
                column: "IdempotencyKey",
                value: "");

            migrationBuilder.AlterColumn<string>(
                name: "IdempotencyKey",
                table: "Payments",
                type: "varchar(128)",
                maxLength: 128,
                nullable: false,
                oldClrType: typeof(string),
                oldType: "varchar(128)",
                oldMaxLength: 128,
                oldNullable: true)
                .Annotation("MySql:CharSet", "utf8mb4")
                .OldAnnotation("MySql:CharSet", "utf8mb4");

            migrationBuilder.AddColumn<decimal>(
                name: "RoundingAmount",
                table: "Invoices",
                type: "decimal(65,30)",
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<int>(
                name: "SortOrder",
                table: "InvoiceItems",
                type: "int",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddForeignKey(
                name: "FK_InvoicePaymentAllocations_Tenants_TenantId",
                table: "InvoicePaymentAllocations",
                column: "TenantId",
                principalTable: "Tenants",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_InvoicePaymentAllocations_Tenants_TenantId",
                table: "InvoicePaymentAllocations");

            migrationBuilder.DropColumn(
                name: "RoundingAmount",
                table: "Invoices");

            migrationBuilder.DropColumn(
                name: "SortOrder",
                table: "InvoiceItems");

            migrationBuilder.AlterColumn<string>(
                name: "IdempotencyKey",
                table: "Payments",
                type: "varchar(128)",
                maxLength: 128,
                nullable: true,
                oldClrType: typeof(string),
                oldType: "varchar(128)",
                oldMaxLength: 128)
                .Annotation("MySql:CharSet", "utf8mb4")
                .OldAnnotation("MySql:CharSet", "utf8mb4");

            migrationBuilder.CreateIndex(
                name: "IX_Payments_BranchId",
                table: "Payments",
                column: "BranchId");

            migrationBuilder.AddForeignKey(
                name: "FK_Payments_CustomerAddresses_BranchId",
                table: "Payments",
                column: "BranchId",
                principalTable: "CustomerAddresses",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);
        }
    }
}
