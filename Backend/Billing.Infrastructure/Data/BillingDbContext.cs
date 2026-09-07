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

        modelBuilder.Entity<UserSession>(entity =>
        {
            entity.ToTable("UserSessions");

            entity.HasKey(e => e.Id);

            entity.Property(e => e.RefreshTokenHash)
                .IsRequired()
                .HasMaxLength(128);

            entity.HasIndex(e => e.RefreshTokenHash)
                .HasDatabaseName("IX_UserSessions_RefreshTokenHash");

            entity.HasIndex(e => e.UserId)
                .HasDatabaseName("IX_UserSessions_UserId");

            entity.HasOne(e => e.User)
                .WithMany(u => u.Sessions)
                .HasForeignKey(e => e.UserId)
                .OnDelete(DeleteBehavior.Cascade);
        });
    }
}
