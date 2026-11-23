using System.IO;
using System.Security.Claims;
using System.Text;
using Billing.API.Controllers;
using Billing.Application.Interfaces;
using Billing.Application.Services;
using Billing.Contracts;
using Billing.Contracts.InvoiceTemplate;
using Billing.Domain.Entities;
using Billing.Infrastructure.Services;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Moq;
using Xunit;

namespace Billing.Tests.Unit;

public class CompanyLogoAndBrandingTests
{
    private readonly Mock<IInvoiceTemplateRepository> _mockTemplateRepo;
    private readonly Mock<IInvoiceSnapshotRepository> _mockSnapshotRepo;
    private readonly Mock<IGeneratedDocumentRepository> _mockDocumentRepo;
    private readonly Mock<IInvoiceRepository> _mockInvoiceRepo;
    private readonly Mock<IDocumentStorageService> _mockStorage;
    private readonly Mock<ITenantRepository> _mockTenantRepo;
    private readonly IInvoicePdfEngine _pdfEngine;
    private readonly InvoiceTemplateService _service;

    public CompanyLogoAndBrandingTests()
    {
        _mockTemplateRepo = new Mock<IInvoiceTemplateRepository>();
        _mockSnapshotRepo = new Mock<IInvoiceSnapshotRepository>();
        _mockDocumentRepo = new Mock<IGeneratedDocumentRepository>();
        _mockInvoiceRepo = new Mock<IInvoiceRepository>();
        _mockStorage = new Mock<IDocumentStorageService>();
        _mockTenantRepo = new Mock<ITenantRepository>();
        _pdfEngine = new QuestPdfInvoiceEngine();

        _service = new InvoiceTemplateService(
            _mockTemplateRepo.Object,
            _mockSnapshotRepo.Object,
            _mockDocumentRepo.Object,
            _mockInvoiceRepo.Object,
            _pdfEngine,
            _mockStorage.Object,
            tenantRepository: _mockTenantRepo.Object);
    }

    [Fact]
    public async Task GetCompanyBranding_ReturnsDefaultTemplateBrandingAndCompanyDetails()
    {
        var template = new InvoiceTemplate
        {
            Id = 10,
            TenantId = 1,
            Name = "Acme Default Template",
            CurrentVersionNumber = 1,
            ActiveVersionId = 101,
            IsDefault = true,
            Versions = new List<TemplateVersion>
            {
                new TemplateVersion
                {
                    Id = 101,
                    VersionNumber = 1,
                    Status = Domain.Enums.TemplateStatus.Active,
                    BrandingJson = "{\"LogoUrl\":\"data:image/png;base64,iVBORw0KGgo=\",\"LogoName\":\"acme-logo.png\",\"LogoPosition\":\"left\",\"LogoWidth\":120,\"PrimaryColor\":\"#123456\",\"SecondaryColor\":\"#abcdef\"}",
                    CompanyDetailsJson = "{\"CompanyName\":\"Acme Corp\",\"Email\":\"billing@acme.com\",\"Phone\":\"+1234567890\",\"AddressLine1\":\"123 Main St\"}",
                    LayoutJson = "{\"ShowLogo\":true,\"CurrencyCode\":\"USD\",\"CurrencySymbol\":\"$\"}"
                }
            }
        };

        _mockTemplateRepo.Setup(r => r.GetDefaultTemplateAsync(1)).ReturnsAsync(template);

        var result = await _service.GetCompanyBrandingAsync(1);

        Assert.NotNull(result);
        Assert.Equal(10, result.TemplateId);
        Assert.Equal("Acme Default Template", result.TemplateName);
        Assert.Equal("data:image/png;base64,iVBORw0KGgo=", result.Branding.LogoUrl);
        Assert.Equal("acme-logo.png", result.Branding.LogoName);
        Assert.Equal("left", result.Branding.LogoPosition);
        Assert.Equal(120, result.Branding.LogoWidth);
        Assert.Equal("Acme Corp", result.CompanyDetails.CompanyName);
        Assert.Equal("billing@acme.com", result.CompanyDetails.Email);
    }

