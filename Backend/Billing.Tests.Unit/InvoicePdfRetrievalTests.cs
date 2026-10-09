using Billing.Application.Interfaces;
using Billing.Application.Services;
using Billing.Contracts.InvoiceTemplate;
using Billing.Domain.Entities;
using Moq;
using Xunit;

namespace Billing.Tests.Unit;

public class InvoicePdfRetrievalTests
{
    private const int TenantId = 2;
    private const int InvoiceId = 101;
    private readonly byte[] _bytes = "%PDF-test"u8.ToArray();
    private readonly Mock<IInvoiceTemplateRepository> _templates = new();
    private readonly Mock<IInvoiceSnapshotRepository> _snapshots = new();
    private readonly Mock<IGeneratedDocumentRepository> _documents = new();
    private readonly Mock<IInvoiceRepository> _invoices = new();
    private readonly Mock<IInvoicePdfEngine> _engine = new();
    private readonly Mock<IDocumentStorageService> _storage = new();
    private readonly Mock<IAuditLogRepository> _audit = new();
    private readonly InvoiceTemplateService _service;
    private GeneratedDocument? _document;
    private InvoiceSnapshot? _snapshot;

    public InvoicePdfRetrievalTests()
    {
        _service = new InvoiceTemplateService(_templates.Object, _snapshots.Object,
            _documents.Object, _invoices.Object, _engine.Object, _storage.Object, _audit.Object);
        _invoices.Setup(r => r.GetByIdAsync(InvoiceId, TenantId)).ReturnsAsync(new Invoice
        {
            Id = InvoiceId, TenantId = TenantId, InvoiceNumber = "INV-101", Status = "Issued",
            Customer = new Customer { Name = "Customer", Email = "customer@example.com" }
        });
        _templates.Setup(r => r.GetDefaultTemplateAsync(TenantId)).ReturnsAsync(new InvoiceTemplate
        {
            Id = 1, TenantId = TenantId, Status = Billing.Domain.Enums.TemplateStatus.Active,
            ActiveVersionId = 10,
            Versions = new List<TemplateVersion>
            {
                new() { Id = 10, VersionNumber = 1, Status = Billing.Domain.Enums.TemplateStatus.Active }
            }
        });
        _documents.Setup(r => r.GetByInvoiceIdAsync(InvoiceId, TenantId)).ReturnsAsync(() => _document);
        _documents.Setup(r => r.GetByIdAsync(It.IsAny<int>(), TenantId)).ReturnsAsync(() => _document);
        _documents.Setup(r => r.AddAsync(It.IsAny<GeneratedDocument>()))
            .Callback<GeneratedDocument>(d => { d.Id = 7; _document = d; }).Returns(Task.CompletedTask);
        _snapshots.Setup(r => r.GetByInvoiceIdAsync(InvoiceId, TenantId)).ReturnsAsync(() => _snapshot);
        _snapshots.Setup(r => r.AddAsync(It.IsAny<InvoiceSnapshot>()))
            .Callback<InvoiceSnapshot>(s => { s.Id = 8; _snapshot = s; }).Returns(Task.CompletedTask);
        _engine.Setup(e => e.GenerateInvoicePdf(It.IsAny<InvoiceSnapshotDto>(), It.IsAny<TemplateVersionDto>()))
            .Returns(_bytes);
        _storage.Setup(s => s.SaveDocumentAsync(_bytes, "INV-101.pdf", "application/pdf", TenantId, default))
            .ReturnsAsync("tenant_2/new.pdf");
        _storage.Setup(s => s.ExistsAsync(It.IsAny<string>(), TenantId, default)).ReturnsAsync(true);
        _storage.Setup(s => s.GetDocumentAsync(It.IsAny<string>(), TenantId, default)).ReturnsAsync(_bytes);
    }

    [Fact]
    public async Task GenerateThenDownloadRepeatedly_RendersSavesAndAuditsOnlyOnce()
    {
        await _service.GenerateInvoicePdfAsync(new GenerateInvoicePdfRequest { InvoiceId = InvoiceId }, TenantId, "Acme Admin");
        for (var i = 0; i < 3; i++)
        {
            var result = await _service.GetInvoicePdfAsync(InvoiceId, TenantId);
            Assert.Equal(_bytes, result.FileBytes);
            Assert.Equal("INV-101.pdf", result.FileName);
        }
        // A repeated non-forced generation request also reuses the stored PDF.
        await _service.GenerateInvoicePdfAsync(new GenerateInvoicePdfRequest { InvoiceId = InvoiceId }, TenantId, "Acme Admin");
        VerifyOneGeneration("Acme Admin");
        _documents.Verify(r => r.AddAsync(It.IsAny<GeneratedDocument>()), Times.Once);
        _documents.Verify(r => r.UpdateAsync(It.IsAny<GeneratedDocument>()), Times.Never);
    }

