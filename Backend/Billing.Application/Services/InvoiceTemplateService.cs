using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Billing.Application.Interfaces;
using Billing.Contracts;
using Billing.Contracts.InvoiceTemplate;
using Billing.Domain.Entities;
using ContractStyle = Billing.Contracts.InvoiceTemplate.TemplateStyle;
using ContractStatus = Billing.Contracts.InvoiceTemplate.TemplateStatus;
using DomainStyle = Billing.Domain.Enums.TemplateStyle;
using DomainStatus = Billing.Domain.Enums.TemplateStatus;

namespace Billing.Application.Services;

public class InvoiceTemplateService : IInvoiceTemplateService
{
    private readonly IInvoiceTemplateRepository _templateRepository;
    private readonly IInvoiceSnapshotRepository _snapshotRepository;
    private readonly IGeneratedDocumentRepository _documentRepository;
    private readonly IInvoiceRepository _invoiceRepository;
    private readonly IInvoicePdfEngine _pdfEngine;
    private readonly IDocumentStorageService _storageService;
    private readonly IAuditLogRepository? _auditLogRepo;

    private static readonly JsonSerializerOptions JsonOpts = new()
    {
        PropertyNameCaseInsensitive = true,
        WriteIndented = false
    };

    public InvoiceTemplateService(
        IInvoiceTemplateRepository templateRepository,
        IInvoiceSnapshotRepository snapshotRepository,
        IGeneratedDocumentRepository documentRepository,
        IInvoiceRepository invoiceRepository,
        IInvoicePdfEngine pdfEngine,
        IDocumentStorageService storageService,
        IAuditLogRepository? auditLogRepo = null)
    {
        _templateRepository = templateRepository;
        _snapshotRepository = snapshotRepository;
        _documentRepository = documentRepository;
        _invoiceRepository = invoiceRepository;
        _pdfEngine = pdfEngine;
        _storageService = storageService;
        _auditLogRepo = auditLogRepo;
    }

    public async Task<PagedResult<InvoiceTemplateDto>> GetTemplatesAsync(TemplateFilterRequest filter, int tenantId, CancellationToken ct = default)
    {
        DomainStyle? domainStyle = null;
        if (!string.IsNullOrWhiteSpace(filter.Style) && !filter.Style.Equals("All", StringComparison.OrdinalIgnoreCase))
        {
            if (Enum.TryParse<DomainStyle>(filter.Style, true, out var parsedStyle))
                domainStyle = parsedStyle;
        }

        DomainStatus? domainStatus = null;
        if (!string.IsNullOrWhiteSpace(filter.Status) && !filter.Status.Equals("All", StringComparison.OrdinalIgnoreCase))
        {
            if (Enum.TryParse<DomainStatus>(filter.Status, true, out var parsedStatus))
                domainStatus = parsedStatus;
        }

        var (items, totalCount) = await _templateRepository.GetPagedListAsync(
            tenantId,
            filter.Search,
            domainStyle,
            domainStatus,
            filter.PageNumber,
            filter.PageSize);

        var dtos = items.Select(MapToDto).ToList();
        return new PagedResult<InvoiceTemplateDto>(dtos, totalCount, filter.PageNumber, filter.PageSize);
    }

    public async Task<InvoiceTemplateDto> GetTemplateByIdAsync(int id, int tenantId, CancellationToken ct = default)
    {
        var template = await _templateRepository.GetByIdAsync(id, tenantId, includeVersions: true);
        if (template == null)
            throw new KeyNotFoundException($"Invoice template with ID {id} not found.");

        return MapToDto(template);
    }

