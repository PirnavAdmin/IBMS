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

    public DbSet<AuditLog> AuditLogs { get; set; }

    public DbSet<ProductCategory> ProductCategories { get; set; }

    public DbSet<Product> Products { get; set; }

    public DbSet<DiscountRule> DiscountRules { get; set; }

    public DbSet<TaxRate> TaxRates { get; set; }

    public DbSet<TaxSetting> TaxSettings { get; set; }

    public DbSet<ChargeConfiguration> ChargeConfigurations { get; set; }

    public DbSet<NumberingSetting> NumberingSettings { get; set; }

    public DbSet<DiscountSetting> DiscountSettings { get; set; }

    public DbSet<Quotation> Quotations { get; set; }

    public DbSet<QuotationItem> QuotationItems { get; set; }

    public DbSet<QuotationCommunication> QuotationCommunications { get; set; }

    public DbSet<Invoice> Invoices { get; set; }

    public DbSet<InvoiceItem> InvoiceItems { get; set; }

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
            entity.Property(t => t.Status).HasMaxLength(32).HasDefaultValue("Active").IsRequired();
            entity.Ignore(t => t.IsActive);

            entity.HasData(new Tenant
            {
                Id = 1,
                Name = "Default Company",
                TenantCode = "tenant-default",
                CompanyEmail = "admin@default.com",
                Status = "Active",
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
            entity.Property(c => c.CustomerType).HasMaxLength(32).HasDefaultValue("Business").IsRequired();
            entity.Property(c => c.TaxId).HasMaxLength(64);
            entity.Property(c => c.Address).HasMaxLength(512);
            entity.Property(c => c.City).HasMaxLength(128);
            entity.Property(c => c.State).HasMaxLength(128);
            entity.Property(c => c.PostalCode).HasMaxLength(32);
            entity.Property(c => c.Country).HasMaxLength(128);
            entity.Property(c => c.Website).HasMaxLength(256);
            entity.Property(c => c.Notes).HasMaxLength(1000);
            entity.Property(c => c.Currency).HasMaxLength(10).HasDefaultValue("INR");
            entity.Property(c => c.PaymentTerms).HasMaxLength(64);
            entity.Property(c => c.Status).HasMaxLength(32).HasDefaultValue("Active").IsRequired();
            entity.Ignore(c => c.IsActive);
            entity.Property(c => c.RowVersion).IsRowVersion();

            entity.HasOne(c => c.Tenant)
                  .WithMany()
                  .HasForeignKey(c => c.TenantId)
                  .OnDelete(DeleteBehavior.Restrict);

            entity.HasIndex(c => new { c.TenantId, c.CustomerCode })
                  .IsUnique();
            entity.HasIndex(c => new { c.TenantId, c.Email });
            entity.HasIndex(c => new { c.TenantId, c.Status });
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
            entity.Property(a => a.IsDefaultStatus).HasColumnName("IsDefault").HasMaxLength(16).HasDefaultValue("Non-Default").IsRequired();
            entity.Ignore(a => a.IsDefault);

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
            entity.Property(u => u.Status).HasMaxLength(32).HasDefaultValue("Active").IsRequired();
            entity.Ignore(u => u.IsActive);
            entity.Property(u => u.RolesString).HasColumnName("Roles").HasMaxLength(256).HasDefaultValue("User").IsRequired();
            entity.Ignore(u => u.Roles);
            entity.Ignore(u => u.RolesJson);
            entity.Property(u => u.PermissionsString).HasColumnName("Permissions").HasMaxLength(1000).HasDefaultValue("billing.view,billing.create").IsRequired();
            entity.Ignore(u => u.Permissions);
            entity.Ignore(u => u.PermissionsJson);

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
            entity.Property(s => s.Id).ValueGeneratedOnAdd();
            entity.Property(s => s.RefreshTokenHash).HasMaxLength(128).IsRequired();
            entity.Property(s => s.UserAgent).HasMaxLength(512);
            entity.Property(s => s.DeviceInfo).HasMaxLength(256);
            entity.Property(s => s.RevocationReason).HasMaxLength(256);
            entity.Property(s => s.ReplacedByTokenHash).HasMaxLength(128);

            entity.HasIndex(s => s.RefreshTokenHash)
                  .IsUnique();

            entity.HasIndex(s => new { s.UserId, s.IsRevoked });
            entity.HasIndex(s => s.SessionExpiresAtUtc);
        });

        modelBuilder.Entity<AuditLog>(entity =>
        {
            entity.ToTable("audit_logs");
            entity.HasKey(e => e.Id);

            entity.Property(e => e.EntityName).HasMaxLength(100).IsRequired();
            entity.Property(e => e.EntityId).HasMaxLength(100).IsRequired();
            entity.Property(e => e.Action).HasMaxLength(50).IsRequired();
            entity.Property(e => e.UserName).HasMaxLength(200);
            entity.Property(e => e.Changes).HasColumnType("text");
            entity.Property(e => e.Timestamp)
                  .HasConversion(
                      v => v.Kind == DateTimeKind.Utc ? v : DateTime.SpecifyKind(v, DateTimeKind.Utc),
                      v => DateTime.SpecifyKind(v, DateTimeKind.Utc));

            entity.HasOne(e => e.Customer)
                  .WithMany()
                  .HasForeignKey(e => e.CustomerId)
                  .OnDelete(DeleteBehavior.SetNull);

            entity.HasOne(e => e.Tenant)
                  .WithMany()
                  .HasForeignKey(e => e.TenantId)
                  .OnDelete(DeleteBehavior.Restrict);

            entity.HasIndex(e => new { e.TenantId, e.CustomerId })
                  .HasDatabaseName("IX_AuditLogs_TenantId_CustomerId");

            entity.HasIndex(e => new { e.TenantId, e.Timestamp })
                  .HasDatabaseName("IX_AuditLogs_TenantId_Timestamp");

            entity.HasIndex(e => new { e.TenantId, e.EntityName, e.EntityId })
                  .HasDatabaseName("IX_AuditLogs_TenantId_Entity");
        });

        modelBuilder.Entity<ProductCategory>(entity =>
        {
            entity.HasKey(c => c.Id);
            entity.Property(c => c.Name).HasMaxLength(128).IsRequired();
            entity.Property(c => c.Description).HasMaxLength(500);
            entity.Property(c => c.Status).HasMaxLength(32).HasDefaultValue("Active").IsRequired();
            entity.Ignore(c => c.IsActive);

            entity.HasOne(c => c.Tenant)
                  .WithMany()
                  .HasForeignKey(c => c.TenantId)
                  .OnDelete(DeleteBehavior.Restrict);

            entity.HasIndex(c => new { c.TenantId, c.Name });
            entity.HasIndex(c => c.TenantId);
        });

        modelBuilder.Entity<Product>(entity =>
        {
            entity.HasKey(p => p.Id);
            entity.Property(p => p.ProductCode).HasMaxLength(64).IsRequired();
            entity.Property(p => p.Name).HasMaxLength(256).IsRequired();
            entity.Property(p => p.Description).HasMaxLength(1000);
            entity.Property(p => p.Type).HasMaxLength(32).HasDefaultValue("Product").IsRequired();
            entity.Property(p => p.Unit).HasMaxLength(32).HasDefaultValue("unit").IsRequired();
            entity.Property(p => p.Price).HasPrecision(18, 2);
            entity.Property(p => p.Currency).HasMaxLength(10).HasDefaultValue("INR").IsRequired();
            entity.Property(p => p.TaxCategory).HasMaxLength(64);
            entity.Property(p => p.HsnSacCode).HasMaxLength(32);
            entity.Property(p => p.DiscountAllowed)
                  .HasConversion(
                      v => v ? "Yes" : "No",
                      v => v != null && (v.Equals("Yes", StringComparison.OrdinalIgnoreCase) || v == "1" || v.Equals("true", StringComparison.OrdinalIgnoreCase)))
                  .HasMaxLength(10)
                  .HasColumnType("varchar(10)")
                  .HasDefaultValue(true);
            entity.Property(p => p.DiscountPercent).HasPrecision(5, 2).HasDefaultValue(0.00m);
            entity.Property(p => p.Status).HasMaxLength(32).HasDefaultValue("Active").IsRequired();
            entity.Ignore(p => p.IsActive);
            entity.Property(p => p.RowVersion).IsRowVersion();

            entity.HasOne(p => p.Tenant)
                  .WithMany()
                  .HasForeignKey(p => p.TenantId)
                  .OnDelete(DeleteBehavior.Restrict);

            entity.Property(p => p.Category).HasMaxLength(128);

            entity.HasOne(p => p.ProductCategory)
                  .WithMany(c => c.Products)
                  .HasForeignKey(p => p.CategoryId)
                  .OnDelete(DeleteBehavior.SetNull);

            // IBMSBE-007: Unique Product Code per tenant & Category foreign key/indexes
            entity.HasIndex(p => new { p.TenantId, p.ProductCode })
                  .IsUnique();
            entity.HasIndex(p => new { p.TenantId, p.CategoryId });
            entity.HasIndex(p => new { p.TenantId, p.Status });
            entity.HasIndex(p => p.CreatedAtUtc);
        });

        modelBuilder.Entity<DiscountRule>(entity =>
        {
            entity.HasKey(d => d.Id);
            entity.Property(d => d.Code).HasMaxLength(64).IsRequired();
            entity.Property(d => d.Name).HasMaxLength(128).IsRequired();
            entity.Property(d => d.Description).HasMaxLength(500);
            entity.Property(d => d.Type).HasConversion<string>().HasMaxLength(32).IsRequired();
            entity.Property(d => d.Scope).HasConversion<string>().HasMaxLength(32).IsRequired();
            entity.Property(d => d.Value).HasPrecision(18, 2);
            entity.Property(d => d.MinInvoiceAmount).HasPrecision(18, 2);
            entity.Property(d => d.MaxDiscountAmount).HasPrecision(18, 2);
            entity.Property(d => d.Status).HasMaxLength(32).HasDefaultValue("Active").IsRequired();
            entity.Ignore(d => d.IsActive);
            entity.Property(d => d.ApplicableRole).HasMaxLength(64);
            entity.Property(d => d.RowVersion).IsRowVersion();

            entity.HasOne(d => d.Tenant)
                  .WithMany()
                  .HasForeignKey(d => d.TenantId)
                  .OnDelete(DeleteBehavior.Restrict);

            entity.HasIndex(d => new { d.TenantId, d.Code }).IsUnique();
            entity.HasIndex(d => new { d.TenantId, d.Status });
            entity.HasIndex(d => d.CreatedAtUtc);
        });

        modelBuilder.Entity<TaxRate>(entity =>
        {
            entity.HasKey(r => r.Id);
            entity.Property(r => r.Name).HasMaxLength(128).IsRequired();
            entity.Property(r => r.Code).HasMaxLength(64).IsRequired();
            entity.Property(r => r.TaxType).HasMaxLength(32).HasDefaultValue("GST").IsRequired();
            entity.Property(r => r.Rate).HasPrecision(5, 2).HasDefaultValue(0.00m);
            entity.Property(r => r.Description).HasMaxLength(500);
            entity.Property(r => r.IsCompound).HasDefaultValue(false);
            entity.Property(r => r.IsInclusive).HasDefaultValue(false);
            entity.Property(r => r.ApplicationLevel).HasMaxLength(32).HasDefaultValue("Item").IsRequired();
            entity.Property(r => r.Priority).HasDefaultValue(1);
            entity.Property(r => r.Status).HasMaxLength(32).HasDefaultValue("Active").IsRequired();
            entity.Ignore(r => r.IsActive);
            entity.Property(r => r.RowVersion).IsRowVersion();

            entity.HasOne(r => r.Tenant)
                  .WithMany()
                  .HasForeignKey(r => r.TenantId)
                  .OnDelete(DeleteBehavior.Restrict);

            entity.HasIndex(r => new { r.TenantId, r.Code }).IsUnique();
            entity.HasIndex(r => new { r.TenantId, r.TaxType });
            entity.HasIndex(r => new { r.TenantId, r.Status });
            entity.HasIndex(r => r.Priority);
            entity.HasIndex(r => r.CreatedAtUtc);
        });

        modelBuilder.Entity<TaxSetting>(entity =>
        {
            entity.HasKey(s => s.Id);
            entity.Property(s => s.IsTaxEnabled).HasDefaultValue(true);
            entity.Property(s => s.DefaultTaxCalculation).HasMaxLength(32).HasDefaultValue("Exclusive").IsRequired();
            entity.Property(s => s.PricesIncludeTax).HasDefaultValue(false);
            entity.Property(s => s.TaxRegistrationNumber).HasMaxLength(64);
            entity.Property(s => s.TaxNumberLabel).HasMaxLength(32).HasDefaultValue("GSTIN").IsRequired();
            entity.Property(s => s.EnableMultipleTaxes).HasDefaultValue(true);
            entity.Property(s => s.State).HasMaxLength(128);
            entity.Property(s => s.RowVersion).IsRowVersion();

            entity.HasOne(s => s.Tenant)
                  .WithMany()
                  .HasForeignKey(s => s.TenantId)
                  .OnDelete(DeleteBehavior.Restrict);

            entity.HasIndex(s => s.TenantId).IsUnique();
        });

        modelBuilder.Entity<ChargeConfiguration>(entity =>
        {
            entity.HasKey(c => c.Id);
            entity.Property(c => c.Name).HasMaxLength(128).IsRequired();
            entity.Property(c => c.Code).HasMaxLength(64).IsRequired();
            entity.Property(c => c.Description).HasMaxLength(500);
            entity.Property(c => c.ChargeType).HasConversion<string>().HasMaxLength(32).IsRequired();
            entity.Property(c => c.CalculationType).HasConversion<string>().HasMaxLength(32).IsRequired();
            entity.Property(c => c.Amount).HasPrecision(18, 2);
            entity.Property(c => c.MinInvoiceAmount).HasPrecision(18, 2);
            entity.Property(c => c.MaxChargeAmount).HasPrecision(18, 2);
            entity.Property(c => c.IsTaxable).HasDefaultValue(true);
            entity.Property(c => c.TaxCategory).HasMaxLength(64);
            entity.Property(c => c.Status).HasMaxLength(32).HasDefaultValue("Active").IsRequired();
            entity.Ignore(c => c.IsActive);
            entity.Property(c => c.RowVersion).IsRowVersion();

            entity.HasOne(c => c.Tenant)
                  .WithMany()
                  .HasForeignKey(c => c.TenantId)
                  .OnDelete(DeleteBehavior.Restrict);

            entity.HasIndex(c => new { c.TenantId, c.Code }).IsUnique();
            entity.HasIndex(c => new { c.TenantId, c.Status });
            entity.HasIndex(c => c.CreatedAtUtc);
        });

        modelBuilder.Entity<NumberingSetting>(entity =>
        {
            entity.HasKey(s => s.Id);
            entity.Property(s => s.DocumentType).HasMaxLength(64).IsRequired();
            entity.Property(s => s.Prefix).HasMaxLength(32).HasDefaultValue("INV-").IsRequired();
            entity.Property(s => s.Suffix).HasMaxLength(32).HasDefaultValue(string.Empty);
            entity.Property(s => s.Tokens).HasMaxLength(64).HasDefaultValue("{YEAR}-").IsRequired();
            entity.Property(s => s.SequenceLength).HasDefaultValue(4).IsRequired();
            entity.Property(s => s.NextNumber).HasDefaultValue(1).IsRequired();
            entity.Property(s => s.ResetPolicy).HasConversion<string>().HasMaxLength(32).IsRequired();
            entity.Property(s => s.Status).HasMaxLength(32).HasDefaultValue("Active").IsRequired();
            entity.Ignore(s => s.IsActive);
            entity.Property(s => s.RowVersion).IsRowVersion();

            entity.HasOne(s => s.Tenant)
                  .WithMany()
                  .HasForeignKey(s => s.TenantId)
                  .OnDelete(DeleteBehavior.Restrict);

            entity.HasIndex(s => new { s.TenantId, s.DocumentType }).IsUnique();
            entity.HasIndex(s => new { s.TenantId, s.Status });
        });

        modelBuilder.Entity<DiscountSetting>(entity =>
        {
            entity.HasKey(s => s.Id);
            entity.Property(s => s.Status).HasMaxLength(32).HasDefaultValue("Active").IsRequired();
            entity.Property(s => s.MaximumType).HasMaxLength(32).HasDefaultValue("Percentage").IsRequired();
            entity.Property(s => s.MaximumValue).HasPrecision(18, 2).HasDefaultValue(50.00m);
            entity.Property(s => s.DiscountType).HasMaxLength(32).HasDefaultValue("Percentage").IsRequired();
            entity.Property(s => s.ApplicationLevel).HasMaxLength(32).HasDefaultValue("Invoice Level").IsRequired();
            entity.Property(s => s.AllowLineLevel).HasDefaultValue(true);
            entity.Property(s => s.AllowInvoiceLevel).HasDefaultValue(true);
            entity.Property(s => s.EnforceMaximum).HasDefaultValue(true);
            entity.Property(s => s.AllowManualOverride).HasDefaultValue(true);
            entity.Property(s => s.RequireOverrideReason).HasDefaultValue(true);
            entity.Property(s => s.MinimumReasonLength).HasDefaultValue(10);
            entity.Property(s => s.RowVersion).IsRowVersion();

            entity.HasOne(s => s.Tenant)
                  .WithMany()
                  .HasForeignKey(s => s.TenantId)
                  .OnDelete(DeleteBehavior.Restrict);

            entity.HasIndex(s => s.TenantId).IsUnique();
        });

        modelBuilder.Entity<Quotation>(entity =>
        {
            entity.HasKey(q => q.Id);
            entity.Property(q => q.QuoteNumber).HasMaxLength(64).IsRequired();
            entity.HasIndex(q => new { q.TenantId, q.QuoteNumber }).IsUnique();
            entity.Property(q => q.Status).HasConversion<int>().IsRequired();
            entity.Property(q => q.Reference).HasMaxLength(128);
            entity.Property(q => q.Subtotal).HasPrecision(18, 2);
            entity.Property(q => q.DiscountAmount).HasPrecision(18, 2);
            entity.Property(q => q.TaxAmount).HasPrecision(18, 2);
            entity.Property(q => q.ChargesAmount).HasPrecision(18, 2);
            entity.Property(q => q.TotalAmount).HasPrecision(18, 2);
            entity.Property(q => q.RowVersion).IsRowVersion();

            entity.HasOne(q => q.Tenant)
                  .WithMany()
                  .HasForeignKey(q => q.TenantId)
                  .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(q => q.Customer)
                  .WithMany()
                  .HasForeignKey(q => q.CustomerId)
                  .OnDelete(DeleteBehavior.Restrict);

            entity.HasMany(q => q.Items)
                  .WithOne(i => i.Quotation)
                  .HasForeignKey(i => i.QuotationId)
                  .OnDelete(DeleteBehavior.Cascade);

            entity.HasMany(q => q.Communications)
                  .WithOne(c => c.Quotation)
                  .HasForeignKey(c => c.QuotationId)
                  .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<QuotationItem>(entity =>
        {
            entity.HasKey(i => i.Id);
            entity.Property(i => i.Description).HasMaxLength(500).IsRequired();
            entity.Property(i => i.Quantity).HasPrecision(18, 4);
            entity.Property(i => i.UnitPrice).HasPrecision(18, 2);
            entity.Property(i => i.DiscountType).HasMaxLength(32);
            entity.Property(i => i.DiscountRate).HasPrecision(18, 2);
            entity.Property(i => i.DiscountAmount).HasPrecision(18, 2);
            entity.Property(i => i.TaxType).HasMaxLength(32);
            entity.Property(i => i.TaxRate).HasPrecision(18, 2);
            entity.Property(i => i.TaxAmount).HasPrecision(18, 2);
            entity.Property(i => i.TotalAmount).HasPrecision(18, 2);
            entity.Property(i => i.HSNSAC).HasMaxLength(64);

            entity.HasOne(i => i.Product)
                  .WithMany()
                  .HasForeignKey(i => i.ProductId)
                  .OnDelete(DeleteBehavior.SetNull);
        });

        modelBuilder.Entity<QuotationCommunication>(entity =>
        {
            entity.HasKey(c => c.Id);
            entity.Property(c => c.CommunicationType).HasMaxLength(64).IsRequired();
            entity.Property(c => c.Recipient).HasMaxLength(256).IsRequired();
            entity.Property(c => c.Subject).HasMaxLength(256).IsRequired();
            entity.Property(c => c.Status).HasMaxLength(64).IsRequired();
            entity.Property(c => c.SentBy).HasMaxLength(128).IsRequired();
        });

        modelBuilder.Entity<Invoice>(entity =>
        {
            entity.HasKey(inv => inv.Id);
            entity.Property(inv => inv.InvoiceNumber).HasMaxLength(64).IsRequired();
            entity.HasIndex(inv => new { inv.TenantId, inv.InvoiceNumber }).IsUnique();
            entity.Property(inv => inv.Status).HasMaxLength(32).HasDefaultValue("Draft").IsRequired();
            entity.Property(inv => inv.Reference).HasMaxLength(128);
            entity.Property(inv => inv.Subtotal).HasPrecision(18, 2);
            entity.Property(inv => inv.DiscountAmount).HasPrecision(18, 2);
            entity.Property(inv => inv.TaxAmount).HasPrecision(18, 2);
            entity.Property(inv => inv.ChargesAmount).HasPrecision(18, 2);
            entity.Property(inv => inv.TotalAmount).HasPrecision(18, 2);
            entity.Property(inv => inv.PaidAmount).HasPrecision(18, 2);
            entity.Property(inv => inv.BalanceAmount).HasPrecision(18, 2);
            entity.Property(inv => inv.RowVersion).IsRowVersion();

            entity.HasOne(inv => inv.Tenant)
                  .WithMany()
                  .HasForeignKey(inv => inv.TenantId)
                  .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(inv => inv.Customer)
                  .WithMany()
                  .HasForeignKey(inv => inv.CustomerId)
                  .OnDelete(DeleteBehavior.Restrict);

            entity.HasMany(inv => inv.Items)
                  .WithOne(i => i.Invoice)
                  .HasForeignKey(i => i.InvoiceId)
                  .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<InvoiceItem>(entity =>
        {
            entity.HasKey(i => i.Id);
            entity.Property(i => i.Description).HasMaxLength(500).IsRequired();
            entity.Property(i => i.Quantity).HasPrecision(18, 4);
            entity.Property(i => i.UnitPrice).HasPrecision(18, 2);
            entity.Property(i => i.DiscountType).HasMaxLength(32);
            entity.Property(i => i.DiscountRate).HasPrecision(18, 2);
            entity.Property(i => i.DiscountAmount).HasPrecision(18, 2);
            entity.Property(i => i.TaxType).HasMaxLength(32);
            entity.Property(i => i.TaxRate).HasPrecision(18, 2);
            entity.Property(i => i.TaxAmount).HasPrecision(18, 2);
            entity.Property(i => i.TotalAmount).HasPrecision(18, 2);
            entity.Property(i => i.HSNSAC).HasMaxLength(64);

            entity.HasOne(i => i.Product)
                  .WithMany()
                  .HasForeignKey(i => i.ProductId)
                  .OnDelete(DeleteBehavior.SetNull);
        });
    }
}