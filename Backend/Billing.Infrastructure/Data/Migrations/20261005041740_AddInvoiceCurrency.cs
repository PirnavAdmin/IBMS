using System;
using Microsoft.EntityFrameworkCore.Metadata;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Billing.Infrastructure.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddInvoiceCurrency : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(@"
                SET @idx_exists = (SELECT COUNT(1) FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'Payments' AND index_name = 'IX_Payments_BranchId');
                SET @sql = IF(@idx_exists > 0, 'DROP INDEX `IX_Payments_BranchId` ON `Payments`', 'SELECT 1');
                PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
            ");

            migrationBuilder.Sql(@"
                SET @col_exists = (SELECT COUNT(1) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'Invoices' AND column_name = 'CreditedAmount');
                SET @sql = IF(@col_exists = 0, 'ALTER TABLE `Invoices` ADD `CreditedAmount` decimal(18,2) NOT NULL DEFAULT 0.0', 'SELECT 1');
                PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
            ");

            migrationBuilder.Sql(@"
                SET @col_exists = (SELECT COUNT(1) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'Invoices' AND column_name = 'Currency');
                SET @sql = IF(@col_exists = 0, 'ALTER TABLE `Invoices` ADD `Currency` longtext CHARACTER SET utf8mb4 NOT NULL', 'SELECT 1');
                PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
            ");

            migrationBuilder.Sql(@"
                CREATE TABLE IF NOT EXISTS `CreditNotes` (
                    `Id` int NOT NULL AUTO_INCREMENT,
                    `TenantId` int NOT NULL,
                    `CreditNoteNumber` varchar(64) CHARACTER SET utf8mb4 NOT NULL,
                    `InvoiceId` int NOT NULL,
                    `CustomerId` int NOT NULL,
                    `CreditDate` datetime(6) NOT NULL,
                    `Type` varchar(32) CHARACTER SET utf8mb4 NOT NULL DEFAULT 'Full',
                    `Subtotal` decimal(18,2) NOT NULL,
                    `TaxAmount` decimal(18,2) NOT NULL,
                    `TotalAmount` decimal(18,2) NOT NULL,
                    `RefundedAmount` decimal(18,2) NOT NULL,
                    `RemainingRefundableAmount` decimal(18,2) NOT NULL,
                    `Status` varchar(32) CHARACTER SET utf8mb4 NOT NULL DEFAULT 'Draft',
                    `Reason` varchar(250) CHARACTER SET utf8mb4 NOT NULL,
                    `Notes` varchar(1000) CHARACTER SET utf8mb4 NULL,
                    `CreatedBy` varchar(200) CHARACTER SET utf8mb4 NOT NULL,
                    `CreatedAtUtc` datetime(6) NOT NULL,
                    `ApprovedBy` varchar(200) CHARACTER SET utf8mb4 NULL,
                    `ApprovedAtUtc` datetime(6) NULL,
                    `RejectionReason` varchar(500) CHARACTER SET utf8mb4 NULL,
                    `RejectedBy` varchar(200) CHARACTER SET utf8mb4 NULL,
                    `RejectedAtUtc` datetime(6) NULL,
                    `IssuedBy` varchar(200) CHARACTER SET utf8mb4 NULL,
                    `IssuedAtUtc` datetime(6) NULL,
                    `CancelledBy` varchar(200) CHARACTER SET utf8mb4 NULL,
                    `CancelledAtUtc` datetime(6) NULL,
                    `CancellationReason` varchar(500) CHARACTER SET utf8mb4 NULL,
                    `UpdatedAtUtc` datetime(6) NULL,
                    `RowVersion` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
                    CONSTRAINT `PK_CreditNotes` PRIMARY KEY (`Id`),
                    CONSTRAINT `FK_CreditNotes_Customers_CustomerId` FOREIGN KEY (`CustomerId`) REFERENCES `Customers` (`Id`) ON DELETE RESTRICT,
                    CONSTRAINT `FK_CreditNotes_Invoices_InvoiceId` FOREIGN KEY (`InvoiceId`) REFERENCES `Invoices` (`Id`) ON DELETE RESTRICT,
                    CONSTRAINT `FK_CreditNotes_Tenants_TenantId` FOREIGN KEY (`TenantId`) REFERENCES `Tenants` (`Id`) ON DELETE RESTRICT
                ) CHARACTER SET=utf8mb4;
            ");

            migrationBuilder.Sql(@"
                CREATE TABLE IF NOT EXISTS `CreditNoteItems` (
                    `Id` int NOT NULL AUTO_INCREMENT,
                    `CreditNoteId` int NOT NULL,
                    `InvoiceItemId` int NULL,
                    `ProductId` int NULL,
                    `Description` varchar(500) CHARACTER SET utf8mb4 NOT NULL,
                    `Quantity` decimal(18,4) NOT NULL,
                    `UnitPrice` decimal(18,2) NOT NULL,
                    `DiscountAmount` decimal(18,2) NOT NULL,
                    `TaxType` varchar(32) CHARACTER SET utf8mb4 NULL,
                    `TaxRate` decimal(18,2) NULL,
                    `TaxAmount` decimal(18,2) NOT NULL,
                    `TotalAmount` decimal(18,2) NOT NULL,
                    `HSNSAC` varchar(64) CHARACTER SET utf8mb4 NULL,
                    CONSTRAINT `PK_CreditNoteItems` PRIMARY KEY (`Id`),
                    CONSTRAINT `FK_CreditNoteItems_CreditNotes_CreditNoteId` FOREIGN KEY (`CreditNoteId`) REFERENCES `CreditNotes` (`Id`) ON DELETE CASCADE,
                    CONSTRAINT `FK_CreditNoteItems_InvoiceItems_InvoiceItemId` FOREIGN KEY (`InvoiceItemId`) REFERENCES `InvoiceItems` (`Id`) ON DELETE SET NULL,
                    CONSTRAINT `FK_CreditNoteItems_Products_ProductId` FOREIGN KEY (`ProductId`) REFERENCES `Products` (`Id`) ON DELETE SET NULL
                ) CHARACTER SET=utf8mb4;
            ");

            migrationBuilder.Sql(@"
                CREATE TABLE IF NOT EXISTS `CreditNoteRefunds` (
                    `Id` int NOT NULL AUTO_INCREMENT,
                    `TenantId` int NOT NULL,
                    `CreditNoteId` int NOT NULL,
                    `RefundNumber` varchar(64) CHARACTER SET utf8mb4 NOT NULL,
                    `RefundDate` datetime(6) NOT NULL,
                    `RefundAmount` decimal(18,2) NOT NULL,
                    `PaymentMethod` varchar(50) CHARACTER SET utf8mb4 NOT NULL,
                    `ReferenceNumber` varchar(100) CHARACTER SET utf8mb4 NULL,
                    `Notes` varchar(500) CHARACTER SET utf8mb4 NULL,
                    `ProcessedBy` varchar(200) CHARACTER SET utf8mb4 NOT NULL,
                    `CreatedAtUtc` datetime(6) NOT NULL,
                    CONSTRAINT `PK_CreditNoteRefunds` PRIMARY KEY (`Id`),
                    CONSTRAINT `FK_CreditNoteRefunds_CreditNotes_CreditNoteId` FOREIGN KEY (`CreditNoteId`) REFERENCES `CreditNotes` (`Id`) ON DELETE CASCADE
                ) CHARACTER SET=utf8mb4;
            ");

            migrationBuilder.Sql(@"
                SET @idx_exists = (SELECT COUNT(1) FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'CreditNoteRefunds' AND index_name = 'IX_CreditNoteRefunds_CreditNoteId');
                SET @sql = IF(@idx_exists = 0, 'CREATE INDEX `IX_CreditNoteRefunds_CreditNoteId` ON `CreditNoteRefunds` (`CreditNoteId`)', 'SELECT 1');
                PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
            ");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "CreditNoteItems");

            migrationBuilder.DropTable(
                name: "CreditNoteRefunds");

            migrationBuilder.DropTable(
                name: "CreditNotes");

            migrationBuilder.DropColumn(
                name: "CreditedAmount",
                table: "Invoices");

            migrationBuilder.DropColumn(
                name: "Currency",
                table: "Invoices");

            migrationBuilder.CreateIndex(
                name: "IX_Payments_BranchId",
                table: "Payments",
                column: "BranchId");
        }
    }
}
