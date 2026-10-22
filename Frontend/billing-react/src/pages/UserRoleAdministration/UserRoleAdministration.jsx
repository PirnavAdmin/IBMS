import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  AccountTreeOutlined,
  AdminPanelSettingsOutlined,
  ArrowBackOutlined,
  BadgeOutlined,
  BlockOutlined,
  CheckCircleOutline,
  DeleteOutline,
  EditOutlined,
  GroupOutlined,
  MoreVertOutlined,
  PersonAddAlt1Outlined,
  SearchOutlined,
  ShieldOutlined,
  VpnKeyOutlined,
  VisibilityOutlined,
} from '@mui/icons-material';
import {
  Alert,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  FormControl,
  FormControlLabel,
  FormGroup,
  IconButton,
  InputAdornment,
  InputLabel,
  ListItemIcon,
  Menu,
  MenuItem,
  Select,
  Tab,
  TablePagination,
  Tabs,
  TextField,
} from '@mui/material';
import { userRoleAdministrationService as service } from './userRoleAdministrationService';
import { FeedbackSnackbar } from '../../components/FeedbackSnackbar';
import { PasswordVisibilityToggle } from '../../components/PasswordVisibilityToggle';
import './user-role-administration.css';

const root = '/user-role-administration';
const tabs = [
  { id: 'users', label: 'Users', icon: GroupOutlined },
  { id: 'roles', label: 'Roles', icon: ShieldOutlined },
  { id: 'permissions', label: 'Permissions', icon: VpnKeyOutlined },
  { id: 'assignments', label: 'Assignments', icon: AccountTreeOutlined },
];
const emptyUser = { name: '', username: '', email: '', password: '', roles: [], permissions: [], tenantId: '', applicationId: '', status: 'Active', identityType: 'Platform', externalProvider: '', externalSubjectId: '', externalScopes: '' };
const emptyRole = { name: '', description: '', tenantId: '', permissions: [] };
const selectMenuProps = {
  variant: 'menu',
  anchorOrigin: { vertical: 'bottom', horizontal: 'left' },
  transformOrigin: { vertical: 'top', horizontal: 'left' },
  marginThreshold: 8,
  PaperProps: { className: 'ura-select-menu' },
};
const getError = (error) => error?.userMessage || error?.message || 'The request could not be completed.';
const getMessage = (result, fallback) => result?.message || fallback;
const statusValue = (item) => item?.status ?? item?.Status ?? (item?.isActive ?? item?.IsActive ? 'Active' : 'Inactive');
const recordValue = (item, key, pascalKey) => item?.[key] ?? item?.[pascalKey];
const permissionModuleOrder = [
  'Dashboard', 'Billing', 'Invoices', 'Quotation Management', 'Payments', 'Customers',
  'Products & Services', 'Credit Notes', 'Background Jobs', 'Export Jobs',
  'Templates & Branding', 'Audit Activity', 'Integration Settings',
  'Webhook Configuration', 'User & Role Administration', 'Settings / Administration',
];
const permissionModuleName = (value) => {
  const normalized = String(value || '').replace(/[^a-z]/gi, '').toLowerCase();
  if (normalized === 'administration' || normalized === 'userroleadministration') return 'User & Role Administration';
  if (normalized === 'recurring' || normalized === 'recurringbilling' || normalized === 'reports') return null;
  return permissionModuleOrder.find((module) => module.replace(/[^a-z]/gi, '').toLowerCase() === normalized) || String(value || 'Other');
};
const groupPermissionDefinitions = (permissions = []) => {
  const grouped = new Map(permissionModuleOrder.map((module) => [module, []]));
  for (const permission of permissions) {
    const module = permissionModuleName(recordValue(permission, 'module', 'Module'));
    if (!module) continue;
    if (!grouped.has(module)) grouped.set(module, []);
    grouped.get(module).push(permission);
  }
  return [...grouped.entries()].map(([module, entries]) => [
    module,
    entries.slice().sort((a, b) => String(recordValue(a, 'name', 'Name') || '').localeCompare(String(recordValue(b, 'name', 'Name') || ''))),
  ]);
};
const getExcludedPermissionCodes = (permissions = []) => new Set(permissions
  .filter((permission) => permissionModuleName(recordValue(permission, 'module', 'Module')) === null)
  .map((permission) => recordValue(permission, 'code', 'Code')));

function useDebounced(value, delay = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

function SectionHeading({ icon: Icon, title, description, action }) {
  return <div className="ura-section-heading">
    <div className="ura-section-icon"><Icon /></div>
    <div className="ura-section-copy"><h2>{title}</h2><p>{description}</p></div>
    {action && <div className="ura-section-action">{action}</div>}
  </div>;
}

function EmptyState({ title, children, icon: Icon = GroupOutlined }) {
  return <div className="ura-empty-state"><span className="ura-empty-icon"><Icon /></span><h3>{title}</h3><p>{children}</p></div>;
}

function QueryState({ query, label, retry, empty, children }) {
  if (query.isPending) return <div className="ura-resource-state" role="status"><CircularProgress size={22} /><span>Loading {label.toLowerCase()}…</span></div>;
  if (query.isError) return <Alert severity="error" action={<Button color="inherit" size="small" onClick={() => (retry ? retry() : query.refetch())}>Retry</Button>}>{getError(query.error)}</Alert>;
  if (empty) return <EmptyState title={`No ${label.toLowerCase()} available`}>{empty}</EmptyState>;
  return children;
}

function currentTenantId() {
  try {
    const user = JSON.parse(localStorage.getItem('billing_auth_user') || 'null');
    const tenantId = user?.tenantId ?? user?.TenantId;
    return tenantId !== '' && tenantId != null && Number.isInteger(Number(tenantId)) ? Number(tenantId) : undefined;
  } catch {
    return undefined;
  }
}

function currentApplicationId() {
  try {
    const user = JSON.parse(localStorage.getItem('billing_auth_user') || 'null');
    return user?.applicationId ?? user?.ApplicationId ?? '';
  } catch {
    return '';
  }
}

function FormActions({ busy, onCancel, onSubmit, saveLabel = 'Save' }) {
  return <div className="ura-form-actions">
    <Button onClick={onCancel} variant="outlined" disabled={busy}>Cancel</Button>
    <Button onClick={onSubmit} variant="contained" disabled={busy}>{busy ? 'Saving…' : saveLabel}</Button>
  </div>;
}

function StatusBadge({ status }) {
  const active = String(status).toLowerCase() === 'active';
  return <span className={`ura-status-badge ${active ? 'is-active' : 'is-inactive'}`}>{status || '—'}</span>;
}

function RowActionsMenu({ actions }) {
  const [anchor, setAnchor] = useState(null);
  const close = () => setAnchor(null);
  return <>
    <IconButton className="ura-action-menu-button" size="small" aria-label="Open row actions" aria-haspopup="menu" onClick={(event) => setAnchor(event.currentTarget)}><MoreVertOutlined /></IconButton>
    <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={close} PaperProps={{ className: 'ura-select-menu ura-action-menu' }} anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }} transformOrigin={{ vertical: 'top', horizontal: 'right' }}>
      {actions.map(({ label, onClick, disabled, icon: Icon }) => <MenuItem key={label} className={label.startsWith('Delete') ? 'ura-delete-action' : ''} disabled={disabled} onClick={() => { close(); onClick(); }}>
        {Icon && <ListItemIcon><Icon fontSize="small" /></ListItemIcon>}{label}
      </MenuItem>)}
    </Menu>
  </>;
}

