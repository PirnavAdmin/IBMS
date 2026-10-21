using System.Security.Claims;
using Billing.Application.Interfaces;
using Billing.Contracts;
using Billing.Contracts.InvoiceTemplate;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;

namespace Billing.API.Controllers;

[Authorize]
[ApiController]
[Route("api/v1/invoice-templates")]
public class InvoiceTemplatesController : ControllerBase
{
    private readonly IInvoiceTemplateService _templateService;
    private readonly IDocumentStorageService _storageService;
    private readonly ILogger<InvoiceTemplatesController> _logger;

    public InvoiceTemplatesController(
        IInvoiceTemplateService templateService,
        IDocumentStorageService storageService,
        ILogger<InvoiceTemplatesController> logger)
    {
        _templateService = templateService;
        _storageService = storageService;
        _logger = logger;
    }

    /// <summary>
    /// Retrieve paginated list of invoice templates with search, style, and status filters.
    /// </summary>
    [HttpGet]
    [ProducesResponseType(typeof(ApiResponse<PagedResult<InvoiceTemplateDto>>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetTemplates([FromQuery] TemplateFilterRequest filter, CancellationToken ct)
    {
        var tenantId = GetTenantId();
        if (!tenantId.HasValue) return Forbid();

        var result = await _templateService.GetTemplatesAsync(filter ?? new TemplateFilterRequest(), tenantId.Value, ct);
        return Ok(ApiResponse<PagedResult<InvoiceTemplateDto>>.Ok(result, "Templates retrieved successfully."));
    }

    /// <summary>
    /// Retrieve single template details including active version visual styling configurations.
    /// </summary>
    [HttpGet("{id:int}")]
    [ProducesResponseType(typeof(ApiResponse<InvoiceTemplateDto>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<InvoiceTemplateDto>), StatusCodes.Status404NotFound)]
    public async Task<IActionResult> GetTemplateById([FromRoute] int id, CancellationToken ct)
    {
        var tenantId = GetTenantId();
        if (!tenantId.HasValue) return Forbid();

        try
        {
            var template = await _templateService.GetTemplateByIdAsync(id, tenantId.Value, ct);
            return Ok(ApiResponse<InvoiceTemplateDto>.Ok(template, "Template retrieved successfully."));
        }
        catch (KeyNotFoundException ex)
        {
            return NotFound(ApiResponse<InvoiceTemplateDto>.Fail(ex.Message));
        }
    }

    /// <summary>
    /// Retrieve all historical and draft versions for a template (Version History).
    /// </summary>
    [HttpGet("{id:int}/versions")]
    [ProducesResponseType(typeof(ApiResponse<List<TemplateVersionDto>>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<List<TemplateVersionDto>>), StatusCodes.Status404NotFound)]
    public async Task<IActionResult> GetTemplateVersions([FromRoute] int id, CancellationToken ct)
    {
        var tenantId = GetTenantId();
        if (!tenantId.HasValue) return Forbid();

        try
        {
            var versions = await _templateService.GetTemplateVersionsAsync(id, tenantId.Value, ct);
            return Ok(ApiResponse<List<TemplateVersionDto>>.Ok(versions, "Template version history retrieved successfully."));
        }
        catch (KeyNotFoundException ex)
        {
            return NotFound(ApiResponse<List<TemplateVersionDto>>.Fail(ex.Message));
        }
    }

    /// <summary>
    /// Create a new custom invoice presentation template with initial version 1.
    /// </summary>
    [HttpPost]
    [ProducesResponseType(typeof(ApiResponse<InvoiceTemplateDto>), StatusCodes.Status201Created)]
    [ProducesResponseType(typeof(ApiResponse<InvoiceTemplateDto>), StatusCodes.Status400BadRequest)]
    public async Task<IActionResult> CreateTemplate([FromBody] CreateTemplateRequest request, CancellationToken ct)
    {
        var tenantId = GetTenantId();
        if (!tenantId.HasValue) return Forbid();

        var user = GetUserName();

        try
        {
            var created = await _templateService.CreateTemplateAsync(request, tenantId.Value, user, ct);
            return CreatedAtAction(nameof(GetTemplateById), new { id = created.Id }, ApiResponse<InvoiceTemplateDto>.Ok(created, "Template created successfully."));
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(ApiResponse<InvoiceTemplateDto>.Fail(ex.Message));
        }
    }

    /// <summary>
    /// Update template details or styling configurations. If active, automatically increments to a new draft version.
    /// </summary>
    [HttpPut("{id:int}")]
    [ProducesResponseType(typeof(ApiResponse<InvoiceTemplateDto>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<InvoiceTemplateDto>), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ApiResponse<InvoiceTemplateDto>), StatusCodes.Status404NotFound)]
    public async Task<IActionResult> UpdateTemplate([FromRoute] int id, [FromBody] UpdateTemplateRequest request, CancellationToken ct)
    {
        var tenantId = GetTenantId();
        if (!tenantId.HasValue) return Forbid();

        var user = GetUserName();

        try
        {
            var updated = await _templateService.UpdateTemplateAsync(id, request, tenantId.Value, user, ct);
            return Ok(ApiResponse<InvoiceTemplateDto>.Ok(updated, "Template updated successfully."));
        }
        catch (KeyNotFoundException ex)
        {
            return NotFound(ApiResponse<InvoiceTemplateDto>.Fail(ex.Message));
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(ApiResponse<InvoiceTemplateDto>.Fail(ex.Message));
        }
    }

    /// <summary>
    /// Clones an existing template's visual styling and configuration into a new draft template.
    /// </summary>
    [HttpPost("{id:int}/duplicate")]
    [ProducesResponseType(typeof(ApiResponse<InvoiceTemplateDto>), StatusCodes.Status201Created)]
    [ProducesResponseType(typeof(ApiResponse<InvoiceTemplateDto>), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ApiResponse<InvoiceTemplateDto>), StatusCodes.Status404NotFound)]
    public async Task<IActionResult> DuplicateTemplate([FromRoute] int id, [FromBody] DuplicateTemplateRequest request, CancellationToken ct)
    {
        var tenantId = GetTenantId();
        if (!tenantId.HasValue) return Forbid();

        var user = GetUserName();

        try
        {
            var duplicated = await _templateService.DuplicateTemplateAsync(id, request, tenantId.Value, user, ct);
            return CreatedAtAction(nameof(GetTemplateById), new { id = duplicated.Id }, ApiResponse<InvoiceTemplateDto>.Ok(duplicated, "Template duplicated successfully."));
        }
        catch (KeyNotFoundException ex)
        {
            return NotFound(ApiResponse<InvoiceTemplateDto>.Fail(ex.Message));
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(ApiResponse<InvoiceTemplateDto>.Fail(ex.Message));
        }
    }

    /// <summary>
    /// Activates a template and publishes the latest (or specified) version for live billing generation.
    /// </summary>
    [HttpPatch("{id:int}/activate")]
    [ProducesResponseType(typeof(ApiResponse<InvoiceTemplateDto>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<InvoiceTemplateDto>), StatusCodes.Status404NotFound)]
    public async Task<IActionResult> ActivateTemplate([FromRoute] int id, [FromQuery] int? version, CancellationToken ct)
    {
        var tenantId = GetTenantId();
        if (!tenantId.HasValue) return Forbid();

        var user = GetUserName();

        try
        {
            var activated = await _templateService.ActivateTemplateAsync(id, version, tenantId.Value, user, ct);
            return Ok(ApiResponse<InvoiceTemplateDto>.Ok(activated, "Template activated successfully."));
        }
        catch (KeyNotFoundException ex)
        {
            return NotFound(ApiResponse<InvoiceTemplateDto>.Fail(ex.Message));
        }
    }

    /// <summary>
    /// Makes this active template the tenant default for future official invoice PDF generation.
    /// </summary>
    [HttpPatch("{id:int}/default")]
    [ProducesResponseType(typeof(ApiResponse<InvoiceTemplateDto>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<InvoiceTemplateDto>), StatusCodes.Status404NotFound)]
    public async Task<IActionResult> SetDefaultTemplate([FromRoute] int id, CancellationToken ct)
    {
        var tenantId = GetTenantId();
        if (!tenantId.HasValue) return Forbid();

        try
        {
            var template = await _templateService.SetDefaultTemplateAsync(id, tenantId.Value, GetUserName(), ct);
            return Ok(ApiResponse<InvoiceTemplateDto>.Ok(template, "Template set as default successfully."));
        }
        catch (KeyNotFoundException ex)
        {
            return NotFound(ApiResponse<InvoiceTemplateDto>.Fail(ex.Message));
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(ApiResponse<InvoiceTemplateDto>.Fail(ex.Message));
        }
    }

    /// <summary>
    /// Deactivates a template, preventing new invoices from utilizing it.
    /// </summary>
    [HttpPatch("{id:int}/deactivate")]
    [ProducesResponseType(typeof(ApiResponse<InvoiceTemplateDto>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<InvoiceTemplateDto>), StatusCodes.Status404NotFound)]
    public async Task<IActionResult> DeactivateTemplate([FromRoute] int id, CancellationToken ct)
    {
        var tenantId = GetTenantId();
        if (!tenantId.HasValue) return Forbid();

        var user = GetUserName();

        try
        {
            var deactivated = await _templateService.DeactivateTemplateAsync(id, tenantId.Value, user, ct);
            return Ok(ApiResponse<InvoiceTemplateDto>.Ok(deactivated, "Template deactivated successfully."));
        }
        catch (KeyNotFoundException ex)
        {
            return NotFound(ApiResponse<InvoiceTemplateDto>.Fail(ex.Message));
        }
    }

    /// <summary>
    /// Archives or removes a custom invoice template.
    /// </summary>
    [HttpDelete("{id:int}")]
    [ProducesResponseType(typeof(ApiResponse<bool>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<bool>), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ApiResponse<bool>), StatusCodes.Status404NotFound)]
    public async Task<IActionResult> DeleteTemplate([FromRoute] int id, CancellationToken ct)
    {
        var tenantId = GetTenantId();
        if (!tenantId.HasValue) return Forbid();

        var user = GetUserName();

        try
        {
            var deleted = await _templateService.DeleteTemplateAsync(id, tenantId.Value, user, ct);
            return Ok(ApiResponse<bool>.Ok(deleted, "Template archived successfully."));
        }
        catch (KeyNotFoundException ex)
        {
            return NotFound(ApiResponse<bool>.Fail(ex.Message));
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(ApiResponse<bool>.Fail(ex.Message));
        }
    }

