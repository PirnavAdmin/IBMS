import { useRef, useState } from "react";
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  ListItemIcon,
  Menu,
  MenuItem,
  TextField,
} from "@mui/material";
import {
  BlockOutlined,
  CancelOutlined,
  DescriptionOutlined,
  EditOutlined,
  MoreVert,
  PaymentOutlined,
  PictureAsPdfOutlined,
  ReceiptLongOutlined,
  SendOutlined,
  VisibilityOutlined,
} from "@mui/icons-material";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import {
  invoiceActions,
  invoiceService,
  invoiceError,
  invalidateInvoices,
  financialBlockers,
  createSubmissionGuard,
} from "../services/invoiceService";
import { InvoiceValues, identifier, date, money } from "./InvoiceShared";
import {
  formFromInvoice,
  calculationDto,
  validateInvoice,
} from "../validation/invoiceValidation";
import { numberingService } from "../../NumberingSettings/services/numberingService";

const actionConfig = {
  view: {
    label: "View",
    icon: VisibilityOutlined,
  },
  edit: {
    label: "Edit",
    icon: EditOutlined,
  },
  preview: {
    label: "Preview",
    icon: DescriptionOutlined,
  },
  pdf: {
    label: "Download PDF",
    icon: PictureAsPdfOutlined,
  },
  issue: {
    label: "Issue Invoice",
    icon: SendOutlined,
  },
  payment: {
    label: "Record Payment",
    icon: PaymentOutlined,
  },
  credit: {
    label: "Create Credit Note",
    icon: ReceiptLongOutlined,
  },
  cancel: {
    label: "Cancel Invoice",
    icon: CancelOutlined,
  },
  void: {
    label: "Void Invoice",
    icon: BlockOutlined,
  },
};