function UserList({ onCreate, onOpenUser, onEditUser, onToggleStatus, onDeleteUser, assignmentMode = false }) {
  const [searchInput, setSearchInput] = useState('');
  const [status, setStatus] = useState('all');
  const [role, setRole] = useState('all');
  const [identityType, setIdentityType] = useState('all');
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const search = useDebounced(searchInput);
  const tenantId = currentTenantId();
  const rolesQuery = useQuery({ queryKey: ['ura', 'roles', tenantId], queryFn: ({ signal }) => service.listRoles({ tenantId, signal }), retry: false });
  const params = { Search: search || undefined, Status: status === 'all' ? undefined : status, Role: role === 'all' ? undefined : role, IdentityType: identityType === 'all' ? undefined : identityType, TenantId: tenantId, PageNumber: page + 1, PageSize: pageSize };
  const usersQuery = useQuery({
    queryKey: ['ura', 'users', params],
    queryFn: ({ signal }) => service.listUsers(params, { signal }),
    retry: false,
    placeholderData: (previous) => previous,
  });
  const users = usersQuery.data?.items ?? [];
  const roles = rolesQuery.data ?? [];
  const changeSearch = (event) => { setSearchInput(event.target.value); setPage(0); };
  const changeStatus = (event) => { setStatus(event.target.value); setPage(0); };
  const changeRole = (event) => { setRole(event.target.value); setPage(0); };
  const changeIdentityType = (event) => { setIdentityType(event.target.value); setPage(0); };
  const resetFilters = () => { setSearchInput(''); setStatus('all'); setRole('all'); setIdentityType('all'); setPage(0); };
  const hasFilters = Boolean(searchInput || status !== 'all' || role !== 'all' || identityType !== 'all');
  const totalUsers = usersQuery.data?.totalCount ?? users.length;

  return <>
    <SectionHeading
      icon={assignmentMode ? AccountTreeOutlined : GroupOutlined}
      title={assignmentMode ? 'User assignments' : 'Users'}
      description={assignmentMode ? 'Review each user’s assigned roles, tenant, and application.' : 'Search users and review their role, tenant, application, and account status.'}
      action={<div className="ura-user-header-actions"><div className="ura-user-count-card ura-user-count-pill" aria-live="polite"><strong>{usersQuery.isPending ? '…' : totalUsers}</strong><span>{totalUsers === 1 ? 'User' : 'Users'}</span></div>{!assignmentMode && <Button variant="contained" startIcon={<PersonAddAlt1Outlined />} onClick={onCreate}>Create user</Button>}</div>}
    />
    <div className="ura-filter-bar ura-user-filter-bar">
      <div className="ura-filter-field ura-filter-search"><TextField id="ura-user-search" label="Search" InputLabelProps={{ shrink: true }} size="small" fullWidth placeholder="Name, username, or email" value={searchInput} onChange={changeSearch} InputProps={{ startAdornment: <SearchOutlined className="ura-search-icon" /> }} inputProps={{ 'aria-label': 'Search users by name, username, or email' }} /></div>
      <div className="ura-filter-field ura-filter-status"><FormControl size="small" fullWidth><InputLabel id="ura-status-filter-label" shrink>Status</InputLabel><Select MenuProps={selectMenuProps} id="ura-status-filter" labelId="ura-status-filter-label" label="Status" value={status} onChange={changeStatus}><MenuItem value="all">All statuses</MenuItem><MenuItem value="Active">Active</MenuItem><MenuItem value="Inactive">Inactive</MenuItem></Select></FormControl></div>
      <div className="ura-filter-role ura-filter-field"><FormControl size="small" fullWidth disabled={rolesQuery.isPending || rolesQuery.isError}><InputLabel id="ura-role-filter-label" shrink>Role</InputLabel><Select MenuProps={selectMenuProps} id="ura-role-filter" labelId="ura-role-filter-label" label="Role" value={role} onChange={changeRole}><MenuItem value="all">All roles</MenuItem>{roles.map((item) => { const name = recordValue(item, 'name', 'Name'); return <MenuItem key={name} value={name}>{name}</MenuItem>; })}</Select></FormControl></div>
      <div className="ura-filter-field ura-filter-identity"><FormControl size="small" fullWidth><InputLabel id="ura-identity-filter-label" shrink>Identity type</InputLabel><Select MenuProps={selectMenuProps} id="ura-identity-filter" labelId="ura-identity-filter-label" label="Identity type" value={identityType} onChange={changeIdentityType}><MenuItem value="all">All identity types</MenuItem><MenuItem value="Platform">Platform</MenuItem><MenuItem value="Host">Host</MenuItem></Select></FormControl></div>
      <Button className="ura-reset-filters" variant="text" onClick={resetFilters} disabled={!hasFilters}>Clear Filters</Button>
    </div>
    {rolesQuery.isError && <Alert severity="error" className="ura-inline-alert">Unable to load role filter options: {getError(rolesQuery.error)}</Alert>}
    <div className="ura-table-wrap"><table className={`ura-table ura-user-table${assignmentMode ? ' ura-assignment-table' : ''}`}>
      <thead><tr>{assignmentMode ? <><th>Name</th><th>Roles</th><th>Tenant</th><th>Application</th><th>Status</th><th>Actions</th></> : <><th>Name</th><th>Username</th><th>Email</th><th>Role</th><th>Tenant</th><th>Application</th><th>Identity type</th><th>Status</th><th>Actions</th></>}</tr></thead>
      <tbody>
        {usersQuery.isPending && <tr><td colSpan={assignmentMode ? 6 : 9}><div className="ura-resource-state"><CircularProgress size={22} /><span>Loading users…</span></div></td></tr>}
        {usersQuery.isError && <tr><td colSpan={assignmentMode ? 6 : 9}><Alert severity="error" action={<Button color="inherit" size="small" onClick={() => usersQuery.refetch()}>Retry</Button>}>{getError(usersQuery.error)}</Alert></td></tr>}
        {!usersQuery.isPending && !usersQuery.isError && users.map((user) => {
          const id = recordValue(user, 'id', 'Id');
          const userRoles = recordValue(user, 'roles', 'Roles') ?? [];
          const tenant = recordValue(user, 'tenantName', 'TenantName') || recordValue(user, 'tenantCode', 'TenantCode') || recordValue(user, 'tenantId', 'TenantId') || '—';
          const application = recordValue(user, 'applicationId', 'ApplicationId') || '—';
          const userStatus = String(statusValue(user)).toLowerCase() === 'active' ? 'Inactive' : 'Active';
          const actions = [
            { label: 'View details', icon: VisibilityOutlined, onClick: () => onOpenUser(id) },
            { label: assignmentMode ? 'Edit assignments' : 'Edit user', icon: EditOutlined, onClick: () => onEditUser(id) },
            ...(!assignmentMode ? [{ label: userStatus === 'Inactive' ? 'Deactivate user' : 'Activate user', icon: userStatus === 'Inactive' ? BlockOutlined : CheckCircleOutline, onClick: () => onToggleStatus(id, userStatus) }] : []),
            ...(!assignmentMode && onDeleteUser ? [{ label: 'Delete user', icon: DeleteOutline, onClick: () => { if (window.confirm('Delete this user permanently?')) onDeleteUser(id); } }] : []),
          ];
          return <tr key={id}>
            <td><strong>{recordValue(user, 'name', 'Name') || '—'}</strong></td>
            {!assignmentMode && <><td>{recordValue(user, 'username', 'Username') || '—'}</td><td>{recordValue(user, 'email', 'Email') || '—'}</td></>}
            <td>{Array.isArray(userRoles) && userRoles.length ? userRoles.join(', ') : '—'}</td>
            <td>{tenant}</td><td>{application}</td>{!assignmentMode && <td>{recordValue(user, 'identityType', 'IdentityType') || '—'}</td>}<td><StatusBadge status={statusValue(user)} /></td>
            <td className="ura-action-cell"><RowActionsMenu actions={actions} /></td>
          </tr>;
        })}
        {!usersQuery.isPending && !usersQuery.isError && users.length === 0 && <tr><td colSpan={assignmentMode ? 6 : 9}><EmptyState title="No users available">No users were returned by the User API for the current search and filters.</EmptyState></td></tr>}
      </tbody>
    </table></div>
    <TablePagination component="div" className="ura-pagination" count={usersQuery.data?.totalCount ?? 0} page={page} onPageChange={(_, next) => setPage(next)} rowsPerPage={pageSize} onRowsPerPageChange={(event) => { setPageSize(Number(event.target.value)); setPage(0); }} rowsPerPageOptions={[5, 10, 25, 50]} />
  </>;
}

