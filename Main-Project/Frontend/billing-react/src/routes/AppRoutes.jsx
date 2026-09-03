import { Routes, Route, Navigate } from 'react-router-dom';
import { Landing } from '../pages/Landing/Landing';
import { Login } from '../pages/Login/Login';
import { Register } from '../pages/Register/Register';
import { ForgotPassword } from '../pages/ForgotPassword/ForgotPassword';
import { VerifyOtp } from '../pages/VerifyOtp/VerifyOtp';
import { ResetPassword } from '../pages/ResetPassword/ResetPassword';
import { Dashboard } from '../pages/Dashboard/Dashboard';
import { CreateInvoice } from '../pages/CreateInvoice/CreateInvoice';

export const AppRoutes = () => (
  <Routes>
    <Route path="/" element={<Landing />} />
    <Route path="/login" element={<Login />} />
    <Route path="/register" element={<Register />} />
    <Route path="/forgot-password" element={<ForgotPassword />} />
    <Route path="/verify-otp" element={<VerifyOtp />} />
    <Route path="/reset-password" element={<ResetPassword />} />
    <Route path="/dashboard" element={<Dashboard />} />
    <Route path="/invoices" element={<CreateInvoice />} />
    <Route path="/invoices/new" element={<CreateInvoice />} />
    <Route path="/invoices/create" element={<CreateInvoice />} />
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes>
);
