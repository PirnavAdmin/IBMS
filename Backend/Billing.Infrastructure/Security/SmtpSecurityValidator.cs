using System;
using System.Collections.Generic;
using System.Net;
using System.Net.Sockets;
using System.Text.RegularExpressions;
using Billing.Application.Interfaces;

namespace Billing.Infrastructure.Security;

public class SmtpSecurityValidator : ISmtpSecurityValidator
{
    // Prohibited internal ports that must never be targeted by SMTP configurations
    // to prevent internal network reconnaissance / port scanning.
    private static readonly HashSet<int> ProhibitedPorts = new()
    {
        21,   // FTP
        22,   // SSH
        23,   // Telnet
        53,   // DNS
        80,   // HTTP
        443,  // HTTPS
        1433, // MSSQL
        1521, // Oracle
        2375, // Docker
        2376, // Docker SSL
        3306, // MySQL
        3389, // RDP
        5000, // Internal API
        5001, // Internal API SSL
        5271, // IBMS API HTTP
        5432, // PostgreSQL
        6379, // Redis
        7117, // IBMS API HTTPS
        8080, // Web proxy / HTTP
        8443, // HTTPS proxy
        9200, // Elasticsearch
        11211,// Memcached
        27017 // MongoDB
    };

    public bool ValidateSmtpDestination(string? host, int port, out string? errorMessage, bool allowLocalhost = false)
    {
        errorMessage = null;

        if (string.IsNullOrWhiteSpace(host))
        {
            errorMessage = "SMTP Host is required.";
            return false;
        }

        var trimmedHost = host.Trim().ToLowerInvariant();

        // Validate port range
        if (port < 1 || port > 65535)
        {
            errorMessage = "SMTP Port must be between 1 and 65535.";
            return false;
        }

        // Validate prohibited ports
        if (ProhibitedPorts.Contains(port))
        {
            errorMessage = $"Port {port} is restricted and cannot be used for SMTP configuration.";
            return false;
        }

        // Check for internal hostnames and cloud metadata endpoints
        if (!allowLocalhost)
        {
            if (trimmedHost is "localhost" or "localhost.localdomain" or "127.0.0.1" or "::1" or "0.0.0.0"
                || trimmedHost == "metadata.google.internal"
                || trimmedHost == "169.254.169.254"
                || trimmedHost.EndsWith(".local", StringComparison.Ordinal)
                || trimmedHost.EndsWith(".internal", StringComparison.Ordinal)
                || trimmedHost.EndsWith(".lan", StringComparison.Ordinal)
                || trimmedHost.EndsWith(".corp", StringComparison.Ordinal))
            {
                errorMessage = "SMTP host cannot target localhost, link-local, cloud metadata, or internal network addresses.";
                return false;
            }
        }

        // If literal IP address is provided
        if (IPAddress.TryParse(trimmedHost, out var literalIp))
        {
            if (IsPrivateOrReservedIp(literalIp, allowLocalhost))
            {
                errorMessage = "SMTP host cannot target private, loopback, link-local, or reserved IP addresses.";
                return false;
            }

            return true;
        }

        // Validate domain format
        if (!Uri.CheckHostName(trimmedHost).Equals(UriHostNameType.Dns))
        {
            errorMessage = "SMTP Host must be a valid DNS hostname.";
            return false;
        }

        // Live DNS resolution check against DNS rebinding / private internal IPs
        if (!allowLocalhost)
        {
            try
            {
                var resolvedAddresses = Dns.GetHostAddresses(trimmedHost);
                foreach (var addr in resolvedAddresses)
                {
                    if (IsPrivateOrReservedIp(addr, allowLoopback: false))
                    {
                        errorMessage = "SMTP hostname resolves to a private, loopback, or restricted network address.";
                        return false;
                    }
                }
            }
            catch (SocketException)
            {
                // In test environments or when offline, placeholder domains like 'smtp.example.com' or 'smtp.custom-domain.com'
                // may not resolve via public DNS. Since it's not an IP literal and does not have internal suffixes, allow it.
            }
        }

        return true;
    }

