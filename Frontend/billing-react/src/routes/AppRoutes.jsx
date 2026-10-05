import { Routes, Route, Navigate } from 'react-router-dom';

import { Landing } from '../pages/Landing/Landing';
import { Login } from '../pages/Login/Login';
import { Register } from '../pages/Register/Register';
import { ForgotPassword } from '../pages/ForgotPassword/ForgotPassword';
import { VerifyOtp } from '../pages/VerifyOtp/VerifyOtp';
import { ResetPassword } from '../pages/ResetPassword/ResetPassword';

import { Dashboard } from '../pages/Dashboard/Dashboard';
import { CreateInvoice } from '../pages/CreateInvoice/CreateInvoice';
import { AppLayout } from '../layouts/AppLayout';
import { ModulePlaceholder } from '../pages/ModulePlaceholder/ModulePlaceholder';
import { SettingsLanding } from '../pages/Settings/SettingsLanding';
import { DiscountConfiguration } from '../pages/Settings/DiscountConfiguration';
import { ChargesConfiguration } from '../pages/Settings/ChargesConfiguration';

import { Payments } from '../pages/Payments/Payments';
import { RecordPayment } from '../pages/Payments/RecordPayment';
import { PaymentDetails } from '../pages/Payments/PaymentDetails';
import { Invoices } from '../pages/Invoices/Invoices';
import { InvoiceDetailsPage } from '../pages/Invoices/pages/InvoiceDetailsPage';
import { Taxes } from '../pages/Taxes/Taxes';
import { CategoryList } from '../pages/Products/pages/CategoryList';
import { CategoryFormPage } from '../pages/Products/pages/CategoryFormPage';
import { ProductList } from '../pages/Products/ProductList';
import { ProductDetails } from '../pages/Products/pages/ProductDetails';
import { CreateProduct } from '../pages/Products/pages/CreateProduct';
import { EditProduct } from '../pages/Products/pages/EditProduct';
import { NumberingSettings } from '../pages/NumberingSettings';
import { QuotationManagement } from '../pages/Quotations';
import { InvoiceTemplates, CreateTemplate, EditTemplate, BrandingSettings, TemplatePreview, TemplateVersionHistory, TemplateAuditHistory, InvoicePdfView } from '../pages/InvoiceTemplates/InvoiceTemplates';
import { CreditNoteList } from '../pages/CreditNotes/pages/CreditNoteList';
import { CreditNoteForm } from '../pages/CreditNotes/pages/CreditNoteForm';
import { CreditNoteDetails } from '../pages/CreditNotes/pages/CreditNoteDetails';

// ==============================
// CUSTOMER MODULE
// ==============================

// Manikanta - Customer List
import { CustomerListPage } from '../pages/Customers/pages/CustomerListPage';

// Jayakrishna - Create & Edit Customer
import { CreateCustomer } from '../pages/Customers/pages/CreateCustomer';
import { EditCustomer } from '../pages/Customers/pages/EditCustomer';

// Sumanth - Customer Details
import { CustomerDetailsPage } from '../pages/Customers/pages/CustomerDetailsPage';
import { CustomerPrintPage } from '../pages/Customers/pages/CustomerPrintPage';