    /// <summary>
    /// Renders a dynamic live sample PDF preview binary directly from client-side customization options.
    /// </summary>
    [HttpPost("preview")]
    [Produces("application/pdf")]
    [ProducesResponseType(typeof(FileContentResult), StatusCodes.Status200OK)]
    public async Task<IActionResult> PreviewTemplatePdf([FromBody] TemplatePreviewRequest request, CancellationToken ct)
    {
        var tenantId = GetTenantId();
        if (!tenantId.HasValue) return Forbid();

        var pdfBytes = await _templateService.GeneratePreviewPdfAsync(request, tenantId.Value, ct);
        return File(pdfBytes, "application/pdf", "Invoice_Preview.pdf");
    }

    /// <summary>
    /// Renders a PDF preview for an existing saved template by ID.
    /// </summary>
    [HttpGet("{id:int}/preview")]
    [Produces("application/pdf")]
    [ProducesResponseType(typeof(FileContentResult), StatusCodes.Status200OK)]
    public async Task<IActionResult> PreviewSavedTemplatePdf([FromRoute] int id, CancellationToken ct)
    {
        var tenantId = GetTenantId();
        if (!tenantId.HasValue) return Forbid();

        var template = await _templateService.GetTemplateByIdAsync(id, tenantId.Value, ct);
        var previewVersion = template.Versions.OrderByDescending(version => version.VersionNumber).FirstOrDefault()
            ?? template.ActiveVersion;
        var previewRequest = new TemplatePreviewRequest
        {
            Style = template.Style,
            Branding = previewVersion?.Branding ?? new BrandingConfigDto(),
            CompanyDetails = previewVersion?.CompanyDetails ?? new CompanyDetailsConfigDto(),
            Layout = previewVersion?.Layout ?? new LayoutConfigDto(),
            PaymentInstructions = previewVersion?.PaymentInstructions ?? new PaymentInstructionsConfigDto(),
            Terms = previewVersion?.Terms ?? new TermsConfigDto()
        };

        var pdfBytes = await _templateService.GeneratePreviewPdfAsync(previewRequest, tenantId.Value, ct);
        return File(pdfBytes, "application/pdf", $"{template.Name}_Preview.pdf");
    }

