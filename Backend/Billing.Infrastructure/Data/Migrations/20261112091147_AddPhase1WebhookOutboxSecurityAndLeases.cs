using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Billing.Infrastructure.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddPhase1WebhookOutboxSecurityAndLeases : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""
                DELETE d1 FROM webhookdeliveries d1
                INNER JOIN webhookdeliveries d2
                  ON d1.WebhookId = d2.WebhookId
                 AND d1.EventId = d2.EventId
                 AND (
                       (d1.Status <> 'Success' AND d2.Status = 'Success')
                    OR ((d1.Status = 'Success') = (d2.Status = 'Success') AND d1.Id < d2.Id)
                 );
                """);

            migrationBuilder.Sql("""
                DELETE m1 FROM outboxmessages m1
                INNER JOIN outboxmessages m2
                  ON m1.TenantId = m2.TenantId
                 AND m1.EventId = m2.EventId
                 AND (
                       (m1.Status <> 'Published' AND m2.Status = 'Published')
                    OR ((m1.Status = 'Published') = (m2.Status = 'Published') AND m1.Id > m2.Id)
                 );
                """);

            migrationBuilder.DropIndex(
                name: "IX_outboxmessages_TenantId_EventId",
                table: "outboxmessages");

            migrationBuilder.AlterColumn<string>(
                name: "SecretKey",
                table: "webhooks",
                type: "varchar(512)",
                maxLength: 512,
                nullable: false,
                oldClrType: typeof(string),
                oldType: "varchar(128)",
                oldMaxLength: 128)
                .Annotation("MySql:CharSet", "utf8mb4")
                .OldAnnotation("MySql:CharSet", "utf8mb4");

            migrationBuilder.AddColumn<string>(
                name: "LockedByInstance",
                table: "webhookdeliveries",
                type: "varchar(100)",
                maxLength: 100,
                nullable: true)
                .Annotation("MySql:CharSet", "utf8mb4");

            migrationBuilder.AddColumn<DateTime>(
                name: "LockedUntilUtc",
                table: "webhookdeliveries",
                type: "datetime(6)",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "LockedByInstance",
                table: "outboxmessages",
                type: "varchar(100)",
                maxLength: 100,
                nullable: true)
                .Annotation("MySql:CharSet", "utf8mb4");

            migrationBuilder.AddColumn<DateTime>(
                name: "LockedUntilUtc",
                table: "outboxmessages",
                type: "datetime(6)",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_webhookdeliveries_Status_NextRetryUtc_LockedUntilUtc",
                table: "webhookdeliveries",
                columns: new[] { "Status", "NextRetryUtc", "LockedUntilUtc" });

            migrationBuilder.CreateIndex(
                name: "IX_webhookdeliveries_WebhookId_EventId",
                table: "webhookdeliveries",
                columns: new[] { "WebhookId", "EventId" },
                unique: true);

            // Drop legacy non-unique index AFTER creating the replacement unique index starting with WebhookId
            // so MySQL InnoDB foreign key on WebhookId always keeps a supporting index.
            migrationBuilder.DropIndex(
                name: "IX_webhookdeliveries_WebhookId",
                table: "webhookdeliveries");

            migrationBuilder.CreateIndex(
                name: "IX_outboxmessages_Status_LockedUntilUtc_CreatedAtUtc",
                table: "outboxmessages",
                columns: new[] { "Status", "LockedUntilUtc", "CreatedAtUtc" });

            migrationBuilder.CreateIndex(
                name: "IX_outboxmessages_TenantId_EventId",
                table: "outboxmessages",
                columns: new[] { "TenantId", "EventId" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateIndex(
                name: "IX_webhookdeliveries_WebhookId",
                table: "webhookdeliveries",
                column: "WebhookId");

            migrationBuilder.DropIndex(
                name: "IX_webhookdeliveries_Status_NextRetryUtc_LockedUntilUtc",
                table: "webhookdeliveries");

            migrationBuilder.DropIndex(
                name: "IX_webhookdeliveries_WebhookId_EventId",
                table: "webhookdeliveries");

            migrationBuilder.DropIndex(
                name: "IX_outboxmessages_Status_LockedUntilUtc_CreatedAtUtc",
                table: "outboxmessages");

            migrationBuilder.DropIndex(
                name: "IX_outboxmessages_TenantId_EventId",
                table: "outboxmessages");

            migrationBuilder.DropColumn(
                name: "LockedByInstance",
                table: "webhookdeliveries");

            migrationBuilder.DropColumn(
                name: "LockedUntilUtc",
                table: "webhookdeliveries");

            migrationBuilder.DropColumn(
                name: "LockedByInstance",
                table: "outboxmessages");

            migrationBuilder.DropColumn(
                name: "LockedUntilUtc",
                table: "outboxmessages");

            migrationBuilder.AlterColumn<string>(
                name: "SecretKey",
                table: "webhooks",
                type: "varchar(128)",
                maxLength: 128,
                nullable: false,
                oldClrType: typeof(string),
                oldType: "varchar(512)",
                oldMaxLength: 512)
                .Annotation("MySql:CharSet", "utf8mb4")
                .OldAnnotation("MySql:CharSet", "utf8mb4");

            migrationBuilder.CreateIndex(
                name: "IX_outboxmessages_TenantId_EventId",
                table: "outboxmessages",
                columns: new[] { "TenantId", "EventId" });
        }
    }
}
