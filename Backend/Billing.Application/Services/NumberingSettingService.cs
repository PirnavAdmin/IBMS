using Billing.Application.Interfaces;
using Billing.Contracts;
using Billing.Contracts.Numbering;
using Billing.Domain.Entities;
using Billing.Domain.Enums;

namespace Billing.Application.Services;

public class NumberingSettingService : INumberingSettingService
{
    private readonly INumberingRepository _numberingRepository;
    private readonly INumberGenerationService _generationService;
    private readonly IAuditLogRepository? _auditLogRepository;

    public NumberingSettingService(
        INumberingRepository numberingRepository,
        INumberGenerationService generationService,
        IAuditLogRepository? auditLogRepository = null)
    {
        _numberingRepository = numberingRepository;
        _generationService = generationService;
        _auditLogRepository = auditLogRepository;
    }

    public async Task<ApiResponse<NumberingSettingDto>> GetSettingByDocTypeAsync(string documentType, int tenantId)
    {
        if (tenantId <= 0)
        {
            return ApiResponse<NumberingSettingDto>.Fail("Invalid tenant identifier", "Tenant ID must be greater than 0.");
        }

        var docType = string.IsNullOrWhiteSpace(documentType) ? "Invoice" : documentType.Trim();
        var setting = await _numberingRepository.GetByDocumentTypeAsync(docType, tenantId);

        if (setting == null)
        {
            // Return default preset
            var defaultDto = GetDefaultPreset(docType, tenantId);
            defaultDto.Preview = _generationService.FormatNumber(
                defaultDto.Prefix,
                defaultDto.Tokens,
                defaultDto.NextNumber,
                defaultDto.SequenceLength,
                defaultDto.Suffix,
                DateTime.UtcNow);

            return ApiResponse<NumberingSettingDto>.Ok(defaultDto, "Default numbering setting retrieved.");
        }

        var dto = MapToDto(setting);
        dto.Preview = _generationService.FormatNumber(
            setting.Prefix,
            setting.Tokens,
            setting.NextNumber,
            setting.SequenceLength,
            setting.Suffix,
            DateTime.UtcNow);

        return ApiResponse<NumberingSettingDto>.Ok(dto);
    }

    public async Task<ApiResponse<List<NumberingSettingDto>>> GetAllSettingsAsync(int tenantId)
    {
        if (tenantId <= 0)
        {
            return ApiResponse<List<NumberingSettingDto>>.Fail("Invalid tenant identifier", "Tenant ID must be greater than 0.");
        }

        var list = await _numberingRepository.GetAllAsync(tenantId);
        var dtos = list.Select(s =>
        {
            var dto = MapToDto(s);
            dto.Preview = _generationService.FormatNumber(
                s.Prefix,
                s.Tokens,
                s.NextNumber,
                s.SequenceLength,
                s.Suffix,
                DateTime.UtcNow);
            return dto;
        }).ToList();

        return ApiResponse<List<NumberingSettingDto>>.Ok(dtos);
    }

    public async Task<ApiResponse<NumberingSettingDto>> UpdateSettingAsync(UpdateNumberingSettingRequest request, int tenantId)
    {
        if (tenantId <= 0)
        {
            return ApiResponse<NumberingSettingDto>.Fail("Invalid tenant identifier", "Tenant ID must be greater than 0.");
        }

        if (request == null)
        {
            return ApiResponse<NumberingSettingDto>.Fail("Validation failed", "Request cannot be null.");
        }

        var docType = string.IsNullOrWhiteSpace(request.DocumentType) ? "Invoice" : request.DocumentType.Trim();

        if (!Enum.TryParse<ResetPolicy>(request.ResetPolicy.Replace(" ", ""), true, out var parsedPolicy))
        {
            parsedPolicy = ResetPolicy.FinancialYear;
        }

        var existing = await _numberingRepository.GetByDocumentTypeAsync(docType, tenantId);
        if (existing == null)
        {
            existing = new NumberingSetting
            {
                TenantId = tenantId,
                DocumentType = docType,
                Prefix = request.Prefix?.Trim() ?? string.Empty,
                Suffix = request.Suffix?.Trim() ?? string.Empty,
                Tokens = request.Tokens?.Trim() ?? string.Empty,
                SequenceLength = request.SequenceLength > 0 ? request.SequenceLength : 4,
                NextNumber = request.NextNumber > 0 ? request.NextNumber : 1,
                ResetPolicy = parsedPolicy,
                Status = string.IsNullOrWhiteSpace(request.Status) ? "Active" : request.Status.Trim(),
                CreatedAtUtc = DateTime.UtcNow,
                RowVersion = DateTime.UtcNow
            };
            existing = await _numberingRepository.AddAsync(existing);
        }
        else
        {
            existing.Prefix = request.Prefix?.Trim() ?? string.Empty;
            existing.Suffix = request.Suffix?.Trim() ?? string.Empty;
            existing.Tokens = request.Tokens?.Trim() ?? string.Empty;
            existing.SequenceLength = request.SequenceLength > 0 ? request.SequenceLength : 4;
            existing.NextNumber = request.NextNumber > 0 ? request.NextNumber : 1;
            existing.ResetPolicy = parsedPolicy;
            if (!string.IsNullOrWhiteSpace(request.Status))
            {
                existing.Status = request.Status.Trim();
            }
            existing.UpdatedAtUtc = DateTime.UtcNow;
            existing.RowVersion = DateTime.UtcNow;

            existing = await _numberingRepository.UpdateAsync(existing);
        }

        if (_auditLogRepository != null)
        {
            await _auditLogRepository.AddAsync(new AuditLog
            {
                TenantId = tenantId,
                EntityName = "NumberingSetting",
                EntityId = existing.Id.ToString(),
                Action = "UPDATE",
                UserName = "System",
                Timestamp = DateTime.UtcNow,
                Changes = $"Updated numbering setting for '{existing.DocumentType}'. Prefix: '{existing.Prefix}', Tokens: '{existing.Tokens}', SequenceLength: {existing.SequenceLength}, NextNumber: {existing.NextNumber}, ResetPolicy: '{existing.ResetPolicy}'."
            });
        }

        var dto = MapToDto(existing);
        dto.Preview = _generationService.FormatNumber(
            existing.Prefix,
            existing.Tokens,
            existing.NextNumber,
            existing.SequenceLength,
            existing.Suffix,
            DateTime.UtcNow);

        return ApiResponse<NumberingSettingDto>.Ok(dto, "Numbering settings updated successfully.");
    }