function UserForm({ userId, onCancel, onSaved }) {
  const editing = Boolean(userId);
  const queryClient = useQueryClient();
  const userQuery = useQuery({ queryKey: ['ura', 'user', userId], queryFn: ({ signal }) => service.getUser(userId, { signal }), enabled: editing, retry: false });
  const [values, setValues] = useState(() => ({ ...emptyUser, tenantId: currentTenantId() ?? '', applicationId: currentApplicationId() }));
  const selectedTenantId = values.tenantId ? Number(values.tenantId) : currentTenantId();
  const rolesQuery = useQuery({ queryKey: ['ura', 'roles', selectedTenantId], queryFn: ({ signal }) => service.listRoles({ tenantId: selectedTenantId, signal }), retry: false });
  const permissionsQuery = useQuery({ queryKey: ['ura', 'permissions'], queryFn: ({ signal }) => service.listPermissions({ signal }), retry: false });
  const [errors, setErrors] = useState({});
  const [attempted, setAttempted] = useState(false);
  const [serverError, setServerError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [openPermissionGroup, setOpenPermissionGroup] = useState(null);
  useEffect(() => {
    if (!userQuery.data) return;
    setValues({
      name: recordValue(userQuery.data, 'name', 'Name') ?? '',
      username: recordValue(userQuery.data, 'username', 'Username') ?? recordValue(userQuery.data, 'email', 'Email') ?? '',
      email: recordValue(userQuery.data, 'email', 'Email') ?? '',
      password: '',
      roles: (() => { const assigned = recordValue(userQuery.data, 'roles', 'Roles') ?? []; return (Array.isArray(assigned) ? assigned : [assigned]).filter(Boolean).slice(0, 1); })(),
      permissions: recordValue(userQuery.data, 'permissions', 'Permissions') ?? [],
      tenantId: recordValue(userQuery.data, 'tenantId', 'TenantId') ?? '',
      applicationId: recordValue(userQuery.data, 'applicationId', 'ApplicationId') ?? '',
      status: statusValue(userQuery.data),
      identityType: String(recordValue(userQuery.data, 'identityType', 'IdentityType') ?? 'Platform').toLowerCase() === 'host' ? 'Host' : 'Platform',
      externalProvider: recordValue(userQuery.data, 'externalProvider', 'ExternalProvider') ?? '',
      externalSubjectId: recordValue(userQuery.data, 'externalSubjectId', 'ExternalSubjectId') ?? '',
      externalScopes: recordValue(userQuery.data, 'externalScopes', 'ExternalScopes') ?? '',
    });
  }, [userQuery.data]);
  const mutation = useMutation({
    mutationFn: (payload) => editing ? service.updateUser(userId, payload) : payload.IdentityType === 'Host' ? service.mapHostIdentity(payload) : service.createUser(payload),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ['ura'] });
      onSaved(getMessage(result, `User ${editing ? 'updated' : 'created'} successfully.`), result?.data);
    },
    onError: (error) => setServerError(getError(error)),
  });
  const roles = rolesQuery.data ?? [];
  const permissions = permissionsQuery.data ?? [];
  const permissionGroups = useMemo(() => groupPermissionDefinitions(permissions), [permissions]);
  const excludedPermissionCodes = useMemo(() => getExcludedPermissionCodes(permissions), [permissions]);
  const update = (key) => (event) => setValues((current) => ({ ...current, [key]: event.target.value }));
  const selectRole = (event) => {
    const selectedName = event.target.value;
    const selectedRole = roles.find((item) => recordValue(item, 'name', 'Name') === selectedName);
    const rolePermissions = selectedRole && recordValue(selectedRole, 'permissions', 'Permissions');
    setValues((current) => ({
      ...current,
      roles: selectedName ? [selectedName] : [],
      permissions: Array.isArray(rolePermissions) ? rolePermissions.filter((code) => !excludedPermissionCodes.has(code)) : current.permissions,
    }));
  };
  const togglePermission = (code) => setValues((current) => ({ ...current, permissions: current.permissions.includes(code) ? current.permissions.filter((item) => item !== code) : [...current.permissions, code] }));
  const originalIdentityIsHost = String(recordValue(userQuery.data, 'identityType', 'IdentityType') ?? 'Platform').toLowerCase() === 'host';
  const validate = () => {
    const next = {};
    if (!values.name.trim() || values.name.trim().length < 2) next.name = 'Enter a name with at least 2 characters.';
    if (!values.username.trim() || values.username.trim().length < 2 || values.username.trim().length > 256 || /\s/.test(values.username.trim())) next.username = 'Enter a unique username with 2 to 256 characters and no spaces.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email.trim())) next.email = 'Enter a valid email address.';
    const switchingHostToPlatform = editing && originalIdentityIsHost && values.identityType === 'Platform';
    if ((!editing && values.identityType === 'Platform' || switchingHostToPlatform) && values.password.length < 8) next.password = 'Enter a password with at least 8 characters.';
    if (editing && values.identityType === 'Platform' && values.password && values.password.length < 8) next.password = 'Password must be at least 8 characters.';
    if (!values.roles.length) next.roles = 'Assign at least one role.';
    if (!/^\d+$/.test(String(values.tenantId)) || Number(values.tenantId) < 1) next.tenantId = 'Enter a valid tenant ID supplied by your administrator.';
    if (!values.applicationId.trim()) next.applicationId = 'Application ID is required.';
    setErrors(next);
    setAttempted(true);
    return Object.keys(next).length === 0;
  };
  const save = () => {
    setServerError('');
    if (!validate() || rolesQuery.isError || rolesQuery.isPending) return;
    const basePayload = {
      Name: values.name.trim(),
      Username: values.username.trim(),
      Email: values.email.trim(),
      TenantId: Number(values.tenantId),
      ApplicationId: values.applicationId.trim(),
      Roles: values.roles,
      Status: values.status,
      IdentityType: values.identityType,
    };
    if (permissionsQuery.data) basePayload.Permissions = values.permissions.filter((code) => !excludedPermissionCodes.has(code));
    if (editing) {
      if (values.identityType === 'Host') {
        basePayload.ExternalProvider = values.externalProvider.trim() || null;
        basePayload.ExternalSubjectId = values.externalSubjectId.trim() || null;
        basePayload.ExternalScopes = values.externalScopes.trim() || null;
      } else if (values.password) {
        basePayload.Password = values.password;
      }
      mutation.mutate(basePayload);
      return;
    }
    if (values.identityType === 'Host') {
      mutation.mutate({ ...basePayload, IdentityType: 'Host', ExternalProvider: values.externalProvider.trim() || null, ExternalSubjectId: values.externalSubjectId.trim() || null, ExternalScopes: values.externalScopes.trim() || null });
      return;
    }
    mutation.mutate({ ...basePayload, Password: values.password, IdentityType: 'Platform' });
  };
  const formContent = <>
    {rolesQuery.isError && <Alert severity="error" className="ura-inline-alert">Unable to load roles: {getError(rolesQuery.error)}</Alert>}
    <div className="ura-form-grid">
      <TextField label="Full Name" InputLabelProps={{ shrink: true }} required value={values.name} onChange={update('name')} error={attempted && !!errors.name} helperText={attempted ? errors.name : ' '} fullWidth />
      <TextField label="Email" InputLabelProps={{ shrink: true }} required type="email" value={values.email} onChange={update('email')} error={attempted && !!errors.email} helperText={attempted ? errors.email : ' '} fullWidth />
      <TextField label="Username" InputLabelProps={{ shrink: true }} required value={values.username} onChange={update('username')} error={attempted && !!errors.username} helperText={attempted ? errors.username : 'Choose a unique username; this can be different from the email address.'} inputProps={{ maxLength: 256, autoComplete: 'off' }} fullWidth />
      <FormControl fullWidth size="small"><InputLabel id="ura-identity-type-label" shrink>Identity type</InputLabel><Select MenuProps={selectMenuProps} labelId="ura-identity-type-label" label="Identity type" value={values.identityType} onChange={update('identityType')}><MenuItem value="Platform">Platform account</MenuItem><MenuItem value="Host">Host / SSO account</MenuItem></Select></FormControl>
      {values.identityType === 'Platform' && (!editing || originalIdentityIsHost) && <TextField id="ura-temporary-password" label={editing ? 'New password' : 'Temporary password'} InputLabelProps={{ shrink: true }} required={!editing || originalIdentityIsHost} type={showPassword ? 'text' : 'password'} value={values.password} onChange={update('password')} error={attempted && !!errors.password} helperText={attempted ? errors.password : editing ? 'Required when changing a Host identity to Platform.' : 'At least 8 characters.'} inputProps={{ autoComplete: 'new-password' }} InputProps={{ endAdornment: <InputAdornment position="end"><PasswordVisibilityToggle visible={showPassword} onToggle={() => setShowPassword((current) => !current)} inputId="ura-temporary-password" label="temporary password" /></InputAdornment> }} fullWidth />}
      {values.identityType === 'Host' && <><TextField label="Identity provider (optional)" InputLabelProps={{ shrink: true }} placeholder="AzureAD, Google, HostPortal" value={values.externalProvider} onChange={update('externalProvider')} helperText="Can be added later when the identity provider is configured." fullWidth /><TextField label="External subject ID (optional)" InputLabelProps={{ shrink: true }} value={values.externalSubjectId} onChange={update('externalSubjectId')} helperText="Stable user identifier from the identity provider; can be added later." fullWidth /><TextField label="External scopes (optional)" InputLabelProps={{ shrink: true }} value={values.externalScopes} onChange={update('externalScopes')} helperText="Scopes returned by the host identity provider." fullWidth /></>}
      <FormControl fullWidth size="small" error={attempted && !!errors.roles} disabled={rolesQuery.isPending || rolesQuery.isError}>
        <InputLabel id="ura-user-roles-label" shrink>Role assignment *</InputLabel>
        <Select MenuProps={selectMenuProps} labelId="ura-user-roles-label" label="Role assignment *" value={values.roles[0] ?? ''} onChange={selectRole} displayEmpty>
          <MenuItem value="" disabled>Select one role</MenuItem>
          {roles.map((item) => { const name = recordValue(item, 'name', 'Name'); return <MenuItem key={name} value={name}><span>{name}</span></MenuItem>; })}
        </Select>
        {attempted && errors.roles && <span className="ura-field-error">{errors.roles}</span>}
      </FormControl>
      <section className="ura-permission-assignment ura-user-permission-assignment">
        <div className="ura-subheading"><VpnKeyOutlined /><div><h3>Permission assignment</h3><p>Choose only the access this user needs. The selected role’s default permissions are preselected; uncheck any access they should not have.</p></div></div>
        {permissionsQuery.isPending ? <div className="ura-resource-state"><CircularProgress size={20} /><span>Loading permissions…</span></div> : permissionsQuery.isError ? <Alert severity="error">Unable to load permission options: {getError(permissionsQuery.error)}</Alert> : <div className="ura-permission-groups">{permissionGroups.map(([module, entries]) => <details className="ura-permission-group ura-permission-dropdown ura-permission-select-group" key={module} open={openPermissionGroup === module}><summary className="ura-permission-group-heading" onClick={(event) => { event.preventDefault(); setOpenPermissionGroup((current) => current === module ? null : module); }}><VpnKeyOutlined /><h3>{module}</h3></summary><div className="ura-permission-dropdown-content"><FormGroup>{entries.map((permission) => { const code = recordValue(permission, 'code', 'Code'); const name = recordValue(permission, 'name', 'Name'); const description = recordValue(permission, 'description', 'Description'); return <FormControlLabel key={code} control={<Checkbox checked={values.permissions.includes(code)} onChange={() => togglePermission(code)} />} label={<span className="ura-permission-option"><strong>{name}</strong><code>{code}</code>{description && <small>{description}</small>}</span>} />; })}{!entries.length && <small className="ura-permission-empty">No permission definitions returned by the API for this module.</small>}</FormGroup></div></details>)}</div>}
      </section>
      <TextField label="Tenant ID" InputLabelProps={{ shrink: true }} required type="number" value={values.tenantId} onChange={update('tenantId')} error={attempted && !!errors.tenantId} helperText={attempted ? errors.tenantId : 'Use an existing tenant ID.'} inputProps={{ min: 1, step: 1 }} fullWidth />
      <TextField label="Application ID" InputLabelProps={{ shrink: true }} required value={values.applicationId} onChange={update('applicationId')} error={attempted && !!errors.applicationId} helperText={attempted ? errors.applicationId : 'Enter an application ID supported by your environment.'} fullWidth />
      {(editing || values.identityType === 'Platform') && <FormControl fullWidth size="small"><InputLabel id="ura-user-status-label" shrink>Account status</InputLabel><Select MenuProps={selectMenuProps} labelId="ura-user-status-label" label="Account status" value={values.status} onChange={update('status')}><MenuItem value="Active">Active</MenuItem><MenuItem value="Inactive">Inactive</MenuItem></Select></FormControl>}
    </div>
    {serverError && <Alert severity="error" className="ura-inline-alert">{serverError}</Alert>}
    <FormActions busy={mutation.isPending} onCancel={onCancel} onSubmit={save} />
  </>;
  if (editing && userQuery.isPending) return <QueryState query={userQuery} label="user" />;
  if (editing && userQuery.isError) return <QueryState query={userQuery} label="user" retry={() => userQuery.refetch()} />;
  return formContent;
}

