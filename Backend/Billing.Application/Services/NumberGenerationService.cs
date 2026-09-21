using System.Collections.Concurrent;
using System.Globalization;
using System.Text.RegularExpressions;
using Billing.Application.Interfaces;
using Billing.Contracts;
using Billing.Contracts.Numbering;
using Billing.Domain.Entities;
using Billing.Domain.Enums;

namespace Billing.Application.Services;

public class NumberGenerationService : INumberGenerationService
{
    private readonly INumberingRepository _numberingRepository;
    private static readonly ConcurrentDictionary<string, SemaphoreSlim> _locks = new(StringComparer.OrdinalIgnoreCase);

    public NumberGenerationService(INumberingRepository numberingRepository)
    {
        _numberingRepository = numberingRepository;
    }

    public async Task<ApiResponse<GenerateNumberResponseDto>> GenerateNextNumberAsync(GenerateNumberRequest request, int tenantId)
    {
        if (tenantId <= 0)
        {
            return ApiResponse<GenerateNumberResponseDto>.Fail("Invalid tenant identifier", "Tenant ID must be greater than 0.");
        }

        var docType = string.IsNullOrWhiteSpace(request?.DocumentType) ? "Invoice" : request.DocumentType.Trim();
        var date = request?.TransactionDate ?? DateTime.UtcNow;

        var lockKey = $"{tenantId}:{docType}";
        var semaphore = _locks.GetOrAdd(lockKey, _ => new SemaphoreSlim(1, 1));

        await semaphore.WaitAsync();
        try
        {
            var setting = await _numberingRepository.GetByDocumentTypeAsync(docType, tenantId);
            if (setting == null)
            {
                // Auto provision default setting for this document type
                try
                {
                    setting = new NumberingSetting
                    {
                        TenantId = tenantId,
                        DocumentType = docType,
                        Prefix = GetDefaultPrefix(docType),
                        Suffix = string.Empty,
                        Tokens = "{YEAR}-",
                        SequenceLength = 4,
                        NextNumber = 1,
                        ResetPolicy = ResetPolicy.FinancialYear,
                        Status = "Active",
                        CreatedAtUtc = DateTime.UtcNow,
                        RowVersion = DateTime.UtcNow
                    };
                    setting = await _numberingRepository.AddAsync(setting);
                }
                catch
                {
                    // If inserted concurrently, re-fetch
                    setting = await _numberingRepository.GetByDocumentTypeAsync(docType, tenantId);
                }
            }

            if (setting == null)
            {
                return ApiResponse<GenerateNumberResponseDto>.Fail("Setting provision error", "Unable to load or initialize numbering setting.");
            }

            // Check and apply reset policy
            if (ShouldReset(setting.ResetPolicy, setting.LastResetDateUtc, date))
            {
                setting.NextNumber = 1;
                setting.LastResetDateUtc = date;
                await _numberingRepository.UpdateAsync(setting);
            }

            // Increment sequence atomically
            var allocatedNumber = await _numberingRepository.IncrementSequenceAsync(setting.Id, tenantId);

            var generatedNumber = FormatNumber(
                setting.Prefix,
                setting.Tokens,
                allocatedNumber,
                setting.SequenceLength,
                setting.Suffix,
                date);

            return ApiResponse<GenerateNumberResponseDto>.Ok(new GenerateNumberResponseDto
            {
                DocumentType = docType,
                GeneratedNumber = generatedNumber,
                SequenceNumber = allocatedNumber,
                GeneratedAtUtc = DateTime.UtcNow
            }, "Document number generated successfully.");
        }
        finally
        {
            semaphore.Release();
        }
    }

    public string FormatNumber(string prefix, string tokens, long sequenceNumber, int sequenceLength, string suffix, DateTime date)
    {
        var evaluatedPrefix = ReplaceTokens(prefix ?? string.Empty, date);
        var evaluatedTokens = ReplaceTokens(tokens ?? string.Empty, date);
        var paddedSequence = sequenceNumber.ToString().PadLeft(Math.Max(1, sequenceLength), '0');
        var evaluatedSuffix = ReplaceTokens(suffix ?? string.Empty, date);

        return $"{evaluatedPrefix}{evaluatedTokens}{paddedSequence}{evaluatedSuffix}";
    }

    public string ReplaceTokens(string text, DateTime date)
    {
        if (string.IsNullOrEmpty(text)) return string.Empty;

        var year = date.Year;
        var yy = (year % 100).ToString("D2");
        var monthName = date.ToString("MMM", CultureInfo.InvariantCulture);
        var mm = date.Month.ToString("D2");
        var dd = date.Day.ToString("D2");

        // Indian Financial Year: April 1 to March 31
        var fyStart = date.Month >= 4 ? year : year - 1;
        var fyEnd = fyStart + 1;
        var fy = $"{(fyStart % 100):D2}-{(fyEnd % 100):D2}";

        // Calendar Quarter Q1-Q4
        var quarter = $"Q{((date.Month - 1) / 3) + 1}";

        var result = text;
        result = Regex.Replace(result, @"\{YEAR\}|\{YYYY\}", year.ToString(), RegexOptions.IgnoreCase);
        result = Regex.Replace(result, @"\{YY\}", yy, RegexOptions.IgnoreCase);
        result = Regex.Replace(result, @"\{MONTH\}", monthName, RegexOptions.IgnoreCase);
        result = Regex.Replace(result, @"\{MM\}", mm, RegexOptions.IgnoreCase);
        result = Regex.Replace(result, @"\{DD\}", dd, RegexOptions.IgnoreCase);
        result = Regex.Replace(result, @"\{FY\}", fy, RegexOptions.IgnoreCase);
        result = Regex.Replace(result, @"\{QUARTER\}", quarter, RegexOptions.IgnoreCase);

        return result;
    }

    private static bool ShouldReset(ResetPolicy policy, DateTime? lastResetDate, DateTime currentDate)
    {
        if (!lastResetDate.HasValue) return false;

        var last = lastResetDate.Value;
        return policy switch
        {
            ResetPolicy.Never => false,
            ResetPolicy.Daily => last.Date < currentDate.Date,
            ResetPolicy.Monthly => (last.Year < currentDate.Year) || (last.Year == currentDate.Year && last.Month < currentDate.Month),
            ResetPolicy.Yearly => last.Year < currentDate.Year,
            ResetPolicy.FinancialYear => GetFinancialYearStart(last) < GetFinancialYearStart(currentDate),
            _ => false
        };
    }

    private static int GetFinancialYearStart(DateTime date)
    {
        return date.Month >= 4 ? date.Year : date.Year - 1;
    }

    private static string GetDefaultPrefix(string documentType)
    {
        var norm = documentType.Trim().ToLowerInvariant();
        if (norm.Contains("credit")) return "CN-";
        if (norm.Contains("estimate") || norm.Contains("quote")) return "EST-";
        if (norm.Contains("recurring")) return "REC-";
        if (norm.Contains("challan")) return "DC-";
        return "INV-";
    }
}
