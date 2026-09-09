using System.Security.Claims;
using System.Text;
using Billing.API.Controllers;
using Billing.Application;
using Billing.Application.Common;
using Billing.Application.Interfaces;
using Billing.Application.Services;
using Billing.Infrastructure.Data;
using Billing.Infrastructure.Repositories;
using Billing.Infrastructure.Services;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using Microsoft.OpenApi;

var builder = WebApplication.CreateBuilder(args);

// ============================================================
// Controllers
// ============================================================
builder.Services.AddControllers()
    .AddApplicationPart(typeof(AuthController).Assembly)
    .AddJsonOptions(options =>
    {
        options.JsonSerializerOptions.AllowTrailingCommas = true;
        options.JsonSerializerOptions.ReadCommentHandling = System.Text.Json.JsonCommentHandling.Skip;
    });

// ============================================================
// CORS
// ============================================================
builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowAll", policy =>
    {
        policy.SetIsOriginAllowed(_ => true)
              .AllowAnyMethod()
              .AllowAnyHeader()
              .AllowCredentials();
    });
});

// ============================================================
// JWT Configuration
// ============================================================
var jwtSettings = new JwtSettings();

builder.Configuration
    .GetSection(JwtSettings.SectionName)
    .Bind(jwtSettings);

// Legacy configuration fallbacks
var legacyKey = builder.Configuration["Jwt:Key"];

if (!string.IsNullOrWhiteSpace(legacyKey))
{
    jwtSettings.SecretKey = legacyKey;
}

var legacyExpiry = builder.Configuration["Jwt:ExpiryMinutes"];

if (!string.IsNullOrWhiteSpace(legacyExpiry) &&
    int.TryParse(legacyExpiry, out var expMin))
{
    jwtSettings.AccessTokenExpirationMinutes = expMin;
}

var legacyIssuer = builder.Configuration["Jwt:Issuer"];

if (!string.IsNullOrWhiteSpace(legacyIssuer))
{
    jwtSettings.Issuer = legacyIssuer;
}

var legacyAudience = builder.Configuration["Jwt:Audience"];

if (!string.IsNullOrWhiteSpace(legacyAudience))
{
    jwtSettings.Audience = legacyAudience;
}

if (string.IsNullOrWhiteSpace(jwtSettings.SecretKey))
{
    throw new InvalidOperationException(
        "JWT SecretKey is not configured. " +
        "Please add JwtSettings:SecretKey or Jwt:Key to appsettings.json."
    );
}

builder.Services.AddSingleton(jwtSettings);

// ============================================================
// Database
// ============================================================
var connectionString =
    builder.Configuration.GetConnectionString("DefaultConnection")
    ?? throw new InvalidOperationException(
        "ConnectionStrings:DefaultConnection is not configured."
    );

builder.Services.AddDbContext<BillingDbContext>(options =>
    options.UseMySql(
        connectionString,
        ServerVersion.AutoDetect(connectionString)
    )
);

// ============================================================
// Application Services
// ============================================================
builder.Services.AddScoped<IJwtTokenService, JwtTokenService>();
builder.Services.AddScoped<AuthService>();
builder.Services.AddScoped<EmailService>();
builder.Services.AddScoped<ICustomerService, CustomerService>();
builder.Services.AddScoped<IAuditService, AuditService>();
builder.Services.AddScoped<LandingPageService>();

// ============================================================
// Repositories
// ============================================================
builder.Services.AddScoped<IUserRepository, UserRepository>();
builder.Services.AddScoped<IUserSessionRepository, UserSessionRepository>();
builder.Services.AddScoped<ITenantRepository, TenantRepository>();
builder.Services.AddScoped<ICustomerRepository, CustomerRepository>();
builder.Services.AddScoped<IAuditLogRepository, AuditLogRepository>();

// ============================================================
// Authentication / JWT
// ============================================================
builder.Services.AddAuthentication(options =>
{
    options.DefaultAuthenticateScheme =
        JwtBearerDefaults.AuthenticationScheme;

    options.DefaultChallengeScheme =
        JwtBearerDefaults.AuthenticationScheme;
})
.AddJwtBearer(options =>
{
    options.RequireHttpsMetadata = false;
    options.SaveToken = true;

    options.TokenValidationParameters = new TokenValidationParameters
    {
        // JWT signature
        ValidateIssuerSigningKey = true,

        IssuerSigningKey = new SymmetricSecurityKey(
            Encoding.UTF8.GetBytes(jwtSettings.SecretKey)
        ),

        // Issuer
        ValidateIssuer = true,
        ValidIssuer = jwtSettings.Issuer,

        // Audience
        ValidateAudience = true,
        ValidAudience = jwtSettings.Audience,

        // Expiration
        ValidateLifetime = true,

        // No tolerance for expired tokens
        ClockSkew = TimeSpan.Zero
    };

    // ========================================================
    // Session-aware JWT validation
    // ========================================================
    options.Events = new JwtBearerEvents
    {
        OnTokenValidated = async context =>
        {
            var userSessionRepo =
                context.HttpContext.RequestServices
                    .GetRequiredService<IUserSessionRepository>();

            var sidClaim =
                context.Principal?.FindFirst("sessionId")?.Value
                ?? context.Principal?.FindFirst(ClaimTypes.Sid)?.Value
                ?? context.Principal?.FindFirst("sid")?.Value;

            // Session ID must exist
            if (string.IsNullOrWhiteSpace(sidClaim))
            {
                context.Fail("Session ID claim is missing.");
                return;
            }

            // Session ID must be a valid Guid
            if (!Guid.TryParse(sidClaim, out var sessionId))
            {
                context.Fail("Session ID claim is invalid.");
                return;
            }

            // Get session from database
            var session =
                await userSessionRepo.GetByIdAsync(sessionId);

            if (session == null)
            {
                context.Fail("Session not found.");
                return;
            }

            // Check revoked session
            if (session.IsRevoked)
            {
                context.Fail("Session has been revoked.");
                return;
            }

            // Check session expiration
            if (session.SessionExpiresAtUtc <= DateTime.UtcNow)
            {
                context.Fail("Session has expired.");
                return;
            }

            // =================================================
            // Inactivity timeout
            // =================================================
            if (jwtSettings.InactivityTimeoutMinutes > 0 &&
                (DateTime.UtcNow - session.LastActivityAtUtc)
                    .TotalMinutes >
                jwtSettings.InactivityTimeoutMinutes)
            {
                await userSessionRepo.RevokeSessionAsync(
                    sessionId,
                    "Session expired due to inactivity"
                );

                context.Fail(
                    "Session has expired due to inactivity."
                );

                return;
            }

            // =================================================
            // Update last activity
            // =================================================
            await userSessionRepo.UpdateActivityAsync(sessionId);
        }
    };
});

