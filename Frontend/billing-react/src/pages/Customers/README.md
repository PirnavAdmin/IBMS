# Customers

Customer frontend code lives in `src/pages/Customers/`. Shared `billing-api-client`
and `billing-contracts` packages remain outside the feature.

- `pages/`: customer screens.
- `components/`: forms, addresses, tables, status and detail sections.
- `api/`: existing API adapters, response mapping and backend contract reference.
- `hooks/`: list, detail and mutation hooks.
- `validation/`: form validation.
- `styles/`: existing stylesheets, kept separate to preserve their cascade.
- `tests/`: customer contract tests. Cross-module and UI regression tests remain
  in `billing-react/tests/`.
- `docs/`: historical integration notes; these are not current acceptance status.

## Active routes

| Route | Page |
| --- | --- |
| `/customers` | `pages/CustomerListPage.jsx` |
| `/customers/create` | `pages/CreateCustomer.jsx` |
| `/customers/:customerId/edit` | `pages/EditCustomer.jsx` |
| `/customers/:customerId` | `pages/CustomerDetailsPage.jsx` |

`CustomerList.jsx`, `Customers.jsx`, `CustomerDetails.jsx` and
`LegacyEditCustomer.jsx` preserve alternate implementations from the previous
folders. They are not wired into the current application routes. The existing
barrel exports are preserved; routes continue to import their pages directly.

## Styles

`customer-list.css` styles the active list. `customer-form.css` imports
`customer-base.css` for create/edit forms. `customer-details.css` styles detail
screens. Keep the existing page imports and CSS order; do not combine these
stylesheets or import all of them from the barrel.

## Verification

Run from `Frontend/billing-react`:

```sh
node --test src/pages/Customers/tests/customerApi.test.mjs tests/customers.test.mjs tests/customer-regressions.test.mjs
node tests/run-customer-ui.mjs
npm run build
```
