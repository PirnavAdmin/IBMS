using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using Billing.Contracts.Payment;
using Billing.Domain.Enums;

namespace Billing.Application.Services;

public record PaymentValidationSummary(
    bool IsValid,
    List<string> Errors,
    string? ErrorCode,
    PaymentMethod ParsedMethod,
    PaymentStatus InitialStatus,
    string NormalizedCurrency,
    List<CreatePaymentAllocationRequest> NormalizedAllocations);

public static class PaymentValidator
{
    private static readonly HashSet<string> SupportedCurrencies = new(StringComparer.OrdinalIgnoreCase)
    {
        "INR", "USD", "EUR", "GBP", "AED", "SGD", "AUD", "CAD"
    };

    private static readonly HashSet<string> PermittedClearingStatuses = new(StringComparer.OrdinalIgnoreCase)
    {
        "Cleared", "Uncleared", "Pending", "Bounced"
    };

    private static readonly HashSet<string> PermittedGatewayCallbackStatuses = new(StringComparer.OrdinalIgnoreCase)
    {
        "Completed", "Captured", "Verified", "Success", "Pending", "Failed"
    };

    // Matches raw 13-19 digit PAN card numbers (with optional spaces or hyphens)
    private static readonly Regex RawCardPanRegex = new(
        @"(?<!\d)(?:\d[ -]?){13,19}(?!\d)",
        RegexOptions.Compiled);

    // Matches explicit sensitive credential key/value patterns in notes/references
    private static readonly Regex SensitiveSecretPatternRegex = new(
        @"\b(cvv|cvc|upi\s*pin|card\s*pin|atm\s*pin|otp|secret_key|private_key)\s*[:=]\s*\S+",
        RegexOptions.IgnoreCase | RegexOptions.Compiled);

    public static bool TryParsePaymentMethod(string? methodInput, out PaymentMethod method)
    {
        method = PaymentMethod.Cash;
        if (string.IsNullOrWhiteSpace(methodInput))
        {
            return false;
        }

        var normalized = methodInput.Trim()
            .Replace(" ", string.Empty)
            .Replace("_", string.Empty)
            .Replace("-", string.Empty);

        if (string.Equals(normalized, "Cash", StringComparison.OrdinalIgnoreCase))
        {
            method = PaymentMethod.Cash;
            return true;
        }
        if (string.Equals(normalized, "BankTransfer", StringComparison.OrdinalIgnoreCase) ||
            string.Equals(normalized, "Bank", StringComparison.OrdinalIgnoreCase))
        {
            method = PaymentMethod.BankTransfer;
            return true;
        }
        if (string.Equals(normalized, "UPI", StringComparison.OrdinalIgnoreCase))
        {
            method = PaymentMethod.UPI;
            return true;
        }
        if (string.Equals(normalized, "Card", StringComparison.OrdinalIgnoreCase) ||
            string.Equals(normalized, "CreditCard", StringComparison.OrdinalIgnoreCase) ||
            string.Equals(normalized, "DebitCard", StringComparison.OrdinalIgnoreCase))
        {
            method = PaymentMethod.Card;
            return true;
        }
        if (string.Equals(normalized, "Cheque", StringComparison.OrdinalIgnoreCase) ||
            string.Equals(normalized, "Check", StringComparison.OrdinalIgnoreCase))
        {
            method = PaymentMethod.Cheque;
            return true;
        }
        if (string.Equals(normalized, "Gateway", StringComparison.OrdinalIgnoreCase) ||
            string.Equals(normalized, "PaymentGateway", StringComparison.OrdinalIgnoreCase))
        {
            method = PaymentMethod.Gateway;
            return true;
        }
        if (string.Equals(normalized, "Custom", StringComparison.OrdinalIgnoreCase))
        {
            method = PaymentMethod.Custom;
            return true;
        }

        return false;
    }

    public static string FormatMethodDisplay(PaymentMethod method, string? customMethodName = null)
    {
        return method switch
        {
            PaymentMethod.Cash => "Cash",
            PaymentMethod.BankTransfer => "Bank Transfer",
            PaymentMethod.UPI => "UPI",
            PaymentMethod.Card => "Card",
            PaymentMethod.Cheque => "Cheque",
            PaymentMethod.Gateway => "Gateway",
            PaymentMethod.Custom => !string.IsNullOrWhiteSpace(customMethodName)
                ? $"Custom ({customMethodName.Trim()})"
                : "Custom",
            _ => method.ToString()
        };
    }