function UserDetails({ userId, onEdit, onBack, notice }) {
  const [noticeOpen, setNoticeOpen] = useState(Boolean(notice));
  useEffect(() => { if (notice) setNoticeOpen(true); }, [notice]);
  const userQuery = useQuery({ queryKey: ['ura', 'user', userId], queryFn: ({ signal }) => service.getUser(userId, { signal }), enabled: Boolean(userId), retry: false });
  if (userQuery.isPending || userQuery.isError) return <QueryState query={userQuery} label="user" retry={() => userQuery.refetch()} />;
  const user = userQuery.data;
  const roles = recordValue(user, 'roles', 'Roles') ?? [];
  return <>
    <FeedbackSnackbar message={noticeOpen ? notice : ''} onClose={() => setNoticeOpen(false)} />
    <SectionHeading icon={BadgeOutlined} title={recordValue(user, 'name', 'Name')} description={`User ID ${recordValue(user, 'id', 'Id')}`} action={<div className="ura-row-actions"><Button variant="outlined" onClick={onBack}>Back</Button><Button variant="contained" startIcon={<EditOutlined />} onClick={onEdit}>Edit user</Button></div>} />
    <div className="ura-detail-grid">
      <section className="ura-detail-card"><h3>User information</h3><dl><dt>Full name</dt><dd>{recordValue(user, 'name', 'Name') || '—'}</dd><dt>Username</dt><dd>{recordValue(user, 'username', 'Username') || '—'}</dd><dt>Email</dt><dd>{recordValue(user, 'email', 'Email') || '—'}</dd><dt>Identity type</dt><dd>{recordValue(user, 'identityType', 'IdentityType') || '—'}</dd><dt>Status</dt><dd><StatusBadge status={statusValue(user)} /></dd><dt>Created</dt><dd>{recordValue(user, 'createdAtUtc', 'CreatedAtUtc') ? new Date(recordValue(user, 'createdAtUtc', 'CreatedAtUtc')).toLocaleString() : '—'}</dd></dl></section>
      <section className="ura-detail-card"><h3>Assignments</h3><dl><dt>Roles</dt><dd>{roles.length ? roles.join(', ') : '—'}</dd><dt>Tenant</dt><dd>{recordValue(user, 'tenantName', 'TenantName') || recordValue(user, 'tenantCode', 'TenantCode') || recordValue(user, 'tenantId', 'TenantId') || '—'}</dd><dt>Application ID</dt><dd>{recordValue(user, 'applicationId', 'ApplicationId') || '—'}</dd></dl></section>
      <section className="ura-detail-card ura-detail-permissions"><h3>Assigned permissions</h3><div className="ura-chip-list">{(recordValue(user, 'permissions', 'Permissions') ?? []).map((permission) => <Chip key={permission} label={permission} size="small" />)}</div>{!(recordValue(user, 'permissions', 'Permissions') ?? []).length && <p>No permissions are assigned to this user.</p>}</section>
    </div>
  </>;
}

