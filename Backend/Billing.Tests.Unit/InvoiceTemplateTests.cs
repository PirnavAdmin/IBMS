using System.Text;
using System.Text.Json;
using Billing.Application.Interfaces;
using Billing.Application.Services;
using Billing.Contracts.InvoiceTemplate;
using Billing.Domain.Entities;
using Billing.Domain.Enums;
using Billing.Infrastructure.Services;
using Moq;
using Xunit;
using ContractStyle = Billing.Contracts.InvoiceTemplate.TemplateStyle;
using ContractStatus = Billing.Contracts.InvoiceTemplate.TemplateStatus;
using DomainStyle = Billing.Domain.Enums.TemplateStyle;
using DomainStatus = Billing.Domain.Enums.TemplateStatus;

namespace Billing.Tests.Unit;

public class InvoiceTemplateTests
{
    private readonly Mock<IInvoiceTemplateRepository> _mockTemplateRepo;
    private readonly Mock<IInvoiceSnapshotRepository> _mockSnapshotRepo;
    private readonly Mock<IGeneratedDocumentRepository> _mockDocumentRepo;
    private readonly Mock<IInvoiceRepository> _mockInvoiceRepo;
    private readonly Mock<IDocumentStorageService> _mockStorage;
    private readonly IInvoicePdfEngine _pdfEngine;
    private readonly InvoiceTemplateService _service;

    public InvoiceTemplateTests()
    {
        _mockTemplateRepo = new Mock<IInvoiceTemplateRepository>();
        _mockSnapshotRepo = new Mock<IInvoiceSnapshotRepository>();
        _mockDocumentRepo = new Mock<IGeneratedDocumentRepository>();
        _mockInvoiceRepo = new Mock<IInvoiceRepository>();
        _mockStorage = new Mock<IDocumentStorageService>();
        _pdfEngine = new QuestPdfInvoiceEngine();

        _service = new InvoiceTemplateService(
            _mockTemplateRepo.Object,
            _mockSnapshotRepo.Object,
            _mockDocumentRepo.Object,
            _mockInvoiceRepo.Object,
            _pdfEngine,
            _mockStorage.Object);
    }

    [Fact]
    public void QuestPdfEngine_GeneratePreviewPdf_ProducesValidPdfBinary()
    {
        // Arrange
        var request = new TemplatePreviewRequest
        {
            Style = ContractStyle.Standard,
            Branding = new BrandingConfigDto
            {
                PrimaryColor = "#0f2942",
                SecondaryColor = "#0284c7",
                AccentColor = "#f1f5f9"
            },
            CompanyDetails = new CompanyDetailsConfigDto
            {
                CompanyName = "Test Enterprise Technologies",
                Email = "test@enterprise.com",
                AddressLine1 = "123 Business Boulevard",
                City = "Hyderabad",
                State = "Telangana",
                Country = "India"
            },
            Layout = new LayoutConfigDto
            {
                ShowLogo = false,
                ShowHeader = true,
                ShowFooter = true,
                CurrencyCode = "INR",
                CurrencySymbol = "₹"
            }
        };

        // Act
        var pdfBytes = _pdfEngine.GeneratePreviewPdf(request);

        // Assert
        Assert.NotNull(pdfBytes);
        Assert.True(pdfBytes.Length > 1000, "PDF bytes should be non-empty");
        var header = Encoding.ASCII.GetString(pdfBytes.Take(5).ToArray());
        Assert.Equal("%PDF-", header);
    }

    [Fact]
    public void QuestPdfEngine_AllThreeStyles_RenderSuccessfully()
    {
        // Arrange
        var styles = new[] { ContractStyle.Standard, ContractStyle.Professional, ContractStyle.Compact };

        foreach (var style in styles)
        {
            var req = new TemplatePreviewRequest
            {
                Style = style,
                Branding = new BrandingConfigDto { PrimaryColor = "#111827", SecondaryColor = "#374151" },
                CompanyDetails = new CompanyDetailsConfigDto { CompanyName = $"Test for {style}" }
            };

            // Act
            var pdfBytes = _pdfEngine.GeneratePreviewPdf(req);

            // Assert
            Assert.NotNull(pdfBytes);
            Assert.True(pdfBytes.Length > 500);
            var header = Encoding.ASCII.GetString(pdfBytes.Take(5).ToArray());
            Assert.Equal("%PDF-", header);
        }
    }