    /// <summary>
    /// Uploads a branding logo image (PNG, JPEG, WebP, max 2MB) for invoice templates.
    /// </summary>
    [HttpPost("logo-upload")]
    [Consumes("multipart/form-data")]
    [ProducesResponseType(typeof(ApiResponse<LogoUploadResponse>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<LogoUploadResponse>), StatusCodes.Status400BadRequest)]
    public async Task<IActionResult> UploadLogo([FromForm] TemplateLogoUploadForm form, CancellationToken ct)
    {
        var tenantId = GetTenantId();
        if (!tenantId.HasValue) return Forbid();

        var file = form?.File ?? (Request.HasFormContentType ? Request.Form.Files.FirstOrDefault() : null);

        if (file == null || file.Length == 0)
            return BadRequest(ApiResponse<LogoUploadResponse>.Fail("No image file was uploaded."));

        if (file.Length > 2 * 1024 * 1024)
            return BadRequest(ApiResponse<LogoUploadResponse>.Fail("Image size exceeds the 2 MB limit."));

        var allowedExtensions = new[] { ".png", ".jpg", ".jpeg", ".webp" };
        var extension = Path.GetExtension(file.FileName).ToLowerInvariant();
        if (!allowedExtensions.Contains(extension))
            return BadRequest(ApiResponse<LogoUploadResponse>.Fail("Only PNG, JPEG, and WebP image formats are supported."));

        using var memoryStream = new MemoryStream();
        await file.CopyToAsync(memoryStream, ct);
        var bytes = memoryStream.ToArray();

        var base64DataUri = $"data:{file.ContentType};base64,{Convert.ToBase64String(bytes)}";

        var response = new LogoUploadResponse
        {
            LogoUrl = base64DataUri,
            FileName = file.FileName,
            FileSizeBytes = file.Length
        };

        return Ok(ApiResponse<LogoUploadResponse>.Ok(response, "Logo uploaded successfully."));
    }

