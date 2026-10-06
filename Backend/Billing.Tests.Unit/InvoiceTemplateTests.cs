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
        Assert.Equal(2, existingTemplate.CurrentVersionNumber);
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
            ActiveVersionId = 1,
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
                }
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
        _mockSnapshotRepo.Verify(r => r.AddAsync(It.Is<InvoiceSnapshot>(s => s.InvoiceId == 101)), Times.Once);
        _mockStorage.Verify(s => s.SaveDocumentAsync(It.IsAny<byte[]>(), "INV-2026-0001.pdf", "application/pdf", 1, default), Times.Once);
    }
}
