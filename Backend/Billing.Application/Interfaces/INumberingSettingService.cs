using Billing.Contracts;
using Billing.Contracts.Numbering;

namespace Billing.Application.Interfaces;

public interface INumberingSettingService
{
    Task<ApiResponse<NumberingSettingDto>> GetSettingByDocTypeAsync(string documentType, int tenantId);
    Task<ApiResponse<List<NumberingSettingDto>>> GetAllSettingsAsync(int tenantId);
    Task<ApiResponse<NumberingSettingDto>> UpdateSettingAsync(UpdateNumberingSettingRequest request, int tenantId);
    Task<ApiResponse<NumberingSettingDto>> ResetSequenceAsync(string documentType, int tenantId, long resetTo = 1, string? userName = null);
    NumberPreviewResponseDto Preview(NumberPreviewRequest request);
}