function RoleList({ onCreate, onView, onEdit, onDelete }) {
  const [search, setSearch] = useState('');
  const tenantId = currentTenantId();
  const rolesQuery = useQuery({ queryKey: ['ura', 'roles', tenantId], queryFn: ({ signal }) => service.listRoles({ tenantId, signal }), retry: false });
  const roles = useMemo(() => (rolesQuery.data ?? []).filter((role) => {
    const query = search.trim().toLowerCase();
    return !query || `${recordValue(role, 'name', 'Name')} ${recordValue(role, 'description', 'Description')}`.toLowerCase().includes(query);
  }), [rolesQuery.data, search]);
  return <>
    <SectionHeading icon={ShieldOutlined} title="Roles" description="Review role details and assigned permissions." action={<Button variant="contained" startIcon={<AdminPanelSettingsOutlined />} onClick={onCreate}>Create role</Button>} />
    <div className="ura-filter-bar ura-role-search"><TextField label="Search roles" InputLabelProps={{ shrink: true }} size="small" fullWidth value={search} onChange={(event) => setSearch(event.target.value)} InputProps={{ startAdornment: <SearchOutlined className="ura-search-icon" /> }} /></div>
    <QueryState query={rolesQuery} label="roles" empty={rolesQuery.data && roles.length === 0 ? (search ? 'No roles match this search.' : 'No roles were returned by the Roles API.') : null}>
      <div className="ura-table-wrap"><table className="ura-table ura-role-table"><thead><tr><th>Role name</th><th>Description</th><th>Permission summary</th><th>Type</th><th>Actions</th></tr></thead><tbody>{roles.map((role) => {
        const id = recordValue(role, 'id', 'Id');
        const permissions = recordValue(role, 'permissions', 'Permissions') ?? [];
        const isSystem = recordValue(role, 'isSystemRole', 'IsSystemRole');
        const actions = [{ label: 'View details', icon: VisibilityOutlined, onClick: () => onView(id) }, { label: 'Edit role', icon: EditOutlined, onClick: () => onEdit(id) }];
        if (!isSystem && onDelete) actions.push({ label: 'Delete role', icon: DeleteOutline, onClick: () => { if (window.confirm('Delete this custom role permanently?')) onDelete(id); } });
        return <tr key={id}><td><strong>{recordValue(role, 'name', 'Name')}</strong></td><td>{recordValue(role, 'description', 'Description') || '—'}</td><td>{permissions.length ? `${permissions.length} permissions` : 'No permissions assigned'}</td><td><Chip size="small" label={isSystem ? 'System' : 'Custom'} variant="outlined" /></td><td className="ura-action-cell"><RowActionsMenu actions={actions} /></td></tr>;
      })}</tbody></table></div>
    </QueryState>
  </>;
}