    [Fact]
    public async Task CreateTemplate_UniqueName_CreatesVersion1Successfully()
    {
        // Arrange
        var request = new CreateTemplateRequest
        {
            Name = "Corporate Template 2026",
            Description = "Corporate invoice template",
            Style = ContractStyle.Standard,
            SetAsDefault = true
        };

        _mockTemplateRepo.Setup(r => r.ExistsByNameAsync("Corporate Template 2026", 1, null))
            .ReturnsAsync(false);
        _mockTemplateRepo.Setup(r => r.AddAsync(It.IsAny<InvoiceTemplate>()))
            .Returns(Task.CompletedTask);
        _mockTemplateRepo.Setup(r => r.UpdateAsync(It.IsAny<InvoiceTemplate>()))
            .Returns(Task.CompletedTask);

        // Act
        var result = await _service.CreateTemplateAsync(request, 1, "testuser");

        // Assert
        Assert.NotNull(result);
        Assert.Equal("Corporate Template 2026", result.Name);
        Assert.Equal(1, result.CurrentVersionNumber);
        Assert.True(result.IsDefault);
        _mockTemplateRepo.Verify(r => r.AddAsync(It.Is<InvoiceTemplate>(t => t.Name == "Corporate Template 2026")), Times.Once);
    }

    [Fact]
    public async Task CreateTemplate_DuplicateName_ThrowsInvalidOperationException()
    {
        // Arrange
        var request = new CreateTemplateRequest
        {
            Name = "Duplicate Template",
            Style = ContractStyle.Standard
        };

        _mockTemplateRepo.Setup(r => r.ExistsByNameAsync("Duplicate Template", 1, null))
            .ReturnsAsync(true);

        // Act & Assert
        await Assert.ThrowsAsync<InvalidOperationException>(() =>
            _service.CreateTemplateAsync(request, 1, "testuser"));
    }

    [Fact]
    public async Task UpdateTemplate_WhenActive_BumpsToNewDraftVersion()
    {
        // Arrange
        var existingTemplate = new InvoiceTemplate
        {
            Id = 5,
            TenantId = 1,
            Name = "Active Invoicing",
            Status = DomainStatus.Active,
            CurrentVersionNumber = 1,
            ActiveVersionId = 10,
            Versions = new List<TemplateVersion>
            {
                new()
                {
                    Id = 10,
                    VersionNumber = 1,
                    Status = DomainStatus.Active,
                    BrandingJson = "{}"
                }
            }
        };

        _mockTemplateRepo.Setup(r => r.GetByIdAsync(5, 1, true))
            .ReturnsAsync(existingTemplate);
        _mockTemplateRepo.Setup(r => r.ExistsByNameAsync("Updated Active Invoicing", 1, 5))
            .ReturnsAsync(false);
        _mockTemplateRepo.Setup(r => r.AddVersionAsync(It.IsAny<TemplateVersion>()))
            .Returns(Task.CompletedTask);
        _mockTemplateRepo.Setup(r => r.UpdateAsync(It.IsAny<InvoiceTemplate>()))
            .Returns(Task.CompletedTask);

        var updateReq = new UpdateTemplateRequest
        {
            Name = "Updated Active Invoicing",
            Style = ContractStyle.Professional,
            Branding = new BrandingConfigDto { PrimaryColor = "#ff0000" }
        };

        // Act
        var result = await _service.UpdateTemplateAsync(5, updateReq, 1, "editor");

        // Assert
        Assert.NotNull(result);
        Assert.Equal(1, existingTemplate.CurrentVersionNumber);
        Assert.Equal(1, result.CurrentVersionNumber);
        _mockTemplateRepo.Verify(r => r.AddVersionAsync(It.Is<TemplateVersion>(v => v.VersionNumber == 2 && v.Status == DomainStatus.Draft)), Times.Once);
    }