    public static string FormatPaymentMethod(PaymentMethod method, string? customMethodName = null)
        => FormatMethodDisplay(method, customMethodName);

    public static PaymentValidationSummary ValidateCreateRequest(CreatePaymentRequest? request, int tenantId = 1)
    {
        var (isValid, errorMessage, errorCode) = ValidateCreateRequest(
            request,
            tenantId,
            out var parsedMethod,
            out var normalizedAllocations);

        var errors = isValid || string.IsNullOrWhiteSpace(errorMessage)
            ? new List<string>()
            : new List<string> { errorMessage };

        var initialStatus = request != null
            ? ResolveInitialPaymentStatus(parsedMethod, request)
            : PaymentStatus.Completed;

        var normCurrency = string.IsNullOrWhiteSpace(request?.Currency)
            ? "INR"
            : request!.Currency!.Trim().ToUpperInvariant();

        return new PaymentValidationSummary(
            isValid,
            errors,
            errorCode,
            parsedMethod,
            initialStatus,
            normCurrency,
            normalizedAllocations);
    }

    public static (bool IsValid, string? ErrorMessage, string? ErrorCode) ValidateCreateRequest(
        CreatePaymentRequest? request,
        int tenantId,
        out PaymentMethod parsedMethod,
        out List<CreatePaymentAllocationRequest> normalizedAllocations)
    {
        parsedMethod = PaymentMethod.Cash;
        normalizedAllocations = new List<CreatePaymentAllocationRequest>();

        if (tenantId <= 0)
        {
            return (false, "Invalid tenant identifier. Tenant ID must be greater than 0.", "INVALID_TENANT");
        }

        if (request == null)
        {
            return (false, "Payment request payload cannot be null.", "INVALID_REQUEST");
        }

        // 1. Sensitive Data Protection (Section 4, 10, 11)
        if (!string.IsNullOrWhiteSpace(request.ForbiddenCardNumber) ||
            !string.IsNullOrWhiteSpace(request.ForbiddenCvv) ||
            !string.IsNullOrWhiteSpace(request.ForbiddenPin) ||
            !string.IsNullOrWhiteSpace(request.ForbiddenUpiPin) ||
            !string.IsNullOrWhiteSpace(request.ForbiddenOtp) ||
            !string.IsNullOrWhiteSpace(request.ForbiddenGatewaySecret))
        {
            return (false,
                "Sensitive authentication data (full card number, CVV, PIN, UPI PIN, OTP, or gateway secrets) must never be submitted or stored.",
                "SENSITIVE_DATA_FORBIDDEN");
        }

        if (request.MethodDetails != null)
        {
            foreach (var kvp in request.MethodDetails)
            {
                var keyNorm = (kvp.Key ?? string.Empty).Trim().Replace("_", "").Replace("-", "").ToLowerInvariant();
                if (keyNorm is "cardnumber" or "pan" or "cvv" or "cvc" or "pin" or "upipin" or "atmpin" or "otp" or "gatewaysecret" or "secretkey")
                {
                    return (false,
                        $"Sensitive field '{kvp.Key}' must never be submitted or stored.",
                        "SENSITIVE_DATA_FORBIDDEN");
                }
                if (!string.IsNullOrWhiteSpace(kvp.Value) && RawCardPanRegex.IsMatch(kvp.Value) && LooksLikeCardPan(kvp.Value))
                {
                    return (false,
                        "Full card numbers (PAN) must never be stored in payment method details.",
                        "SENSITIVE_DATA_FORBIDDEN");
                }
            }
        }

        var textFieldsToInspect = new[]
        {
            request.Reference,
            request.Notes,
            request.UpiPayerMetadata,
            request.CustomMethodName,
            request.AccountLabel
        };

        foreach (var field in textFieldsToInspect)
        {
            if (string.IsNullOrWhiteSpace(field)) continue;

            if (SensitiveSecretPatternRegex.IsMatch(field))
            {
                return (false,
                    "Payment fields must not contain sensitive credentials such as CVV, PIN, OTP, or secrets.",
                    "SENSITIVE_DATA_FORBIDDEN");
            }

            if (RawCardPanRegex.IsMatch(field) && LooksLikeCardPan(field))
            {
                return (false,
                    "Full card numbers (PAN) must never be stored in payment references or notes.",
                    "SENSITIVE_DATA_FORBIDDEN");
            }
        }

        // 2. Idempotency Key Length Validation (Section 8)
        if (!string.IsNullOrWhiteSpace(request.IdempotencyKey) && request.IdempotencyKey.Trim().Length > 128)
        {
            return (false, "IdempotencyKey cannot exceed 128 characters.", "INVALID_IDEMPOTENCY_KEY");
        }

        // 3. Amount Validation (Section 3.2, 6.1)
        if (request.Amount <= 0m)
        {
            return (false, "Payment amount must be a positive monetary value greater than zero.", "INVALID_AMOUNT");
        }

        if (decimal.Round(request.Amount, 2) != request.Amount)
        {
            return (false, "Payment amount cannot have more than 2 decimal places.", "INVALID_AMOUNT_PRECISION");
        }

        // 4. Payment Date Validation (Section 3.2)
        if (!request.PaymentDate.HasValue || request.PaymentDate.Value == default)
        {
            return (false, "Payment date is required.", "INVALID_PAYMENT_DATE");
        }

        var paymentDateUtc = request.PaymentDate.Value.Kind == DateTimeKind.Utc
            ? request.PaymentDate.Value
            : request.PaymentDate.Value.ToUniversalTime();

        if (paymentDateUtc.Year < 2000 || paymentDateUtc.Date > DateTime.UtcNow.Date.AddDays(1))
        {
            return (false, "Payment date must be a valid business date and cannot be in the future.", "INVALID_PAYMENT_DATE");
        }

        // 5. Currency Validation
        if (!string.IsNullOrWhiteSpace(request.Currency) &&
            !SupportedCurrencies.Contains(request.Currency.Trim()))
        {
            return (false, $"Currency '{request.Currency}' is not supported.", "INVALID_CURRENCY");
        }

        // 6. Allocations Resolution & Full Allocation Enforcement (Section 2)
        if (request.Allocations != null && request.Allocations.Count > 0)
        {
            foreach (var alloc in request.Allocations)
            {
                if (alloc.InvoiceId <= 0)
                {
                    return (false, "Each payment allocation must specify a valid InvoiceId.", "INVALID_INVOICE_ID");
                }

                if (alloc.AllocatedAmount <= 0m)
                {
                    return (false, "Allocated amount for each invoice must be greater than zero.", "INVALID_ALLOCATION_AMOUNT");
                }

                if (decimal.Round(alloc.AllocatedAmount, 2) != alloc.AllocatedAmount)
                {
                    return (false, "Allocated amount cannot have more than 2 decimal places.", "INVALID_AMOUNT_PRECISION");
                }
            }

            if (request.Allocations.Select(a => a.InvoiceId).Distinct().Count() != request.Allocations.Count)
            {
                return (false, "Duplicate invoice IDs are not allowed in the same payment allocation list.", "DUPLICATE_INVOICE_ALLOCATION");
            }

            var totalAllocated = Math.Round(request.Allocations.Sum(a => a.AllocatedAmount), 2, MidpointRounding.AwayFromZero);
            var roundedPaymentAmount = Math.Round(request.Amount, 2, MidpointRounding.AwayFromZero);

            if (totalAllocated != roundedPaymentAmount)
            {
                return (false,
                    $"Full payment amount ({roundedPaymentAmount:F2}) must be allocated to invoices at creation. Allocated sum was {totalAllocated:F2}.",
                    "ALLOCATION_AMOUNT_MISMATCH");
            }

            if (request.InvoiceId.HasValue && request.InvoiceId.Value > 0 &&
                !request.Allocations.Any(a => a.InvoiceId == request.InvoiceId.Value))
            {
                return (false, "Top-level InvoiceId does not match the provided invoice allocations.", "INVOICE_ALLOCATION_MISMATCH");
            }

            normalizedAllocations = request.Allocations
                .Select(a => new CreatePaymentAllocationRequest
                {
                    InvoiceId = a.InvoiceId,
                    AllocatedAmount = Math.Round(a.AllocatedAmount, 2, MidpointRounding.AwayFromZero)
                })
                .ToList();
        }
        else if (request.InvoiceId.HasValue && request.InvoiceId.Value > 0)
        {
            normalizedAllocations.Add(new CreatePaymentAllocationRequest
            {
                InvoiceId = request.InvoiceId.Value,
                AllocatedAmount = Math.Round(request.Amount, 2, MidpointRounding.AwayFromZero)
            });
        }
        else
        {
            return (false, "An eligible InvoiceId or at least one invoice allocation is required.", "INVOICE_REQUIRED");
        }

        // 7. Payment Method & Method-Specific Validation (Section 4)
        if (!TryParsePaymentMethod(request.Method, out parsedMethod))
        {
            return (false,
                $"Unsupported payment method '{request.Method}'. Supported methods are: Cash, Bank Transfer, UPI, Card, Cheque, Gateway, Custom.",
                "INVALID_PAYMENT_METHOD");
        }

        switch (parsedMethod)
        {
            case PaymentMethod.Cash:
                break;

            case PaymentMethod.BankTransfer:
                if (string.IsNullOrWhiteSpace(request.Reference))
                {
                    return (false, "Bank transaction reference is required for Bank Transfer payments.", "METHOD_REFERENCE_REQUIRED");
                }
                break;

            case PaymentMethod.UPI:
                if (string.IsNullOrWhiteSpace(request.Reference) && string.IsNullOrWhiteSpace(request.ProviderTransactionId))
                {
                    return (false, "UPI transaction/reference ID is required for UPI payments.", "METHOD_REFERENCE_REQUIRED");
                }
                break;

            case PaymentMethod.Card:
                if (string.IsNullOrWhiteSpace(request.Reference) && string.IsNullOrWhiteSpace(request.ProviderTransactionId))
                {
                    return (false, "Card transaction reference is required for Card payments.", "METHOD_REFERENCE_REQUIRED");
                }
                break;

            case PaymentMethod.Cheque:
                if (string.IsNullOrWhiteSpace(request.ChequeNumber))
                {
                    return (false, "Cheque number is required for Cheque payments.", "CHEQUE_NUMBER_REQUIRED");
                }
                if (!request.ChequeDate.HasValue || request.ChequeDate.Value == default)
                {
                    return (false, "Cheque date is required for Cheque payments.", "CHEQUE_DATE_REQUIRED");
                }
                if (!string.IsNullOrWhiteSpace(request.ClearingStatus) &&
                    !PermittedClearingStatuses.Contains(request.ClearingStatus.Trim()))
                {
                    return (false,
                        $"Invalid cheque clearing status '{request.ClearingStatus}'. Allowed values: Cleared, Uncleared, Pending, Bounced.",
                        "INVALID_CLEARING_STATUS");
                }
                break;

            case PaymentMethod.Gateway:
                if (string.IsNullOrWhiteSpace(request.ProviderName))
                {
                    return (false, "Gateway provider name is required for Gateway payments.", "GATEWAY_PROVIDER_REQUIRED");
                }
                if (string.IsNullOrWhiteSpace(request.ProviderTransactionId) && string.IsNullOrWhiteSpace(request.Reference))
                {
                    return (false, "Gateway provider transaction ID is required for Gateway payments.", "GATEWAY_TRANSACTION_ID_REQUIRED");
                }
                if (!string.IsNullOrWhiteSpace(request.CallbackStatus))
                {
                    if (string.Equals(request.CallbackStatus.Trim(), "BrowserCallbackOnly", StringComparison.OrdinalIgnoreCase) ||
                        string.Equals(request.CallbackStatus.Trim(), "UnverifiedBrowserCallback", StringComparison.OrdinalIgnoreCase))
                    {
                        return (false,
                            "Gateway payment cannot be marked captured based solely on an unverified browser callback.",
                            "UNVERIFIED_GATEWAY_CALLBACK");
                    }

                    if (!PermittedGatewayCallbackStatuses.Contains(request.CallbackStatus.Trim()))
                    {
                        return (false,
                            $"Invalid gateway status '{request.CallbackStatus}'. Allowed values: Completed, Captured, Verified, Pending, Failed.",
                            "INVALID_GATEWAY_STATUS");
                    }
                }
                break;

            case PaymentMethod.Custom:
                if (string.IsNullOrWhiteSpace(request.CustomMethodName))
                {
                    return (false, "Configured custom method name is required when Method is Custom.", "CUSTOM_METHOD_NAME_REQUIRED");
                }
                if (request.CustomMethodName.Trim().Length < 2 || request.CustomMethodName.Trim().Length > 64)
                {
                    return (false, "Custom payment method name must be between 2 and 64 characters.", "INVALID_CUSTOM_METHOD");
                }
                break;
        }

        if (!string.IsNullOrWhiteSpace(request.Notes) && request.Notes.Length > 1000)
        {
            return (false, "Notes cannot exceed 1000 characters.", "NOTES_TOO_LONG");
        }

        return (true, null, null);
    }