export const AppRoutes = () => (
  <Routes>
    {/* Public Routes */}
    <Route path="/" element={<Landing />} />
    <Route path="/login" element={<Login />} />
    <Route path="/register" element={<Register />} />
    <Route path="/forgot-password" element={<ForgotPassword />} />
    <Route path="/verify-otp" element={<VerifyOtp />} />
    <Route path="/reset-password" element={<ResetPassword />} />

    {/* Application Routes */}
    <Route element={<AppLayout />}>
      <Route path="/dashboard" element={<Dashboard />} />

      {/* Invoices */}
      <Route path="/invoices" element={<Invoices />} />
      <Route path="/invoices/new" element={<CreateInvoice />} />
      <Route path="/invoices/create" element={<CreateInvoice />} />
      <Route path="/invoices/:id" element={<InvoiceDetailsPage />} />
      <Route path="/invoices/:id/edit" element={<CreateInvoice mode="edit" />} />
      <Route path="/invoices/:invoiceId/pdf" element={<InvoicePdfView />} />

      {/* Quotation Management — backend API integration */}
      <Route path="/quotations" element={<QuotationManagement />} />

      {/* Payments */}
      <Route path="/payments" element={<Payments />} />
      <Route path="/payments/new" element={<RecordPayment />} />
      <Route path="/payments/:id" element={<PaymentDetails />} />

      {/* ==============================
          CUSTOMER MODULE
      ============================== */}

      {/* Manikanta - Customer List */}
      <Route
        path="/customers"
        element={<CustomerListPage />}
      />

      {/* Jayakrishna - Create Customer */}
      <Route
        path="/customers/create"
        element={<CreateCustomer />}
      />

      {/* Jayakrishna - Edit Customer */}
      <Route
        path="/customers/:customerId/edit"
        element={<EditCustomer />}
      />

      {/* Sumanth - Customer Details */}
      <Route
        path="/customers/:customerId/print"
        element={<CustomerPrintPage />}
      />
      <Route
        path="/customers/:customerId"
        element={<CustomerDetailsPage />}
      />

      {/* Other Modules */}
      <Route path="/products" element={<ProductList />} />
      <Route path="/products/categories" element={<CategoryList />} />
      <Route path="/products/categories/new" element={<CategoryFormPage />} />
      <Route path="/products/categories/:categoryId/edit" element={<CategoryFormPage />} />
      <Route path="/products/new" element={<CreateProduct />} />
      <Route path="/products/:id" element={<ProductDetails />} />
      <Route path="/products/:id/edit" element={<EditProduct />} />
      <Route path="/credit-notes" element={<CreditNoteList />} />
      <Route path="/credit-notes/new" element={<CreditNoteForm />} />
      <Route path="/credit-notes/:id/edit" element={<CreditNoteForm />} />
      <Route path="/credit-notes/:id/approve" element={<CreditNoteDetails />} />
      <Route path="/credit-notes/:id/refund" element={<CreditNoteDetails />} />
      <Route path="/credit-notes/:id/preview" element={<CreditNoteDetails />} />
      <Route path="/credit-notes/:id" element={<CreditNoteDetails />} />
      <Route path="/recurring-billing" element={<ModulePlaceholder />} />
      <Route path="/expenses" element={<ModulePlaceholder />} />
      <Route path="/taxes/*" element={<Navigate to="/settings/taxes" replace />} />
      <Route path="/reports" element={<ModulePlaceholder />} />
      <Route path="/audit-activity" element={<ModulePlaceholder />} />
      <Route path="/templates-branding" element={<InvoiceTemplates />} />
      <Route path="/templates-branding/new" element={<CreateTemplate />} />
      <Route path="/templates-branding/branding" element={<BrandingSettings />} />
      <Route path="/templates-branding/preview" element={<TemplatePreview />} />
      <Route path="/templates-branding/versions" element={<TemplateVersionHistory />} />
      <Route path="/templates-branding/audit" element={<TemplateAuditHistory />} />
      <Route path="/templates-branding/:templateId/edit" element={<EditTemplate />} />
      <Route path="/invoice-numbering" element={<Navigate to="/settings/numbering" replace />} />
      <Route path="/settings/numbering" element={<NumberingSettings />} />
      <Route path="/integration-settings" element={<ModulePlaceholder />} />
      <Route path="/settings" element={<SettingsLanding />} />
      <Route path="/settings/taxes/*" element={<Taxes />} />
      <Route path="/settings/discounts" element={<DiscountConfiguration />} />
      <Route path="/settings/charges" element={<ChargesConfiguration />} />
      <Route path="/support" element={<ModulePlaceholder />} />
    </Route>

    {/* Unknown Route */}
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes>
);