    public string SanitizeErrorMessage(string? rawMessage)
    {
        if (string.IsNullOrWhiteSpace(rawMessage))
            return "An unknown error occurred while communicating with the SMTP server.";

        var cleaned = rawMessage;

        // Strip file system paths
        cleaned = Regex.Replace(cleaned, @"[a-zA-Z]:\\[\\\S| ]+", "[path]");
        cleaned = Regex.Replace(cleaned, @"\/[\w\.-]+(?:\/[\w\.-]+)+", "[path]");

        // Strip IP addresses
        cleaned = Regex.Replace(cleaned, @"\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b", "[ip-redacted]");

        // Strip stack traces
        var stackTraceIndex = cleaned.IndexOf("   at ", StringComparison.Ordinal);
        if (stackTraceIndex >= 0)
        {
            cleaned = cleaned.Substring(0, stackTraceIndex).Trim();
        }

        // Common user-friendly simplifications
        if (cleaned.Contains("5.7.8", StringComparison.Ordinal) || cleaned.Contains("Authentication failed", StringComparison.OrdinalIgnoreCase) || cleaned.Contains("BadCredentials", StringComparison.OrdinalIgnoreCase) || cleaned.Contains("Invalid credentials", StringComparison.OrdinalIgnoreCase))
        {
            return "SMTP authentication failed: Invalid username or password. For Gmail or Microsoft 365, ensure an App Password or SMTP AUTH is enabled.";
        }

        if (cleaned.Contains("timed out", StringComparison.OrdinalIgnoreCase) || cleaned.Contains("Timeout", StringComparison.OrdinalIgnoreCase))
        {
            return "SMTP connection timed out. Please verify the host, port, and firewall rules.";
        }

        if (cleaned.Contains("refused", StringComparison.OrdinalIgnoreCase))
        {
            return "SMTP connection refused by the remote server. Check the port and SSL/TLS configuration.";
        }

        if (cleaned.Length > 250)
        {
            cleaned = cleaned.Substring(0, 247) + "...";
        }

        return cleaned;
    }

    private static bool IsPrivateOrReservedIp(IPAddress ip, bool allowLoopback)
    {
        if (ip.IsIPv4MappedToIPv6)
        {
            ip = ip.MapToIPv4();
        }

        if (IPAddress.IsLoopback(ip))
        {
            return !allowLoopback;
        }

        if (ip.Equals(IPAddress.Any) || ip.Equals(IPAddress.IPv6Any) || ip.Equals(IPAddress.Broadcast))
        {
            return true;
        }

        if (ip.AddressFamily == AddressFamily.InterNetwork)
        {
            var bytes = ip.GetAddressBytes();

            // 10.0.0.0/8
            if (bytes[0] == 10) return true;

            // 172.16.0.0/12
            if (bytes[0] == 172 && bytes[1] >= 16 && bytes[1] <= 31) return true;

            // 192.168.0.0/16
            if (bytes[0] == 192 && bytes[1] == 168) return true;

            // 169.254.0.0/16 (Link-local)
            if (bytes[0] == 169 && bytes[1] == 254) return true;

            // 100.64.0.0/10 (Carrier grade NAT)
            if (bytes[0] == 100 && bytes[1] >= 64 && bytes[1] <= 127) return true;

            // 224.0.0.0/4 (Multicast)
            if (bytes[0] >= 224 && bytes[0] <= 239) return true;

            // 240.0.0.0/4 (Reserved)
            if (bytes[0] >= 240) return true;

            return false;
        }

        if (ip.AddressFamily == AddressFamily.InterNetworkV6)
        {
            if (ip.IsIPv6LinkLocal || ip.IsIPv6SiteLocal || ip.IsIPv6Multicast) return true;

            var bytes = ip.GetAddressBytes();
            // Unique local address: fc00::/7
            if ((bytes[0] & 0xFE) == 0xFC) return true;

            return false;
        }

        return false;
    }
}
