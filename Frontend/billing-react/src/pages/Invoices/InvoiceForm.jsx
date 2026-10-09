import { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Autocomplete,
  Button,
  IconButton,
  InputAdornment,
  MenuItem,
  TextField,
  Tooltip,
} from "@mui/material";
import {
  Add,
  ArrowBack,
  ArrowDownward,
  ArrowUpward,
  DeleteOutline,
  PersonOutline,
  ReceiptLongOutlined,
  SaveOutlined,
  Tag,
  LocalOfferOutlined,
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
  getTodayIso,
  getOneMonthLaterIso,
} from "./validation/invoiceValidation";
import {
  InvoiceShell,
  InvoiceState,
  InvoiceTotals,
  InvoiceValues,
  DateField,
  useDebounced,
  useInvoiceUser,
  money,
} from "./components/InvoiceShared";
import { numberingService } from "../NumberingSettings/services/numberingService";
import { useRegionalSettings } from "../../services/regionalSettingsService";
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
  const { selectedCurrencies = [] } = useRegionalSettings();
  const defaultCurrency = selectedCurrencies.length === 1 ? selectedCurrencies[0] : "";
  const [form, setForm] = useState(() => blankInvoice(defaultCurrency));
  const [loaded, setLoaded] = useState(!id);
  const [errors, setErrors] = useState({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [customerSearch, setCustomerSearch] = useState("");
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
    setForm(blankInvoice(defaultCurrency));
    setLoaded(!id);
    setErrors({});
    setError("");
  }, [id, defaultCurrency]);
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
    user.permissions.manage !== false;
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
  const rawRates = Array.isArray(taxes.data)
    ? taxes.data
    : taxes.data?.taxRates || taxes.data?.TaxRates || [];
  const rates = rawRates.filter(
    (rate) =>
      rate.isActive !== false &&
      rate.status !== "Inactive" &&
      !rate.isCompound &&
      (!rate.applicationLevel ||
        ["Item", "Both"].includes(rate.applicationLevel)),
  );
  const configuredCharges = (charges.data || []).filter(
    (charge) => charge.status === "Active",
  );
  const currentSubtotal = useMemo(() => {
    if (calculation.data?.grossSubtotal != null) {
      return calculation.data.grossSubtotal;
    }
    return (form.items || []).reduce((sum, item) => {
      const qty = Number(item.quantity) || 0;
      const price = Number(item.unitPrice) || 0;
      return sum + Math.max(0, qty * price);
    }, 0);
  }, [calculation.data?.grossSubtotal, form.items]);
  const change = (key, value) => {
    setForm((previous) => ({ ...previous, [key]: value }));
    setErrors((previous) => ({ ...previous, [key]: "" }));
  };
  const handleInvoiceDateChange = (val) => {
    setForm((previous) => {
      const next = { ...previous, invoiceDate: val };
      if (!id && /^\d{4}-\d{2}-\d{2}$/.test(val)) {
        next.dueDate = getOneMonthLaterIso(val);
      }
      return next;
    });
    setErrors((previous) => ({
      ...previous,
      invoiceDate: "",
      ...(val && /^\d{4}-\d{2}-\d{2}$/.test(val) ? { dueDate: "" } : {}),
    }));
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
    if (value?.currency && !id) {
      change("currency", value.currency.toUpperCase());
    } else if (!id && !form.currency && defaultCurrency) {
      change("currency", defaultCurrency);
    }
  };
  const moveItem = (index, direction) => {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= form.items.length) return;
    setForm((previous) => {
      const updated = [...previous.items];
      const temp = updated[index];
      updated[index] = updated[targetIndex];
      updated[targetIndex] = temp;
      return { ...previous, items: updated };
    });
  };
  const isDirty = useMemo(() => {
    if (!loaded) return false;
    const initial =
      id && persisted.data ? formFromInvoice(persisted.data) : blankInvoice();
    return (
      form.customerId !== initial.customerId ||
      form.invoiceDate !== initial.invoiceDate ||
      form.dueDate !== initial.dueDate ||
      form.currency !== initial.currency ||
      form.reference !== initial.reference ||
      form.notes !== initial.notes ||
      form.termsAndConditions !== initial.termsAndConditions ||
      form.discountAmount !== initial.discountAmount ||
      form.chargesAmount !== initial.chargesAmount ||
      form.items.length !== initial.items.length ||
      form.items.some((item, i) => {
        const initItem = initial.items[i];
        if (!initItem) return true;
        return (
          item.productId !== initItem.productId ||
          item.description !== initItem.description ||
          item.quantity !== initItem.quantity ||
          item.unitPrice !== initItem.unitPrice ||
          item.taxRate !== initItem.taxRate
        );
      })
    );
  }, [form, persisted.data, id, loaded]);
  useEffect(() => {
    const handleBeforeUnload = (event) => {
      if (isDirty && !busy) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty, busy]);
  const handleLeave = (event) => {
    if (
      isDirty &&
      !window.confirm("You have unsaved changes. Discard changes and leave?")
    ) {
      event.preventDefault();
    }
  };
  useEffect(() => {
    if (
      !id &&
      customer.data &&
      form.customerId === String(customer.data.id)
    ) {
      if (
        customer.data.currency &&
        (!form.currency || !form.items.some((i) => i.productId))
      ) {
        change("currency", customer.data.currency.toUpperCase());
      }
    }
  }, [customer.data, form.customerId, id]);
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
      const targetCurrency = form.currency || product.currency || defaultCurrency || "";
      if (!form.currency && targetCurrency) {
        change("currency", targetCurrency.toUpperCase());
      }
      const fullProduct = { ...(option || {}), ...(product || {}) };
      const item = productToItem(fullProduct, rates, targetCurrency);
      item.currency = targetCurrency;
      setForm((previous) => ({
        ...previous,
        currency: previous.currency || targetCurrency,
        items: previous.items.map((old, i) => (i === index ? item : old)),
      }));
      setErrors((previous) => {
        const next = { ...previous };
        delete next[`items.${index}.productId`];
        delete next[`items.${index}.unitPrice`];
        delete next[`items.${index}.quantity`];
        delete next[`items.${index}.taxRate`];
        delete next[`items.${index}.discountRate`];
        return next;
      });
    } catch (e) {
      setError(invoiceError(e));
    } finally {
      guard.current.release();
      setBusy(false);
    }
  }
  async function applyCharge() {
    if (!chargeId || !guard.current.acquire()) return;
    setBusy(true);
    setError("");
    try {
      const result = await invoiceService.calculateCharges(
        currentSubtotal,
        [Number(chargeId)],
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
  async function submitForm(event, shouldIssue = false) {
    if (event?.preventDefault) event.preventDefault();
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
      if (!form.currency)
        throw new Error("Currency is required.");
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
        if (!validation.isValid) {
          const msg = validation.message || "Discount validation failed.";
          setErrors((previous) => ({ ...previous, discountAmount: msg }));
          throw new Error(msg);
        }
      }
      const saved = await invoiceService.save(
        id,
        invoiceDto(form, Boolean(id), user.data?.tenantId),
      );

      if (shouldIssue) {
        if (!saved?.id) {
          throw new Error("Failed to save draft invoice before issuing.");
        }
        const issued = await invoiceService.issue(saved.id);
        await invalidateInvoices(client);
        navigate(`/invoices/${issued.id}`, {
          replace: true,
          state: {
            invoiceNotice: `Invoice created and issued successfully as ${issued.invoiceNumber || identifier(issued)}.`,
          },
        });
        return;
      }

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
      {...(type === "date" ? { InputLabelProps: { shrink: true } } : {})}
      {...extra}
      helperText={errors[key] || extra.helperText}
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
        <Button
          component={Link}
          to={id ? `/invoices/${id}` : "/invoices"}
          variant="outlined"
          startIcon={<ArrowBack />}
          disabled={busy}
          onClick={handleLeave}
        >
          Back to invoices
        </Button>
      }
    >
      <InvoiceState
        loading={id ? persisted.isPending : false}
        error={persisted.error}
        retry={() => persisted.refetch()}
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
      <form onSubmit={(e) => submitForm(e, false)} noValidate>
        <fieldset className="invoice-fieldset" disabled={busy || !editable}>
          <section className="invoice-panel invoice-customer-panel">
            <div className="invoice-section-heading">
              <div>
                <h2>Customer &amp; invoice information</h2>
                <p>
                  Select a customer to load commercial terms, billing details and tax information.
                </p>
              </div>
            </div>
            <div className="invoice-customer-selection-row">
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
                    placeholder="Search registered customer by name or company..."
                    error={Boolean(errors.customerId)}
                    helperText={errors.customerId || "Select from registered active customers"}
                    InputProps={{
                      ...params.InputProps,
                      startAdornment: (
                        <>
                          <InputAdornment position="start">
                            <PersonOutline sx={{ color: "var(--secondary)", opacity: 0.8 }} />
                          </InputAdornment>
                          {params.InputProps.startAdornment}
                        </>
                      ),
                    }}
                  />
                )}
              />
            </div>
            <InvoiceState
              error={customers.error || customer.error}
              retry={() => {
                customers.refetch();
                customer.refetch();
              }}
            />
            {customer.data && (
              <div className="invoice-customer-card">
                <div className="invoice-customer-card-header">
                  <div className="invoice-customer-avatar">
                    {customer.data.name?.charAt(0)?.toUpperCase() || "C"}
                  </div>
                  <div className="invoice-customer-meta">
                    <strong>{customer.data.name}</strong>
                    <span>{customer.data.email || "No email on record"}</span>
                  </div>
                  {customer.data.taxId && (
                    <span className="invoice-tax-id-tag">Tax ID: {customer.data.taxId}</span>
                  )}
                </div>
                <div className="invoice-customer-card-details">
                  <div className="invoice-customer-detail-group">
                    <span className="invoice-detail-label">Billing Address</span>
                    <p>
                      {[
                        customer.data.address,
                        customer.data.city,
                        customer.data.state,
                        customer.data.postalCode,
                        customer.data.country,
                      ]
                        .filter(Boolean)
                        .join(", ") || "No address supplied"}
                    </p>
                  </div>
                  <div className="invoice-customer-detail-group">
                    <span className="invoice-detail-label">Payment Terms</span>
                    <p>{customer.data.paymentTerms || "Standard / Net 30"}</p>
                  </div>
                  <div className="invoice-customer-detail-group">
                    <span className="invoice-detail-label">Commercial Currency</span>
                    <p>{customer.data.currency || form.currency || defaultCurrency || "—"}</p>
                  </div>
                </div>
              </div>
            )}
            <div className="invoice-subheading-row">
              <h3 className="invoice-subheading">Invoice details</h3>
              <span className="invoice-subheading-hint">Dates, currency and legal reference</span>
            </div>
            <div className="invoice-form-grid invoice-details-grid">
              <div className="invoice-number-card">
                <div className="invoice-number-card-top">
                  <span className="invoice-number-label">Invoice Number</span>
                  <span className="invoice-auto-tag">Auto-Generated</span>
                </div>
                <div className="invoice-number-card-body">
                  <Tag className="invoice-number-icon" sx={{ fontSize: 18, color: "var(--secondary)" }} />
                  <span>{numberPreview.data?.fullPreview || "Auto-generated on issue"}</span>
                </div>
                <span className="invoice-number-hint">Advisory preview; assigned on issue</span>
              </div>
              <DateField
                label="Invoice date"
                required
                value={form.invoiceDate}
                onChange={handleInvoiceDateChange}
                error={Boolean(errors.invoiceDate)}
                helperText={errors.invoiceDate}
                disabled={busy || !editable}
              />
              <DateField
                label="Due date"
                required
                value={form.dueDate}
                onChange={(val) => change("dueDate", val)}
                error={Boolean(errors.dueDate)}
                helperText={errors.dueDate}
                disabled={busy || !editable}
              />
              {selectedCurrencies.length > 0 ? (
                <TextField
                  select
                  size="small"
                  required
                  label="Currency"
                  disabled={busy || !editable}
                  value={form.currency || ""}
                  onChange={(event) => change("currency", event.target.value)}
                  error={Boolean(errors.currency)}
                  helperText={id ? "Currency locked on existing draft." : errors.currency}
                  InputProps={{ readOnly: Boolean(id) }}
                >
                  {!form.currency && (
                    <MenuItem value="">
                      <em>Select Currency</em>
                    </MenuItem>
                  )}
                  {selectedCurrencies.map((c) => (
                    <MenuItem key={c} value={c}>
                      {c}
                    </MenuItem>
                  ))}
                </TextField>
              ) : (
                field("currency", "Currency", "text", {
                  required: true,
                  placeholder: "e.g. USD, EUR, INR",
                  inputProps: { maxLength: 3 },
                  InputProps: { readOnly: Boolean(id) },
                  helperText: id
                    ? "Currency locked on existing draft."
                    : errors.currency,
                })
              )}
              {field("reference", "Customer PO / Reference", "text", {
                placeholder: "e.g. PO-2026-001",
                InputProps: {
                  startAdornment: (
                    <InputAdornment position="start">
                      <ReceiptLongOutlined sx={{ color: "var(--secondary)", opacity: 0.8 }} />
                    </InputAdornment>
                  ),
                },
              })}
            </div>
            <InvoiceState
              error={numbering.error || numberPreview.error}
              retry={() => {
                numbering.refetch();
                if (form.invoiceDate) numberPreview.refetch();
              }}
            />
          </section>
          <section className="invoice-panel invoice-line-items-panel">
            <div className="invoice-section-heading">
              <div>
                <h2>Line items</h2>
                <p>
                  Select real products or services. Rates, taxes and totals reflect authoritative backend calculations.
                </p>
              </div>
              <Button
                variant="contained"
                className="invoice-add-item-btn"
                startIcon={<Add />}
                onClick={() => {
                  setForm((previous) => ({
                    ...previous,
                    items: [...previous.items, blankItem()],
                  }));
                }}
              >
                Add Line Item
              </Button>
            </div>
            <InvoiceState error={taxes.error} retry={() => taxes.refetch()} />
            <div className="invoice-table-scroll">
              <table className="invoice-table invoice-edit-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Product / Service &amp; description</th>
                    <th>HSN/SAC</th>
                    <th>Quantity</th>
                    <th>Unit Price</th>
                    <th>Discount</th>
                    <th>Tax Rate</th>
                    <th>Tax amount</th>
                    <th>Line total</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {form.items.map((item, index) => (
                    <tr key={index}>
                      <td>
                        <span className="invoice-row-index">{index + 1}</span>
                      </td>
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
                          InputLabelProps={{ shrink: true }}
                          placeholder="e.g. 8471"
                          value={item.hsnsac || ""}
                          onChange={(event) =>
                            changeItem(index, "hsnsac", event.target.value)
                          }
                        />
                        {item.unit && (
                          <span className="invoice-unit-badge">{item.unit}</span>
                        )}
                      </td>
                      <td>
                        <TextField
                          size="small"
                          required
                          type="number"
                          label="Quantity"
                          InputLabelProps={{ shrink: true }}
                          placeholder="1"
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
                          label="Unit Price"
                          InputLabelProps={{ shrink: true }}
                          placeholder="0.00"
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
                        <TextField
                          size="small"
                          type="number"
                          label="Discount"
                          placeholder="0"
                          InputLabelProps={{ shrink: true }}
                          value={item.discountRate ?? ""}
                          onChange={(event) =>
                            changeItem(index, "discountRate", event.target.value)
                          }
                          inputProps={{
                            min: 0,
                            max: item.discountType === "Percentage" ? 100 : 999999999,
                            step: 0.01,
                          }}
                          InputProps={{
                            endAdornment: (
                              <InputAdornment position="end" sx={{ mr: -0.5 }}>
                                <select
                                  aria-label={`Discount type line ${index + 1}`}
                                  value={item.discountType || "Percentage"}
                                  onChange={(e) =>
                                    changeItem(index, "discountType", e.target.value)
                                  }
                                  className="invoice-line-discount-select"
                                >
                                  <option value="Percentage">%</option>
                                  <option value="Fixed">{form.currency || "Val"}</option>
                                </select>
                              </InputAdornment>
                            ),
                          }}
                          error={Boolean(errors[`items.${index}.discountRate`])}
                          helperText={
                            errors[`items.${index}.discountRate`] ||
                            (freshCalculation?.items?.[index]?.discountAmount > 0
                              ? `-${money(freshCalculation.items[index].discountAmount, form.currency)}`
                              : "")
                          }
                        />
                      </td>
                      <td>
                        <TextField
                          select
                          size="small"
                          label="Tax Rate"
                          InputLabelProps={{ shrink: true }}
                          error={Boolean(errors[`items.${index}.taxRate`])}
                          helperText={errors[`items.${index}.taxRate`]}
                          value={
                            (() => {
                              if (item.taxRate === "" || item.taxRate == null) return "";
                              const itemRateNum = Number(item.taxRate);
                              const matched =
                                rates.find(
                                  (r) =>
                                    Number(r.rate) === itemRateNum &&
                                    (!item.taxType ||
                                      String(r.taxType || r.type || "").toLowerCase() ===
                                        String(item.taxType).toLowerCase()),
                                ) || rates.find((r) => Number(r.rate) === itemRateNum);
                              if (matched) {
                                return `${matched.taxType || matched.type || "GST"}|${matched.rate}`;
                              }
                              return `${item.taxType || "GST"}|${item.taxRate}`;
                            })()
                          }
                          disabled={Boolean(taxes.error) || taxes.isPending}
                          onChange={(event) => {
                            const val = event.target.value;
                            if (!val) {
                              setForm((previous) => ({
                                ...previous,
                                items: previous.items.map((old, i) =>
                                  i === index
                                    ? {
                                        ...old,
                                        taxType: "",
                                        taxRate: "",
                                      }
                                    : old,
                                ),
                              }));
                              return;
                            }
                            const [taxType, taxRate] = val.split("|");
                            setForm((previous) => ({
                              ...previous,
                              items: previous.items.map((old, i) =>
                                i === index
                                  ? {
                                      ...old,
                                      taxType: taxType || "GST",
                                      taxRate: taxRate || "",
                                    }
                                  : old,
                              ),
                            }));
                          }}
                        >
                          <MenuItem value="">No item tax</MenuItem>
                          {item.taxRate !== "" &&
                            item.taxRate != null &&
                            !rates.some(
                              (rate) => Number(rate.rate) === Number(item.taxRate),
                            ) && (
                              <MenuItem
                                value={`${item.taxType || "GST"}|${item.taxRate}`}
                              >
                                {item.taxType || "GST"} {item.taxRate}%
                              </MenuItem>
                            )}
                          {rates.map((rate) => {
                            const rateType = rate.taxType || rate.type || "GST";
                            return (
                              <MenuItem
                                key={rate.id || `${rateType}-${rate.rate}`}
                                value={`${rateType}|${rate.rate}`}
                              >
                                {rate.name || `${rateType} ${rate.rate}%`} / {rate.rate}%
                              </MenuItem>
                            );
                          })}
                        </TextField>
                      </td>
                      <td>
                        {money(
                          freshCalculation?.items?.[index]?.taxAmount,
                          form.currency,
                        )}
                      </td>
                      <td style={{ fontWeight: 700, color: "var(--primary)" }}>
                        {money(
                          freshCalculation?.items?.[index]?.lineTotal,
                          form.currency,
                        )}
                      </td>
                      <td>
                        <div style={{ display: "inline-flex", alignItems: "center", gap: 1 }}>
                          <Tooltip title="Move line up">
                            <span>
                              <IconButton
                                size="small"
                                aria-label={`Move line ${index + 1} up`}
                                disabled={index === 0}
                                onClick={() => moveItem(index, -1)}
                              >
                                <ArrowUpward fontSize="small" />
                              </IconButton>
                            </span>
                          </Tooltip>
                          <Tooltip title="Move line down">
                            <span>
                              <IconButton
                                size="small"
                                aria-label={`Move line ${index + 1} down`}
                                disabled={index === form.items.length - 1}
                                onClick={() => moveItem(index, 1)}
                              >
                                <ArrowDownward fontSize="small" />
                              </IconButton>
                            </span>
                          </Tooltip>
                          <Tooltip title="Delete line">
                            <span>
                              <IconButton
                                size="small"
                                aria-label={`Remove line ${index + 1}`}
                                className="invoice-delete-line-btn"
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
                                <DeleteOutline fontSize="small" />
                              </IconButton>
                            </span>
                          </Tooltip>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="invoice-table-footer-actions">
              <Button
                variant="outlined"
                startIcon={<Add />}
                onClick={() => {
                  setForm((previous) => ({
                    ...previous,
                    items: [...previous.items, blankItem()],
                  }));
                }}
              >
                Add Another Line
              </Button>
            </div>
            {errors.items && <Alert severity="error">{errors.items}</Alert>}
            <p className="invoice-footnote">
              Line discounts and single exclusive item taxes are calculated by the authoritative backend engine.
            </p>
          </section>
          <div className="invoice-form-bottom">
            <div>
              <section className="invoice-panel invoice-adjustments-panel">
                <div className="invoice-section-heading">
                  <div>
                    <h2>Discounts &amp; additional charges</h2>
                    <p>Configure invoice-level discounts and applicable charges.</p>
                  </div>
                  <Button
                    size="small"
                    variant="text"
                    component={Link}
                    to="/settings/discounts"
                    target="_blank"
                    rel="noopener noreferrer"
                    startIcon={<LocalOfferOutlined />}
                    sx={{ fontSize: "12.5px", fontWeight: 700 }}
                  >
                    Discount Configuration
                  </Button>
                </div>
                <InvoiceState
                  error={discounts.error || charges.error}
                  retry={() => {
                    discounts.refetch();
                    charges.refetch();
                  }}
                />
                {discounts.data &&
                  (discounts.data.status !== "Active" ||
                    discounts.data.allowInvoiceLevel === false) && (
                    <Alert severity="warning" sx={{ mb: 2 }}>
                      Invoice-level discounts are currently disabled in tenant
                      settings.{" "}
                      <Link
                        to="/settings/discounts"
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Enable in Discount Configuration
                      </Link>
                    </Alert>
                  )}
                <div className="invoice-form-grid invoice-charges-grid">
                  {field(
                    "discountAmount",
                    `Invoice discount (fixed${form.currency ? ` in ${form.currency}` : ""})`,
                    "number",
                    {
                      inputProps: { min: 0, step: 0.01 },
                      placeholder: "0.00",
                      InputLabelProps: { shrink: true },
                      disabled:
                        discounts.isPending ||
                        Boolean(discounts.error) ||
                        discounts.data?.status !== "Active" ||
                        discounts.data?.allowInvoiceLevel === false,
                      helperText: (
                        <span>
                          Validated against tenant maximum discount limits.{" "}
                          <Link
                            to="/settings/discounts"
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            Manage limits
                          </Link>
                        </span>
                      ),
                    },
                  )}
                  <div className="invoice-charge-apply-group">
                    <TextField
                      select
                      fullWidth
                      label="Configured charge"
                      value={chargeId}
                      onChange={(event) => setChargeId(event.target.value)}
                      disabled={charges.isPending || Boolean(charges.error) || !editable}
                      SelectProps={{
                        renderValue: (selectedId) => {
                          if (!selectedId) return "No additional charge";
                          const selected = configuredCharges.find(
                            (c) => String(c.id) === String(selectedId)
                          );
                          if (!selected) return "No additional charge";
                          const rateLabel =
                            selected.calculationType === "Percentage"
                              ? `${selected.value}%`
                              : money(selected.value, form.currency);
                          return `${selected.name} (${rateLabel})`;
                        },
                      }}
                    >
                      <MenuItem value="">
                        <em>No additional charge</em>
                      </MenuItem>
                      {configuredCharges.map((charge) => (
                        <MenuItem key={charge.id} value={String(charge.id)}>
                          <div style={{ display: "flex", flexDirection: "column", width: "100%" }}>
                            <span style={{ fontWeight: 600 }}>{charge.name}</span>
                            <span
                              style={{
                                fontSize: "11.5px",
                                color: "var(--secondary)",
                                opacity: 0.85,
                              }}
                            >
                              {charge.calculationType === "Percentage"
                                ? `Percentage • ${charge.value}%`
                                : `Fixed • ${money(charge.value, form.currency)}`}
                              {charge.taxable ? " • Taxable" : ""}
                            </span>
                          </div>
                        </MenuItem>
                      ))}
                    </TextField>
                    <Button
                      variant="outlined"
                      onClick={applyCharge}
                      disabled={
                        !chargeId ||
                        charges.isPending ||
                        Boolean(charges.error) ||
                        busy
                      }
                      className="invoice-apply-charge-btn"
                    >
                      Apply charge
                    </Button>
                  </div>
                  <TextField
                    label="Additional Charges Total"
                    value={form.chargesAmount}
                    InputProps={{ readOnly: true }}
                    helperText={`Total additional charges applied in ${form.currency}.`}
                  />
                </div>
                <p className="invoice-footnote">
                  Discount limits are validated against tenant settings. Calculations reflect backend calculation service rules.
                </p>
              </section>
              <section className="invoice-panel invoice-notes-panel">
                <div className="invoice-section-heading">
                  <div>
                    <h2>Notes &amp; terms</h2>
                    <p>Customer remarks, payment instructions and terms of service.</p>
                  </div>
                </div>
                <div className="invoice-form-grid invoice-notes-grid">
                  {field("notes", "Notes & Remarks", "text", {
                    multiline: true,
                    minRows: 3,
                    placeholder: "Payment instructions, bank transfer details, or customer notes...",
                  })}
                  {field("termsAndConditions", "Terms & Conditions", "text", {
                    multiline: true,
                    minRows: 3,
                    placeholder: "Payment timeline, delayed payment interest, delivery conditions...",
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
              <p className="invoice-footnote" style={{ marginTop: "12px" }}>
                The invoice backend applies whole-unit rounding on Save/Issue. Saved totals replace this preview.
              </p>
            </div>
          </div>
          {error && (
            <Alert
              severity="error"
              sx={{ mt: 2.5, borderRadius: "10px" }}
              action={id && <Button onClick={reload}>Reload latest</Button>}
            >
              {error}
            </Alert>
          )}
          <div className="invoice-form-actions">
            <Button
              component={Link}
              to={id ? `/invoices/${id}` : "/invoices"}
              variant="outlined"
              onClick={handleLeave}
              className="invoice-btn-cancel"
            >
              Cancel
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
              onClick={(e) => submitForm(e, false)}
              className="invoice-btn-save-draft"
            >
              Save Draft
            </Button>
          </div>
        </fieldset>
      </form>
    </InvoiceShell>
  );
}
export default InvoiceForm;
