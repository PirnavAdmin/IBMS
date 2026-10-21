import { printCustomerDetails } from '../utils/customerReports';
import { CustomerPrintSheet } from '../components/CustomerPrintSheet';
import { Button, Skeleton } from "@mui/material";
import { Link as RouterLink, useParams } from "react-router-dom";
import { useCustomer } from "../hooks/useCustomer";
import { CustomerState } from "../components/CustomerShared";
import { formatCurrency, displayDate } from "../components/CustomerShared";
import "../styles/customer-details.css";

export function CustomerPrintPage() {
  const { customerId } = useParams();
  const query = useCustomer(customerId);
  const record = query.data;
  const customer = record?.customer;
  const summary = record?.financialSummary || {};
  if (query.isPending) return <main className="customer-page"><Skeleton height={80} /><Skeleton height={260} /></main>;
  if (query.isError) return <main className="customer-page"><CustomerState query={query} /><Button component={RouterLink} to={`/customers/${encodeURIComponent(customerId)}`}>Back to customer</Button></main>;

  return (
    <main className="customer-print-page">
      <div className="customer-print-toolbar">
        <Button component={RouterLink} to={`/customers/${encodeURIComponent(customerId)}`} variant="outlined">Back to Customer</Button>
        <Button variant="contained" onClick={() => printCustomerDetails(record)}>Print Customer Details</Button>
      </div>
      <CustomerPrintSheet record={record} />
    </main>
  );
}