    [Fact]
    public async Task DuplicateTemplate_ClonesConfigurationIntoDraft()
    {
        // Arrange
        var sourceTemplate = new InvoiceTemplate
        {
            Id = 3,
            TenantId = 1,
            Name = "Base Template",
            Style = DomainStyle.Compact,
            CurrentVersionNumber = 2,
            ActiveVersionId = 20,
            Versions = new List<TemplateVersion>
            {
                new()
                {
                    Id = 20,
                    VersionNumber = 2,
                    Status = DomainStatus.Active,
                    BrandingJson = "{\"PrimaryColor\":\"#123456\"}"
                }
            }
        };

        _mockTemplateRepo.Setup(r => r.GetByIdAsync(3, 1, true))
            .ReturnsAsync(sourceTemplate);
        _mockTemplateRepo.Setup(r => r.ExistsByNameAsync("Cloned Template", 1, null))
            .ReturnsAsync(false);
        _mockTemplateRepo.Setup(r => r.AddAsync(It.IsAny<InvoiceTemplate>()))
            .Returns(Task.CompletedTask);

        var dupReq = new DuplicateTemplateRequest
        {
            NewTemplateName = "Cloned Template",
            NewDescription = "Cloned for client A"
        };

        // Act
        var result = await _service.DuplicateTemplateAsync(3, dupReq, 1, "testuser");

        // Assert
        Assert.NotNull(result);
        Assert.Equal("Cloned Template", result.Name);
        Assert.Equal(ContractStatus.Draft, result.Status);
        Assert.False(result.IsDefault);
        _mockTemplateRepo.Verify(r => r.AddAsync(It.Is<InvoiceTemplate>(t => t.Name == "Cloned Template" && t.Status == DomainStatus.Draft)), Times.Once);
    }

    [Fact]
    public async Task GenerateInvoicePdf_CreatesImmutableSnapshotAndPdfStorage()
    {
        // Arrange
        var invoice = new Invoice
        {
            Id = 101,
            TenantId = 1,
            InvoiceNumber = "INV-2026-0001",
            InvoiceDate = DateTime.UtcNow,
            DueDate = DateTime.UtcNow.AddDays(30),
            Status = "Issued",
            Subtotal = 1000m,
            DiscountAmount = 100m,
            TaxAmount = 162m,
            TotalAmount = 1062m,
            PaidAmount = 0m,
            BalanceAmount = 1062m,
            Customer = new Customer
            {
                Id = 1,
                Name = "Acme Corp",
                CompanyName = "Acme Global Solutions",
                Email = "billing@acme.com",
                Address = "100 Industrial Road",
                Currency = "INR"
            },
            Items = new List<InvoiceItem>
            {
                new()
                {
                    Id = 1,
                    Description = "Cloud Migration Consulting",
                    Quantity = 10,
                    UnitPrice = 100m,
                    DiscountAmount = 10m,
                    TaxAmount = 16.2m,
                    TotalAmount = 106.2m
                }
            }
        };

        var activeTemplate = new InvoiceTemplate
        {
            Id = 1,
            TenantId = 1,
            Name = "Default Corporate",
            Style = DomainStyle.Standard,
            Status = DomainStatus.Active,
            IsDefault = true,
            ActiveVersionId = 2,
            Versions = new List<TemplateVersion>
            {
                new()
                {
                    Id = 1,
                    VersionNumber = 1,
                    Status = DomainStatus.Active,
                    BrandingJson = "{\"PrimaryColor\":\"#0f2942\"}",
                    CompanyDetailsJson = "{\"CompanyName\":\"IBMS Tech\"}",
                    LayoutJson = "{\"ShowHeader\":true,\"ShowFooter\":true}",
                    TermsJson = "{\"TermsAndConditions\":\"Standard Terms\"}"
                },
                new() { Id = 2, VersionNumber = 2, Status = DomainStatus.Draft }
            }
        };

        _mockInvoiceRepo.Setup(r => r.GetByIdAsync(101, 1))
            .ReturnsAsync(invoice);
        _mockDocumentRepo.Setup(r => r.GetByInvoiceIdAsync(101, 1))
            .ReturnsAsync((GeneratedDocument?)null);
        _mockSnapshotRepo.Setup(r => r.GetByInvoiceIdAsync(101, 1))
            .ReturnsAsync((InvoiceSnapshot?)null);
        _mockTemplateRepo.Setup(r => r.GetDefaultTemplateAsync(1))
            .ReturnsAsync(activeTemplate);
        _mockStorage.Setup(s => s.SaveDocumentAsync(It.IsAny<byte[]>(), It.IsAny<string>(), "application/pdf", 1, default))
            .ReturnsAsync("tenant_1/INV-2026-0001.pdf");
        _mockSnapshotRepo.Setup(r => r.AddAsync(It.IsAny<InvoiceSnapshot>()))
            .Returns(Task.CompletedTask);
        _mockDocumentRepo.Setup(r => r.AddAsync(It.IsAny<GeneratedDocument>()))
            .Returns(Task.CompletedTask);

        var req = new GenerateInvoicePdfRequest
        {
            InvoiceId = 101,
            ForceRegenerate = false
        };

        // Act
        var response = await _service.GenerateInvoicePdfAsync(req, 1, "generatorUser");

        // Assert
        Assert.NotNull(response);
        Assert.Equal("INV-2026-0001", response.InvoiceNumber);
        Assert.Equal("INV-2026-0001.pdf", response.FileName);
        Assert.False(response.IsHistoricalReproduction);
        _mockSnapshotRepo.Verify(r => r.AddAsync(It.Is<InvoiceSnapshot>(s => s.InvoiceId == 101 && s.TemplateVersionId == 1)), Times.Once);
        _mockStorage.Verify(s => s.SaveDocumentAsync(It.IsAny<byte[]>(), "INV-2026-0001.pdf", "application/pdf", 1, default), Times.Once);
    }