    public async Task<InvoiceTemplateDto> CreateTemplateAsync(CreateTemplateRequest request, int tenantId, string user, CancellationToken ct = default)
    {
        if (await _templateRepository.ExistsByNameAsync(request.Name, tenantId))
            throw new InvalidOperationException($"An invoice template with the name '{request.Name}' already exists.");

        var template = new InvoiceTemplate
        {
            TenantId = tenantId,
            Name = request.Name.Trim(),
            Description = request.Description,
            Style = (DomainStyle)request.Style,
            Status = request.SetAsDefault ? DomainStatus.Active : DomainStatus.Draft,
            IsDefault = request.SetAsDefault,
            CurrentVersionNumber = 1,
            CreatedBy = user,
            CreatedAtUtc = DateTime.UtcNow
        };

        var initialVersion = new TemplateVersion
        {
            TenantId = tenantId,
            VersionNumber = 1,
            Status = request.SetAsDefault ? DomainStatus.Active : DomainStatus.Draft,
            VersionDescription = "Initial template version",
            BrandingJson = JsonSerializer.Serialize(request.Branding, JsonOpts),
            CompanyDetailsJson = JsonSerializer.Serialize(request.CompanyDetails, JsonOpts),
            LayoutJson = JsonSerializer.Serialize(request.Layout, JsonOpts),
            PaymentInstructionsJson = JsonSerializer.Serialize(request.PaymentInstructions, JsonOpts),
            TermsJson = JsonSerializer.Serialize(request.Terms, JsonOpts),
            CreatedBy = user,
            CreatedAtUtc = DateTime.UtcNow
        };

        template.Versions.Add(initialVersion);
        await _templateRepository.AddAsync(template);

        // Link active version id if default
        if (request.SetAsDefault)
        {
            template.ActiveVersionId = initialVersion.Id;
            await _templateRepository.UpdateAsync(template);
        }

        await RecordAuditAsync(tenantId, "Template Created", "InvoiceTemplate", template.Id.ToString(), user, $"Created template '{template.Name}' with initial version v1", ct);

        return MapToDto(template);
    }

    public async Task<InvoiceTemplateDto> UpdateTemplateAsync(int id, UpdateTemplateRequest request, int tenantId, string user, CancellationToken ct = default)
    {
        var template = await _templateRepository.GetByIdAsync(id, tenantId, includeVersions: true);
        if (template == null)
            throw new KeyNotFoundException($"Invoice template with ID {id} not found.");

        if (await _templateRepository.ExistsByNameAsync(request.Name, tenantId, excludeId: id))
            throw new InvalidOperationException($"An invoice template with the name '{request.Name}' already exists.");

        template.Name = request.Name.Trim();
        template.Description = request.Description;
        template.Style = (DomainStyle)request.Style;
        template.UpdatedAtUtc = DateTime.UtcNow;
        template.UpdatedBy = user;

        var activeVersion = template.Versions.FirstOrDefault(v => v.Id == template.ActiveVersionId)
            ?? template.Versions.OrderByDescending(v => v.VersionNumber).FirstOrDefault();

        if (activeVersion != null && activeVersion.Status == DomainStatus.Active)
        {
            // Create a new draft version to preserve active version immutability
            var nextVersionNumber = template.CurrentVersionNumber + 1;
            var newVersion = new TemplateVersion
            {
                TenantId = tenantId,
                TemplateId = template.Id,
                VersionNumber = nextVersionNumber,
                Status = DomainStatus.Draft,
                VersionDescription = $"Draft revision {nextVersionNumber}",
                BrandingJson = JsonSerializer.Serialize(request.Branding, JsonOpts),
                CompanyDetailsJson = JsonSerializer.Serialize(request.CompanyDetails, JsonOpts),
                LayoutJson = JsonSerializer.Serialize(request.Layout, JsonOpts),
                PaymentInstructionsJson = JsonSerializer.Serialize(request.PaymentInstructions, JsonOpts),
                TermsJson = JsonSerializer.Serialize(request.Terms, JsonOpts),
                CreatedBy = user,
                CreatedAtUtc = DateTime.UtcNow
            };

            template.CurrentVersionNumber = nextVersionNumber;
            template.Versions.Add(newVersion);
            await _templateRepository.AddVersionAsync(newVersion);
        }
        else if (activeVersion != null)
        {
            // Update the existing draft version in-place
            activeVersion.BrandingJson = JsonSerializer.Serialize(request.Branding, JsonOpts);
            activeVersion.CompanyDetailsJson = JsonSerializer.Serialize(request.CompanyDetails, JsonOpts);
            activeVersion.LayoutJson = JsonSerializer.Serialize(request.Layout, JsonOpts);
            activeVersion.PaymentInstructionsJson = JsonSerializer.Serialize(request.PaymentInstructions, JsonOpts);
            activeVersion.TermsJson = JsonSerializer.Serialize(request.Terms, JsonOpts);
            await _templateRepository.UpdateVersionAsync(activeVersion);
        }

        await _templateRepository.UpdateAsync(template);

        await RecordAuditAsync(tenantId, "Template Updated", "InvoiceTemplate", template.Id.ToString(), user, request.ChangeDescription ?? $"Updated template '{template.Name}' (version v{template.CurrentVersionNumber})", ct);

        return MapToDto(template);
    }

