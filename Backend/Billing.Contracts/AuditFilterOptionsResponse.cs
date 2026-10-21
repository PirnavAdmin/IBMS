namespace Billing.Contracts;

public class AuditFilterOptionsResponse
{
    public List<string> EntityNames { get; set; } = new();
    public List<string> Actions { get; set; } = new();
    public List<string> UserNames { get; set; } = new();

    // Convenient aliases matching frontend dropdown concepts
    public List<string> Modules => EntityNames;
    public List<string> EventNames => Actions;
    public List<string> PerformedBy => UserNames;
}