function PermissionList() {
  const permissionsQuery = useQuery({ queryKey: ['ura', 'permissions'], queryFn: ({ signal }) => service.listPermissions({ signal }), retry: false });
  const groups = useMemo(() => groupPermissionDefinitions(permissionsQuery.data ?? []), [permissionsQuery.data]);
  return <>
    <SectionHeading icon={VpnKeyOutlined} title="Permissions" description="Permission definitions loaded from the Roles API." />
    <QueryState query={permissionsQuery} label="permissions">
      <div className="ura-permission-groups">{groups.map(([module, permissions]) => <section className="ura-permission-group" key={module}><div className="ura-permission-group-heading"><VpnKeyOutlined /><h3>{module}</h3></div><ul className="ura-permission-list">{permissions.map((permission) => <li key={recordValue(permission, 'code', 'Code')}><div className="ura-permission-item-main"><strong>{recordValue(permission, 'name', 'Name')}</strong><code>{recordValue(permission, 'code', 'Code')}</code></div>{recordValue(permission, 'description', 'Description') && <small>{recordValue(permission, 'description', 'Description')}</small>}</li>)}{!permissions.length && <li className="ura-permission-empty">No permission definitions returned by the API for this module.</li>}</ul></section>)}</div>
    </QueryState>
  </>;
}

