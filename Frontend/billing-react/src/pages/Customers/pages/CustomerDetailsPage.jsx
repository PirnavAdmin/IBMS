import { useEffect, useRef } from "react";
import { InactivityReason } from "../components/CustomerCardDetails";
import { Breadcrumbs, Button, Link, Tab, Tabs } from "@mui/material";
import {
  ArrowBack,
  PrintOutlined,
  EditOutlined,
  DashboardOutlined,
  LocationOnOutlined,
  ReceiptLongOutlined,
  PaymentsOutlined,
  AccountBalanceWalletOutlined,
  HistoryOutlined,
} from "@mui/icons-material";
import { Link as RouterLink, useParams, useSearchParams } from "react-router-dom";
import { useCustomer } from "../hooks/useCustomer";
import { CustomerState, StatusBadge } from "../components/CustomerShared";
import { CustomerOverview } from "../components/CustomerOverview";
import { CustomerAddresses } from "../components/CustomerAddresses";
import {
  CustomerInvoices,
  CustomerPayments,
} from "../components/CustomerTransactions";
import { CustomerStatement } from "../components/CustomerStatement";
import { CustomerAudit } from "../components/CustomerAudit";
import { DeactivateCustomerDialog } from "../components/DeactivateCustomerDialog";
import "../styles/customer-details.css";

const tabs = [
  { name: "Overview", icon: <DashboardOutlined /> },
  { name: "Addresses", icon: <LocationOnOutlined /> },
  { name: "Invoices", icon: <ReceiptLongOutlined /> },
  { name: "Payments", icon: <PaymentsOutlined /> },
  { name: "Statement", icon: <AccountBalanceWalletOutlined /> },
  { name: "Audit", icon: <HistoryOutlined /> },
];

export function CustomerDetailsPage() {
  const { customerId } = useParams();
  const query = useCustomer(customerId);
  const [params, setParams] = useSearchParams();
  const panelRef = useRef(null);
  const wheelTimeoutRef = useRef(null);
  const previousScrollTopRef = useRef({ window: 0, panel: 0 });
  const tab = tabs.find((item) => item.name.toLowerCase() === params.get("tab"))?.name || "Overview";
  const activeTabIndex = tabs.findIndex((item) => item.name === tab);
  const c = query.data?.customer;

  useEffect(() => {
    const nextTab = tabs[activeTabIndex + 1]?.name;
    if (!query.isSuccess || !nextTab) return undefined;

    const panel = panelRef.current;
    previousScrollTopRef.current = {
      window: window.scrollY,
      panel: panel?.scrollTop || 0,
    };

    const scheduleNextTabSwitch = (source, currentPosition) => {
      const scrollingDown = currentPosition > previousScrollTopRef.current[source];
      previousScrollTopRef.current[source] = currentPosition;
      if (wheelTimeoutRef.current) clearTimeout(wheelTimeoutRef.current);
      wheelTimeoutRef.current = null;
      if (!scrollingDown) return;

      wheelTimeoutRef.current = setTimeout(() => {
        wheelTimeoutRef.current = null;
        setParams((previous) => {
          const currentTab = previous.get("tab") || "overview";
          if (currentTab !== tab.toLowerCase()) return previous;
          const next = new URLSearchParams(previous);
          next.set("tab", nextTab.toLowerCase());
          return next;
        }, { replace: true });
      }, 1000);
    };

    const handleWindowScroll = () => scheduleNextTabSwitch("window", window.scrollY);
    const handlePanelScroll = () => scheduleNextTabSwitch("panel", panel?.scrollTop || 0);
    window.addEventListener("scroll", handleWindowScroll, { passive: true });
    panel?.addEventListener("scroll", handlePanelScroll, { passive: true });

    return () => {
      window.removeEventListener("scroll", handleWindowScroll);
      panel?.removeEventListener("scroll", handlePanelScroll);
      if (wheelTimeoutRef.current) clearTimeout(wheelTimeoutRef.current);
      wheelTimeoutRef.current = null;
    };
  }, [tab, activeTabIndex, query.isSuccess, setParams]);

  const changeTab = (nextTab) => {
    if (wheelTimeoutRef.current) {
      clearTimeout(wheelTimeoutRef.current);
      wheelTimeoutRef.current = null;
    }
    setParams((previous) => {
      const next = new URLSearchParams(previous);
      next.set("tab", nextTab.toLowerCase());
      return next;
    }, { replace: true });
  };

  const handleTabChange = (_, nextTab) => changeTab(nextTab);

  return (
    <main className="customer-page customer-details-view">
      <Breadcrumbs aria-label="Breadcrumb">
        <Link component={RouterLink} to="/customers" underline="hover">
          Back to Customers
        </Link>
        <span>Customer Details</span>
      </Breadcrumbs>
      <CustomerState query={query} />
      {query.isSuccess && (
        <>
          <header className="customer-heading">
            <div>
              <h1>{c.name || "—"}</h1>
              <div className="customer-meta">
                <span>Customer Code: {c.customerCode || "—"}</span>
                {c.companyName && <span>{c.companyName}</span>}
                <StatusBadge value={c.status} />
              </div>
            </div>
            <div className="customer-actions">
              <Button variant="outlined" startIcon={<ArrowBack />} component={RouterLink} to="/customers">
                Back
              </Button>
              <Button
                variant="outlined"
                component={RouterLink}
                to={`/customers/${encodeURIComponent(customerId)}/print`}
                startIcon={<PrintOutlined />}
              >
                Print Details
              </Button>
              <Button
                variant="outlined"
                component={RouterLink}
                to={`/customers/${encodeURIComponent(customerId)}/edit`}
                startIcon={<EditOutlined />}
              >
                Edit Customer
              </Button>
              <DeactivateCustomerDialog key={c.id} customer={c} />
            </div>
          </header>
          {c.isActive === false && <InactivityReason customerId={customerId} />}
          <Tabs
            className="customer-tabs"
            value={tab}
            variant="scrollable"
            scrollButtons="auto"
            allowScrollButtonsMobile
            aria-label="Customer details tabs"
            onChange={handleTabChange}
          >
            {tabs.map(({ name, icon }) => (
              <Tab key={name} icon={icon} iconPosition="start" label={name} value={name} id={`customer-tab-${name}`} aria-controls={`customer-panel-${name}`} />
            ))}
          </Tabs>
          <div
            className="customer-tab-panel"
            ref={panelRef}
            role="tabpanel"
            id={`customer-panel-${tab}`}
            aria-labelledby={`customer-tab-${tab}`}
            key={`${customerId}-${tab}`}
          >
            {tab === "Overview" && <CustomerOverview record={query.data} />}
            {tab === "Addresses" && <CustomerAddresses customer={c} />}
            {tab === "Invoices" && <CustomerInvoices rows={query.data.invoices} />}
            {tab === "Payments" && <CustomerPayments rows={query.data.payments} />}
            {tab === "Statement" && <CustomerStatement record={query.data} />}
            {tab === "Audit" && <CustomerAudit customerId={customerId} />}
          </div>
        </>
      )}
    </main>
  );
}
