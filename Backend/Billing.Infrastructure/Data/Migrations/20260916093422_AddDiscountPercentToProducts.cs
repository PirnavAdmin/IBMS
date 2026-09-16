using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Billing.Infrastructure.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddDiscountPercentToProducts : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AlterColumn<string>(
                name: "DiscountAllowed",
                table: "Products",
                type: "varchar(10)",
                maxLength: 10,
                nullable: false,
                defaultValue: "Yes",
                oldClrType: typeof(bool),
                oldType: "tinyint(1)",
                oldDefaultValue: true)
                .Annotation("MySql:CharSet", "utf8mb4");

            migrationBuilder.AddColumn<decimal>(
                name: "DiscountPercent",
                table: "Products",
                type: "decimal(5,2)",
                precision: 5,
                scale: 2,
                nullable: true,
                defaultValue: 0.00m);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "DiscountPercent",
                table: "Products");

            migrationBuilder.AlterColumn<bool>(
                name: "DiscountAllowed",
                table: "Products",
                type: "tinyint(1)",
                nullable: false,
                defaultValue: true,
                oldClrType: typeof(string),
                oldType: "varchar(10)",
                oldMaxLength: 10,
                oldDefaultValue: "Yes")
                .OldAnnotation("MySql:CharSet", "utf8mb4");
        }
    }
}