    public async Task<InvoiceTemplateDto> DuplicateTemplateAsync(int id, DuplicateTemplateRequest request, int tenantId, string user, CancellationToken ct = default)
    {
        var source = await _templateRepository.GetByIdAsync(id, tenantId, includeVersions: true);
        if (source == null)
            throw new KeyNotFoundException($"Invoice template with ID {id} not found.");

        if (await _templateRepository.ExistsByNameAsync(request.NewTemplateName, tenantId))
            throw new InvalidOperationException($"An invoice template with the name '{request.NewTemplateName}' already exists.");

        var sourceVersion = source.Versions.FirstOrDefault(v => v.Id == source.ActiveVersionId)
            ?? source.Versions.OrderByDescending(v => v.VersionNumber).FirstOrDefault();

        var duplicate = new InvoiceTemplate
        {
            TenantId = tenantId,
            Name = request.NewTemplateName.Trim(),
            Description = request.NewDescription ?? $"Duplicated from {source.Name}",
            Style = source.Style,
            Status = DomainStatus.Draft,
            IsDefault = false,
            CurrentVersionNumber = 1,
            CreatedBy = user,
            CreatedAtUtc = DateTime.UtcNow
        };

        var initialVersion = new TemplateVersion
        {
            TenantId = tenantId,
            VersionNumber = 1,
            Status = DomainStatus.Draft,
            VersionDescription = $"Initial version cloned from {source.Name} v{sourceVersion?.VersionNumber ?? 1}",
            BrandingJson = sourceVersion?.BrandingJson ?? "{}",
            CompanyDetailsJson = sourceVersion?.CompanyDetailsJson ?? "{}",
            LayoutJson = sourceVersion?.LayoutJson ?? "{}",
            PaymentInstructionsJson = sourceVersion?.PaymentInstructionsJson ?? "{}",
            TermsJson = sourceVersion?.TermsJson ?? "{}",
            CreatedBy = user,
            CreatedAtUtc = DateTime.UtcNow
        };

        duplicate.Versions.Add(initialVersion);
        await _templateRepository.AddAsync(duplicate);

        await RecordAuditAsync(tenantId, "Template Duplicated", "InvoiceTemplate", duplicate.Id.ToString(), user, $"Cloned from template #{id} into '{duplicate.Name}'", ct);

        return MapToDto(duplicate);
    }

    public async Task<InvoiceTemplateDto> ActivateTemplateAsync(int id, int? versionNumber, int tenantId, string user, CancellationToken ct = default)
    {
        var template = await _templateRepository.GetByIdAsync(id, tenantId, includeVersions: true);
        if (template == null)
            throw new KeyNotFoundException($"Invoice template with ID {id} not found.");

        TemplateVersion? targetVersion = null;
        if (versionNumber.HasValue)
        {
            targetVersion = template.Versions.FirstOrDefault(v => v.VersionNumber == versionNumber.Value);
            if (targetVersion == null)
                throw new KeyNotFoundException($"Version {versionNumber.Value} was not found on template {id}.");
        }
        else
        {
            targetVersion = template.Versions.OrderByDescending(v => v.VersionNumber).FirstOrDefault();
        }

        if (targetVersion != null)
        {
            targetVersion.Status = DomainStatus.Active;
            await _templateRepository.UpdateVersionAsync(targetVersion);
            template.ActiveVersionId = targetVersion.Id;
        }

        template.Status = DomainStatus.Active;
        template.UpdatedAtUtc = DateTime.UtcNow;
        template.UpdatedBy = user;

        await _templateRepository.UpdateAsync(template);

        await RecordAuditAsync(tenantId, "Version Activated", "InvoiceTemplate", template.Id.ToString(), user, $"Activated version v{(targetVersion?.VersionNumber ?? template.CurrentVersionNumber)} for '{template.Name}'", ct);

        return MapToDto(template);
    }