const labels = Object.fromEntries(
  Object.entries(actionConfig).map(([key, item]) => [key, item.label]),
);
export function InvoiceActions({ invoice, permissions }) {
  const [anchor, setAnchor] = useState(null);
  const [review, setReview] = useState(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const lock = useRef(createSubmissionGuard());
  const navigate = useNavigate();
  const client = useQueryClient();
  const actions = invoiceActions(invoice, permissions);
  async function select(action) {
    setAnchor(null);
    setError("");
    setNotice("");
    if (["view", "edit", "preview"].includes(action)) {
      navigate(
        `/invoices/${invoice.id}${action === "view" ? "" : `/${action}`}`,
      );
      return;
    }
    if (action === "payment") {
      navigate("/payments/new", { state: { invoiceId: invoice.id } });
      return;
    }
    if (action === "credit") {
      navigate("/credit-notes/new", { state: { invoiceId: invoice.id } });
      return;
    }
    if (!lock.current.acquire()) return;
    setBusy(true);
    try {
      const fresh = await invoiceService.get(invoice.id);
      if (!invoiceActions(fresh, permissions).includes(action))
        throw new Error(
          "This action is no longer available. Refresh the invoice.",
        );
      if (action === "pdf") {
        await invoiceService.downloadPdf(fresh);
        return;
      }
      let numberPreview;
      if (action === "issue") {
        if (financialBlockers(fresh).length)
          throw new Error(financialBlockers(fresh).join(" "));
        // Revalidate through the same backend financial engine, never client arithmetic.
        const values = formFromInvoice(fresh);
        const errors = validateInvoice(values);
        if (Object.keys(errors).length)
          throw new Error(Object.values(errors).join(" "));
        const customer = await invoiceService.customer(fresh.customerId);
        if (
          customer.isActive === false ||
          String(customer.status).toLowerCase() === "inactive"
        )
          throw new Error("The customer is inactive.");
        await Promise.all(
          fresh.items.map((item) =>
            invoiceService.validateProduct(item.productId),
          ),
        );
        await invoiceService.calculate(calculationDto(values));
        if (Number(values.discountAmount) > 0) {
          const validation = await invoiceService.validateDiscount(
            values.discountAmount,
            fresh.subtotal,
          );
          if (!validation.isValid)
            throw new Error(
              validation.message || "Discount validation failed.",
            );
        }
        const numbering = await numberingService.getSettings("Invoice");
        if (numbering.status !== "Active")
          throw new Error(
            "Invoice numbering is inactive. Activate it in Numbering Settings before issuing.",
          );
        const preview = await numberingService.preview({
          ...numbering,
          date: fresh.invoiceDate,
        });
        numberPreview = preview.fullPreview;
      }
      setReason("");
      setReview({ action, invoice: fresh, numberPreview });
    } catch (e) {
      setError(invoiceError(e));
    } finally {
      lock.current.release();
      setBusy(false);
    }
  }
  async function confirm() {
    if (!review || !lock.current.acquire()) return;
    setBusy(true);
    setError("");
    try {
      const latest = await invoiceService.get(review.invoice.id);
      if (
        latest.rowVersion !== review.invoice.rowVersion ||
        !invoiceActions(latest, permissions).includes(review.action)
      )
        throw Object.assign(new Error("Changed"), { status: 409 });
      const result =
        review.action === "issue"
          ? await invoiceService.issue(latest.id)
          : await invoiceService[review.action](latest.id, reason.trim());
      await invalidateInvoices(client);
      setNotice(
        `${labels[review.action]} confirmed: ${identifier(result)} | ${result.status} | ${money(result.totalAmount, result.currency)}`,
      );
      setReview(null);
    } catch (e) {
      setError(invoiceError(e));
    } finally {
      lock.current.release();
      setBusy(false);
    }
  }
  return (
    <div className="invoice-action-control">
      <IconButton
        id={`invoice-actions-btn-${invoice.id}`}
        className={`invoice-action-trigger ${anchor ? "is-active" : ""}`}
        size="small"
        aria-label={`Actions for ${identifier(invoice)}`}
        aria-haspopup="menu"
        aria-expanded={Boolean(anchor)}
        aria-controls={anchor ? `invoice-actions-${invoice.id}` : undefined}
        disabled={busy || !actions.length}
        onClick={(event) => setAnchor(event.currentTarget)}
      >
        <MoreVert fontSize="small" />
      </IconButton>
      <Menu
        id={`invoice-actions-${invoice.id}`}
        anchorEl={anchor}
        open={Boolean(anchor)}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
        slotProps={{
          paper: {
            className: "invoice-actions-dropdown-paper",
            elevation: 4,
          },
        }}
        MenuListProps={{
          "aria-labelledby": `invoice-actions-btn-${invoice.id}`,
          dense: true,
          className: "invoice-actions-menu-list",
        }}
      >
        {actions.map((action, index) => {
          const config = actionConfig[action];
          if (!config) return null;
          const Icon = config.icon;
          const isDestructive = action === "cancel" || action === "void";
          const showDivider =
            isDestructive &&
            index > 0 &&
            !["cancel", "void"].includes(actions[index - 1]);

          return [
            showDivider && (
              <Divider
                key={`divider-${action}`}
                className="invoice-actions-divider"
              />
            ),
            <MenuItem
              key={action}
              className={`invoice-action-item ${isDestructive ? "is-destructive" : ""}`}
              onClick={() => select(action)}
            >
              <ListItemIcon className="invoice-action-item-icon">
                <Icon fontSize="small" />
              </ListItemIcon>
              <span className="invoice-action-item-label">{config.label}</span>
            </MenuItem>,
          ];
        })}
      </Menu>
      {error && !review && (
        <Alert severity="error" onClose={() => setError("")}>
          {error}
        </Alert>
      )}
      {notice && (
        <Alert severity="success" onClose={() => setNotice("")}>
          {notice}
        </Alert>
      )}
      <Dialog
        open={Boolean(review)}
        onClose={busy ? undefined : () => setReview(null)}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>{review && labels[review.action]}</DialogTitle>
        <DialogContent>
          {review && (
            <>
              <InvoiceValues
                values={[
                  ["Customer", review.invoice.customer?.name],
                  ["Invoice", identifier(review.invoice)],
                  ["Invoice date", date(review.invoice.invoiceDate)],
                  ["Due date", date(review.invoice.dueDate)],
                  ["Items", review.invoice.items?.length],
                  [
                    "Subtotal",
                    money(review.invoice.subtotal, review.invoice.currency),
                  ],
                  [
                    "Tax",
                    money(review.invoice.taxAmount, review.invoice.currency),
                  ],
                  [
                    "Charges",
                    money(
                      review.invoice.chargesAmount,
                      review.invoice.currency,
                    ),
                  ],
                  [
                    "Grand total",
                    money(review.invoice.totalAmount, review.invoice.currency),
                  ],
                ]}
              />
              {review.numberPreview && (
                <p>
                  Expected number (advisory):{" "}
                  <strong>{review.numberPreview}</strong>
                </p>
              )}
              {review.action === "issue" ? (
                <p>
                  The backend assigns the final number and recalculates totals
                  on issuance.
                </p>
              ) : (
                <TextField
                  fullWidth
                  required
                  label="Reason"
                  multiline
                  minRows={2}
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                />
              )}
            </>
          )}
          {error && <Alert severity="error">{error}</Alert>}
        </DialogContent>
        <DialogActions>
          <Button disabled={busy} onClick={() => setReview(null)}>
            Back
          </Button>
          <Button
            variant="contained"
            disabled={busy || (review?.action !== "issue" && !reason.trim())}
            onClick={confirm}
          >
            {busy ? "Processing..." : review && labels[review.action]}
          </Button>
        </DialogActions>
      </Dialog>
    </div>
  );
}
