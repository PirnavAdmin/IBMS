import { getCurrentUserRoles } from '../../utils/permissionUtils';
export const isPlatformAdmin = user => getCurrentUserRoles(user).includes('SuperAdmin');
export const platformNavigation = [{ label: 'Overview', items: [
  { id: 'platform-dashboard', label: 'Platform Dashboard', icon: 'dashboard', route: '/platform/dashboard' },
  { id: 'platform-tenants', label: 'Tenant Management', icon: 'customer', route: '/platform/tenants' },
  { id: 'platform-users', label: 'Platform Users', icon: 'user-role', route: '/platform/users' },
  { id: 'platform-audit', label: 'Platform Audit Logs', icon: 'activity', route: '/platform/audit' },
  { id: 'platform-settings', label: 'Platform Settings', icon: 'settings', route: '/platform/settings' },
] }];
export const loginDestination = user => isPlatformAdmin(user) ? '/platform/dashboard' : '/dashboard';