    public async Task<InvoiceTemplateDto> SetDefaultTemplateAsync(int id, int tenantId, string user, CancellationToken ct = default)
    {
        var template = await _templateRepository.GetByIdAsync(id, tenantId, includeVersions: true);
        if (template == null)
            throw new KeyNotFoundException($"Invoice template with ID {id} not found.");

        var version = template.Versions.OrderByDescending(v => v.VersionNumber).FirstOrDefault();
        if (version == null)
            throw new InvalidOperationException("A template version is required before it can be set as default.");

        await _templateRepository.ClearDefaultTemplateAsync(tenantId, template.Id, ct);

        if (version.Status != DomainStatus.Active)
        {
            version.Status = DomainStatus.Active;
            await _templateRepository.UpdateVersionAsync(version);
        }

        template.IsDefault = true;
        template.Status = DomainStatus.Active;
        template.ActiveVersionId = version.Id;
        template.UpdatedAtUtc = DateTime.UtcNow;
        template.UpdatedBy = user;
        await _templateRepository.UpdateAsync(template);

        await RecordAuditAsync(tenantId, "Template Set as Default", "InvoiceTemplate", template.Id.ToString(), user, $"Set '{template.Name}' version v{version.VersionNumber} as the default invoice PDF template.", ct);

        return MapToDto(template);
    }

    public async Task<InvoiceTemplateDto> DeactivateTemplateAsync(int id, int tenantId, string user, CancellationToken ct = default)
    {
        var template = await _templateRepository.GetByIdAsync(id, tenantId, includeVersions: true);
        if (template == null)
            throw new KeyNotFoundException($"Invoice template with ID {id} not found.");

        template.Status = DomainStatus.Inactive;
        template.IsDefault = false;
        template.UpdatedAtUtc = DateTime.UtcNow;
        template.UpdatedBy = user;

        await _templateRepository.UpdateAsync(template);

        await RecordAuditAsync(tenantId, "Template Deactivated", "InvoiceTemplate", template.Id.ToString(), user, $"Deactivated template '{template.Name}'", ct);

        return MapToDto(template);
    }

    public async Task<List<TemplateVersionDto>> GetTemplateVersionsAsync(int templateId, int tenantId, CancellationToken ct = default)
    {
        var template = await _templateRepository.GetByIdAsync(templateId, tenantId, includeVersions: true);
        if (template == null)
            throw new KeyNotFoundException($"Invoice template with ID {templateId} not found.");

        return template.Versions
            .OrderByDescending(v => v.VersionNumber)
            .Select(MapVersionToDto)
            .ToList();
    }

    public async Task<bool> DeleteTemplateAsync(int id, int tenantId, string user, CancellationToken ct = default)
    {
        var template = await _templateRepository.GetByIdAsync(id, tenantId, includeVersions: true);
        if (template == null)
            throw new KeyNotFoundException($"Invoice template with ID {id} not found.");

        if (template.IsDefault)
            throw new InvalidOperationException("Default system invoice template cannot be deleted. Please set another template as default first.");

        template.Status = DomainStatus.Archived;
        template.UpdatedAtUtc = DateTime.UtcNow;
        template.UpdatedBy = user;

        await _templateRepository.UpdateAsync(template);

        await RecordAuditAsync(tenantId, "Template Archived", "InvoiceTemplate", id.ToString(), user, $"Archived template '{template.Name}'", ct);

        return true;
    }

