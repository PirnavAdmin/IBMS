namespace Billing.Application.Common;

using System;
using System.Net;
using System.Net.Sockets;

/// <summary>
/// Resolves public / network reachable base URLs for the frontend portal and backend API.
/// This ensures email links (Quotation decisions, Pay Now Online) work seamlessly on mobile phones,
/// tablets, and other laptops connected to the local network or domain.
/// </summary>
public static class AppUrlResolver
{
    private static string? _configuredFrontendUrl;
    private static string? _configuredApiUrl;

    public static void Configure(string? frontendUrl, string? apiUrl)
    {
        _configuredFrontendUrl = !string.IsNullOrWhiteSpace(frontendUrl) ? frontendUrl.TrimEnd('/') : null;
        _configuredApiUrl = !string.IsNullOrWhiteSpace(apiUrl) ? apiUrl.TrimEnd('/') : null;
    }

    public static string GetFrontendBaseUrl()
    {
        if (!string.IsNullOrWhiteSpace(_configuredFrontendUrl))
        {
            if (!_configuredFrontendUrl.Contains("localhost", StringComparison.OrdinalIgnoreCase) &&
                !_configuredFrontendUrl.Contains("127.0.0.1"))
            {
                return _configuredFrontendUrl;
            }

            return _configuredFrontendUrl
                .Replace("localhost", GetLocalLanIp(), StringComparison.OrdinalIgnoreCase)
                .Replace("127.0.0.1", GetLocalLanIp());
        }

        var env = Environment.GetEnvironmentVariable("APP_FRONTEND_URL");
        if (!string.IsNullOrWhiteSpace(env))
        {
            if (!env.Contains("localhost", StringComparison.OrdinalIgnoreCase) &&
                !env.Contains("127.0.0.1"))
            {
                return env.TrimEnd('/');
            }

            return env.TrimEnd('/')
                .Replace("localhost", GetLocalLanIp(), StringComparison.OrdinalIgnoreCase)
                .Replace("127.0.0.1", GetLocalLanIp());
        }

        return $"http://{GetLocalLanIp()}:3000";
    }

    public static string GetApiBaseUrl()
    {
        if (!string.IsNullOrWhiteSpace(_configuredApiUrl))
        {
            if (!_configuredApiUrl.Contains("localhost", StringComparison.OrdinalIgnoreCase) &&
                !_configuredApiUrl.Contains("127.0.0.1"))
            {
                return _configuredApiUrl;
            }

            return _configuredApiUrl
                .Replace("localhost", GetLocalLanIp(), StringComparison.OrdinalIgnoreCase)
                .Replace("127.0.0.1", GetLocalLanIp());
        }

        var env = Environment.GetEnvironmentVariable("APP_API_URL");
        if (!string.IsNullOrWhiteSpace(env))
        {
            if (!env.Contains("localhost", StringComparison.OrdinalIgnoreCase) &&
                !env.Contains("127.0.0.1"))
            {
                return env.TrimEnd('/');
            }

            return env.TrimEnd('/')
                .Replace("localhost", GetLocalLanIp(), StringComparison.OrdinalIgnoreCase)
                .Replace("127.0.0.1", GetLocalLanIp());
        }

        return $"http://{GetLocalLanIp()}:5271";
    }

    public static string GetLocalLanIp()
    {
        try
        {
            using var socket = new Socket(AddressFamily.InterNetwork, SocketType.Dgram, 0);
            socket.Connect("8.8.8.8", 65530);
            if (socket.LocalEndPoint is IPEndPoint endPoint)
            {
                var ip = endPoint.Address.ToString();
                if (!string.IsNullOrWhiteSpace(ip) && !ip.StartsWith("127."))
                {
                    return ip;
                }
            }
        }
        catch { }

        try
        {
            var host = Dns.GetHostEntry(Dns.GetHostName());
            foreach (var ip in host.AddressList)
            {
                if (ip.AddressFamily == AddressFamily.InterNetwork && !IPAddress.IsLoopback(ip))
                {
                    return ip.ToString();
                }
            }
        }
        catch { }

        return "localhost";
    }
}