// ============================================================
// Authorization
// ============================================================
builder.Services.AddAuthorization();

// ============================================================
// Swagger / OpenAPI
// ============================================================
builder.Services.AddEndpointsApiExplorer();

builder.Services.AddSwaggerGen(options =>
{
    options.SwaggerDoc("v1", new OpenApiInfo
    {
        Title = "IBMS Billing API",
        Version = "v1",
        Description =
            "Billing Management System API with JWT Authentication " +
            "and Multi-Tenant Isolation"
    });

    // JWT Bearer authentication
    options.AddSecurityDefinition(
        "Bearer",
        new OpenApiSecurityScheme
        {
            Name = "Authorization",
            Type = SecuritySchemeType.Http,
            Scheme = "bearer",
            BearerFormat = "JWT",
            In = ParameterLocation.Header,
            Description =
                "Enter your JWT token. Example: " +
                "Bearer eyJhbGciOiJIUzI1NiIs..."
        }
    );

    options.AddSecurityRequirement(doc =>
        new OpenApiSecurityRequirement
        {
            {
                new OpenApiSecuritySchemeReference(
                    "Bearer",
                    doc
                ),
                new List<string>()
            }
        }
    );

    var apiXmlPath = Path.Combine(AppContext.BaseDirectory, "Billing.API.xml");
    if (File.Exists(apiXmlPath))
    {
        options.IncludeXmlComments(apiXmlPath);
    }

    var contractsXmlPath = Path.Combine(AppContext.BaseDirectory, "Billing.Contracts.xml");
    if (File.Exists(contractsXmlPath))
    {
        options.IncludeXmlComments(contractsXmlPath);
    }
});

// ============================================================
// Build Application
// ============================================================
var app = builder.Build();

// ============================================================
// Database Migration + Seeding
// ============================================================
using (var scope = app.Services.CreateScope())
{
    var services = scope.ServiceProvider;

    var logger =
        services.GetRequiredService<ILogger<Program>>();

    try
    {
        var context =
            services.GetRequiredService<BillingDbContext>();

        logger.LogInformation(
            "Applying pending EF Core database migrations..."
        );

        await context.Database.MigrateAsync();

        logger.LogInformation(
            "Database migrations up to date."
        );

        logger.LogInformation(
            "Executing database initializer & seeding..."
        );

        await DbInitializer.InitializeAsync(services);

        logger.LogInformation(
            "Database seeding completed."
        );
    }
    catch (Exception ex)
    {
        logger.LogError(
            ex,
            "An error occurred during database migration or seeding: {Message}",
            ex.Message
        );
    }
}

// ============================================================
// Swagger
// ============================================================
// Swagger UI will be available at:
// http://localhost:5000/swagger/index.html
// ============================================================
app.UseSwagger();

app.UseSwaggerUI(options =>
{
    options.SwaggerEndpoint(
        "/swagger/v1/swagger.json",
        "IBMS Billing API v1"
    );

    // IMPORTANT:
    // "swagger" gives the standard Swagger URL:
    // /swagger/index.html
    options.RoutePrefix = "swagger";
});

// ============================================================
// Middleware Pipeline
// ============================================================
app.UseForwardedHeaders(new ForwardedHeadersOptions
{
    ForwardedHeaders = Microsoft.AspNetCore.HttpOverrides.ForwardedHeaders.All
});

app.UseCors("AllowAll");

// Note: UseHttpsRedirection is removed to prevent 307 Temporary Redirect breaking reverse proxy (ngrok) and CORS preflight OPTIONS

app.UseAuthentication();

app.UseAuthorization();

// ============================================================
// Controllers
// ============================================================
app.MapControllers();

// Auto-redirect root URL ("/") to Swagger UI (hidden from Swagger UI documentation)
app.MapGet("/", () => Results.Redirect("/swagger")).ExcludeFromDescription();

// ============================================================
// Run
// ============================================================
app.Run();