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

export const AppRoutes = () => (
  <Routes>
    <Route path="/" element={<Landing />} />
    <Route path="/login" element={<Login />} />
    <Route path="/register" element={<Register />} />
    <Route path="/forgot-password" element={<ForgotPassword />} />
    <Route path="/verify-otp" element={<VerifyOtp />} />
    <Route path="/reset-password" element={<ResetPassword />} />
    <Route element={<AppLayout />}>
      <Route path="/dashboard" element={<Dashboard />} />
      <Route path="/invoices" element={<CreateInvoice />} />
      <Route path="/invoices/new" element={<CreateInvoice />} />
      <Route path="/invoices/create" element={<CreateInvoice />} />
      <Route path="/payments" element={<Payments />} />
      <Route path="/customers" element={<ModulePlaceholder />} />
      <Route path="/products" element={<ModulePlaceholder />} />
      <Route path="/credit-notes" element={<ModulePlaceholder />} />
      <Route path="/recurring-billing" element={<ModulePlaceholder />} />
      <Route path="/expenses" element={<ModulePlaceholder />} />
      <Route path="/taxes" element={<ModulePlaceholder />} />
      <Route path="/reports" element={<ModulePlaceholder />} />
      <Route path="/audit-activity" element={<ModulePlaceholder />} />
      <Route path="/settings" element={<ModulePlaceholder />} />
      <Route path="/support" element={<ModulePlaceholder />} />
    </Route>
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes>
);
