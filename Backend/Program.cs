using System.Security.Claims;
using System.Text;
using System.Text.Json.Serialization;
using Billing.API.Controllers;
using Billing.API.Middleware;
using Billing.Application;
using Billing.Application.Common;
using Billing.Application.Interfaces;
using Billing.Application.Services;
using Billing.Infrastructure.Data;
using Billing.Infrastructure.Repositories;
using Billing.Infrastructure.Services;
using Billing.Infrastructure.BackgroundJobs;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using Microsoft.OpenApi;

var builder = WebApplication.CreateBuilder(args);

//
