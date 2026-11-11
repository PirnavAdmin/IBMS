using System;
using Microsoft.EntityFrameworkCore.Metadata;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Billing.Infrastructure.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddReminderSettingsAndInvoicePayOnlineButton : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "IncludePayOnlineButton",
                table: "Invoices",
                type: "tinyint(1)",
                nullable: false,
                defaultValue: true);

            migrationBuilder.CreateTable(
                name: "remindersettings",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("MySql:ValueGenerationStrategy", MySqlValueGenerationStrategy.IdentityColumn),
                    TenantId = table.Column<int>(type: "int", nullable: false),
                    PartialPaymentReminderEnabled = table.Column<bool>(type: "tinyint(1)", nullable: false, defaultValue: true),
                    PartialPaymentIntervalValue = table.Column<int>(type: "int", nullable: false, defaultValue: 7),
                    PartialPaymentIntervalUnit = table.Column<string>(type: "varchar(16)", maxLength: 16, nullable: false, defaultValue: "Days")
                        .Annotation("MySql:CharSet", "utf8mb4"),
                    OverdueReminderEnabled = table.Column<bool>(type: "tinyint(1)", nullable: false, defaultValue: true),
                    OverdueReminderIntervalDays = table.Column<int>(type: "int", nullable: false, defaultValue: 1),
                    UpcomingDueReminderEnabled = table.Column<bool>(type: "tinyint(1)", nullable: false, defaultValue: true),
                    CreatedAtUtc = table.Column<DateTime>(type: "datetime(6)", nullable: false),
                    UpdatedAtUtc = table.Column<DateTime>(type: "datetime(6)", nullable: true),
                    UpdatedBy = table.Column<string>(type: "varchar(128)", maxLength: 128, nullable: true)
                        .Annotation("MySql:CharSet", "utf8mb4")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_remindersettings", x => x.Id);
                    table.ForeignKey(
                        name: "FK_remindersettings_Tenants_TenantId",
                        column: x => x.TenantId,
                        principalTable: "Tenants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                })
                .Annotation("MySql:CharSet", "utf8mb4");

            migrationBuilder.CreateIndex(
                name: "IX_remindersettings_TenantId",
                table: "remindersettings",
                column: "TenantId",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "remindersettings");

            migrationBuilder.DropColumn(
                name: "IncludePayOnlineButton",
                table: "Invoices");
        }
    }
}