    [Theory]
    [InlineData("Generated")]
    [InlineData("Stored")]
    public async Task ExistingReadableDocument_ReturnsWithoutGenerating(string status)
    {
        SetExistingDocument(status);
        var result = await _service.GetInvoicePdfAsync(InvoiceId, TenantId);
        Assert.Equal(_bytes, result.FileBytes);
        _engine.Verify(e => e.GenerateInvoicePdf(It.IsAny<InvoiceSnapshotDto>(), It.IsAny<TemplateVersionDto>()), Times.Never);
        _audit.Verify(r => r.AddAsync(It.IsAny<AuditLog>(), default), Times.Never);
        _documents.Verify(r => r.AddAsync(It.IsAny<GeneratedDocument>()), Times.Never);
        _documents.Verify(r => r.UpdateAsync(It.IsAny<GeneratedDocument>()), Times.Never);
    }

    [Fact]
    public async Task MissingDocument_GeneratesOnceAndNextDownloadReusesIt()
    {
        await _service.GetInvoicePdfAsync(InvoiceId, TenantId);
        await _service.GetInvoicePdfAsync(InvoiceId, TenantId);
        VerifyOneGeneration("SystemReproduction");
        _documents.Verify(r => r.AddAsync(It.IsAny<GeneratedDocument>()), Times.Once);
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task MissingOrUnreadableFile_RegeneratesAndUpdatesExistingRecord(bool failsDuringRead)
    {
        SetExistingDocument("Generated");
        if (failsDuringRead)
            _storage.Setup(s => s.GetDocumentAsync("tenant_2/old.pdf", TenantId, default))
                .ThrowsAsync(new IOException("File unavailable after existence check"));
        else
            _storage.Setup(s => s.ExistsAsync("tenant_2/old.pdf", TenantId, default)).ReturnsAsync(false);

        var result = await _service.GetInvoicePdfAsync(InvoiceId, TenantId);
        await _service.GetInvoicePdfAsync(InvoiceId, TenantId);
        Assert.Equal(_bytes, result.FileBytes);
        Assert.Equal("tenant_2/new.pdf", _document!.StoragePath);
        VerifyOneGeneration("SystemReproduction");
        _documents.Verify(r => r.AddAsync(It.IsAny<GeneratedDocument>()), Times.Never);
        _documents.Verify(r => r.UpdateAsync(It.IsAny<GeneratedDocument>()), Times.Once);
    }

    [Fact]
    public async Task AuthorizationFailure_PropagatesWithoutRegeneration()
    {
        SetExistingDocument("Generated");
        _storage.Setup(s => s.GetDocumentAsync("tenant_2/old.pdf", TenantId, default))
            .ThrowsAsync(new UnauthorizedAccessException());
        await Assert.ThrowsAsync<UnauthorizedAccessException>(() => _service.GetInvoicePdfAsync(InvoiceId, TenantId));
        _engine.Verify(e => e.GenerateInvoicePdf(It.IsAny<InvoiceSnapshotDto>(), It.IsAny<TemplateVersionDto>()), Times.Never);
    }

    [Fact]
    public async Task EmailDelivery_AttachesGeneratedPdfWithoutSecondGeneration()
    {
        var email = new Mock<IEmailService>();
        var delivery = new InvoiceService(_invoices.Object, Mock.Of<INumberGenerationService>(),
            Mock.Of<IFinancialCalculationEngine>(), Mock.Of<IUnitOfWork>(), _audit.Object,
            email.Object, Mock.Of<IInvoiceCommunicationRepository>(), _service);

        var result = await delivery.DeliverInvoiceAsync(InvoiceId, TenantId, "Acme Admin");

        Assert.True(result.Success);
        email.Verify(e => e.SendEmailAsync("customer@example.com", It.IsAny<string>(),
            It.IsAny<string>(), _bytes, "INV-101.pdf"), Times.Once);
        VerifyOneGeneration("Acme Admin");
        _documents.Verify(r => r.AddAsync(It.IsAny<GeneratedDocument>()), Times.Once);
    }

    private void SetExistingDocument(string status)
    {
        _document = new GeneratedDocument
        {
            Id = 7, InvoiceId = InvoiceId, TenantId = TenantId, Status = status,
            StoragePath = "tenant_2/old.pdf", FileName = "INV-101.pdf"
        };
    }

    private void VerifyOneGeneration(string actor)
    {
        _engine.Verify(e => e.GenerateInvoicePdf(It.IsAny<InvoiceSnapshotDto>(), It.IsAny<TemplateVersionDto>()), Times.Once);
        _storage.Verify(s => s.SaveDocumentAsync(It.IsAny<byte[]>(), It.IsAny<string>(),
            "application/pdf", TenantId, default), Times.Once);
        _audit.Verify(r => r.AddAsync(It.Is<AuditLog>(a => a.Action == "PDF Generated"
            && a.UserName == actor && a.TenantId == TenantId && a.EntityId == InvoiceId.ToString()), default), Times.Once);
        _audit.Verify(r => r.AddAsync(It.Is<AuditLog>(a => a.Action == "PDF Generated"), default), Times.Once);
    }
}
