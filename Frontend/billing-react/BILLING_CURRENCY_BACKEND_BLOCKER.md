# Billing currency configuration: backend blocker

Inspected the Settings screens, `regionalSettingsService.js`, API controllers,
tenant entities and Product create/update contracts. No implemented tenant
supported-country or billing-currency configuration GET/PUT was found.

## Existing support

- `POST /api/v1/products`, `PUT /api/v1/products/{id}` and Product reads use
  `currency`: a string (maximum 10 characters), normalized to uppercase by
  ProductService. No limited currency enum is enforced there.
- `taxCategory` is the existing trimmed string (maximum 64 characters).
- Implemented settings routes cover discounts, taxes and numbering.
- Settings → Country uses `regionalSettingsService`, which currently saves
  browser-local preferences and attempts `PUT /api/v1/settings/country`.
  That URL is referenced by the frontend only; there is no matching backend
  implementation. It is NOT a supported tenant billing-currency API.

## Safe frontend behavior implemented

- Compact ISO currency labels, searchable by country, currency name and code.
- Unique currency-code values. Existing saved/historical codes remain visible.
- Products do not consume the existing localStorage country preferences as
  tenant authorization/configuration. No new settings persistence or invented
  endpoint has been added. The full supported ISO reference remains available
  until an authoritative allowlist exists; tenant restrictions are BLOCKED.

## Required backend capability (route must be defined by backend owners)

Add an authenticated, tenant-scoped configuration read/update API under the
existing settings architecture. Suggested response fields, not an existing API:

```json
{
  "currencies": [
    {
      "countryCode": "IN",
      "countryName": "India",
      "currencyCode": "INR",
      "currencySymbol": "₹",
      "enabled": true
    }
  ],
  "rowVersion": "..."
}
```

The backend must persist enabled codes, authorize configuration updates, dedupe
shared currencies, validate ISO codes and enforce new-record eligibility.
Define the policy for editing a product whose saved currency was later disabled:
the frontend must display that saved value without replacing it; backend should
allow retaining it or return a clear validation error. Include concurrency
handling and distinguish unconfigured settings from an intentionally empty list.
Once available, Products can consume enabled codes and preserve the saved Edit
value separately. No backend files were modified.