    [Fact]
    public async Task SetDefaultTemplate_ValidTemplate_SetsAsActiveDefaultAndLogsAudit()
    {
        // Arrange
        var template = new InvoiceTemplate
        {
            Id = 8,
            TenantId = 1,
            Name = "TrailTemplate",
            Status = DomainStatus.Draft,
            IsDefault = false,
            CurrentVersionNumber = 2,
            Versions = new List<TemplateVersion>
            {
                new()
                {
                    Id = 81,
                    TemplateId = 8,
                    VersionNumber = 1,
                    Status = DomainStatus.Draft
                },
                new()
                {
                    Id = 82,
                    TemplateId = 8,
                    VersionNumber = 2,
                    Status = DomainStatus.Draft
                }
            }
        };

        _mockTemplateRepo.Setup(r => r.GetByIdAsync(8, 1, true))
            .ReturnsAsync(template);
        _mockTemplateRepo.Setup(r => r.ClearDefaultTemplateAsync(1, 8, It.IsAny<CancellationToken>()))
            .Returns(Task.CompletedTask);
        _mockTemplateRepo.Setup(r => r.UpdateVersionAsync(It.IsAny<TemplateVersion>()))
            .Returns(Task.CompletedTask);
        _mockTemplateRepo.Setup(r => r.UpdateAsync(It.IsAny<InvoiceTemplate>()))
            .Returns(Task.CompletedTask);

        // Act
        var result = await _service.SetDefaultTemplateAsync(8, 1, "Acme Admin");

        // Assert
        Assert.NotNull(result);
        Assert.True(result.IsDefault);
        Assert.Equal(ContractStatus.Active, result.Status);
        Assert.Equal(82, template.ActiveVersionId);
        var v2 = template.Versions.First(v => v.VersionNumber == 2);
        Assert.Equal(DomainStatus.Active, v2.Status);

        _mockTemplateRepo.Verify(r => r.ClearDefaultTemplateAsync(1, 8, It.IsAny<CancellationToken>()), Times.Once);
        _mockTemplateRepo.Verify(r => r.UpdateVersionAsync(It.Is<TemplateVersion>(v => v.Id == 82 && v.Status == DomainStatus.Active)), Times.Once);
        _mockTemplateRepo.Verify(r => r.UpdateAsync(It.Is<InvoiceTemplate>(t => t.Id == 8 && t.IsDefault && t.Status == DomainStatus.Active)), Times.Once);
    }

