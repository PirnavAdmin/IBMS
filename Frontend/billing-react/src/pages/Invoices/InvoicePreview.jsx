import { useEffect, useState } from "react";
import { Alert, Button } from "@mui/material";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { templateApi } from "billing-api-client";
import { invoiceService, invoiceError } from "./services/invoiceService";
import { InvoiceDocument } from "./components/InvoiceDocument";
import {
  InvoiceShell,
  InvoiceState,
  useInvoiceUser,
} from "./components/InvoiceShared";
export function InvoicePreview() {
  const { id } = useParams();
  const user = useInvoiceUser();
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const invoice = useQuery({
    queryKey: ["invoice", id],
    queryFn: () => invoiceService.get(id),
    enabled: user.permissions.view,
    retry: false,
    staleTime: 0,
  });
  useEffect(
    () => () => {
      if (url) URL.revokeObjectURL(url);
    },
    [url],
  );
  async function openPdf() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await templateApi.generateInvoicePdf(invoice.data.id, {
        invoiceId: invoice.data.id,
        overrideTemplateId: null,
        forceRegenerate: false,
      });
      const blob = await templateApi.downloadInvoicePdf(invoice.data.id, true);
      if (!blob?.size || !blob.type.includes("pdf"))
        throw new Error("The server did not return an invoice PDF.");
      setUrl(URL.createObjectURL(blob));
    } catch (e) {
      setError(invoiceError(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <InvoiceShell
      title="Invoice Preview"
      subtitle="Review the saved invoice. Open the server PDF for the final branding and document snapshot."
      actions={
        <>
          <Button component={Link} to={`/invoices/${id}`}>
            Back to invoice
          </Button>
          {invoice.data?.status === "Draft" && (
            <Button component={Link} to={`/invoices/${id}/edit`}>
              Edit draft
            </Button>
          )}
          {invoice.data && invoice.data.status !== "Draft" && (
            <Button variant="contained" disabled={busy} onClick={openPdf}>
              Open server PDF
            </Button>
          )}
        </>
      }
    >
      <InvoiceState
        loading={invoice.isFetching}
        error={invoice.error}
        retry={() => invoice.refetch()}
      />
      {error && <Alert severity="error">{error}</Alert>}
      {!user.isPending && !user.permissions.view && (
        <Alert severity="warning">
          Invoice access requires TenantAdmin or SuperAdmin.
        </Alert>
      )}
      {url ? (
        <iframe className="invoice-pdf" title="Server invoice PDF" src={url} />
      ) : (
        invoice.data && (
          <>
            <Alert severity="info">
              Printable overview uses persisted line amounts and current
              customer contact details. The server PDF supplies the
              authoritative branding and snapshot.
            </Alert>
            <InvoiceDocument invoice={invoice.data} />
          </>
        )
      )}
    </InvoiceShell>
  );
}
