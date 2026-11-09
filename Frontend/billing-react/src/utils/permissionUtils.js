export function getCurrentUser() {
  try {
    const raw = localStorage.getItem('billing_auth_user');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function getCurrentUserRoles(userObj = null) {
  const user = userObj || getCurrentUser();
  if (!user) return [];
  const roles = user.roles || user.Roles || (user.role ? [user.role] : []);
  return (Array.isArray(roles) ? roles : [roles])
    .filter(Boolean)
    .flatMap(r => String(r).split(','))
    .map(r => r.trim());
}

export function getCurrentUserPermissions(userObj = null) {
  const user = userObj || getCurrentUser();
  if (!user) return [];
  const perms = user.permissions || user.Permissions || [];
  return (Array.isArray(perms) ? perms : [perms])
    .filter(Boolean)
    .flatMap(p => String(p).split(','))
    .map(p => p.trim().toLowerCase());
}

export function isSuperOrTenantAdmin(userObj = null) {
  const roles = getCurrentUserRoles(userObj).map(r => r.toLowerCase());
  const perms = getCurrentUserPermissions(userObj);
  return (
    roles.includes('superadmin') ||
    roles.includes('tenantadmin') ||
    roles.includes('admin') ||
    perms.includes('all') ||
    perms.includes('*')
  );
}

export function hasPermission(requiredPermission, userObj = null) {
  if (!requiredPermission) return true;
  if (isSuperOrTenantAdmin(userObj)) return true;

  const roles = getCurrentUserRoles(userObj).map(r => r.toLowerCase());
  const userPerms = getCurrentUserPermissions(userObj);
  const reqList = (Array.isArray(requiredPermission) ? requiredPermission : [requiredPermission])
    .map(p => String(p).toLowerCase().trim());

  const isRestrictedPortalRole =
    (roles.includes('customer') || roles.includes('viewer')) &&
    !roles.some(r => ['superadmin', 'tenantadmin', 'admin', 'billingmanager', 'accountant', 'user'].includes(r));

  if (isRestrictedPortalRole) {
    if (reqList.includes('backgroundjobs.view') || reqList.includes('backgroundjobs.manage')) {
      return false;
    }
    if (reqList.includes('exportjobs.view') || reqList.includes('exportjobs.create')) {
      return userPerms.includes('exportjobs.view') || userPerms.includes('exportjobs.create');
    }
  }

  return reqList.some(p => userPerms.includes(p));
}
