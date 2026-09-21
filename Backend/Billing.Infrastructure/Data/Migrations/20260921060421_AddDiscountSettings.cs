using System;
using Microsoft.EntityFrameworkCore.Metadata;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Billing.Infrastructure.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddDiscountSettings : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "DiscountSettings",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("MySql:ValueGenerationStrategy", MySqlValueGenerationStrategy.IdentityColumn),
                    TenantId = table.Column<int>(type: "int", nullable: false),
                    Status = table.Column<string>(type: "varchar(32)", maxLength: 32, nullable: false, defaultValue: "Active")
                        .Annotation("MySql:CharSet", "utf8mb4"),
                    MaximumType = table.Column<string>(type: "varchar(32)", maxLength: 32, nullable: false, defaultValue: "Percentage")
                        .Annotation("MySql:CharSet", "utf8mb4"),
                    MaximumValue = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false, defaultValue: 50.00m),
                    DiscountType = table.Column<string>(type: "varchar(32)", maxLength: 32, nullable: false, defaultValue: "Percentage")
                        .Annotation("MySql:CharSet", "utf8mb4"),
                    ApplicationLevel = table.Column<string>(type: "varchar(32)", maxLength: 32, nullable: false, defaultValue: "Invoice Level")
                        .Annotation("MySql:CharSet", "utf8mb4"),
                    AllowLineLevel = table.Column<bool>(type: "tinyint(1)", nullable: false, defaultValue: true),
                    AllowInvoiceLevel = table.Column<bool>(type: "tinyint(1)", nullable: false, defaultValue: true),
                    EnforceMaximum = table.Column<bool>(type: "tinyint(1)", nullable: false, defaultValue: true),
                    AllowManualOverride = table.Column<bool>(type: "tinyint(1)", nullable: false, defaultValue: true),
                    RequireOverrideReason = table.Column<bool>(type: "tinyint(1)", nullable: false, defaultValue: true),
                    MinimumReasonLength = table.Column<int>(type: "int", nullable: false, defaultValue: 10),
                    RolesJson = table.Column<string>(type: "longtext", nullable: false)
                        .Annotation("MySql:CharSet", "utf8mb4"),
                    CreatedAtUtc = table.Column<DateTime>(type: "datetime(6)", nullable: false),
                    UpdatedAtUtc = table.Column<DateTime>(type: "datetime(6)", nullable: true),
                    RowVersion = table.Column<DateTime>(type: "datetime(6)", rowVersion: true, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_DiscountSettings", x => x.Id);
                    table.ForeignKey(
                        name: "FK_DiscountSettings_Tenants_TenantId",
                        column: x => x.TenantId,
                        principalTable: "Tenants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                })
                .Annotation("MySql:CharSet", "utf8mb4");

            migrationBuilder.CreateIndex(
                name: "IX_DiscountSettings_TenantId",
                table: "DiscountSettings",
                column: "TenantId",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "DiscountSettings");
        }
    }
}
