import { Routes, Route, Navigate } from 'react-router-dom';
import { FormDraftProvider } from '../context/FormDraftContext';
import { ProtectedRoute } from './ProtectedRoute';
import { PermissionRoute } from './PermissionRoute';

import { Landing } from '../pages/Landing/Landing';
import { Login } from '../pages/Login/Login';
import { Register } from '../pages/Register/Register';
import { TermsAndConditions, PrivacyPolicy } from '../pages/Legal/LegalPages';
import { ForgotPassword } from '../pages/ForgotPassword/ForgotPassword';
import { VerifyOtp } from '../pages/VerifyOtp/VerifyOtp';
import { ResetPassword } from '../pages/ResetPassword/ResetPassword';

import { Dashboard } from '../pages/Dashboard/Dashboard';
import { AppLayout } from '../layouts/AppLayout';
import { ModulePlaceholder } from '../pages/ModulePlaceholder/ModulePlaceholder';
import { AuditActivity } from '../pages/AuditActivity/AuditActivity';
import { SettingsLanding } from '../pages/Settings/SettingsLanding';
import { NotificationTemplates } from '../pages/Notifications/NotificationTemplates';
import { NotificationTemplateForm } from '../pages/Notifications/NotificationTemplateForm';
import { NotificationHistory } from '../pages/Notifications/NotificationHistory';
import { DiscountConfiguration } from '../pages/Settings/DiscountConfiguration';
import { ChargesConfiguration } from '../pages/Settings/ChargesConfiguration';
import { CountryConfiguration } from '../pages/Settings/CountryConfiguration';

import { Payments } from '../pages/Payments/Payments';
import { RecordPayment } from '../pages/Payments/RecordPayment';
import { PaymentDetails } from '../pages/Payments/PaymentDetails';
import { InvoiceList } from '../pages/Invoices/InvoiceList';
import { InvoiceForm } from '../pages/Invoices/InvoiceForm';
import { InvoiceDetails } from '../pages/Invoices/InvoiceDetails';
import { InvoicePreview } from '../pages/Invoices/InvoicePreview';
import { Taxes } from '../pages/Taxes/Taxes';
import { CategoryList } from '../pages/Products/pages/CategoryList';
import { CategoryFormPage } from '../pages/Products/pages/CategoryFormPage';
import { ProductList } from '../pages/Products/ProductList';
import { ProductDetails } from '../pages/Products/pages/ProductDetails';
import { CreateProduct } from '../pages/Products/pages/CreateProduct';
import { EditProduct } from '../pages/Products/pages/EditProduct';
import { NumberingSettings } from '../pages/NumberingSettings';
import { QuotationManagement } from '../pages/Quotations';
import { InvoiceTemplates, CreateTemplate, EditTemplate, BrandingSettings, TemplatePreview, TemplateVersionHistory, TemplateAuditHistory } from '../pages/InvoiceTemplates/InvoiceTemplates';
import { CreditNoteList } from '../pages/CreditNotes/pages/CreditNoteList';
import { CreditNoteForm } from '../pages/CreditNotes/pages/CreditNoteForm';
import { CreditNoteDetails } from '../pages/CreditNotes/pages/CreditNoteDetails';
import { CreditNoteExportPage } from '../pages/CreditNotes/pages/CreditNoteExportPage';
import { UserRoleAdministration } from '../pages/UserRoleAdministration/UserRoleAdministration';
import { Integrations } from '../pages/Integrations/Integrations';
import { Webhooks } from '../pages/Webhooks/Webhooks';
import { DeliveryHistory } from '../pages/Webhooks/DeliveryHistory';
import { BackgroundJobStatus } from '../pages/BackgroundJobs/BackgroundJobStatus';
import { ExportJobStatus } from '../pages/BackgroundJobs/ExportJobStatus';

// Customers
import { CustomerListPage } from '../pages/Customers/pages/CustomerListPage';
import { CreateCustomer } from '../pages/Customers/pages/CreateCustomer';
import { EditCustomer } from '../pages/Customers/pages/EditCustomer';
import { CustomerDetailsPage } from '../pages/Customers/pages/CustomerDetailsPage';
import { CustomerPrintPage } from '../pages/Customers/pages/CustomerPrintPage';

