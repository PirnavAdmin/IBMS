namespace Billing.Contracts.BackgroundJobs;

public class JobExecutionResultDto
{
    public string JobName { get; set; } = string.Empty;
    public bool Success { get; set; }
    public int ProcessedCount { get; set; }
    public string? Message { get; set; }
    public TimeSpan Duration { get; set; }
    public DateTime ExecutedAtUtc { get; set; } = DateTime.UtcNow;
}

public class BackgroundJobStatusDto
{
    public string JobName { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public string Status { get; set; } = "Idle"; // Idle, Running, Succeeded, Failed
    public DateTime? LastRunAtUtc { get; set; }
    public DateTime? NextScheduledRunUtc { get; set; }
    public bool LastRunSuccess { get; set; } = true;
    public string? LastRunMessage { get; set; }
    public int LastProcessedCount { get; set; }
    public double LastExecutionDurationMs { get; set; }
}

public class CleanupResultDto
{
    public bool Success { get; set; }
    public int ExpiredSessionsCleaned { get; set; }
    public int OldOutboxMessagesCleaned { get; set; }
    public int OldWebhookDeliveriesCleaned { get; set; }
    public int ExpiredExportJobsCleaned { get; set; }
    public int OldIdempotencyKeysPurged { get; set; }
    public string? Message { get; set; }
    public TimeSpan Duration { get; set; }
    public DateTime ExecutedAtUtc { get; set; } = DateTime.UtcNow;
}

public class RunJobRequest
{
    public int? TenantId { get; set; }
}