    [Fact]
    public async Task SetDefaultTemplate_NonExistentTemplate_ThrowsKeyNotFoundException()
    {
        // Arrange
        _mockTemplateRepo.Setup(r => r.GetByIdAsync(999, 1, true))
            .ReturnsAsync((InvoiceTemplate?)null);

        // Act & Assert
        await Assert.ThrowsAsync<KeyNotFoundException>(() =>
            _service.SetDefaultTemplateAsync(999, 1, "Acme Admin"));
    }

    private InvoiceTemplate PublishedTemplateWithDraft(int? pointer = 90)
    {
        var template = new InvoiceTemplate
        {
            Id = 5, TenantId = 1, Name = "Published", Status = DomainStatus.Active,
            IsDefault = true, CurrentVersionNumber = 10, ActiveVersionId = pointer,
            Versions = new List<TemplateVersion>
            {
                new() { Id = 90, VersionNumber = 9, Status = DomainStatus.Active },
                new() { Id = 100, VersionNumber = 10, Status = DomainStatus.Draft }
            }
        };
        _mockTemplateRepo.Setup(r => r.GetByIdAsync(5, 1, true)).ReturnsAsync(template);
        _mockTemplateRepo.Setup(r => r.GetPagedListAsync(1, null, null, null, 1, 10))
            .ReturnsAsync((new List<InvoiceTemplate> { template }, 1));
        return template;
    }

    [Theory]
    [InlineData(90)]
    [InlineData(100)]
    [InlineData(null)]
    public async Task ListAndHistory_ResolvePublishedVersionWithoutChangingLegacyRecords(int? pointer)
    {
        var template = PublishedTemplateWithDraft(pointer);
        var list = await _service.GetTemplatesAsync(new TemplateFilterRequest { PageNumber = 1, PageSize = 10 }, 1);
        var detail = await _service.GetTemplateByIdAsync(5, 1);
        var history = await _service.GetTemplateVersionsAsync(5, 1);
        Assert.Equal(9, list.Items.Single().CurrentVersionNumber);
        Assert.Equal(9, detail.ActiveVersion!.VersionNumber);
        Assert.Equal(ContractStatus.Active, detail.Status);
        Assert.True(detail.IsDefault);
        Assert.True(history.Single(v => v.VersionNumber == 9).IsCurrent);
        Assert.False(history.Single(v => v.VersionNumber == 10).IsCurrent);
        Assert.Equal(ContractStatus.Draft, history.Single(v => v.VersionNumber == 10).Status);
        Assert.Equal(pointer, template.ActiveVersionId);
        Assert.Equal(10, template.CurrentVersionNumber);
    }

    [Fact]
    public async Task PublishThenCreateDraft_KeepsPublishedVersionCurrentAndPreservesHistory()
    {
        var template = PublishedTemplateWithDraft();
        var activated = await _service.ActivateTemplateAsync(5, 10, 1, "editor");
        Assert.Equal(10, activated.CurrentVersionNumber);
        Assert.Equal(100, activated.ActiveVersionId);
        Assert.False(activated.Versions.Single(v => v.VersionNumber == 9).IsCurrent);
        var updated = await _service.UpdateTemplateAsync(5, new UpdateTemplateRequest { Name = "Published" }, 1, "editor");
        Assert.Equal(10, updated.CurrentVersionNumber);
        Assert.Equal(10, template.CurrentVersionNumber);
        Assert.Equal(3, updated.Versions.Count);
        Assert.True(updated.Versions.Single(v => v.VersionNumber == 10).IsCurrent);
        Assert.Equal(ContractStatus.Draft, updated.Versions.Single(v => v.VersionNumber == 11).Status);
        Assert.False(updated.Versions.Single(v => v.VersionNumber == 11).IsCurrent);
    }

    [Fact]
    public async Task SetDefault_WithPublishedVersion_DoesNotPublishNewerDraft()
    {
        var template = PublishedTemplateWithDraft();
        var result = await _service.SetDefaultTemplateAsync(5, 1, "editor");
        Assert.True(result.IsDefault);
        Assert.Equal(9, result.CurrentVersionNumber);
        Assert.Equal(DomainStatus.Draft, template.Versions.Single(v => v.VersionNumber == 10).Status);
    }