    /// <summary>
    /// Generates an immutable snapshot and customer-ready PDF document for an invoice.
    /// </summary>
    [HttpPost("/api/v1/invoices/{id:int}/generate-pdf")]
    [ProducesResponseType(typeof(ApiResponse<InvoicePdfResponse>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<InvoicePdfResponse>), StatusCodes.Status404NotFound)]
    public async Task<IActionResult> GenerateInvoicePdf([FromRoute] int id, [FromBody] GenerateInvoicePdfRequest? request, CancellationToken ct)
    {
        var tenantId = GetTenantId();
        if (!tenantId.HasValue) return Forbid();

        var user = GetUserName();
        var req = request ?? new GenerateInvoicePdfRequest { InvoiceId = id };
        req.InvoiceId = id;

        try
        {
            var response = await _templateService.GenerateInvoicePdfAsync(req, tenantId.Value, user, ct);
            return Ok(ApiResponse<InvoicePdfResponse>.Ok(response, "Invoice PDF generated successfully."));
        }
        catch (KeyNotFoundException ex)
        {
            return NotFound(ApiResponse<InvoicePdfResponse>.Fail(ex.Message));
        }
    }

    /// <summary>
    /// Streams or downloads the official PDF document for an issued invoice.
    /// </summary>
    [HttpGet("/api/v1/invoices/{id:int}/pdf")]
    [Produces("application/pdf")]
    [ProducesResponseType(typeof(FileContentResult), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status404NotFound)]
    public async Task<IActionResult> DownloadInvoicePdf([FromRoute] int id, [FromQuery] bool inline = false, CancellationToken ct = default)
    {
        var tenantId = GetTenantId();
        if (!tenantId.HasValue) return Forbid();

        try
        {
            var (fileBytes, fileName, contentType) = await _templateService.GetInvoicePdfAsync(id, tenantId.Value, ct);
            
            if (inline)
            {
                Response.Headers["Content-Disposition"] = $"inline; filename=\"{fileName}\"";
                return File(fileBytes, contentType);
            }

            return File(fileBytes, contentType, fileName);
        }
        catch (KeyNotFoundException ex)
        {
            return NotFound(ApiResponse<object>.Fail(ex.Message));
        }
    }

    /// <summary>
    /// Retrieve audit trail activity log for all template and PDF document events (Audit & Traceability screen).
    /// </summary>
    [HttpGet("audit")]
    [ProducesResponseType(typeof(ApiResponse<List<TemplateAuditLogDto>>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetAuditLogs([FromQuery] int? templateId, CancellationToken ct)
    {
        var tenantId = GetTenantId();
        if (!tenantId.HasValue) return Forbid();

        var logs = await _templateService.GetAuditLogsAsync(templateId, tenantId.Value, ct);
        return Ok(ApiResponse<List<TemplateAuditLogDto>>.Ok(logs, "Template audit records retrieved successfully."));
    }

    #region Tenant & User Helpers

    private int? GetTenantId()
    {
        var tenantClaim = User.FindFirst("TenantId")?.Value ?? User.FindFirst("tenant_id")?.Value;
        if (int.TryParse(tenantClaim, out var tenantId) && tenantId > 0) return tenantId;

        if (User.IsInRole("SuperAdmin"))
        {
            if (Request.Headers.TryGetValue("X-Tenant-Id", out var headerVal) && int.TryParse(headerVal, out var headerTenantId) && headerTenantId > 0)
                return headerTenantId;

            if (Request.Query.TryGetValue("tenantId", out var queryVal) && int.TryParse(queryVal, out var queryTenantId) && queryTenantId > 0)
                return queryTenantId;

            return 1;
        }

        return null;
    }

    private string GetUserName()
    {
        return User.FindFirst(ClaimTypes.Name)?.Value 
            ?? User.FindFirst(ClaimTypes.Email)?.Value 
            ?? User.FindFirst(ClaimTypes.NameIdentifier)?.Value 
            ?? "SystemUser";
    }

    #endregion
}

/// <summary>
/// Multipart form-data model for uploading invoice template logo images.
/// </summary>
public class TemplateLogoUploadForm
{
    /// <summary>
    /// The logo image file (PNG, JPEG, WebP, max 2MB).
    /// </summary>
    public IFormFile? File { get; set; }
}
