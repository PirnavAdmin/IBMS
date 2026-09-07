using Billing.Domain.Entities;

namespace Billing.Application.Interfaces;

public interface ITokenService
{
    string GenerateAccessToken(User user);

    string GenerateRefreshToken();

    string HashToken(string token);

    int GetAccessTokenExpirySeconds();
}
