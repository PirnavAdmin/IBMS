import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { FormDraftProvider } from '../context/FormDraftContext';
import { ProtectedRoute } from './ProtectedRoute';
import { PermissionRoute } from './PermissionRoute';

// Keep the shell mounted while the selected page loads; unrelated modules stay unloaded.
const lazyPage = (load, exportName) => {
  const Page = lazy(() => load().then(module => ({ default: module[exportName] })));
  const LazyPage = (props) => (
    <Suspense fallback={<div role="status" aria-live="polite" style={{ padding: 24, color: 'inherit' }}>Loading page…</div>}>
      <Page {...props} />
    </Suspense>
  );
  LazyPage.displayName = exportName;
  return LazyPage;
};

const Landing = lazyPage(() => import('../pages/Landing/Landing'), 'Landing');
const Login = lazyPage(() => import('../pages/Login/Login'), 'Login');
const Register = lazyPage(() => import('../pages/Register/Register'), 'Register');
const TermsAndConditions = lazyPage(() => import('../pages/Legal/LegalPages'), 'TermsAndConditions');
const PrivacyPolicy = lazyPage(() => import('../pages/Legal/LegalPages'), 'PrivacyPolicy');
const ForgotPassword = lazyPage(() => import('../pages/ForgotPassword/ForgotPassword'), 'ForgotPassword');
const VerifyOtp = lazyPage(() => import('../pages/VerifyOtp/VerifyOtp'), 'VerifyOtp');
const ResetPassword = lazyPage(() => import('../pages/ResetPassword/ResetPassword'), 'ResetPassword');
const Dashboard = lazyPage(() => import('../pages/Dashboard/Dashboard'), 'Dashboard');
const AppLayout = lazyPage(() => import('../layouts/AppLayout'), 'AppLayout');
const ModulePlaceholder = lazyPage(() => import('../pages/ModulePlaceholder/ModulePlaceholder'), 'ModulePlaceholder');
const AuditActivity = lazyPage(() => import('../pages/AuditActivity/AuditActivity'), 'AuditActivity');
const SettingsWorkspace = lazyPage(() => import('../pages/Settings/SettingsWorkspace'), 'SettingsWorkspace');
const SettingsLanding = lazyPage(() => import('../pages/Settings/SettingsLanding'), 'SettingsLanding');
const NotificationTemplates = lazyPage(() => import('../pages/Notifications/NotificationTemplates'), 'NotificationTemplates');
const NotificationTemplateForm = lazyPage(() => import('../pages/Notifications/NotificationTemplateForm'), 'NotificationTemplateForm');
const NotificationHistory = lazyPage(() => import('../pages/Notifications/NotificationHistory'), 'NotificationHistory');
const DiscountConfiguration = lazyPage(() => import('../pages/Settings/DiscountConfiguration'), 'DiscountConfiguration');
const ChargesConfiguration = lazyPage(() => import('../pages/Settings/ChargesConfiguration'), 'ChargesConfiguration');
const CountryConfiguration = lazyPage(() => import('../pages/Settings/CountryConfiguration'), 'CountryConfiguration');
const Payments = lazyPage(() => import('../pages/Payments/Payments'), 'Payments');
const RecordPayment = lazyPage(() => import('../pages/Payments/RecordPayment'), 'RecordPayment');
const PaymentDetails = lazyPage(() => import('../pages/Payments/PaymentDetails'), 'PaymentDetails');
const InvoiceList = lazyPage(() => import('../pages/Invoices/InvoiceList'), 'InvoiceList');
const InvoiceForm = lazyPage(() => import('../pages/Invoices/InvoiceForm'), 'InvoiceForm');
const InvoiceDetails = lazyPage(() => import('../pages/Invoices/InvoiceDetails'), 'InvoiceDetails');
const InvoicePreview = lazyPage(() => import('../pages/Invoices/InvoicePreview'), 'InvoicePreview');
const Taxes = lazyPage(() => import('../pages/Taxes/Taxes'), 'Taxes');
const CategoryList = lazyPage(() => import('../pages/Products/pages/CategoryList'), 'CategoryList');
const CategoryFormPage = lazyPage(() => import('../pages/Products/pages/CategoryFormPage'), 'CategoryFormPage');
const ProductList = lazyPage(() => import('../pages/Products/ProductList'), 'ProductList');
const ProductDetails = lazyPage(() => import('../pages/Products/pages/ProductDetails'), 'ProductDetails');
const CreateProduct = lazyPage(() => import('../pages/Products/pages/CreateProduct'), 'CreateProduct');
const EditProduct = lazyPage(() => import('../pages/Products/pages/EditProduct'), 'EditProduct');
const NumberingSettings = lazyPage(() => import('../pages/NumberingSettings'), 'NumberingSettings');
const QuotationManagement = lazyPage(() => import('../pages/Quotations'), 'QuotationManagement');
const InvoiceTemplates = lazyPage(() => import('../pages/InvoiceTemplates/InvoiceTemplates'), 'InvoiceTemplates');
const CreateTemplate = lazyPage(() => import('../pages/InvoiceTemplates/InvoiceTemplates'), 'CreateTemplate');
const EditTemplate = lazyPage(() => import('../pages/InvoiceTemplates/InvoiceTemplates'), 'EditTemplate');
const BrandingSettings = lazyPage(() => import('../pages/InvoiceTemplates/InvoiceTemplates'), 'BrandingSettings');
const TemplatePreview = lazyPage(() => import('../pages/InvoiceTemplates/InvoiceTemplates'), 'TemplatePreview');
const TemplateVersionHistory = lazyPage(() => import('../pages/InvoiceTemplates/InvoiceTemplates'), 'TemplateVersionHistory');
const TemplateAuditHistory = lazyPage(() => import('../pages/InvoiceTemplates/InvoiceTemplates'), 'TemplateAuditHistory');
const CreditNoteList = lazyPage(() => import('../pages/CreditNotes/pages/CreditNoteList'), 'CreditNoteList');
const CreditNoteForm = lazyPage(() => import('../pages/CreditNotes/pages/CreditNoteForm'), 'CreditNoteForm');
const CreditNoteDetails = lazyPage(() => import('../pages/CreditNotes/pages/CreditNoteDetails'), 'CreditNoteDetails');
const CreditNoteExportPage = lazyPage(() => import('../pages/CreditNotes/pages/CreditNoteExportPage'), 'CreditNoteExportPage');
const UserRoleAdministration = lazyPage(() => import('../pages/UserRoleAdministration/UserRoleAdministration'), 'UserRoleAdministration');
const Integrations = lazyPage(() => import('../pages/Integrations/Integrations'), 'Integrations');
const Webhooks = lazyPage(() => import('../pages/Webhooks/Webhooks'), 'Webhooks');
const DeliveryHistory = lazyPage(() => import('../pages/Webhooks/DeliveryHistory'), 'DeliveryHistory');
const BackgroundJobStatus = lazyPage(() => import('../pages/BackgroundJobs/BackgroundJobStatus'), 'BackgroundJobStatus');
const ExportJobStatus = lazyPage(() => import('../pages/BackgroundJobs/ExportJobStatus'), 'ExportJobStatus');
const CustomerListPage = lazyPage(() => import('../pages/Customers/pages/CustomerListPage'), 'CustomerListPage');
const CreateCustomer = lazyPage(() => import('../pages/Customers/pages/CreateCustomer'), 'CreateCustomer');
const EditCustomer = lazyPage(() => import('../pages/Customers/pages/EditCustomer'), 'EditCustomer');
const CustomerDetailsPage = lazyPage(() => import('../pages/Customers/pages/CustomerDetailsPage'), 'CustomerDetailsPage');
const CustomerPrintPage = lazyPage(() => import('../pages/Customers/pages/CustomerPrintPage'), 'CustomerPrintPage');

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
      <Route path="/settings/numbering" element={<PermissionRoute permission={['settings.view', 'settings.manage']}><SettingsWorkspace><NumberingSettings /></SettingsWorkspace></PermissionRoute>} />
      <Route path="/integrations" element={<PermissionRoute permission="integrations.manage"><Integrations /></PermissionRoute>} />
      <Route path="/webhooks" element={<PermissionRoute permission="integrations.manage"><Webhooks /></PermissionRoute>} />
      <Route path="/webhooks/deliveries" element={<PermissionRoute permission="integrations.manage"><DeliveryHistory /></PermissionRoute>} />
      <Route path="/background-jobs" element={<PermissionRoute permission={['settings.view', 'settings.manage', 'integrations.manage']}><BackgroundJobStatus /></PermissionRoute>} />
      <Route path="/export-jobs" element={<PermissionRoute permission={['billing.view', 'invoices.view', 'reports.view']}><ExportJobStatus /></PermissionRoute>} />
      <Route path="/integration-settings" element={<Navigate to="/integrations" replace />} />
      <Route path="/settings" element={<PermissionRoute permission={['settings.view', 'settings.manage']}><SettingsWorkspace><SettingsLanding /></SettingsWorkspace></PermissionRoute>} />
      <Route path="/user-role-administration/*" element={<PermissionRoute permission={['users.view', 'roles.view', 'users.assign']}><UserRoleAdministration /></PermissionRoute>} />
      <Route path="/settings/notifications" element={<PermissionRoute permission={['settings.view', 'settings.manage']}><SettingsWorkspace><NotificationTemplates /></SettingsWorkspace></PermissionRoute>} />
      <Route path="/settings/notifications/new" element={<PermissionRoute permission="settings.manage"><SettingsWorkspace><NotificationTemplateForm /></SettingsWorkspace></PermissionRoute>} />
      <Route path="/settings/notifications/:id/edit" element={<PermissionRoute permission="settings.manage"><SettingsWorkspace><NotificationTemplateForm /></SettingsWorkspace></PermissionRoute>} />
      <Route path="/settings/notifications/history" element={<PermissionRoute permission={['settings.view', 'settings.manage']}><SettingsWorkspace><NotificationHistory /></SettingsWorkspace></PermissionRoute>} />
      <Route path="/settings/countries" element={<PermissionRoute permission={['settings.view', 'settings.manage']}><SettingsWorkspace><CountryConfiguration /></SettingsWorkspace></PermissionRoute>} />
      <Route path="/settings/country" element={<Navigate to="/settings/countries" replace />} />
      <Route path="/settings/taxes/*" element={<PermissionRoute permission={['settings.view', 'settings.manage']}><SettingsWorkspace><Taxes embedded /></SettingsWorkspace></PermissionRoute>} />
      <Route path="/taxes/*" element={<Navigate to="/settings/taxes" replace />} />
      <Route path="/settings/discounts" element={<PermissionRoute permission={['settings.view', 'settings.manage']}><SettingsWorkspace><DiscountConfiguration /></SettingsWorkspace></PermissionRoute>} />
      <Route path="/settings/discount-configuration" element={<Navigate to="/settings/discounts" replace />} />
      <Route path="/settings/discount" element={<Navigate to="/settings/discounts" replace />} />
      <Route path="/discounts" element={<Navigate to="/settings/discounts" replace />} />
      <Route path="/discount-configuration" element={<Navigate to="/settings/discounts" replace />} />
      <Route path="/settings/charges" element={<PermissionRoute permission={['settings.view', 'settings.manage']}><SettingsWorkspace><ChargesConfiguration /></SettingsWorkspace></PermissionRoute>} />
    </Route>

    {/* Unknown Route */}
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes>
);