    public Task<byte[]> GeneratePreviewPdfAsync(TemplatePreviewRequest request, int tenantId, CancellationToken ct = default)
    {
        var pdfBytes = _pdfEngine.GeneratePreviewPdf(request);
        return Task.FromResult(pdfBytes);
    }

    public async Task<InvoicePdfResponse> GenerateInvoicePdfAsync(GenerateInvoicePdfRequest request, int tenantId, string user, CancellationToken ct = default)
    {
        var invoice = await _invoiceRepository.GetByIdAsync(request.InvoiceId, tenantId);
        if (invoice == null)
            throw new KeyNotFoundException($"Invoice with ID {request.InvoiceId} not found.");

        // Check if an existing physical document exists and regeneration is not forced
        var existingDoc = await _documentRepository.GetByInvoiceIdAsync(request.InvoiceId, tenantId);
        if (existingDoc != null && !request.ForceRegenerate)
        {
            var existsOnDisk = await _storageService.ExistsAsync(existingDoc.StoragePath, tenantId, ct);
            if (existsOnDisk)
            {
                return new InvoicePdfResponse
                {
                    InvoiceId = invoice.Id,
                    InvoiceNumber = invoice.InvoiceNumber,
                    DocumentId = existingDoc.Id,
                    FileName = existingDoc.FileName,
                    DownloadUrl = $"/api/v1/invoices/{invoice.Id}/pdf",
                    FileSizeBytes = existingDoc.FileSizeBytes,
                    GeneratedAtUtc = existingDoc.CreatedAtUtc,
                    IsHistoricalReproduction = true
                };
            }
        }

        // Determine template & version to use
        InvoiceTemplate? template = null;
        if (request.OverrideTemplateId.HasValue)
        {
            template = await _templateRepository.GetByIdAsync(request.OverrideTemplateId.Value, tenantId, includeVersions: true);
        }

        template ??= await _templateRepository.GetDefaultTemplateAsync(tenantId)
                     ?? (await _templateRepository.GetPagedListAsync(tenantId, null, null, DomainStatus.Active, 1, 1)).Items.FirstOrDefault();

        TemplateVersion? version = null;
        if (template != null)
        {
            version = template.Versions.FirstOrDefault(v => v.Id == template.ActiveVersionId)
                      ?? template.Versions.OrderByDescending(v => v.VersionNumber).FirstOrDefault();
        }

        // Resolve or create immutable invoice snapshot
        var snapshot = await _snapshotRepository.GetByInvoiceIdAsync(invoice.Id, tenantId);
        InvoiceSnapshotDto snapshotDto;
        TemplateVersionDto versionDto;

        if (snapshot != null)
        {
            snapshotDto = JsonSerializer.Deserialize<InvoiceSnapshotDto>(snapshot.SnapshotDataJson, JsonOpts)
                          ?? BuildSnapshotDto(invoice);
            if ((request.ForceRegenerate || request.OverrideTemplateId.HasValue) && version != null)
            {
                versionDto = MapVersionToDto(version);
            }
            else
            {
                versionDto = JsonSerializer.Deserialize<TemplateVersionDto>(snapshot.TemplateConfigJson, JsonOpts)
                             ?? (version != null ? MapVersionToDto(version) : BuildDefaultVersionDto());
            }
        }
        else
        {
            snapshotDto = BuildSnapshotDto(invoice);
            versionDto = version != null ? MapVersionToDto(version) : BuildDefaultVersionDto();

            snapshot = new InvoiceSnapshot
            {
                TenantId = tenantId,
                InvoiceId = invoice.Id,
                InvoiceNumber = invoice.InvoiceNumber,
                TemplateVersionId = version?.Id ?? 0,
                SnapshotDataJson = JsonSerializer.Serialize(snapshotDto, JsonOpts),
                TemplateConfigJson = JsonSerializer.Serialize(versionDto, JsonOpts),
                CreatedAtUtc = DateTime.UtcNow,
                CreatedBy = user
            };

            await _snapshotRepository.AddAsync(snapshot);
        }

        // Generate PDF using immutable snapshot and template configuration
        var pdfBytes = _pdfEngine.GenerateInvoicePdf(snapshotDto, versionDto);

        // Persist to document storage
        var fileName = $"{invoice.InvoiceNumber}.pdf";
        var storagePath = await _storageService.SaveDocumentAsync(pdfBytes, fileName, "application/pdf", tenantId, ct);

        // Record or update generated document record
        var sha256 = Convert.ToHexString(SHA256.HashData(pdfBytes));

        if (existingDoc == null)
        {
            existingDoc = new GeneratedDocument
            {
                TenantId = tenantId,
                InvoiceId = invoice.Id,
                InvoiceSnapshotId = snapshot.Id,
                DocumentType = "Invoice",
                StorageProvider = Billing.Domain.Enums.DocumentStorageProvider.Local,
                StoragePath = storagePath,
                FileName = fileName,
                FileSizeBytes = pdfBytes.Length,
                ContentType = "application/pdf",
                ChecksumSha256 = sha256,
                Status = "Generated",
                CreatedAtUtc = DateTime.UtcNow
            };
            await _documentRepository.AddAsync(existingDoc);
        }
        else
        {
            existingDoc.StoragePath = storagePath;
            existingDoc.FileSizeBytes = pdfBytes.Length;
            existingDoc.ChecksumSha256 = sha256;
            existingDoc.CreatedAtUtc = DateTime.UtcNow;
            await _documentRepository.UpdateAsync(existingDoc);
        }

        await RecordAuditAsync(tenantId, "PDF Generated", "InvoiceDocument", invoice.Id.ToString(), user, $"Generated official PDF document {existingDoc.FileName} (Storage: {storagePath})", ct);

        return new InvoicePdfResponse
        {
            InvoiceId = invoice.Id,
            InvoiceNumber = invoice.InvoiceNumber,
            DocumentId = existingDoc.Id,
            FileName = existingDoc.FileName,
            DownloadUrl = $"/api/v1/invoices/{invoice.Id}/pdf",
            FileSizeBytes = existingDoc.FileSizeBytes,
            GeneratedAtUtc = existingDoc.CreatedAtUtc,
            IsHistoricalReproduction = false
        };
    }

