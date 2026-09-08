using Billing.Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace Billing.Infrastructure.Data;

public class BillingDbContext : DbContext
{
    public BillingDbContext(DbContextOptions<BillingDbContext> options)
        : base(options)
    {
    }

    public DbSet<Tenant> Tenants { get; set; }

    public DbSet<User> Users { get; set; }

    public DbSet<UserSession> UserSessions { get; set; }

    public DbSet<Customer> Customers { get; set; }

    public DbSet<CustomerAddress> CustomerAddresses { get; set; }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        modelBuilder.Entity<Tenant>(entity =>
        {
            entity.HasKey(t => t.Id);
            entity.Property(t => t.Name).HasMaxLength(256).IsRequired();
            entity.Property(t => t.TenantCode).HasMaxLength(64).IsRequired();
            entity.HasIndex(t => t.TenantCode).IsUnique();
            entity.Property(t => t.CompanyEmail).HasMaxLength(256);
            entity.Property(t => t.Phone).HasMaxLength(64);
            entity.Property(t => t.TaxId).HasMaxLength(64);
            entity.Property(t => t.Address).HasMaxLength(512);

            entity.HasData(new Tenant
            {
                Id = 1,
                Name = "Default Company",
                TenantCode = "tenant-default",
                CompanyEmail = "admin@default.com",
                IsActive = true,
                CreatedAtUtc = new DateTime(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc)
            });
        });

        modelBuilder.Entity<Customer>(entity =>
        {
            entity.HasKey(c => c.Id);
            entity.Property(c => c.CustomerCode).HasMaxLength(64).IsRequired();
            entity.Property(c => c.Name).HasMaxLength(256).IsRequired();
            entity.Property(c => c.Email).HasMaxLength(256).IsRequired();
            entity.Property(c => c.Phone).HasMaxLength(64);
            entity.Property(c => c.CompanyName).HasMaxLength(256);
            entity.Property(c => c.TaxId).HasMaxLength(64);
            entity.Property(c => c.Address).HasMaxLength(512);
            entity.Property(c => c.City).HasMaxLength(128);
            entity.Property(c => c.State).HasMaxLength(128);
            entity.Property(c => c.PostalCode).HasMaxLength(32);
            entity.Property(c => c.Country).HasMaxLength(128);
            entity.Property(c => c.Website).HasMaxLength(256);
            entity.Property(c => c.Notes).HasMaxLength(1000);
            entity.Property(c => c.Currency).HasMaxLength(10).HasDefaultValue("USD");
            entity.Property(c => c.PaymentTerms).HasMaxLength(64);
            entity.Property(c => c.RowVersion).IsRowVersion();

            entity.HasOne(c => c.Tenant)
                  .WithMany()
                  .HasForeignKey(c => c.TenantId)
                  .OnDelete(DeleteBehavior.Restrict);

            entity.HasIndex(c => new { c.TenantId, c.CustomerCode })
                  .IsUnique();
            entity.HasIndex(c => new { c.TenantId, c.Email });
            entity.HasIndex(c => new { c.TenantId, c.IsActive });
            entity.HasIndex(c => c.CreatedAtUtc);
        });

        modelBuilder.Entity<CustomerAddress>(entity =>
        {
            entity.HasKey(a => a.Id);
            entity.Property(a => a.AddressType).HasMaxLength(32).IsRequired();
            entity.Property(a => a.AddressLine1).HasMaxLength(256).IsRequired();
            entity.Property(a => a.AddressLine2).HasMaxLength(256);
            entity.Property(a => a.City).HasMaxLength(128).IsRequired();
            entity.Property(a => a.State).HasMaxLength(128);
            entity.Property(a => a.PostalCode).HasMaxLength(32);
            entity.Property(a => a.Country).HasMaxLength(128).IsRequired();

            entity.HasOne(a => a.Customer)
                  .WithMany(c => c.Addresses)
                  .HasForeignKey(a => a.CustomerId)
                  .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(a => a.Tenant)
                  .WithMany()
                  .HasForeignKey(a => a.TenantId)
                  .OnDelete(DeleteBehavior.Restrict);

            entity.HasIndex(a => new { a.TenantId, a.CustomerId });
            entity.HasIndex(a => new { a.CustomerId, a.AddressType });
        });

        modelBuilder.Entity<User>(entity =>
        {
            entity.HasKey(u => u.Id);
            entity.Property(u => u.Email).HasMaxLength(256).IsRequired();
            entity.Property(u => u.Username).HasMaxLength(256);
            entity.Property(u => u.Name).HasMaxLength(256);
            entity.Property(u => u.ApplicationId).HasMaxLength(128);

            entity.HasOne(u => u.Tenant)
                  .WithMany(t => t.Users)
                  .HasForeignKey(u => u.TenantId)
                  .OnDelete(DeleteBehavior.SetNull);

            entity.HasMany(u => u.Sessions)
                  .WithOne(s => s.User)
                  .HasForeignKey(s => s.UserId)
                  .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<UserSession>(entity =>
        {
            entity.HasKey(s => s.Id);
            entity.Property(s => s.RefreshTokenHash).HasMaxLength(128).IsRequired();
            entity.Property(s => s.IpAddress).HasMaxLength(64);
            entity.Property(s => s.UserAgent).HasMaxLength(512);
            entity.Property(s => s.DeviceInfo).HasMaxLength(256);
            entity.Property(s => s.RevocationReason).HasMaxLength(256);
            entity.Property(s => s.ReplacedByTokenHash).HasMaxLength(128);

            entity.HasIndex(s => s.RefreshTokenHash)
                  .IsUnique();

            entity.HasIndex(s => new { s.UserId, s.IsRevoked });
            entity.HasIndex(s => s.SessionExpiresAtUtc);
        });
    }
}