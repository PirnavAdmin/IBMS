import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Autocomplete,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  MenuItem,
  TextField,
} from "@mui/material";
import {
  Add,
  DeleteOutline,
  VisibilityOutlined,
  SaveOutlined,
} from "@mui/icons-material";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  invoiceService,
  invoiceError,
  financialBlockers,
  invalidateInvoices,
  createSubmissionGuard,
} from "./services/invoiceService";
import {
  blankInvoice,
  blankItem,
  formFromInvoice,
  validateInvoice,
  invoiceDto,
  calculationDto,
  productToItem,
} from "./validation/invoiceValidation";
import {
  InvoiceShell,
  InvoiceState,
  InvoiceTotals,
  InvoiceValues,
  useDebounced,
  useInvoiceUser,
  money,
} from "./components/InvoiceShared";
import { InvoiceDocument } from "./components/InvoiceDocument";
import { numberingService } from "../NumberingSettings/services/numberingService";
function ProductSelect({ item, onSelect, error, disabled }) {
  const [search, setSearch] = useState("");
  const term = useDebounced(search);
  const products = useQuery({
    queryKey: ["invoices", "products", term],
    queryFn: () => invoiceService.products(term),
    enabled: !disabled,
    retry: false,
  });
  const selected = item.productId
    ? { id: Number(item.productId), name: item.productName || item.description }
    : null;
  const options = products.data?.items || [];
  return (
    <div>
      <Autocomplete
        options={options}
        filterOptions={(values) => values}
        value={selected}
        disabled={disabled}
        loading={products.isFetching}
        getOptionLabel={(option) => option.name || ""}
        isOptionEqualToValue={(a, b) => a.id === b.id}
        onInputChange={(_, value, reason) => {
          if (reason === "input") setSearch(value);
        }}
        onChange={(_, value) => onSelect(value)}
        renderInput={(params) => (
          <TextField
            {...params}
            size="small"
            required
            label="Product / Service"
            error={Boolean(error)}
            helperText={error}
          />
        )}
      />
      {products.error && (
        <Alert
          severity="error"
          action={<Button onClick={() => products.refetch()}>Retry</Button>}
        >
          {invoiceError(products.error)}
        </Alert>
      )}
    </div>
  );
}
export function InvoiceForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const client = useQueryClient();
  const user = useInvoiceUser();
  const [form, setForm] = useState(blankInvoice);
  const [loaded, setLoaded] = useState(!id);
  const [errors, setErrors] = useState({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [customerSearch, setCustomerSearch] = useState("");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [chargeId, setChargeId] = useState("");
  const guard = useRef(createSubmissionGuard());
  const term = useDebounced(customerSearch);
  const persisted = useQuery({
    queryKey: ["invoice", id],
    queryFn: () => invoiceService.get(id),
    enabled: Boolean(id) && user.permissions.view,
    retry: false,
    staleTime: 0,
  });
  useEffect(() => {
    setForm(blankInvoice());
    setLoaded(!id);
    setErrors({});
    setError("");
  }, [id]);
  useEffect(() => {
    if (persisted.data && !loaded) {
      setForm(formFromInvoice(persisted.data));
      setLoaded(true);
    }
  }, [persisted.data, loaded]);
  const customers = useQuery({
    queryKey: ["invoices", "customers", term],
    queryFn: () => invoiceService.customers(term),
    enabled: user.permissions.view,
    retry: false,
  });
  const customer = useQuery({
    queryKey: ["invoices", "customer", form.customerId],
    queryFn: () => invoiceService.customer(form.customerId),
    enabled: Boolean(form.customerId) && user.permissions.view,
    retry: false,
  });
  const taxes = useQuery({
    queryKey: ["invoices", "taxes"],
    queryFn: () => invoiceService.taxes(),
    enabled: user.permissions.view,
    retry: false,
  });
  const discounts = useQuery({
    queryKey: ["invoices", "discount-settings"],
    queryFn: () => invoiceService.discountSettings(),
    enabled: user.permissions.view,
    retry: false,
  });
  const charges = useQuery({
    queryKey: ["invoices", "charges"],
    queryFn: () => invoiceService.charges(),
    enabled: user.permissions.view,
    retry: false,
  });
  const numbering = useQuery({
    queryKey: ["numbering", "Invoice"],
    queryFn: () => numberingService.getSettings("Invoice"),
    enabled: user.permissions.view,
    retry: false,
    staleTime: 0,
  });
  const numberPreview = useQuery({
    queryKey: [
      "numbering",
      "invoice-preview",
      numbering.data,
      form.invoiceDate,
    ],
    queryFn: () =>
      numberingService.preview({
        ...numbering.data,
        date: `${form.invoiceDate}T00:00:00Z`,
      }),
    enabled: Boolean(numbering.data && form.invoiceDate),
    retry: false,
    staleTime: 0,
  });
  const blockers = financialBlockers(persisted.data || { items: form.items });
  const editable =
    loaded &&
    (!id || persisted.data?.status === "Draft") &&
    !blockers.length &&
    user.permissions.manage;
  const valid = Object.keys(validateInvoice(form)).length === 0;
  const debounceForm = useDebounced(form, 350);
  const calculation = useQuery({
    queryKey: ["invoices", "calculation", debounceForm],
    queryFn: () => invoiceService.calculate(calculationDto(debounceForm)),
    enabled:
      editable && Object.keys(validateInvoice(debounceForm)).length === 0,
    retry: false,
    staleTime: 0,
  });
  const freshCalculation = debounceForm === form ? calculation.data : null;
  const rates = (taxes.data?.taxRates || []).filter(
    (rate) =>
      rate.isActive &&
      !rate.isInclusive &&
      !rate.isCompound &&
      ["Item", "Both"].includes(rate.applicationLevel),
  );
  const configuredCharges = (charges.data || []).filter(
    (charge) =>
      charge.status === "Active" &&
      charge.calculationType === "Fixed" &&
      !charge.taxable,
  );
  const change = (key, value) => {
    setForm((previous) => ({ ...previous, [key]: value }));
    setErrors((previous) => ({ ...previous, [key]: "" }));
  };
  const changeItem = (index, key, value) => {
    setForm((previous) => ({
      ...previous,
      items: previous.items.map((item, i) =>
        i === index ? { ...item, [key]: value } : item,
      ),
    }));
  };
  const chooseCustomer = (value) => {
    change("customerId", value ? String(value.id) : "");
  };
  useEffect(() => {
    if (
      !id &&
      customer.data &&
      form.customerId === String(customer.data.id) &&
      !form.currency
    )
      change("currency", customer.data.currency?.toUpperCase() || "");
  }, [customer.data, form.customerId, form.currency, id]);
  async function chooseProduct(index, option) {
    if (!guard.current.acquire()) return;
    setBusy(true);
    setError("");
    try {
      if (!option) {
        setForm((previous) => ({
          ...previous,
          items: previous.items.map((item, i) =>
            i === index ? blankItem() : item,
          ),
        }));
        return;
      }
      await invoiceService.validateProduct(option.id);
      const product = await invoiceService.product(option.id);
      if (product.currency !== form.currency)
        throw new Error(
          `Product currency ${product.currency} does not match invoice currency ${form.currency || "(select currency first)"}.`,
        );
      const item = productToItem(product, rates);
      setForm((previous) => ({
        ...previous,
        items: previous.items.map((old, i) => (i === index ? item : old)),
      }));
    } catch (e) {
      setError(invoiceError(e));
    } finally {
      guard.current.release();
      setBusy(false);
    }
  }
  async function applyCharge() {
    if (!freshCalculation || !guard.current.acquire()) return;
    setBusy(true);
    setError("");
    try {
      const result = await invoiceService.calculateCharges(
        freshCalculation.grossSubtotal,
        chargeId ? [Number(chargeId)] : [],
      );
      if (!Number.isFinite(result.totalCharges))
        throw new Error("Invalid charges calculation response.");
      change("chargesAmount", String(result.totalCharges));
    } catch (e) {
      setError(invoiceError(e));
    } finally {
      guard.current.release();
      setBusy(false);
    }
  }
  async function save(event) {
    event.preventDefault();
    const validation = validateInvoice(form);
    setErrors(validation);
    if (Object.keys(validation).length || !editable || !guard.current.acquire())
      return;
    setBusy(true);
    setError("");
    try {
      if (taxes.error || taxes.isPending)
        throw new Error("Load the tax settings before saving the invoice.");
      if (
        taxes.data?.pricesIncludeTax &&
        form.items.some((item) => Number(item.taxRate) > 0)
      )
        throw new Error(
          "Inclusive tax pricing cannot be persisted by the current invoice backend.",
        );
      const currentCustomer = await invoiceService.customer(form.customerId);
      if (
        currentCustomer.isActive === false ||
        String(currentCustomer.status).toLowerCase() === "inactive"
      )
        throw new Error("Select an active customer.");
      if (
        currentCustomer.currency &&
        currentCustomer.currency !== form.currency
      )
        throw new Error(
          "Invoice currency must match the selected customer currency.",
        );
      await Promise.all(
        form.items.map((item) =>
          invoiceService.validateProduct(item.productId),
        ),
      );
      const computed = await invoiceService.calculate(calculationDto(form));
      if (Number(form.discountAmount) > 0) {
        const validation = await invoiceService.validateDiscount(
          form.discountAmount,
          computed.grossSubtotal,
        );
        if (!validation.isValid)
          throw new Error(validation.message || "Discount validation failed.");
      }
      const saved = await invoiceService.save(
        id,
        invoiceDto(form, Boolean(id)),
      );
      await invalidateInvoices(client);
      navigate(`/invoices/${saved.id}`, {
        replace: true,
        state: {
          invoiceNotice:
            "Draft saved. Totals and version are the values returned by the billing server.",
        },
      });
    } catch (e) {
      setError(invoiceError(e));
    } finally {
      guard.current.release();
      setBusy(false);
    }
  }
  async function reload() {
    if (busy) return;
    const result = await persisted.refetch();
    if (result.data && !result.error) {
      setForm(formFromInvoice(result.data));
      setError("");
      setErrors({});
      setLoaded(true);
    }
  }
  const field = (key, label, type = "text", extra = {}) => (
    <TextField
      label={label}
      type={type}
      value={form[key]}
      onChange={(event) => change(key, event.target.value)}
      error={Boolean(errors[key])}
      helperText={errors[key]}
      {...(type === "date" ? { InputLabelProps: { shrink: true } } : {})}
      {...extra}
    />
  );
  return (
    <InvoiceShell
      title={id ? "Edit Invoice" : "Create Invoice"}
      subtitle={
        id
          ? `Update draft invoice ${id}.`
          : "Create a new customer invoice with products, taxes and billing details."
      }
      actions={
        <Button component={Link} to="/invoices" disabled={busy}>
          Back to invoices
        </Button>
      }
    >
      <InvoiceState
        loading={user.isPending || (id && persisted.isPending)}
        error={user.error || persisted.error}
        retry={() => {
          user.refetch();
          persisted.refetch();
        }}
      />
      {loaded && id && persisted.data?.status !== "Draft" && (
        <Alert severity="warning">
          Only Draft invoices can be edited.{" "}
          <Link to={`/invoices/${id}`}>View invoice</Link>
        </Alert>
      )}
      {blockers.map((text) => (
        <Alert key={text} severity="warning">
          {text}
        </Alert>
      ))}
      {!user.isPending && !user.permissions.manage && (
        <Alert severity="warning">
          Invoice creation and editing require TenantAdmin or SuperAdmin.
        </Alert>
      )}
      <form onSubmit={save} noValidate>
        <fieldset className="invoice-fieldset" disabled={busy || !editable}>
          <section className="invoice-panel">
            <h2>Customer &amp; invoice information</h2>
            <div className="invoice-form-grid">
              <Autocomplete
                options={customers.data?.items || []}
                filterOptions={(values) => values}
                value={customer.data || null}
                loading={customers.isFetching}
                getOptionLabel={(option) => option.name}
                isOptionEqualToValue={(a, b) => a.id === b.id}
                onInputChange={(_, value, reason) => {
                  if (reason === "input") setCustomerSearch(value);
                }}
                onChange={(_, value) => chooseCustomer(value)}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    required
                    label="Customer"
                    error={Boolean(errors.customerId)}
                    helperText={errors.customerId}
                  />
                )}
              />
              <TextField
                label="Invoice number"
                value={
                  numberPreview.data?.fullPreview || "Auto-generated on issue"
                }
                InputProps={{ readOnly: true }}
                helperText="Advisory preview; final number is assigned by the backend."
              />
              {field("invoiceDate", "Invoice date", "date", { required: true })}
              {field("dueDate", "Due date", "date", { required: true })}
              {field("currency", "Currency", "text", {
                required: true,
                inputProps: { maxLength: 3 },
                InputProps: { readOnly: Boolean(id) },
                helperText: id
                  ? "Currency changes are not persisted by the current draft update API."
                  : errors.currency,
              })}
              {field("reference", "Reference")}
            </div>
            <InvoiceState
              error={customers.error || customer.error}
              retry={() => {
                customers.refetch();
                customer.refetch();
              }}
            />
            <InvoiceState
              error={numbering.error || numberPreview.error}
              retry={() => {
                numbering.refetch();
                if (form.invoiceDate) numberPreview.refetch();
              }}
            />
            {customer.data && (
              <InvoiceValues
                values={[
                  [
                    "Current billing address",
                    [
                      customer.data.address,
                      customer.data.city,
                      customer.data.state,
                      customer.data.postalCode,
                      customer.data.country,
                    ]
                      .filter(Boolean)
                      .join(", "),
                  ],
                  ["Email", customer.data.email],
                  ["Payment terms", customer.data.paymentTerms],
                ]}
              />
            )}
          </section>
          <section className="invoice-panel">
            <div className="invoice-section-heading">
              <div>
                <h2>Line items</h2>
                <p>
                  Select real products or services. Historical drafts keep their
                  saved rates until you select another product.
                </p>
              </div>
              <Button
                startIcon={<Add />}
                onClick={() => {
                  setForm((previous) => ({
                    ...previous,
                    items: [...previous.items, blankItem()],
                  }));
                }}
              >
                Add Line
              </Button>
            </div>
            <InvoiceState error={taxes.error} retry={() => taxes.refetch()} />
            <div className="invoice-table-scroll">
              <table className="invoice-table invoice-edit-table">
                <thead>
                  <tr>
                    <th>Product / Service &amp; description</th>
                    <th>HSN/SAC / Unit</th>
                    <th>Quantity</th>
                    <th>Unit Price</th>
                    <th>Discount</th>
                    <th>Tax</th>
                    <th className="numeric">Tax amount</th>
                    <th className="numeric">Line total</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {form.items.map((item, index) => (
                    <tr key={index}>
                      <td>
                        <ProductSelect
                          item={item}
                          disabled={
                            busy ||
                            !editable ||
                            !form.currency ||
                            taxes.isPending ||
                            Boolean(taxes.error)
                          }
                          onSelect={(value) => chooseProduct(index, value)}
                          error={errors[`items.${index}.productId`]}
                        />
                        <TextField
                          size="small"
                          label="Description"
                          value={item.description}
                          onChange={(event) =>
                            changeItem(index, "description", event.target.value)
                          }
                          error={Boolean(errors[`items.${index}.description`])}
                          helperText={errors[`items.${index}.description`]}
                        />
                        {item.taxCategory && !item.taxType && (
                          <small>
                            Tax category: {item.taxCategory}. Select a
                            configured rate.
                          </small>
                        )}
                      </td>
                      <td>
                        <TextField
                          size="small"
                          label="HSN/SAC"
                          value={item.hsnsac || ""}
                          onChange={(event) =>
                            changeItem(index, "hsnsac", event.target.value)
                          }
                        />
                        <small>{item.unit || "\u2014"}</small>
                      </td>
                      <td>
                        <TextField
                          size="small"
                          required
                          type="number"
                          label="Quantity"
                          value={item.quantity}
                          onChange={(event) =>
                            changeItem(index, "quantity", event.target.value)
                          }
                          inputProps={{ min: 0.01, max: 999999, step: 0.0001 }}
                          error={Boolean(errors[`items.${index}.quantity`])}
                          helperText={errors[`items.${index}.quantity`]}
                        />
                      </td>
                      <td>
                        <TextField
                          size="small"
                          required
                          type="number"
                          label="Price"
                          value={item.unitPrice}
                          onChange={(event) =>
                            changeItem(index, "unitPrice", event.target.value)
                          }
                          inputProps={{ min: 0.01, step: 0.01 }}
                          error={Boolean(errors[`items.${index}.unitPrice`])}
                          helperText={errors[`items.${index}.unitPrice`]}
                        />
                      </td>
                      <td>
                        <span title="Line discount recalculation requires a backend fix.">
                          Unavailable
                        </span>
                      </td>
                      <td>
                        <TextField
                          select
                          size="small"
                          label="Tax"
                          error={Boolean(errors[`items.${index}.taxRate`])}
                          helperText={errors[`items.${index}.taxRate`]}
                          value={
                            item.taxType
                              ? `${item.taxType}|${item.taxRate}`
                              : ""
                          }
                          disabled={Boolean(taxes.error) || taxes.isPending}
                          onChange={(event) => {
                            const [taxType, taxRate] =
                              event.target.value.split("|");
                            setForm((previous) => ({
                              ...previous,
                              items: previous.items.map((old, i) =>
                                i === index
                                  ? {
                                      ...old,
                                      taxType: taxType || "",
                                      taxRate: taxRate || "",
                                    }
                                  : old,
                              ),
                            }));
                          }}
                        >
                          <MenuItem value="">No item tax</MenuItem>
                          {item.taxType &&
                            !rates.some(
                              (rate) =>
                                rate.taxType === item.taxType &&
                                String(rate.rate) === String(item.taxRate),
                            ) && (
                              <MenuItem
                                value={`${item.taxType}|${item.taxRate}`}
                              >
                                Saved {item.taxType} {item.taxRate}%
                              </MenuItem>
                            )}
                          {rates.map((rate) => (
                            <MenuItem
                              key={rate.id}
                              value={`${rate.taxType}|${rate.rate}`}
                            >
                              {rate.name} / {rate.rate}%
                            </MenuItem>
                          ))}
                        </TextField>
                      </td>
                      <td className="numeric">
                        {money(
                          freshCalculation?.items?.[index]?.taxAmount,
                          form.currency,
                        )}
                      </td>
                      <td className="numeric">
                        {money(
                          freshCalculation?.items?.[index]?.lineTotal,
                          form.currency,
                        )}
                      </td>
                      <td>
                        <IconButton
                          aria-label={`Remove line ${index + 1}`}
                          disabled={form.items.length === 1}
                          onClick={() => {
                            setForm((previous) => ({
                              ...previous,
                              items: previous.items.filter(
                                (_, i) => i !== index,
                              ),
                            }));
                          }}
                        >
                          <DeleteOutline />
                        </IconButton>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {errors.items && <Alert severity="error">{errors.items}</Alert>}
            <p className="invoice-footnote">
              Line discounts, inclusive/compound taxes and detailed charge tax
              persistence require backend support. This form uses the supported
              single exclusive item tax.
            </p>
          </section>
          <div className="invoice-form-bottom">
            <div>
              <section className="invoice-panel">
                <h2>Discounts &amp; additional charges</h2>
                <InvoiceState
                  error={discounts.error || charges.error}
                  retry={() => {
                    discounts.refetch();
                    charges.refetch();
                  }}
                />
                <div className="invoice-form-grid">
                  {field(
                    "discountAmount",
                    "Invoice discount (fixed)",
                    "number",
                    {
                      inputProps: { min: 0, step: 0.01 },
                      disabled:
                        discounts.isPending ||
                        Boolean(discounts.error) ||
                        discounts.data?.status !== "Active" ||
                        discounts.data?.allowInvoiceLevel === false,
                    },
                  )}
                  <TextField
                    label="Persisted charge amount"
                    value={form.chargesAmount}
                    InputProps={{ readOnly: true }}
                    helperText="Calculated from enabled, fixed, non-taxable charge settings."
                  />
                  <TextField
                    select
                    label="Configured charge"
                    value={chargeId}
                    onChange={(event) => setChargeId(event.target.value)}
                  >
                    <MenuItem value="">No additional charge</MenuItem>
                    {configuredCharges.map((charge) => (
                      <MenuItem key={charge.id} value={String(charge.id)}>
                        {charge.name}
                      </MenuItem>
                    ))}
                  </TextField>
                  <Button
                    onClick={applyCharge}
                    disabled={
                      !freshCalculation ||
                      charges.isPending ||
                      Boolean(charges.error)
                    }
                  >
                    Apply configured charge
                  </Button>
                </div>
                <p className="invoice-footnote">
                  Discount limits are validated by the existing configuration
                  API. Override reasons and richer discount rules cannot be
                  persisted in the invoice contract.
                </p>
              </section>
              <section className="invoice-panel">
                <h2>Notes &amp; terms</h2>
                <div className="invoice-form-grid">
                  {field("notes", "Notes", "text", {
                    multiline: true,
                    minRows: 3,
                  })}
                  {field("termsAndConditions", "Terms & conditions", "text", {
                    multiline: true,
                    minRows: 3,
                  })}
                </div>
              </section>
            </div>
            <div>
              <InvoiceState
                loading={calculation.isFetching}
                error={valid ? calculation.error : null}
                retry={() => calculation.refetch()}
              />
              <InvoiceTotals
                calculation={freshCalculation}
                currency={form.currency}
              />
              <p className="invoice-footnote">
                The invoice backend applies whole-unit rounding on Save/Issue.
                Saved totals replace this preview.
              </p>
            </div>
          </div>
          {error && (
            <Alert
              severity="error"
              action={id && <Button onClick={reload}>Reload latest</Button>}
            >
              {error}
            </Alert>
          )}
          <div className="invoice-form-actions">
            <Button component={Link} to={id ? `/invoices/${id}` : "/invoices"}>
              Cancel
            </Button>
            <Button
              variant="outlined"
              startIcon={<VisibilityOutlined />}
              disabled={!freshCalculation}
              onClick={() => setPreviewOpen(true)}
            >
              Preview
            </Button>
            <Button
              type="submit"
              variant="contained"
              startIcon={<SaveOutlined />}
              disabled={
                busy ||
                !editable ||
                calculation.isFetching ||
                Boolean(customer.error)
              }
            >
              Save Draft
            </Button>
          </div>
        </fieldset>
      </form>
      <Dialog
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        fullWidth
        maxWidth="lg"
      >
        <DialogTitle>Unsaved draft preview</DialogTitle>
        <DialogContent>
          <Alert severity="info">
            This preview preserves your input. It does not allocate a number or
            generate the final invoice PDF.
          </Alert>
          <InvoiceDocument
            invoice={{ ...form, status: "Unsaved draft" }}
            calculation={freshCalculation}
            customer={customer.data}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPreviewOpen(false)}>Back to Edit</Button>
        </DialogActions>
      </Dialog>
    </InvoiceShell>
  );
}
export default InvoiceForm;
