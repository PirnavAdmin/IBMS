using System.ComponentModel.DataAnnotations;

namespace Billing.Contracts.Numbering;

public class NumberingSettingDto
{
    public int Id { get; set; }
    public int TenantId { get; set; }
    public string DocumentType { get; set; } = "Invoice";
    public string Prefix { get; set; } = "INV-";
    public string Suffix { get; set; } = string.Empty;
    public string Tokens { get; set; } = "{YEAR}-";
    public int SequenceLength { get; set; } = 4;
    public long NextNumber { get; set; } = 1;
    public string ResetPolicy { get; set; } = "Financial Year";
    public DateTime? LastResetDateUtc { get; set; }
    public string Status { get; set; } = "Active";
    public bool IsActive { get; set; } = true;
    public DateTime CreatedAtUtc { get; set; }
    public DateTime? UpdatedAtUtc { get; set; }
    public string? RowVersion { get; set; }
    public string? Preview { get; set; }
}

public class UpdateNumberingSettingRequest
{
    [Required(ErrorMessage = "Document type is required.")]
    [StringLength(64)]
    public string DocumentType { get; set; } = "Invoice";

    [StringLength(20, ErrorMessage = "Prefix must not exceed 20 characters.")]
    public string Prefix { get; set; } = "INV-";

    [StringLength(20, ErrorMessage = "Suffix must not exceed 20 characters.")]
    public string Suffix { get; set; } = string.Empty;

    [StringLength(30, ErrorMessage = "Tokens expression must not exceed 30 characters.")]
    public string Tokens { get; set; } = "{YEAR}-";

    [Range(3, 10, ErrorMessage = "Sequence length must be between 3 and 10 digits.")]
    public int SequenceLength { get; set; } = 4;

    [Range(1, 999999999999, ErrorMessage = "Next number must be at least 1.")]
    public long NextNumber { get; set; } = 1;

    [Required(ErrorMessage = "Reset policy is required.")]
    [StringLength(32)]
    public string ResetPolicy { get; set; } = "Financial Year";

    [StringLength(32)]
    public string Status { get; set; } = "Active";

    public string? RowVersion { get; set; }
}

public class ResetNumberingSequenceRequest
{
    [Required]
    public string DocumentType { get; set; } = "Invoice";

    [Range(1, 999999999999)]
    public long ResetTo { get; set; } = 1;
}

public class NumberPreviewRequest
{
    public string DocumentType { get; set; } = "Invoice";
    public string? Prefix { get; set; }
    public string? Suffix { get; set; }
    public string? Tokens { get; set; }
    public int? SequenceLength { get; set; }
    public long? NextNumber { get; set; }
    public DateTime? Date { get; set; }
}

public class NumberPreviewResponseDto
{
    public string FullPreview { get; set; } = string.Empty;
    public NumberPreviewPartsDto Parts { get; set; } = new();
}

public class NumberPreviewPartsDto
{
    public string Prefix { get; set; } = string.Empty;
    public string Tokens { get; set; } = string.Empty;
    public string Sequence { get; set; } = string.Empty;
    public string Suffix { get; set; } = string.Empty;
}

public class GenerateNumberRequest
{
    [Required]
    public string DocumentType { get; set; } = "Invoice";
    public DateTime? TransactionDate { get; set; }
}

public class GenerateNumberResponseDto
{
    public string DocumentType { get; set; } = "Invoice";
    public string GeneratedNumber { get; set; } = string.Empty;
    public long SequenceNumber { get; set; }
    public DateTime GeneratedAtUtc { get; set; }
}