    public async Task<(byte[] FileBytes, string FileName, string ContentType)> GetInvoicePdfAsync(int invoiceId, int tenantId, CancellationToken ct = default)
    {
        var existingDoc = await _documentRepository.GetByInvoiceIdAsync(invoiceId, tenantId);
        if (existingDoc != null && await _storageService.ExistsAsync(existingDoc.StoragePath, tenantId, ct))
        {
            var bytes = await _storageService.GetDocumentAsync(existingDoc.StoragePath, tenantId, ct);
            return (bytes, existingDoc.FileName, existingDoc.ContentType);
        }

        // If not cached physically, reproduce on-the-fly via snapshot
        var response = await GenerateInvoicePdfAsync(new GenerateInvoicePdfRequest
        {
            InvoiceId = invoiceId,
            ForceRegenerate = true
        }, tenantId, "SystemReproduction", ct);

        var freshDoc = await _documentRepository.GetByIdAsync(response.DocumentId, tenantId);
        if (freshDoc == null)
            throw new KeyNotFoundException($"Could not reproduce document for invoice ID {invoiceId}.");

        var fileBytes = await _storageService.GetDocumentAsync(freshDoc.StoragePath, tenantId, ct);
        return (fileBytes, freshDoc.FileName, freshDoc.ContentType);
    }

