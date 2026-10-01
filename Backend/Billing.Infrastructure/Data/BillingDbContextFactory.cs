using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;
using Microsoft.EntityFrameworkCore.Diagnostics;

namespace Billing.Infrastructure.Data;

public class BillingDbContextFactory : IDesignTimeDbContextFactory<BillingDbContext>
{
    public BillingDbContext CreateDbContext(string[] args)
    {
        var connectionString =
            "Server=localhost;Port=3306;Database=invoice;User=root;Password=Abhiram@123;";

        var optionsBuilder = new DbContextOptionsBuilder<BillingDbContext>();

        optionsBuilder.UseMySql(
            connectionString,
            new MySqlServerVersion(new Version(8, 0, 36))
        )
        .ConfigureWarnings(w => w.Ignore(RelationalEventId.PendingModelChangesWarning));

        return new BillingDbContext(optionsBuilder.Options);
    }
}