function RoleForm({ roleId, onCancel, onSaved }) {
  const editing = Boolean(roleId);
  const queryClient = useQueryClient();
  const roleQuery = useQuery({ queryKey: ['ura', 'role', roleId], queryFn: ({ signal }) => service.getRole(roleId, { signal }), enabled: editing, retry: false });
  const permissionsQuery = useQuery({ queryKey: ['ura', 'permissions'], queryFn: ({ signal }) => service.listPermissions({ signal }), retry: false });
  const [values, setValues] = useState(emptyRole);
  const [errors, setErrors] = useState({});
  const [attempted, setAttempted] = useState(false);
  const [serverError, setServerError] = useState('');
  const [openPermissionGroup, setOpenPermissionGroup] = useState(null);
  useEffect(() => {
    if (!roleQuery.data) return;
    setValues({
      name: recordValue(roleQuery.data, 'name', 'Name') ?? '',
      description: recordValue(roleQuery.data, 'description', 'Description') ?? '',
      tenantId: recordValue(roleQuery.data, 'tenantId', 'TenantId') ?? '',
      permissions: recordValue(roleQuery.data, 'permissions', 'Permissions') ?? [],
    });
  }, [roleQuery.data]);
  const mutation = useMutation({
    mutationFn: (payload) => editing ? service.updateRole(roleId, payload) : service.createRole(payload),
    onSuccess: async (result) => { await queryClient.invalidateQueries({ queryKey: ['ura'] }); onSaved(getMessage(result, `Role ${editing ? 'updated' : 'created'} successfully.`)); },
    onError: (error) => setServerError(getError(error)),
  });
  const permissions = permissionsQuery.data ?? [];
  const systemRole = editing && Boolean(recordValue(roleQuery.data, 'isSystemRole', 'IsSystemRole'));
  const modules = useMemo(() => groupPermissionDefinitions(permissions), [permissions]);
  const excludedPermissionCodes = useMemo(() => getExcludedPermissionCodes(permissions), [permissions]);
  const change = (key) => (event) => setValues((current) => ({ ...current, [key]: event.target.value }));
  const togglePermission = (code) => setValues((current) => ({ ...current, permissions: current.permissions.includes(code) ? current.permissions.filter((item) => item !== code) : [...current.permissions, code] }));
  const save = () => {
    const next = {};
    if (!values.name.trim()) next.name = 'Role name is required.';
    if (values.tenantId && (!/^\d+$/.test(String(values.tenantId)) || Number(values.tenantId) < 1)) next.tenantId = 'Enter a valid tenant ID.';
    setErrors(next);
    setAttempted(true);
    setServerError('');
    if (Object.keys(next).length || permissionsQuery.isPending || permissionsQuery.isError) return;
    const payload = { Name: values.name.trim(), Description: values.description.trim(), Permissions: values.permissions.filter((code) => !excludedPermissionCodes.has(code)) };
    if (!editing && values.tenantId) payload.TenantId = Number(values.tenantId);
    mutation.mutate(payload);
  };
  if (editing && roleQuery.isPending) return <QueryState query={roleQuery} label="role" />;
  if (editing && roleQuery.isError) return <QueryState query={roleQuery} label="role" retry={() => roleQuery.refetch()} />;
  return <>
    {permissionsQuery.isError && <Alert severity="error" className="ura-inline-alert">Unable to load permission definitions: {getError(permissionsQuery.error)}</Alert>}
    <div className="ura-form-grid">
      <TextField label="Role Name" InputLabelProps={{ shrink: true }} required value={values.name} disabled={systemRole} onChange={change('name')} error={attempted && !!errors.name} helperText={systemRole ? 'System roles cannot be renamed by this API.' : attempted ? errors.name : ' '} fullWidth />
      {!editing && <TextField label="Tenant ID (optional)" InputLabelProps={{ shrink: true }} type="number" value={values.tenantId} onChange={change('tenantId')} error={attempted && !!errors.tenantId} helperText={attempted ? errors.tenantId : 'Enter an existing tenant ID to scope this role.'} inputProps={{ min: 1, step: 1 }} fullWidth />}
      <TextField className="ura-role-description" label="Description" InputLabelProps={{ shrink: true }} value={values.description} onChange={change('description')} helperText=" " multiline minRows={2} fullWidth />
      <section className="ura-permission-assignment"><div className="ura-subheading"><VpnKeyOutlined /><div><h3>Permission assignment</h3><p>Select from permission definitions returned by the API.</p></div></div>
        {permissionsQuery.isPending ? <div className="ura-resource-state"><CircularProgress size={20} /><span>Loading permissions…</span></div> : permissionsQuery.isError ? <Alert severity="error">{getError(permissionsQuery.error)}</Alert> : <div className="ura-permission-groups">{modules.map(([module, entries]) => <details className="ura-permission-group ura-permission-dropdown ura-permission-select-group" key={module} open={openPermissionGroup === module}><summary className="ura-permission-group-heading" onClick={(event) => { event.preventDefault(); setOpenPermissionGroup((current) => current === module ? null : module); }}><VpnKeyOutlined /><h3>{module}</h3></summary><div className="ura-permission-dropdown-content"><FormGroup>{entries.map((permission) => { const code = recordValue(permission, 'code', 'Code'); const name = recordValue(permission, 'name', 'Name'); const description = recordValue(permission, 'description', 'Description'); return <FormControlLabel key={code} control={<Checkbox checked={values.permissions.includes(code)} onChange={() => togglePermission(code)} />} label={<span className="ura-permission-option"><strong>{name}</strong><code>{code}</code>{description && <small>{description}</small>}</span>} />; })}{!entries.length && <small className="ura-permission-empty">No permission definitions returned by the API for this module.</small>}</FormGroup></div></details>)}</div>}
      </section>
    </div>
    {serverError && <Alert severity="error" className="ura-inline-alert">{serverError}</Alert>}
    <FormActions busy={mutation.isPending} onCancel={onCancel} onSubmit={save} />
  </>;
}