    public async Task<List<TemplateAuditLogDto>> GetAuditLogsAsync(int? templateId, int tenantId, CancellationToken ct = default)
    {
        var result = new List<TemplateAuditLogDto>();

        if (_auditLogRepo != null)
        {
            var templateLogs = templateId.HasValue
                ? await _auditLogRepo.GetByEntityAsync(tenantId, "InvoiceTemplate", templateId.Value.ToString(), ct)
                : (await _auditLogRepo.GetFilteredPagedAsync(tenantId, new AuditLogFilterRequest
                {
                    EntityName = "InvoiceTemplate",
                    Page = 1,
                    PageSize = 500
                }, ct)).Items;
            var documentLogs = (await _auditLogRepo.GetFilteredPagedAsync(tenantId, new AuditLogFilterRequest
            {
                EntityName = "InvoiceDocument",
                Page = 1,
                PageSize = 500
            }, ct)).Items;

            var combined = (templateLogs ?? new List<AuditLog>())
                .Concat(documentLogs ?? new List<AuditLog>())
                .Where(log => !string.Equals(log.Changes, "Automated data mutation log", StringComparison.Ordinal))
                .OrderByDescending(l => l.Timestamp)
                .ToList();

            foreach (var log in combined)
            {
                result.Add(new TemplateAuditLogDto
                {
                    Id = log.Id,
                    Event = log.Action,
                    DateAndTime = log.Timestamp,
                    PerformedBy = string.IsNullOrWhiteSpace(log.UserName) ? "Admin" : log.UserName,
                    ChangesOrResult = log.Changes ?? string.Empty,
                    TemplateVersionOrDocument = log.EntityName == "InvoiceDocument" ? $"Invoice #{log.EntityId} PDF" : $"Template #{log.EntityId}"
                });
            }
        }

        return result;
    }

    private async Task RecordAuditAsync(int tenantId, string action, string entityName, string entityId, string user, string changes, CancellationToken ct)
    {
        if (_auditLogRepo == null) return;
        try
        {
            var log = new AuditLog
            {
                TenantId = tenantId,
                Action = action,
                EntityName = entityName,
                EntityId = entityId,
                UserName = user,
                Timestamp = DateTime.UtcNow,
                Changes = changes
            };
            await _auditLogRepo.AddAsync(log, ct);
        }
        catch
        {
            // Do not fail primary flow on audit logging
        }
    }

    #region Helpers & Mappers

    private static InvoiceSnapshotDto BuildSnapshotDto(Invoice invoice)
    {
        var customer = invoice.Customer;
        return new InvoiceSnapshotDto
        {
            InvoiceId = invoice.Id,
            InvoiceNumber = invoice.InvoiceNumber,
            IssueDate = invoice.InvoiceDate,
            DueDate = invoice.DueDate ?? invoice.InvoiceDate.AddDays(30),
            Status = invoice.Status,
            Currency = invoice.GetCurrency(),
            CurrencySymbol = invoice.GetCurrency() == "USD" ? "$" : "₹",
            Customer = new CustomerSnapshotDto
            {
                CustomerId = invoice.CustomerId,
                CustomerName = !string.IsNullOrWhiteSpace(customer?.CompanyName) ? customer.CompanyName : (customer?.Name ?? "Valued Customer"),
                CustomerCode = customer?.CustomerCode,
                Email = customer?.Email,
                Phone = customer?.Phone,
                TaxId = customer?.TaxId,
                BillingAddress = customer?.Address,
                ShippingAddress = customer?.Address
            },
            Items = invoice.Items.Select(i => new InvoiceItemSnapshotDto
            {
                ItemId = i.Id,
                ItemName = !string.IsNullOrWhiteSpace(i.Product?.Name) ? i.Product.Name : (!string.IsNullOrWhiteSpace(i.Description) ? i.Description : "Product Item"),
                Description = i.Description ?? i.Product?.Description,
                HsnSacCode = i.HSNSAC,
                Quantity = i.Quantity,
                Unit = i.Product?.Unit ?? "Unit",
                UnitPrice = i.UnitPrice,
                DiscountAmount = i.DiscountAmount,
                TaxRatePercent = i.TaxRate ?? 0,
                TaxAmount = i.TaxAmount,
                LineTotal = i.TotalAmount
            }).ToList(),
            Subtotal = invoice.Subtotal,
            TotalDiscount = invoice.DiscountAmount,
            TotalTax = invoice.TaxAmount,
            TotalAdditionalCharges = invoice.ChargesAmount,
            GrandTotal = invoice.TotalAmount,
            AmountPaid = invoice.PaidAmount,
            BalanceDue = invoice.BalanceAmount,
            TaxBreakdowns = new List<TaxBreakdownSnapshotDto>
            {
                new()
                {
                    TaxName = "GST",
                    RatePercent = 18m,
                    TaxableAmount = invoice.Subtotal - invoice.DiscountAmount,
                    TaxAmount = invoice.TaxAmount
                }
            },
            AdditionalCharges = invoice.ChargesAmount > 0
                ? new List<ChargeSnapshotDto> { new() { ChargeName = "Shipping & Handling", Amount = invoice.ChargesAmount } }
                : new List<ChargeSnapshotDto>()
        };
    }

