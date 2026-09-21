namespace Billing.Contracts;

public class ApiResponse<T>
{
    public bool Success { get; set; }
    public string Message { get; set; } = string.Empty;
    public T? Data { get; set; }
    public List<string>? Errors { get; set; }
    public string? ErrorCode { get; set; }

    public static ApiResponse<T> Ok(T data, string message = "Success") =>
        new() { Success = true, Message = message, Data = data };

    public static ApiResponse<T> Fail(string message, List<string>? errors = null, string? errorCode = null) =>
        new() { Success = false, Message = message, Errors = errors ?? new List<string>(), ErrorCode = errorCode };

    public static ApiResponse<T> Fail(string message, string error, string? errorCode = null) =>
        new() { Success = false, Message = message, Errors = new List<string> { error }, ErrorCode = errorCode };
}
