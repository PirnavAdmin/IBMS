using System;
using System.Collections.Generic;
using System.Threading.Tasks;

namespace Billing.Application.Interfaces;

public class PaymentLedgerEntry
{
    public DateTime TimestampUtc { get; set; } = DateTime.UtcNow;
    
    public string TimestampIst
    {
        get
        {
            try
            {
                var tzId = OperatingSystem.IsWindows() ? "India Standard Time" : "Asia/Kolkata";
                var tz = TimeZoneInfo.FindSystemTimeZoneById(tzId);
                return TimeZoneInfo.ConvertTimeFromUtc(TimestampUtc, tz).ToString("dd-MM-yyyy HH:mm:ss");
            }
            catch
            {
                return TimestampUtc.AddHours(5).AddMinutes(30).ToString("dd-MM-yyyy HH:mm:ss");
            }
        }
    }

    public int TenantId { get; set; }
    public int InvoiceId { get; set; }
    public string InvoiceNumber { get; set; } = string.Empty;
    public string CustomerName { get; set; } = string.Empty;
    public string CustomerPhone { get; set; } = string.Empty;
    public string CustomerEmail { get; set; } = string.Empty;
    public decimal TotalAmount { get; set; }
    public decimal AmountPaid { get; set; }
    public decimal BalanceDue { get; set; }
    public string PayVia { get; set; } = string.Empty;
    public string TransactionReference { get; set; } = string.Empty;
    public string PaymentStatus { get; set; } = string.Empty;
    public string Source { get; set; } = "Customer Portal";
}

public interface IPaymentLedgerService
{
    Task LogPaymentAsync(PaymentLedgerEntry entry);
    Task<byte[]> GetExcelBytesAsync(int? tenantId = null);
    Task<List<PaymentLedgerEntry>> GetRecentEntriesAsync(int? tenantId = null, int limit = 100);
}