    public static (bool IsValid, List<string> Errors, string? ErrorCode) ValidateReversalRequest(ReversePaymentRequest? request)
    {
        if (request == null || string.IsNullOrWhiteSpace(request.Reason))
        {
            return (false, new List<string> { "A reversal reason is mandatory to reverse a payment." }, "REVERSAL_REASON_REQUIRED");
        }

        var trimmed = request.Reason.Trim();
        if (trimmed.Length < 3)
        {
            return (false, new List<string> { "Reversal reason must be at least 3 characters long." }, "REVERSAL_REASON_REQUIRED");
        }

        if (trimmed.Length > 500)
        {
            return (false, new List<string> { "Reversal reason cannot exceed 500 characters." }, "REVERSAL_REASON_TOO_LONG");
        }

        return (true, new List<string>(), null);
    }

    public static PaymentStatus ResolveInitialPaymentStatus(PaymentMethod method, CreatePaymentRequest request)
    {
        if (method == PaymentMethod.Cheque)
        {
            var clearing = request.ClearingStatus?.Trim();
            if (string.Equals(clearing, "Uncleared", StringComparison.OrdinalIgnoreCase) ||
                string.Equals(clearing, "Pending", StringComparison.OrdinalIgnoreCase))
            {
                return PaymentStatus.Pending;
            }
            if (string.Equals(clearing, "Bounced", StringComparison.OrdinalIgnoreCase))
            {
                return PaymentStatus.Failed;
            }
            return PaymentStatus.Completed;
        }

        if (method == PaymentMethod.Gateway)
        {
            var cb = request.CallbackStatus?.Trim();
            if (string.Equals(cb, "Pending", StringComparison.OrdinalIgnoreCase))
            {
                return PaymentStatus.Pending;
            }
            if (string.Equals(cb, "Failed", StringComparison.OrdinalIgnoreCase))
            {
                return PaymentStatus.Failed;
            }
            return PaymentStatus.Completed;
        }

        return PaymentStatus.Completed;
    }