    public NumberPreviewResponseDto Preview(NumberPreviewRequest request)
    {
        var date = request.Date ?? DateTime.UtcNow;
        var prefix = request.Prefix ?? "INV-";
        var tokens = request.Tokens ?? "{YEAR}-";
        var seqLen = request.SequenceLength.GetValueOrDefault(4);
        var nextNum = request.NextNumber.GetValueOrDefault(1);
        var suffix = request.Suffix ?? string.Empty;

        var evaluatedPrefix = _generationService.ReplaceTokens(prefix, date);
        var evaluatedTokens = _generationService.ReplaceTokens(tokens, date);
        var paddedSeq = nextNum.ToString().PadLeft(Math.Max(1, seqLen), '0');
        var evaluatedSuffix = _generationService.ReplaceTokens(suffix, date);

        var full = $"{evaluatedPrefix}{evaluatedTokens}{paddedSeq}{evaluatedSuffix}";

        return new NumberPreviewResponseDto
        {
            FullPreview = full,
            Parts = new NumberPreviewPartsDto
            {
                Prefix = evaluatedPrefix,
                Tokens = evaluatedTokens,
                Sequence = paddedSeq,
                Suffix = evaluatedSuffix
            }
        };
    }

    private static NumberingSettingDto MapToDto(NumberingSetting s)
    {
        return new NumberingSettingDto
        {
            Id = s.Id,
            TenantId = s.TenantId,
            DocumentType = s.DocumentType,
            Prefix = s.Prefix,
            Suffix = s.Suffix,
            Tokens = s.Tokens,
            SequenceLength = s.SequenceLength,
            NextNumber = s.NextNumber,
            ResetPolicy = FormatPolicyName(s.ResetPolicy),
            LastResetDateUtc = s.LastResetDateUtc,
            Status = s.Status,
            IsActive = s.IsActive,
            CreatedAtUtc = s.CreatedAtUtc,
            UpdatedAtUtc = s.UpdatedAtUtc,
            RowVersion = Convert.ToBase64String(BitConverter.GetBytes(s.RowVersion.Ticks))
        };
    }

    private static string FormatPolicyName(ResetPolicy p)
    {
        return p switch
        {
            ResetPolicy.FinancialYear => "Financial Year",
            _ => p.ToString()
        };
    }

    private static NumberingSettingDto GetDefaultPreset(string documentType, int tenantId)
    {
        var norm = documentType.Trim().ToLowerInvariant();
        var (prefix, policy) = norm switch
        {
            var d when d.Contains("credit") => ("CN-", "Financial Year"),
            var d when d.Contains("estimate") || d.Contains("quote") => ("EST-", "Yearly"),
            var d when d.Contains("recurring") => ("REC-", "Yearly"),
            var d when d.Contains("challan") => ("DC-", "Financial Year"),
            _ => ("INV-", "Financial Year")
        };

        return new NumberingSettingDto
        {
            TenantId = tenantId,
            DocumentType = documentType,
            Prefix = prefix,
            Suffix = string.Empty,
            Tokens = "{YEAR}-",
            SequenceLength = 4,
            NextNumber = 1,
            ResetPolicy = policy,
            Status = "Active",
            IsActive = true,
            CreatedAtUtc = DateTime.UtcNow
        };
    }
}
