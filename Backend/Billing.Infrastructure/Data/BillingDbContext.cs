using Billing.Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace Billing.Infrastructure.Data;

public class BillingDbContext : DbContext
{
    public BillingDbContext(DbContextOptions<BillingDbContext> options)
        : base(options)
    {
    }

    public DbSet<User> Users { get; set; }

    public DbSet<UserSession> UserSessions { get; set; }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        modelBuilder.Entity<User>(entity =>
        {
            entity.HasKey(u => u.Id);
            entity.Property(u => u.Email).HasMaxLength(256).IsRequired();
            entity.Property(u => u.Username).HasMaxLength(256);
            entity.Property(u => u.Name).HasMaxLength(256);
            entity.Property(u => u.TenantId).HasMaxLength(128);
            entity.Property(u => u.ApplicationId).HasMaxLength(128);

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