    public static string ComputePayloadHash(
        CreatePaymentRequest request,
        PaymentMethod method,
        List<CreatePaymentAllocationRequest> allocations,
        int tenantId = 1)
    {
        var allocPart = string.Join(";", allocations
            .OrderBy(a => a.InvoiceId)
            .Select(a => $"{a.InvoiceId}:{a.AllocatedAmount:F2}"));

        var primaryRef = (request.Reference ?? request.ChequeNumber ?? request.ProviderTransactionId ?? string.Empty).Trim().ToUpperInvariant();
        var currency = (request.Currency ?? "INR").Trim().ToUpperInvariant();
        var customerPart = request.CustomerId.HasValue && request.CustomerId.Value > 0 ? request.CustomerId.Value.ToString() : "AUTO";
        var datePart = request.PaymentDate?.ToUniversalTime().ToString("yyyy-MM-dd") ?? string.Empty;

        var raw = $"{tenantId}|{customerPart}|{request.Amount:F2}|{currency}|{method}|{datePart}|{allocPart}|{primaryRef}";
        var bytes = SHA256.HashData(Encoding.UTF8.GetBytes(raw));
        return Convert.ToHexString(bytes);
    }

    public static string? MaskReferenceIfNeeded(PaymentMethod method, string? reference)
    {
        if (string.IsNullOrWhiteSpace(reference)) return null;
        var trimmed = reference.Trim();

        if (method == PaymentMethod.Card && trimmed.Length > 8 && trimmed.All(c => char.IsDigit(c) || c == '-' || c == ' '))
        {
            var last4 = trimmed[^4..];
            return $"****-****-{last4}";
        }

        return trimmed;
    }

    public static string? MaskReference(string? reference, PaymentMethod method)
        => MaskReferenceIfNeeded(method, reference);

    private static bool LooksLikeCardPan(string input)
    {
        var match = RawCardPanRegex.Match(input);
        if (!match.Success) return false;

        var prefixStart = Math.Max(0, match.Index - 4);
        var prefix = input[prefixStart..match.Index];
        if (Regex.IsMatch(prefix, @"[A-Za-z]"))
        {
            return false;
        }

        var digitsOnly = new string(match.Value.Where(char.IsDigit).ToArray());
        return digitsOnly.Length is >= 13 and <= 19;
    }
}
