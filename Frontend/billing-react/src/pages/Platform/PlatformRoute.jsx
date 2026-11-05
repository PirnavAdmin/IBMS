import { Navigate } from 'react-router-dom';
import { useCurrentUser } from '../../hooks/useCurrentUser';
import { isPlatformAdmin } from './platformAccess';
export function PlatformRoute({ children }) { return isPlatformAdmin(useCurrentUser()) ? children : <section role="alert" className="platform-page"><h1>Access denied</h1><p>SuperAdmin access is required for platform administration.</p></section>; }
export function DashboardEntry({ children }) { return isPlatformAdmin(useCurrentUser()) ? <Navigate to="/platform/dashboard" replace /> : children; }
