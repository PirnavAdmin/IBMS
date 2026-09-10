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

import { Payments } from '../pages/Payments/Payments';
import { Invoices } from '../pages/Invoices/Invoices';
import { Taxes } from '../pages/Taxes/Taxes';

// ==============================
// CUSTOMER MODULE
// ==============================

// Manikanta - Customer List
import { CustomerListPage } from '../features/customers/CustomerListPage';

// Jayakrishna - Create & Edit Customer
import { CreateCustomer } from '../features/customer/pages/CreateCustomer';
import { EditCustomer } from '../features/customer/pages/EditCustomer';

// Sumanth - Customer Details
import { CustomerDetailsPage } from '../pages/Customers/CustomerDetailsPage';

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

      {/* Payments */}
      <Route path="/payments" element={<Payments />} />

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
        path="/customers/:customerId"
        element={<CustomerDetailsPage />}
      />

      {/* Other Modules */}
      <Route path="/products" element={<ModulePlaceholder />} />
      <Route path="/credit-notes" element={<ModulePlaceholder />} />
      <Route path="/recurring-billing" element={<ModulePlaceholder />} />
      <Route path="/expenses" element={<ModulePlaceholder />} />
      <Route path="/taxes/*" element={<Taxes />} />
      <Route path="/reports" element={<ModulePlaceholder />} />
      <Route path="/audit-activity" element={<ModulePlaceholder />} />
      <Route path="/templates-branding" element={<ModulePlaceholder />} />
      <Route path="/invoice-numbering" element={<ModulePlaceholder />} />
      <Route path="/integration-settings" element={<ModulePlaceholder />} />
      <Route path="/settings" element={<ModulePlaceholder />} />
      <Route path="/support" element={<ModulePlaceholder />} />
    </Route>

    {/* Unknown Route */}
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes>
);