    [Fact]
    public async Task UpdateCompanyBranding_UpdatesBrandingAndSyncsTenant()
    {
        var template = new InvoiceTemplate
        {
            Id = 20,
            TenantId = 2,
            Name = "Pirnav Standard",
            CurrentVersionNumber = 1,
            ActiveVersionId = 201,
            Versions = new List<TemplateVersion>
            {
                new TemplateVersion
                {
                    Id = 201,
                    VersionNumber = 1,
                    Status = Domain.Enums.TemplateStatus.Active,
                    BrandingJson = "{}",
                    CompanyDetailsJson = "{\"CompanyName\":\"Old Name\"}",
                    LayoutJson = "{\"ShowLogo\":false}"
                }
            }
        };

        var tenant = new Tenant
        {
            Id = 2,
            Name = "Old Name",
            TenantCode = "tenant-2",
            CompanyEmail = "old@example.com"
        };

        _mockTemplateRepo.Setup(r => r.GetDefaultTemplateAsync(2)).ReturnsAsync(template);
        _mockTemplateRepo.Setup(r => r.GetByIdAsync(20, 2)).ReturnsAsync(template);
        _mockTenantRepo.Setup(r => r.GetByIdAsync(2)).ReturnsAsync(tenant);

        var updateRequest = new UpdateCompanyBrandingRequest
        {
            Branding = new BrandingConfigDto
            {
                LogoUrl = "data:image/webp;base64,UklGRkAAAABXRUJQVlA4IDQAAADwAQCdASoBAAEAAQAcJaACdLoAAP7/2QAA",
                LogoName = "new-company-logo.webp",
                LogoPosition = "right",
                LogoWidth = 140
            },
            CompanyDetails = new CompanyDetailsConfigDto
            {
                CompanyName = "Brand New Company Ltd",
                Email = "info@brandnew.com",
                Phone = "+91 9999999999",
                AddressLine1 = "Tech Hub, Tower 3"
            }
        };

        var result = await _service.UpdateCompanyBrandingAsync(updateRequest, 2, "TestAdmin");

        Assert.NotNull(result);
        Assert.Equal("data:image/webp;base64,UklGRkAAAABXRUJQVlA4IDQAAADwAQCdASoBAAEAAQAcJaACdLoAAP7/2QAA", result.Branding.LogoUrl);
        Assert.Equal("new-company-logo.webp", result.Branding.LogoName);
        Assert.Equal("right", result.Branding.LogoPosition);
        Assert.Equal(140, result.Branding.LogoWidth);
        Assert.Equal("Brand New Company Ltd", result.CompanyDetails.CompanyName);

        // Verify tenant sync
        _mockTenantRepo.Verify(r => r.UpdateAsync(It.Is<Tenant>(t =>
            t.Name == "Brand New Company Ltd" &&
            t.CompanyEmail == "info@brandnew.com" &&
            t.Phone == "+91 9999999999" &&
            t.Address == "Tech Hub, Tower 3")), Times.Once);
    }

    [Fact]
    public async Task UploadLogo_ControllerAction_ValidatesFileExtensions()
    {
        var mockService = new Mock<IInvoiceTemplateService>();
        var mockStorage = new Mock<IDocumentStorageService>();
        var mockLogger = new Mock<Microsoft.Extensions.Logging.ILogger<InvoiceTemplatesController>>();
        var controller = new InvoiceTemplatesController(mockService.Object, mockStorage.Object, mockLogger.Object);

        // Set ClaimsPrincipal for tenant 1
        var user = new ClaimsPrincipal(new ClaimsIdentity(new[]
        {
            new Claim("TenantId", "1"),
            new Claim(ClaimTypes.Name, "AdminUser")
        }, "mock"));
        controller.ControllerContext = new ControllerContext
        {
            HttpContext = new DefaultHttpContext { User = user }
        };

        // 1. Invalid file extension (.pdf)
        var invalidBytes = Encoding.UTF8.GetBytes("fake pdf content");
        var invalidFile = new FormFile(new MemoryStream(invalidBytes), 0, invalidBytes.Length, "file", "invoice.pdf");
        var badExtResult = await controller.UploadLogo(new TemplateLogoUploadForm { File = invalidFile }, default);
        Assert.IsType<BadRequestObjectResult>(badExtResult);

        // 2. Valid PNG file
        var validBytes = new byte[] { 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A };
        var validFile = new FormFile(new MemoryStream(validBytes), 0, validBytes.Length, "file", "company-logo.png")
        {
            Headers = new HeaderDictionary(),
            ContentType = "image/png"
        };
        var goodResult = await controller.UploadLogo(new TemplateLogoUploadForm { File = validFile }, default);
        var okResult = Assert.IsType<OkObjectResult>(goodResult);
        var apiResponse = Assert.IsType<ApiResponse<LogoUploadResponse>>(okResult.Value);
        Assert.True(apiResponse.Success);
        Assert.StartsWith("data:image/png;base64,", apiResponse.Data!.LogoUrl);
        Assert.Equal("company-logo.png", apiResponse.Data.FileName);
    }

    [Fact]
    public async Task UploadLogo_RejectsFilesExceeding2MB()
    {
        var mockService = new Mock<IInvoiceTemplateService>();
        var mockStorage = new Mock<IDocumentStorageService>();
        var mockLogger = new Mock<Microsoft.Extensions.Logging.ILogger<InvoiceTemplatesController>>();
        var controller = new InvoiceTemplatesController(mockService.Object, mockStorage.Object, mockLogger.Object);

        var user = new ClaimsPrincipal(new ClaimsIdentity(new[]
        {
            new Claim("TenantId", "1"),
            new Claim(ClaimTypes.Name, "AdminUser")
        }, "mock"));
        controller.ControllerContext = new ControllerContext
        {
            HttpContext = new DefaultHttpContext { User = user }
        };

        // File larger than 2MB
        var largeStream = new MemoryStream(new byte[2 * 1024 * 1024 + 10]);
        var largeFile = new FormFile(largeStream, 0, largeStream.Length, "file", "giant-logo.png")
        {
            Headers = new HeaderDictionary(),
            ContentType = "image/png"
        };

        var result = await controller.UploadLogo(new TemplateLogoUploadForm { File = largeFile }, default);
        var badResult = Assert.IsType<BadRequestObjectResult>(result);
        var apiResponse = Assert.IsType<ApiResponse<LogoUploadResponse>>(badResult.Value);
        Assert.False(apiResponse.Success);
        Assert.Contains("exceeds the 2 MB limit", apiResponse.Message);
    }
}
