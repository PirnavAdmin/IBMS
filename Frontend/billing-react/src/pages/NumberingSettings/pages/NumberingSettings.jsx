import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Breadcrumbs,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  TextField,
} from "@mui/material";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { numberingService } from "../services/numberingService";
import {
  numberingValidationSchema,
  RESET_POLICIES,
  DOCUMENT_TYPES,
  SUPPORTED_TOKENS,
} from "../validation/numberingValidation";
import {
  useDebounced,
  useInvoiceUser,
  InvoiceState,
  InvoiceValues,
} from "../../Invoices/components/InvoiceShared";
import {
  invoiceError,
  createSubmissionGuard,
} from "../../Invoices/services/invoiceService";
import "../styles/numbering-settings.css";
export function NumberingSettings() {
  const [documentType, setDocumentType] = useState("Invoice");
  const [form, setForm] = useState(null);
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const original = useRef(null);
  const guard = useRef(createSubmissionGuard());
  const user = useInvoiceUser();
  const client = useQueryClient();
  const settings = useQuery({
    queryKey: ["numbering", documentType],
    queryFn: () => numberingService.getSettings(documentType),
    enabled: Boolean(user.data),
    retry: false,
    staleTime: 0,
  });
  useEffect(() => {
    if (settings.data && !form) {
      setForm(settings.data);
      original.current = settings.data;
    }
  }, [settings.data, form]);
  const values = useDebounced(form, 300);
  const valid = values && numberingValidationSchema.isValidSync(values);
  const tokenError =
    values &&
    ["prefix", "suffix", "tokens"].some(
      (key) => !numberingValidationSchema.fields[key].isValidSync(values[key]),
    );
  const preview = useQuery({
    queryKey: ["numbering", "preview", values],
    queryFn: () => numberingService.preview(values),
    enabled: Boolean(valid && form?.documentType === documentType),
    retry: false,
    staleTime: 0,
  });
  const change = (key, value) => {
    setMessage("");
    setError("");
    setErrors((previous) => ({ ...previous, [key]: "" }));
    setForm((previous) => ({ ...previous, [key]: value }));
  };
  async function validate() {
    try {
      await numberingValidationSchema.validate(form, { abortEarly: false });
      setErrors({});
      return true;
    } catch (e) {
      setErrors(
        Object.fromEntries(
          (e.inner || []).map((item) => [item.path, item.message]),
        ),
      );
      return false;
    }
  }
  async function review(event) {
    event.preventDefault();
    if (!form || busy || !user.permissions.manage || !(await validate()))
      return;
    setConfirm(true);
  }
  async function save() {
    if (!user.permissions.manage || !guard.current.acquire()) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const fresh = await numberingService.getSettings(documentType);
      if (
        fresh.rowVersion !== original.current?.rowVersion ||
        fresh.nextNumber !== original.current?.nextNumber
      )
        throw Object.assign(new Error("Changed"), { status: 409 });
      const saved = await numberingService.updateSettings(form);
      setForm(saved);
      original.current = saved;
      await client.invalidateQueries({ queryKey: ["numbering"] });
      setConfirm(false);
      setMessage("Numbering settings saved by the billing server.");
    } catch (e) {
      setError(invoiceError(e));
    } finally {
      guard.current.release();
      setBusy(false);
    }
  }
  async function reload() {
    if (busy) return;
    const result = await settings.refetch();
    if (result.data && !result.error) {
      setForm(result.data);
      original.current = result.data;
      setError("");
      setConfirm(false);
    }
  }
  const field = (key, label, type = "text", extra = {}) => (
    <TextField
      label={label}
      type={type}
      value={form?.[key] ?? ""}
      onChange={(event) => change(key, event.target.value)}
      error={Boolean(errors[key])}
      helperText={errors[key]}
      {...extra}
    />
  );
  return (
    <main className="numbering-page-root">
      <Breadcrumbs>
        <Link to="/settings">Settings</Link>
        <span>Invoice Numbering</span>
      </Breadcrumbs>
      <header className="numbering-heading">
        <div>
          <span className="invoice-eyebrow">Administration</span>
          <h1>Invoice Numbering</h1>
          <p>
            Configure future document numbers and preview the format without
            consuming the sequence.
          </p>
        </div>
        <Button disabled={busy || settings.isFetching} onClick={reload}>
          Refresh
        </Button>
      </header>
      <InvoiceState
        loading={user.isPending || settings.isPending}
        error={user.error || settings.error}
        retry={() => {
          user.refetch();
          settings.refetch();
        }}
      />
      {!user.isPending && !user.permissions.manage && (
        <Alert severity="info">
          Numbering settings are read-only for your role.
        </Alert>
      )}
      {form && (
        <form onSubmit={review} noValidate>
          <fieldset
            className="numbering-fieldset"
            disabled={busy || !user.permissions.manage}
          >
            <div className="numbering-rebuild-grid">
              <section className="numbering-card-panel">
                <h2>Build Your Format</h2>
                <div className="numbering-fields">
                  <TextField
                    select
                    label="Document Type"
                    value={documentType}
                    onChange={(event) => {
                      setDocumentType(event.target.value);
                      setForm(null);
                      original.current = null;
                      setErrors({});
                      setError("");
                      setMessage("");
                    }}
                  >
                    {DOCUMENT_TYPES.map((type) => (
                      <MenuItem key={type} value={type}>
                        {type === "CreditNote" ? "Credit Note" : type}
                      </MenuItem>
                    ))}
                  </TextField>
                  {field("prefix", "Prefix")}
                  {field("suffix", "Suffix")}
                  {field("tokens", "Format / Tokens", "text", {
                    className: "numbering-wide",
                  })}
                  {field("sequenceLength", "Sequence Length", "number", {
                    inputProps: { min: 3, max: 10, step: 1 },
                  })}
                  {field("nextNumber", "Next Number", "number", {
                    inputProps: { min: 1, max: 999999999999, step: 1 },
                    helperText:
                      errors.nextNumber ||
                      "Changing the sequence requires confirmation.",
                  })}
                  <TextField
                    select
                    label="Reset Policy"
                    value={form.resetPolicy}
                    onChange={(event) =>
                      change("resetPolicy", event.target.value)
                    }
                  >
                    {RESET_POLICIES.map((policy) => (
                      <MenuItem key={policy} value={policy}>
                        {policy}
                      </MenuItem>
                    ))}
                  </TextField>
                  <TextField
                    select
                    label="Status"
                    value={form.status}
                    onChange={(event) => change("status", event.target.value)}
                  >
                    <MenuItem value="Active">Active</MenuItem>
                    <MenuItem value="Inactive">Inactive</MenuItem>
                  </TextField>
                </div>
                <h3>Supported tokens</h3>
                <div className="numbering-token-list">
                  {SUPPORTED_TOKENS.map((token) => (
                    <Button
                      key={token}
                      size="small"
                      variant="outlined"
                      onClick={() => change("tokens", `${form.tokens}${token}`)}
                    >
                      {token}
                    </Button>
                  ))}
                </div>
                <Button onClick={() => change("tokens", "")}>
                  Clear All tokens
                </Button>
                <p className="invoice-footnote">
                  The backend appends the sequence after these tokens and before
                  the suffix.
                </p>
              </section>
              <aside className="numbering-card-panel">
                <h2>Live Preview</h2>
                {tokenError && (
                  <Alert severity="error">
                    The format contains an unsupported token or exceeds the
                    allowed length. Use the listed brace tokens; invalid input
                    is preserved.
                  </Alert>
                )}
                <InvoiceState
                  loading={preview.isFetching}
                  error={preview.error}
                  retry={() => preview.refetch()}
                />
                <p>Next Document Number (advisory)</p>
                <strong className="numbering-preview-value">
                  {values === form && valid && !preview.error
                    ? preview.data?.fullPreview || "Loading preview..."
                    : "Enter a valid configuration"}
                </strong>
                {preview.data && values === form && valid && (
                  <InvoiceValues
                    values={Object.entries(preview.data.parts).map(
                      ([key, value]) => [key, value],
                    )}
                  />
                )}
                <p className="invoice-footnote">
                  Preview never reserves or increments a number. The final
                  number is assigned by the document workflow. Reset policy can
                  affect that result.
                </p>
                <Alert severity="warning">
                  The server does not enforce inactive numbering or concurrent
                  configuration updates. A dedicated reset action is
                  unavailable.
                </Alert>
              </aside>
            </div>
            <div className="numbering-save-bar">
              <Button
                disabled={busy}
                onClick={() => {
                  setForm(original.current);
                  setErrors({});
                  setError("");
                  setMessage("");
                }}
              >
                Cancel changes
              </Button>
              <Button
                variant="contained"
                type="submit"
                disabled={busy || !form}
              >
                Save Changes
              </Button>
            </div>
          </fieldset>
        </form>
      )}
      {message && <Alert severity="success">{message}</Alert>}
      {error && !confirm && (
        <Alert
          severity="error"
          action={<Button onClick={reload}>Reload latest</Button>}
        >
          {error}
        </Alert>
      )}
      <Dialog
        open={confirm}
        onClose={busy ? undefined : () => setConfirm(false)}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>Confirm numbering changes</DialogTitle>
        <DialogContent>
          <p>
            These settings affect future documents. Existing document numbers
            remain unchanged.
          </p>
          {form && (
            <InvoiceValues
              values={[
                ["Document Type", form.documentType],
                ["Next Number", form.nextNumber],
                ["Reset Policy", form.resetPolicy],
                ["Status", form.status],
              ]}
            />
          )}
          {Number(form?.nextNumber) !== original.current?.nextNumber && (
            <Alert severity="warning">
              You are changing the stored sequence. Reusing a previous number
              may cause collisions.
            </Alert>
          )}
          {error && (
            <Alert
              severity="error"
              action={
                <Button disabled={busy} onClick={reload}>
                  Reload latest
                </Button>
              }
            >
              {error}
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button disabled={busy} onClick={() => setConfirm(false)}>
            Back
          </Button>
          <Button variant="contained" disabled={busy} onClick={save}>
            {busy ? "Saving..." : "Confirm Save"}
          </Button>
        </DialogActions>
      </Dialog>
    </main>
  );
}
export default NumberingSettings;
