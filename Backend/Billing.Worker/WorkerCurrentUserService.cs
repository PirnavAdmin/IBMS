using Billing.Application.Interfaces;

namespace Billing.Worker;

public class WorkerCurrentUserService : ICurrentUserService
{
    public string? UserId => "system-worker";
    public int? TenantId => 1;
    public string? UserName => "SystemWorker";
}