    [Fact]
    public async Task CreateDraft_WithExistingDraft_UsesNextHistoryNumberAndKeepsActiveVersion()
    {
        var template = PublishedTemplateWithDraft();
        var result = await _service.UpdateTemplateAsync(5, new UpdateTemplateRequest { Name = "Published" }, 1, "editor");
        Assert.Equal(9, result.CurrentVersionNumber);
        Assert.Equal(90, result.ActiveVersionId);
        Assert.Equal(ContractStatus.Draft, result.Versions.Single(v => v.VersionNumber == 11).Status);
        Assert.Equal(DomainStatus.Draft, template.Versions.Single(v => v.VersionNumber == 10).Status);
    }

    [Fact]
    public async Task PublishedPointer_TakesPrecedenceOverHigherHistoricalActiveVersion()
    {
        var template = PublishedTemplateWithDraft();
        template.Versions.Single(v => v.VersionNumber == 10).Status = DomainStatus.Active;
        var result = await _service.GetTemplateByIdAsync(5, 1);
        Assert.Equal(9, result.CurrentVersionNumber);
        Assert.Single(result.Versions.Where(v => v.IsCurrent));
        template.Versions.Remove(template.Versions.Single(v => v.VersionNumber == 10));
        Assert.Equal(9, (await _service.GetTemplateByIdAsync(5, 1)).CurrentVersionNumber);
    }

    [Fact]
    public void DebugPirnavPreviewPdfException()
    {
        var request = new TemplatePreviewRequest
        {
            Style = ContractStyle.Professional,
            Branding = new BrandingConfigDto
            {
                LogoUrl = "/template-assets/pirnav.png",
                LogoName = "pirnav.png",
                LogoPosition = "right",
                LogoWidth = 132,
                PrimaryColor = "#70472f",
                SecondaryColor = "#a46a43",
                AccentColor = "#f1e6dc",
                FontFamily = "Segoe UI"
            },
            CompanyDetails = new CompanyDetailsConfigDto
            {
                CompanyName = "Pirnav Software Solutions Pvt. Ltd.",
                AddressLine1 = "",
                Country = "India"
            },
            Layout = new LayoutConfigDto
            {
                UsePirnavStandardLayout = true,
                ShowLogo = true,
                ShowHeader = true,
                ShowFooter = true,
                ShowTaxBreakdown = true,
                ShowPaymentInstructions = true,
                ShowTermsAndConditions = true,
                CurrencyCode = "INR",
                CurrencySymbol = "₹",
                MarginTopMm = 12,
                MarginBottomMm = 12,
                MarginLeftMm = 14,
                MarginRightMm = 14
            },
            PaymentInstructions = new PaymentInstructionsConfigDto(),
            Terms = new TermsConfigDto
            {
                TermsAndConditions = "1. Payment terms.",
                FooterNote = "Thank you for choosing us! This is a system-generated invoice and does not require a physical signature."
            },
            CustomSampleData = new InvoiceSnapshotDto
            {
                InvoiceId = 49,
                InvoiceNumber = "INV-2026-10-000100",
                IssueDate = new DateTime(2026, 10, 7),
                DueDate = new DateTime(2026, 11, 7),
                Status = "Paid",
                Currency = "INR",
                CurrencySymbol = "₹",
                Customer = new CustomerSnapshotDto
                {
                    CustomerId = 31,
                    CustomerName = "Pratap",
                    CustomerCode = "CUST-027",
                    BillingAddress = "HITECH COLONY"
                },
                Items = new List<InvoiceItemSnapshotDto>
                {
                    new()
                    {
                        ItemId = 53,
                        ItemName = "sun Flower oil",
                        Description = "sun Flower oil",
                        Quantity = 1,
                        Unit = "Box",
                        UnitPrice = 5400,
                        DiscountAmount = 648,
                        TaxRatePercent = 22,
                        TaxAmount = 1045.44m,
                        LineTotal = 5797.44m
                    }
                },
                Subtotal = 5400,
                TotalDiscount = 648,
                TotalTax = 1045.44m,
                TotalAdditionalCharges = 0,
                GrandTotal = 5797,
                AmountPaid = 5797,
                BalanceDue = 0
            }
        };

        var bytes = _pdfEngine.GeneratePreviewPdf(request);
        Assert.NotNull(bytes);
        Assert.NotEmpty(bytes);
    }
}
