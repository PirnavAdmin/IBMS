# Product List pricing backend blocker

Repository contract inspection, 8 October 2026. Live API responses were not tested.
No backend files were modified.

## Existing support

- `GET /api/v1/products` and `GET /api/v1/products/{id}` share `ProductDto`, mapped by `ProductService.MapToDto`.
- The response provides `price`, `currency`, `discountAllowed`, `discountPercent`, and `taxCategory`. Neither endpoint supplies an effective discount amount, tax amount/rate, or final/net/selling unit price.
- The frontend retains the API `price` sort key and formats `price` with `currency` as Unit Price. Discount displays the saved `discountPercent` only when `discountAllowed` is true. Disabled discounts display Not Applicable; missing data displays Unavailable. This is product configuration, not a resolved transaction discount.
- `taxCategory` is a free-text category, not a foreign key to Tax Settings. The Tax column preserves explicit Exempt/Not Applicable categories. Other categories display Unavailable; they are not parsed into an authoritative rate. The existing Tax Category column continues to show the original category.

## Existing calculation APIs considered

- `POST /api/v1/discounts/calculate-line` accepts a caller-selected discount type/value and returns discount amount and discounted line total. It does not resolve catalog pricing or tax; one call per product would add unnecessary requests.
- `POST /api/v1/discounts/calculate-invoice` supports line and invoice discounts, rules, role limits, and overrides. `GET /api/v1/discounts/rules` and `GET /api/v1/settings/discounts` expose rules/settings, not the applicable pricing of each product.
- `GET /api/v1/settings/taxes` supplies tenant tax settings and rate definitions (including default rate, inclusion mode, enablement, and state).
- `POST /api/v1/settings/taxes/calculate` accepts multiple items but needs tax rate IDs/codes and transaction context. It returns discount amounts, applied taxes, tax amounts, and gross amounts; its `ItemId` identifies input items and does not resolve product tax-category associations.
- `POST /api/v1/financial/calculate` accepts multiple lines and returns `discountAmount`, `taxRate`, `taxAmount`, `netAmount`, `lineTotal`, and inclusion mode. It needs caller-supplied financial inputs; `productCode` is echoed, not used to load catalog tax/discount settings. It does not resolve the product's free-text tax category. Its request also requires unit prices above zero, whereas products permit zero prices.

These APIs cannot reliably provide a catalog final unit price without the frontend choosing tax associations and calculation assumptions. No extra calculation requests or financial formulas were added.

## Missing support

1. A backend-resolved product-to-tax association, exemption status, and applicable tax rate(s).
2. A backend-resolved effective discount type/value/amount, distinguishing saved product discounts from transaction rules.
3. A calculated final unit price and the business context in which that price applies: inclusion mode, calculation order, tenant rules, currency rounding, effective date, and any required customer/location context.
4. Either enriched list results or a batch product pricing endpoint that accepts product IDs and resolves the missing data server-side. A detail request or calculation request per row is unsuitable.

## Recommended Product List response fields

Keep existing `price` and its sorting contract. Add server-calculated fields per item:

| Field | Meaning |
| --- | --- |
| `unitPrice` (optional alias for `price`) | Original product unit price |
| `currency` | Currency for all monetary fields |
| `discountAllowed` | Whether a product discount can apply |
| `discountType` | Resolved Percentage/Fixed/None |
| `discountValue` | Resolved rate or fixed value |
| `discountAmount` | Official discount amount for one unit |
| `taxRate` or `appliedTaxes[]` | Resolved tax rate(s), identifiers, and amounts |
| `taxAmount` | Official tax amount for one unit |
| `isTaxExempt` | Explicit exemption status |
| `isTaxInclusive` | Official inclusion mode |
| `finalUnitPrice` | Official final price for one unit |
| `pricingStatus` / `pricingUnavailableReason` | Distinguish unavailable/context-dependent pricing from genuine zero amounts |

The backend must calculate discount, tax, and final unit price according to official business rules. It should document the pricing context and rounding policy, and return unavailable/context-dependent pricing explicitly rather than defaulting missing values to zero. Until supported, Final Price displays Unavailable.