export const AppRoutes = () => (
  <Routes>
    {/* Public Routes */}
    <Route path="/" element={<Landing />} />
    <Route path="/login" element={<Login />} />
    <Route path="/register" element={<Register />} />
    <Route path="/terms" element={<TermsAndConditions />} />
    <Route path="/privacy" element={<PrivacyPolicy />} />
    <Route path="/forgot-password" element={<ForgotPassword />} />
    <Route path="/verify-otp" element={<VerifyOtp />} />
    <Route path="/reset-password" element={<ResetPassword />} />

    {/* Application Routes */}
    <Route element={<ProtectedRoute><FormDraftProvider><AppLayout /></FormDraftProvider></ProtectedRoute>}>
      <Route path="/dashboard" element={<Dashboard />} />

      {/* Invoices */}
      <Route path="/invoices" element={<PermissionRoute permission="invoices.view"><InvoiceList /></PermissionRoute>} />
      <Route path="/invoices/new" element={<PermissionRoute permission="invoices.create"><InvoiceForm /></PermissionRoute>} />
      <Route path="/invoices/:id" element={<PermissionRoute permission="invoices.view"><InvoiceDetails /></PermissionRoute>} />
      <Route path="/invoices/:id/edit" element={<PermissionRoute permission="invoices.edit"><InvoiceForm /></PermissionRoute>} />
      <Route path="/invoices/:id/preview" element={<PermissionRoute permission="invoices.view"><InvoicePreview /></PermissionRoute>} />

      {/* Quotation Management */}
      <Route path="/quotations" element={<PermissionRoute permission="quotations.view"><QuotationManagement /></PermissionRoute>} />

      {/* Payments */}
      <Route path="/payments" element={<PermissionRoute permission="payments.view"><Payments /></PermissionRoute>} />
      <Route path="/payments/new" element={<PermissionRoute permission="payments.create"><RecordPayment /></PermissionRoute>} />
      <Route path="/payments/:id" element={<PermissionRoute permission="payments.view"><PaymentDetails /></PermissionRoute>} />

      {/* Customers */}
      <Route path="/customers" element={<PermissionRoute permission="customers.view"><CustomerListPage /></PermissionRoute>} />
      <Route path="/customers/create" element={<PermissionRoute permission="customers.create"><CreateCustomer /></PermissionRoute>} />
      <Route path="/customers/:customerId/edit" element={<PermissionRoute permission="customers.edit"><EditCustomer /></PermissionRoute>} />
      <Route path="/customers/:customerId/print" element={<PermissionRoute permission="customers.view"><CustomerPrintPage /></PermissionRoute>} />
      <Route path="/customers/:customerId" element={<PermissionRoute permission="customers.view"><CustomerDetailsPage /></PermissionRoute>} />

      {/* Products & Services */}
      <Route path="/products" element={<PermissionRoute permission="products.view"><ProductList /></PermissionRoute>} />
      <Route path="/products/categories" element={<PermissionRoute permission="products.view"><CategoryList /></PermissionRoute>} />
      <Route path="/products/categories/new" element={<PermissionRoute permission="products.create"><CategoryFormPage /></PermissionRoute>} />
      <Route path="/products/categories/:categoryId/edit" element={<PermissionRoute permission="products.edit"><CategoryFormPage /></PermissionRoute>} />
      <Route path="/products/new" element={<PermissionRoute permission="products.create"><CreateProduct /></PermissionRoute>} />
      <Route path="/products/:id" element={<PermissionRoute permission="products.view"><ProductDetails /></PermissionRoute>} />
      <Route path="/products/:id/edit" element={<PermissionRoute permission="products.edit"><EditProduct /></PermissionRoute>} />

      {/* Credit Notes */}
      <Route path="/credit-notes" element={<PermissionRoute permission="creditnotes.view"><CreditNoteList /></PermissionRoute>} />
      <Route path="/credit-notes/new" element={<PermissionRoute permission="creditnotes.create"><CreditNoteForm /></PermissionRoute>} />
      <Route path="/credit-notes/:id/edit" element={<PermissionRoute permission="creditnotes.edit"><CreditNoteForm /></PermissionRoute>} />
      <Route path="/credit-notes/:id/approve" element={<PermissionRoute permission="creditnotes.approve"><CreditNoteDetails /></PermissionRoute>} />
      <Route path="/credit-notes/:id/refund" element={<PermissionRoute permission="creditnotes.manage"><CreditNoteDetails /></PermissionRoute>} />
      <Route path="/credit-notes/:id/export" element={<PermissionRoute permission="creditnotes.view"><CreditNoteExportPage /></PermissionRoute>} />
      <Route path="/credit-notes/:id/preview" element={<PermissionRoute permission="creditnotes.view"><CreditNoteDetails /></PermissionRoute>} />
      <Route path="/credit-notes/:id" element={<PermissionRoute permission="creditnotes.view"><CreditNoteDetails /></PermissionRoute>} />

      {/* Operations & Insights */}
      <Route path="/recurring-billing" element={<PermissionRoute permission="billing.view"><ModulePlaceholder /></PermissionRoute>} />
      <Route path="/expenses" element={<PermissionRoute permission="billing.view"><ModulePlaceholder /></PermissionRoute>} />
      <Route path="/reports" element={<PermissionRoute permission="reports.view"><ModulePlaceholder /></PermissionRoute>} />
      <Route path="/audit-activity" element={<PermissionRoute permission="audit.view"><AuditActivity /></PermissionRoute>} />

      {/* Administration & Configuration */}
      <Route path="/templates-branding" element={<PermissionRoute permission={['settings.view', 'settings.manage', 'invoices.manage']}><InvoiceTemplates /></PermissionRoute>} />
      <Route path="/templates-branding/new" element={<PermissionRoute permission="settings.manage"><CreateTemplate /></PermissionRoute>} />
      <Route path="/templates-branding/branding" element={<PermissionRoute permission="settings.manage"><BrandingSettings /></PermissionRoute>} />
      <Route path="/templates-branding/preview" element={<PermissionRoute permission="settings.view"><TemplatePreview /></PermissionRoute>} />
      <Route path="/templates-branding/versions" element={<PermissionRoute permission="settings.view"><TemplateVersionHistory /></PermissionRoute>} />
      <Route path="/templates-branding/audit" element={<PermissionRoute permission="audit.view"><TemplateAuditHistory /></PermissionRoute>} />
      <Route path="/templates-branding/:templateId/edit" element={<PermissionRoute permission="settings.manage"><EditTemplate /></PermissionRoute>} />
      <Route path="/invoice-numbering" element={<Navigate to="/settings/numbering" replace />} />
      <Route path="/settings/numbering" element={<PermissionRoute permission={['settings.view', 'settings.manage']}><NumberingSettings /></PermissionRoute>} />
      <Route path="/integrations" element={<PermissionRoute permission="integrations.manage"><Integrations /></PermissionRoute>} />
      <Route path="/webhooks" element={<PermissionRoute permission="integrations.manage"><Webhooks /></PermissionRoute>} />
      <Route path="/webhooks/deliveries" element={<PermissionRoute permission="integrations.manage"><DeliveryHistory /></PermissionRoute>} />
      <Route path="/background-jobs" element={<PermissionRoute permission={['settings.view', 'settings.manage', 'integrations.manage']}><BackgroundJobStatus /></PermissionRoute>} />
      <Route path="/export-jobs" element={<PermissionRoute permission={['billing.view', 'invoices.view', 'reports.view']}><ExportJobStatus /></PermissionRoute>} />
      <Route path="/integration-settings" element={<Navigate to="/integrations" replace />} />
      <Route path="/settings" element={<PermissionRoute permission={['settings.view', 'settings.manage']}><SettingsLanding /></PermissionRoute>} />
      <Route path="/user-role-administration/*" element={<PermissionRoute permission={['users.view', 'roles.view', 'users.assign']}><UserRoleAdministration /></PermissionRoute>} />
      <Route path="/settings/notifications" element={<PermissionRoute permission={['settings.view', 'settings.manage']}><NotificationTemplates /></PermissionRoute>} />
      <Route path="/settings/notifications/new" element={<PermissionRoute permission="settings.manage"><NotificationTemplateForm /></PermissionRoute>} />
      <Route path="/settings/notifications/:id/edit" element={<PermissionRoute permission="settings.manage"><NotificationTemplateForm /></PermissionRoute>} />
      <Route path="/settings/notifications/history" element={<PermissionRoute permission={['settings.view', 'settings.manage']}><NotificationHistory /></PermissionRoute>} />
      <Route path="/settings/countries" element={<PermissionRoute permission={['settings.view', 'settings.manage']}><CountryConfiguration /></PermissionRoute>} />
      <Route path="/settings/country" element={<Navigate to="/settings/countries" replace />} />
      <Route path="/settings/taxes/*" element={<PermissionRoute permission={['settings.view', 'settings.manage']}><Taxes /></PermissionRoute>} />
      <Route path="/taxes/*" element={<Navigate to="/settings/taxes" replace />} />
      <Route path="/settings/discounts" element={<PermissionRoute permission={['settings.view', 'settings.manage']}><DiscountConfiguration /></PermissionRoute>} />
      <Route path="/settings/discount-configuration" element={<Navigate to="/settings/discounts" replace />} />
      <Route path="/settings/discount" element={<Navigate to="/settings/discounts" replace />} />
      <Route path="/discounts" element={<Navigate to="/settings/discounts" replace />} />
      <Route path="/discount-configuration" element={<Navigate to="/settings/discounts" replace />} />
      <Route path="/settings/charges" element={<PermissionRoute permission={['settings.view', 'settings.manage']}><ChargesConfiguration /></PermissionRoute>} />
      <Route path="/support" element={<ModulePlaceholder />} />
    </Route>

    {/* Unknown Route */}
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes>
);
