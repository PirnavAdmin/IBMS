using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace Billing.Infrastructure.Data;

public class BillingDbContextFactory : IDesignTimeDbContextFactory<BillingDbContext>
{
    public BillingDbContext CreateDbContext(string[] args)
    {
        var connectionString =
            "Server=localhost;Port=3306;Database=invoice;User=root;Password=Sandeep@21;";

        var optionsBuilder = new DbContextOptionsBuilder<BillingDbContext>();

        optionsBuilder.UseMySql(
            connectionString,
            new MySqlServerVersion(new Version(8, 0, 36))
        );

        return new BillingDbContext(optionsBuilder.Options);
    }
}