using System;
using Microsoft.EntityFrameworkCore.Metadata;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Billing.Infrastructure.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddPlatformSettingsTenantIdempotencyAndAuditProvenance : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "IdempotencyKey",
                table: "Tenants",
                type: "longtext",
                nullable: true)
                .Annotation("MySql:CharSet", "utf8mb4");

            migrationBuilder.AddColumn<string>(
                name: "RequestPayloadHash",
                table: "Tenants",
                type: "longtext",
                nullable: true)
                .Annotation("MySql:CharSet", "utf8mb4");

            migrationBuilder.AddColumn<string>(
                name: "CustomerDecision",
                table: "Quotations",
                type: "varchar(32)",
                maxLength: 32,
                nullable: true)
                .Annotation("MySql:CharSet", "utf8mb4");

            migrationBuilder.AddColumn<DateTime>(
                name: "CustomerRespondedAtUtc",
                table: "Quotations",
                type: "datetime(6)",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "PublicActionToken",
                table: "Quotations",
                type: "varchar(64)",
                maxLength: 64,
                nullable: true)
                .Annotation("MySql:CharSet", "utf8mb4");

            migrationBuilder.AddColumn<bool>(
                name: "AllowPartialPayments",
                table: "Invoices",
                type: "tinyint(1)",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<string>(
                name: "ActorRole",
                table: "audit_logs",
                type: "longtext",
                nullable: true)
                .Annotation("MySql:CharSet", "utf8mb4");

            migrationBuilder.AddColumn<string>(
                name: "ActorUserId",
                table: "audit_logs",
                type: "longtext",
                nullable: true)
                .Annotation("MySql:CharSet", "utf8mb4");

            migrationBuilder.AddColumn<string>(
                name: "CorrelationId",
                table: "audit_logs",
                type: "longtext",
                nullable: true)
                .Annotation("MySql:CharSet", "utf8mb4");

            migrationBuilder.AddColumn<string>(
                name: "ResultStatus",
                table: "audit_logs",
                type: "longtext",
                nullable: false)
                .Annotation("MySql:CharSet", "utf8mb4");

            migrationBuilder.CreateTable(
                name: "PlatformSettings",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("MySql:ValueGenerationStrategy", MySqlValueGenerationStrategy.IdentityColumn),
                    PlatformName = table.Column<string>(type: "longtext", nullable: false)
                        .Annotation("MySql:CharSet", "utf8mb4"),
                    MaintenanceMode = table.Column<bool>(type: "tinyint(1)", nullable: false),
                    AllowSelfRegistration = table.Column<bool>(type: "tinyint(1)", nullable: false),
                    SessionTimeoutMinutes = table.Column<int>(type: "int", nullable: false),
                    InactivityTimeoutMinutes = table.Column<int>(type: "int", nullable: false),
                    PasswordMinLength = table.Column<int>(type: "int", nullable: false),
                    RequireDigit = table.Column<bool>(type: "tinyint(1)", nullable: false),
                    RequireSpecialChar = table.Column<bool>(type: "tinyint(1)", nullable: false),
                    SupportedCurrenciesJson = table.Column<string>(type: "longtext", nullable: false)
                        .Annotation("MySql:CharSet", "utf8mb4"),
                    AccountRecoveryContact = table.Column<string>(type: "longtext", nullable: false)
                        .Annotation("MySql:CharSet", "utf8mb4"),
                    UpdatedAtUtc = table.Column<DateTime>(type: "datetime(6)", nullable: false),
                    UpdatedBy = table.Column<string>(type: "longtext", nullable: false)
                        .Annotation("MySql:CharSet", "utf8mb4"),
                    Version = table.Column<string>(type: "longtext", nullable: true)
                        .Annotation("MySql:CharSet", "utf8mb4")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PlatformSettings", x => x.Id);
                })
                .Annotation("MySql:CharSet", "utf8mb4");

            migrationBuilder.UpdateData(
                table: "Tenants",
                keyColumn: "Id",
                keyValue: 1,
                columns: new[] { "IdempotencyKey", "RequestPayloadHash" },
                values: new object[] { null, null });

            migrationBuilder.CreateIndex(
                name: "IX_Quotations_TenantId_PublicActionToken",
                table: "Quotations",
                columns: new[] { "TenantId", "PublicActionToken" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "PlatformSettings");

            migrationBuilder.DropIndex(
                name: "IX_Quotations_TenantId_PublicActionToken",
                table: "Quotations");

            migrationBuilder.DropColumn(
                name: "IdempotencyKey",
                table: "Tenants");

            migrationBuilder.DropColumn(
                name: "RequestPayloadHash",
                table: "Tenants");

            migrationBuilder.DropColumn(
                name: "CustomerDecision",
                table: "Quotations");

            migrationBuilder.DropColumn(
                name: "CustomerRespondedAtUtc",
                table: "Quotations");

            migrationBuilder.DropColumn(
                name: "PublicActionToken",
                table: "Quotations");

            migrationBuilder.DropColumn(
                name: "AllowPartialPayments",
                table: "Invoices");

            migrationBuilder.DropColumn(
                name: "ActorRole",
                table: "audit_logs");

            migrationBuilder.DropColumn(
                name: "ActorUserId",
                table: "audit_logs");

            migrationBuilder.DropColumn(
                name: "CorrelationId",
                table: "audit_logs");

            migrationBuilder.DropColumn(
                name: "ResultStatus",
                table: "audit_logs");
        }
    }
}
