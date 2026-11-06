using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using Billing.Application.Interfaces;
using Microsoft.Extensions.Logging;

namespace Billing.Application.Services;

public class PaymentLedgerService : IPaymentLedgerService
{
    private readonly ILogger<PaymentLedgerService> _logger;
    private readonly string _storageDir;
    private readonly string _csvFilePath;
    private static readonly SemaphoreSlim _lock = new(1, 1);

    public PaymentLedgerService(ILogger<PaymentLedgerService> logger)
    {
        _logger = logger;
        _storageDir = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "Storage");
        _csvFilePath = Path.Combine(_storageDir, "Payments_Ledger.csv");

        EnsureFileInitialized();
    }

    private void EnsureFileInitialized()
    {
        try
        {
            if (!Directory.Exists(_storageDir))
            {
                Directory.CreateDirectory(_storageDir);
            }

            if (!File.Exists(_csvFilePath))
            {
                var header = "\"Timestamp (IST)\",\"Invoice Number\",\"Customer Name\",\"Customer Phone\",\"Customer Email\",\"Total Amount (INR)\",\"Amount Paid (INR)\",\"Balance Due (INR)\",\"Pay Via\",\"Transaction Reference / UTR\",\"Status\",\"Source\"\n";
                // Write with UTF-8 BOM so Excel opens it with perfect formatting and encoding
                File.WriteAllText(_csvFilePath, header, new UTF8Encoding(true));
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Could not initialize Payments_Ledger.csv file at {Path}", _csvFilePath);
        }
    }

    public async Task LogPaymentAsync(PaymentLedgerEntry entry)
    {
        if (entry == null) return;

        await _lock.WaitAsync();
        try
        {
            EnsureFileInitialized();

            var line = string.Format(
                "\"{0}\",\"{1}\",\"{2}\",\"{3}\",\"{4}\",\"{5:F2}\",\"{6:F2}\",\"{7:F2}\",\"{8}\",\"{9}\",\"{10}\",\"{11}\"\n",
                EscapeCsv(entry.TimestampIst),
                EscapeCsv(entry.InvoiceNumber),
                EscapeCsv(entry.CustomerName),
                EscapeCsv(entry.CustomerPhone),
                EscapeCsv(entry.CustomerEmail),
                entry.TotalAmount,
                entry.AmountPaid,
                entry.BalanceDue,
                EscapeCsv(entry.PayVia),
                EscapeCsv(entry.TransactionReference),
                EscapeCsv(entry.PaymentStatus),
                EscapeCsv(entry.Source)
            );

            await File.AppendAllTextAsync(_csvFilePath, line, new UTF8Encoding(true));
            _logger.LogInformation("Logged payment of ₹{Amount} for Invoice {InvoiceNumber} to Payments_Ledger.csv", 
                entry.AmountPaid, entry.InvoiceNumber);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to append payment entry for Invoice {InvoiceNumber} to Payments_Ledger.csv", entry.InvoiceNumber);
        }
        finally
        {
            _lock.Release();
        }
    }

    public async Task<byte[]> GetExcelBytesAsync(int? tenantId = null)
    {
        await _lock.WaitAsync();
        try
        {
            EnsureFileInitialized();
            if (File.Exists(_csvFilePath))
            {
                return await File.ReadAllBytesAsync(_csvFilePath);
            }
            return Encoding.UTF8.GetPreamble();
        }
        finally
        {
            _lock.Release();
        }
    }

    public async Task<List<PaymentLedgerEntry>> GetRecentEntriesAsync(int? tenantId = null, int limit = 100)
    {
        var list = new List<PaymentLedgerEntry>();
        await _lock.WaitAsync();
        try
        {
            EnsureFileInitialized();
            if (!File.Exists(_csvFilePath)) return list;

            var lines = await File.ReadAllLinesAsync(_csvFilePath);
            // Skip header line
            foreach (var line in lines.Skip(1).Reverse().Take(limit))
            {
                if (string.IsNullOrWhiteSpace(line)) continue;
                var cols = ParseCsvLine(line);
                if (cols.Count >= 11)
                {
                    decimal.TryParse(cols[5], out var total);
                    decimal.TryParse(cols[6], out var paid);
                    decimal.TryParse(cols[7], out var balance);

                    list.Add(new PaymentLedgerEntry
                    {
                        InvoiceNumber = cols[1],
                        CustomerName = cols[2],
                        CustomerPhone = cols[3],
                        CustomerEmail = cols[4],
                        TotalAmount = total,
                        AmountPaid = paid,
                        BalanceDue = balance,
                        PayVia = cols[8],
                        TransactionReference = cols[9],
                        PaymentStatus = cols[10],
                        Source = cols.Count > 11 ? cols[11] : "Customer Portal"
                    });
                }
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to read recent entries from Payments_Ledger.csv");
        }
        finally
        {
            _lock.Release();
        }
        return list;
    }

    private static string EscapeCsv(string? value)
    {
        if (string.IsNullOrEmpty(value)) return string.Empty;
        return value.Replace("\"", "\"\"");
    }

    private static List<string> ParseCsvLine(string line)
    {
        var result = new List<string>();
        var sb = new StringBuilder();
        bool inQuotes = false;

        for (int i = 0; i < line.Length; i++)
        {
            char c = line[i];
            if (c == '\"')
            {
                if (inQuotes && i + 1 < line.Length && line[i + 1] == '\"')
                {
                    sb.Append('\"');
                    i++;
                }
                else
                {
                    inQuotes = !inQuotes;
                }
            }
            else if (c == ',' && !inQuotes)
            {
                result.Add(sb.ToString());
                sb.Clear();
            }
            else
            {
                sb.Append(c);
            }
        }
        result.Add(sb.ToString());
        return result;
    }
}
