import { Navigate } from 'react-router-dom';
import { hasPermission } from '../utils/permissionUtils';

export function PermissionRoute({ permission, children }) {
  if (!hasPermission(permission)) {
    return <Navigate to="/dashboard" replace />;
  }
  return children;
}