export function UserRoleAdministration() {
  const { pathname, search, state: locationState } = useLocation();
  const navigate = useNavigate();
  const [feedback, setFeedback] = useState(null);
  const section = new URLSearchParams(search).get('tab');
  const activeTab = tabs.some((tab) => tab.id === section) ? section : 'users';
  const route = pathname.slice(root.length).split('/').filter(Boolean);
  const entity = route[0];
  const routeId = route[1] && route[1] !== 'new' ? route[1] : null;
  const isNew = route[1] === 'new';
  const isEdit = route[2] === 'edit';
  const screen = !entity ? 'list' : entity === 'users' ? (isNew ? 'create-user' : isEdit ? 'edit-user' : 'user-details') : entity === 'roles' ? (isNew ? 'create-role' : isEdit ? 'edit-role' : 'role-details') : 'list';
  const queryClient = useQueryClient();
  const changeTab = (id) => { setFeedback(null); navigate(`${root}?tab=${id}`); };
  const navigateBack = () => navigate(`${root}?tab=${entity === 'roles' ? 'roles' : 'users'}`);
  const saved = (message, tab) => { setFeedback({ severity: 'success', message }); navigate(`${root}?tab=${tab}`); };
  const savedUser = (message, user) => {
    const userId = recordValue(user, 'id', 'Id');
    setFeedback({ severity: 'success', message });
    navigate(userId ? `${root}/users/${userId}` : `${root}?tab=users`, userId ? { state: { notice: message } } : undefined);
  };
  const userStatusMutation = useMutation({
    mutationFn: ({ id, status }) => service.setUserStatus(id, status),
    onSuccess: async (result) => { await queryClient.invalidateQueries({ queryKey: ['ura'] }); setFeedback({ severity: 'success', message: getMessage(result, 'User status updated.') }); },
    onError: (error) => setFeedback({ severity: 'error', message: getError(error) }),
  });
  const deleteUserMutation = useMutation({
    mutationFn: (id) => service.deleteUser(id),
    onSuccess: async (result) => { await queryClient.invalidateQueries({ queryKey: ['ura'] }); setFeedback({ severity: 'success', message: getMessage(result, 'User deleted successfully.') }); },
    onError: (error) => setFeedback({ severity: 'error', message: getError(error) }),
  });
  const deleteRoleMutation = useMutation({
    mutationFn: (id) => service.deleteRole(id),
    onSuccess: async (result) => { await queryClient.invalidateQueries({ queryKey: ['ura'] }); setFeedback({ severity: 'success', message: getMessage(result, 'Role deleted successfully.') }); },
    onError: (error) => setFeedback({ severity: 'error', message: getError(error) }),
  });
  const pageTitle = screen === 'create-user' ? 'Create user' : screen === 'edit-user' ? 'Edit user' : screen === 'user-details' ? 'User details' : screen === 'create-role' ? 'Create role' : screen === 'edit-role' ? 'Edit role' : screen === 'role-details' ? 'Role details' : '';
  const showBack = screen !== 'list';

  return <main className="ura-page">
    <header className="ura-page-header">
      <div><p className="ura-eyebrow">Configuration &amp; Administration</p><h1>User &amp; Role Administration</h1><p>Manage user access and role assignments for this workspace.</p></div>
      {showBack && <Button variant="outlined" startIcon={<ArrowBackOutlined />} onClick={navigateBack}>Back to {entity === 'roles' ? 'roles' : 'users'}</Button>}
    </header>
    <section className="ura-workspace">
      {screen === 'list' ? <>
        <Tabs value={Math.max(0, tabs.findIndex((tab) => tab.id === activeTab))} onChange={(_, value) => changeTab(tabs[value].id)} className="ura-tabs" aria-label="User and role administration sections" variant="scrollable" scrollButtons="auto">
          {tabs.map(({ id, label, icon: Icon }) => <Tab key={id} icon={<Icon />} iconPosition="start" label={label} />)}
        </Tabs>
        {feedback?.severity === 'success' && <FeedbackSnackbar message={feedback.message} onClose={() => setFeedback(null)} />}
        {feedback?.severity === 'error' && <Alert severity="error" className="ura-feedback" onClose={() => setFeedback(null)}>{feedback.message}</Alert>}
        <div className="ura-panel-content">
          {activeTab === 'users' && <UserList onCreate={() => navigate(`${root}/users/new`)} onOpenUser={(id) => navigate(`${root}/users/${id}`)} onEditUser={(id) => navigate(`${root}/users/${id}/edit`)} onToggleStatus={(id, status) => userStatusMutation.mutate({ id, status })} onDeleteUser={(id) => deleteUserMutation.mutate(id)} />}
          {activeTab === 'roles' && <RoleList onCreate={() => navigate(`${root}/roles/new`)} onView={(id) => navigate(`${root}/roles/${id}`)} onEdit={(id) => navigate(`${root}/roles/${id}/edit`)} onDelete={(id) => deleteRoleMutation.mutate(id)} />}
          {activeTab === 'permissions' && <PermissionList />}
          {activeTab === 'assignments' && <UserList assignmentMode onOpenUser={(id) => navigate(`${root}/users/${id}`)} onEditUser={(id) => navigate(`${root}/users/${id}/edit`)} />}
        </div>
      </> : <div className="ura-panel-content ura-form-screen">
        <div className="ura-form-screen-heading"><BadgeOutlined /><div><h2>{pageTitle}</h2><p>{screen.includes('edit') || screen.includes('details') ? 'Record data is loaded from the backend API.' : 'Save changes through the connected administration API.'}</p></div></div>
        {screen.includes('user') && (screen === 'user-details' ? <UserDetails userId={routeId} notice={locationState?.notice} onBack={navigateBack} onEdit={() => navigate(`${root}/users/${routeId}/edit`)} /> : <UserForm userId={screen === 'edit-user' ? routeId : null} onCancel={navigateBack} onSaved={savedUser} />)}
        {screen.includes('role') && (screen === 'role-details' ? <RoleDetails roleId={routeId} onBack={navigateBack} onEdit={() => navigate(`${root}/roles/${routeId}/edit`)} /> : <RoleForm roleId={screen === 'edit-role' ? routeId : null} onCancel={navigateBack} onSaved={(message) => saved(message, 'roles')} />)}
      </div>}
    </section>
  </main>;
}

function RoleDetails({ roleId, onBack, onEdit }) {
  const query = useQuery({ queryKey: ['ura', 'role', roleId], queryFn: ({ signal }) => service.getRole(roleId, { signal }), enabled: Boolean(roleId), retry: false });
  if (query.isPending || query.isError) return <QueryState query={query} label="role" retry={() => query.refetch()} />;
  const role = query.data;
  const permissions = recordValue(role, 'permissions', 'Permissions') ?? [];
  return <>
    <SectionHeading icon={ShieldOutlined} title={recordValue(role, 'name', 'Name')} description={recordValue(role, 'description', 'Description') || 'No description provided.'} action={<div className="ura-row-actions"><Button variant="outlined" onClick={onBack}>Back</Button><Button variant="contained" startIcon={<EditOutlined />} onClick={onEdit}>Edit role</Button></div>} />
    <Alert severity="info" className="ura-inline-alert">This API reports role type, but does not define a role status field.</Alert>
    <div className="ura-detail-grid"><section className="ura-detail-card"><h3>Role information</h3><dl><dt>Name</dt><dd>{recordValue(role, 'name', 'Name')}</dd><dt>Type</dt><dd>{recordValue(role, 'isSystemRole', 'IsSystemRole') ? 'System' : 'Custom'}</dd><dt>Tenant ID</dt><dd>{recordValue(role, 'tenantId', 'TenantId') ?? '—'}</dd></dl></section><section className="ura-detail-card ura-detail-permissions"><h3>Permissions ({permissions.length})</h3><div className="ura-chip-list">{permissions.map((code) => <Chip key={code} size="small" label={code} />)}</div>{!permissions.length && <p>No permissions are assigned to this role.</p>}</section></div>
  </>;
}

export default UserRoleAdministration;