    private static TemplateVersionDto BuildDefaultVersionDto()
    {
        return new TemplateVersionDto
        {
            VersionNumber = 1,
            Status = ContractStatus.Active,
            Branding = new BrandingConfigDto
            {
                PrimaryColor = "#1E3A8A",
                SecondaryColor = "#3B82F6",
                AccentColor = "#10B981"
            },
            CompanyDetails = new CompanyDetailsConfigDto
            {
                CompanyName = "IBMS Billing Enterprise",
                AddressLine1 = "Business Technology Park",
                City = "Hyderabad",
                State = "Telangana",
                PostalCode = "500081",
                Country = "India",
                Email = "billing@ibms.com"
            },
            Layout = new LayoutConfigDto
            {
                ShowLogo = false,
                ShowHeader = true,
                ShowFooter = true,
                ShowTaxBreakdown = true,
                ShowPaymentInstructions = true,
                ShowTermsAndConditions = true,
                CurrencyCode = "INR",
                CurrencySymbol = "₹"
            },
            Terms = new TermsConfigDto
            {
                TermsAndConditions = "Payment due within 30 days of invoice date.",
                FooterNote = "Thank you for your business!"
            }
        };
    }

    private static InvoiceTemplateDto MapToDto(InvoiceTemplate t)
    {
        var activeVersion = t.Versions.FirstOrDefault(v => v.Id == t.ActiveVersionId)
                            ?? t.Versions.OrderByDescending(v => v.VersionNumber).FirstOrDefault();

        return new InvoiceTemplateDto
        {
            Id = t.Id,
            TenantId = t.TenantId,
            Name = t.Name,
            Description = t.Description,
            Style = (ContractStyle)t.Style,
            Status = (ContractStatus)t.Status,
            IsDefault = t.IsDefault,
            CurrentVersionNumber = t.CurrentVersionNumber,
            ActiveVersionId = t.ActiveVersionId,
            ActiveVersion = activeVersion != null ? MapVersionToDto(activeVersion) : null,
            Versions = t.Versions.OrderByDescending(v => v.VersionNumber).Select(MapVersionToDto).ToList(),
            CreatedAtUtc = t.CreatedAtUtc,
            UpdatedAtUtc = t.UpdatedAtUtc,
            CreatedBy = t.CreatedBy,
            UpdatedBy = t.UpdatedBy
        };
    }

    private static TemplateVersionDto MapVersionToDto(TemplateVersion v)
    {
        return new TemplateVersionDto
        {
            Id = v.Id,
            TemplateId = v.TemplateId,
            VersionNumber = v.VersionNumber,
            Status = (ContractStatus)v.Status,
            VersionDescription = v.VersionDescription,
            Branding = DeserializeConfig<BrandingConfigDto>(v.BrandingJson),
            CompanyDetails = DeserializeConfig<CompanyDetailsConfigDto>(v.CompanyDetailsJson),
            Layout = DeserializeConfig<LayoutConfigDto>(v.LayoutJson),
            PaymentInstructions = DeserializeConfig<PaymentInstructionsConfigDto>(v.PaymentInstructionsJson),
            Terms = DeserializeConfig<TermsConfigDto>(v.TermsJson),
            CreatedAtUtc = v.CreatedAtUtc,
            CreatedBy = v.CreatedBy
        };
    }

    private static T DeserializeConfig<T>(string? json) where T : new()
    {
        if (string.IsNullOrWhiteSpace(json)) return new T();
        try
        {
            return JsonSerializer.Deserialize<T>(json, JsonOpts) ?? new T();
        }
        catch
        {
            return new T();
        }
    }

    #endregion
}
