using Billing.Contracts.Notification;

namespace Billing.Application.Interfaces;

public interface ITemplateEngineService
{
    string Render(string template, IDictionary<string, string> variables);
    List<NotificationVariableDefinitionDto> GetAvailableVariables(string eventType);
    Dictionary<string, string> GetSampleVariables(string eventType);
    NotificationPreviewResponse Preview(NotificationPreviewRequest request);
}
