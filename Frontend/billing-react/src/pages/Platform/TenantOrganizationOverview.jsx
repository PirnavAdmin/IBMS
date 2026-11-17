import { useMemo, useState } from 'react';
import { Chip, MenuItem, TextField } from '@mui/material';
import PeopleOutline from '@mui/icons-material/PeopleOutline';
import CheckCircleOutline from '@mui/icons-material/CheckCircleOutline';
import ShieldOutlined from '@mui/icons-material/ShieldOutlined';
import BadgeOutlined from '@mui/icons-material/BadgeOutlined';
import { WorkspacePagination } from '../../components/WorkspacePagination';
import { PlatformStatus, PlatformTable, QueryState, SelectFilter, dateText, platformMatches, readableLabel } from './PlatformShared';

const normKey = value => String(value ?? '').trim().toLowerCase();

/**
 * Computes per-role user counts and normalizes tenant roles (custom + system)
 * while excluding platform-level SuperAdmin roles.
 */
export function buildTenantRoleAnalytics(users = [], roles = []) {
  const counts = new Map();
  for (const user of users) {
    const isActive = String(user?.status ?? '').toLowerCase() === 'active';
    const userRoles = Array.isArray(user?.roles) ? user.roles : [];
    const seenForUser = new Set();
    for (const rawRole of userRoles) {
      const name = String(rawRole ?? '').trim();
      const key = normKey(name);
      if (!key || key === 'superadmin' || seenForUser.has(key)) continue;
      seenForUser.add(key);
      const entry = counts.get(key) || { name, userCount: 0, activeCount: 0 };
      entry.userCount += 1;
      if (isActive) entry.activeCount += 1;
      counts.set(key, entry);
    }
  }

  const seenRoles = new Set();
  const roleRows = [];
  for (const role of roles) {
    const name = String(role?.name ?? role?.Name ?? '').trim();
    const key = normKey(name);
    if (!key || key === 'superadmin' || seenRoles.has(key)) continue;
    seenRoles.add(key);
    const stat = counts.get(key);
    const permissions = role?.permissions ?? role?.Permissions ?? [];
    roleRows.push({
      id: role?.id ?? role?.Id ?? name,
      name,
      description: role?.description ?? role?.Description ?? '',
      isSystem: Boolean(role?.isSystemRole ?? role?.IsSystemRole),
      permissionsCount: Array.isArray(permissions) ? permissions.length : 0,
      userCount: stat?.userCount ?? 0,
      activeCount: stat?.activeCount ?? 0,
    });
  }

  for (const [key, stat] of counts.entries()) {
    if (seenRoles.has(key)) continue;
    roleRows.push({
      id: stat.name,
      name: stat.name,
      description: 'Assigned to tenant users.',
      isSystem: false,
      permissionsCount: 0,
      userCount: stat.userCount,
      activeCount: stat.activeCount,
    });
  }

  roleRows.sort((a, b) => (Number(a.isSystem) - Number(b.isSystem)) || (b.userCount - a.userCount) || a.name.localeCompare(b.name));

  const roleBreakdown = roleRows
    .filter(row => row.userCount > 0 || !row.isSystem)
    .slice()
    .sort((a, b) => (b.userCount - a.userCount) || a.name.localeCompare(b.name));

  return {
    totalUsers: users.length,
    activeUsers: users.filter(u => String(u?.status ?? '').toLowerCase() === 'active').length,
    totalRoles: roleRows.length,
    customRolesCount: roleRows.filter(r => !r.isSystem).length,
    roleRows,
    roleBreakdown,
  };
}

/**
 * Displays tenant role counts, role-wise user breakdown (e.g., Accountants, Billing Managers),
 * and searchable/filterable lists of all tenant users and created roles for SuperAdmin review.
 */
export function TenantOrganizationOverview({ tenantUserCount, usersQuery, rolesQuery }) {
  const [userSearch, setUserSearch] = useState('');
  const [selectedRole, setSelectedRole] = useState('');
  const [userStatus, setUserStatus] = useState('');
  const [userPage, setUserPage] = useState(1);
  const [userPageSize, setUserPageSize] = useState(10);

  const [roleSearch, setRoleSearch] = useState('');
  const [roleTypeFilter, setRoleTypeFilter] = useState('');

  const users = usersQuery.data ?? [];
  const roles = rolesQuery.data ?? [];
  const analytics = useMemo(() => buildTenantRoleAnalytics(users, roles), [users, roles]);

  const roleOptions = useMemo(() => analytics.roleRows.map(r => r.name), [analytics.roleRows]);

  const filteredUsers = useMemo(() => users.filter(user => {
    if (userSearch.trim() && !platformMatches([user.name, user.email, user.username, user.roles], userSearch)) return false;
    if (userStatus && String(user.status || '').toLowerCase() !== userStatus.toLowerCase()) return false;
    if (selectedRole) {
      const target = normKey(selectedRole);
      if (!(user.roles || []).some(r => normKey(r) === target)) return false;
    }
    return true;
  }), [users, userSearch, userStatus, selectedRole]);

  const pagedUsers = useMemo(() => {
    const start = (userPage - 1) * userPageSize;
    return filteredUsers.slice(start, start + userPageSize);
  }, [filteredUsers, userPage, userPageSize]);

  const filteredRoles = useMemo(() => analytics.roleRows.filter(role => {
    if (roleSearch.trim() && !platformMatches([role.name, role.description], roleSearch)) return false;
    if (roleTypeFilter === 'Custom' && role.isSystem) return false;
    if (roleTypeFilter === 'System' && !role.isSystem) return false;
    return true;
  }), [analytics.roleRows, roleSearch, roleTypeFilter]);

  const selectRoleFilter = roleName => {
    setSelectedRole(current => (normKey(current) === normKey(roleName) ? '' : roleName));
    setUserPage(1);
  };

  const totalUserDisplay = usersQuery.data ? analytics.totalUsers : (tenantUserCount ?? 0);

  return (
    <>
      <div className="platform-metrics" aria-label="Tenant user and role summary">
        <section className="platform-panel platform-metric platform-metric-espresso">
          <div className="platform-metric-top"><span>Total Users</span><PeopleOutline aria-hidden="true" /></div>
          <strong>{totalUserDisplay.toLocaleString('en-IN')}</strong>
        </section>
        <section className="platform-panel platform-metric platform-metric-green">
          <div className="platform-metric-top"><span>Active Users</span><CheckCircleOutline aria-hidden="true" /></div>
          <strong>{(usersQuery.data ? analytics.activeUsers : 0).toLocaleString('en-IN')}</strong>
        </section>
        <section className="platform-panel platform-metric platform-metric-amber">
          <div className="platform-metric-top"><span>Total Roles</span><ShieldOutlined aria-hidden="true" /></div>
          <strong>{(rolesQuery.data ? analytics.totalRoles : 0).toLocaleString('en-IN')}</strong>
        </section>
        <section className="platform-panel platform-metric platform-metric-muted">
          <div className="platform-metric-top"><span>Custom Roles Created</span><BadgeOutlined aria-hidden="true" /></div>
          <strong>{(rolesQuery.data ? analytics.customRolesCount : 0).toLocaleString('en-IN')}</strong>
        </section>
      </div>

      <section className="platform-panel" aria-label="Users by role breakdown">
        <div className="platform-section-heading">
          <div>
            <h2>Users by Role</h2>
            <p>Role-wise headcount in this tenant. Select a role to filter the user list below.</p>
          </div>
        </div>
        <QueryState query={usersQuery} resource="tenant role counts">
          <div className="platform-role-breakdown">
            <button
              type="button"
              className={`platform-role-filter-chip${selectedRole === '' ? ' is-selected' : ''}`}
              onClick={() => { setSelectedRole(''); setUserPage(1); }}
            >
              <span>All Users</span>
              <strong>{analytics.totalUsers}</strong>
            </button>
            {analytics.roleBreakdown.map(role => {
              const active = normKey(selectedRole) === normKey(role.name);
              return (
                <button
                  key={role.name}
                  type="button"
                  className={`platform-role-filter-chip${active ? ' is-selected' : ''}`}
                  onClick={() => selectRoleFilter(role.name)}
                >
                  <span>{readableLabel(role.name)}</span>
                  {!role.isSystem && <em className="platform-role-custom-badge">Custom</em>}
                  <strong>{role.userCount}</strong>
                </button>
              );
            })}
          </div>
        </QueryState>
      </section>

      <section className="platform-panel" aria-label="Tenant users directory">
        <div className="platform-section-heading">
          <div>
            <h2>Tenant Users</h2>
            <p>Complete list of administrators, accountants, billing managers, and users in this organization.</p>
          </div>
          <span className="platform-count-pill">{filteredUsers.length} users</span>
        </div>
        <div className="platform-filters platform-subpanel-filters">
          <TextField
            size="small"
            label="Search users"
            value={userSearch}
            onChange={e => { setUserSearch(e.target.value); setUserPage(1); }}
          />
          <TextField
            select
            size="small"
            InputLabelProps={{ shrink: true }}
            SelectProps={{ displayEmpty: true }}
            label="Role"
            value={selectedRole}
            onChange={e => { setSelectedRole(e.target.value); setUserPage(1); }}
          >
            <MenuItem value="">All roles ({analytics.totalUsers})</MenuItem>
            {roleOptions.map(roleName => {
              const row = analytics.roleRows.find(r => r.name === roleName);
              return <MenuItem key={roleName} value={roleName}>{readableLabel(roleName)} ({row?.userCount ?? 0})</MenuItem>;
            })}
          </TextField>
          <SelectFilter
            label="Status"
            hideLabel
            value={userStatus}
            options={['Active', 'Inactive', 'Suspended']}
            onChange={value => { setUserStatus(value); setUserPage(1); }}
          />
        </div>
        <QueryState query={usersQuery} resource="tenant users">
          {usersQuery.data && (
            <>
              <PlatformTable
                label="Tenant users"
                rows={pagedUsers}
                columns={[
                  ['name', 'Name'],
                  ['email', 'Email'],
                  ['roles', 'Roles', r => (r.roles || []).join(', ') || '—'],
                  ['status', 'Status'],
                  ['createdAtUtc', 'Created', r => dateText(r.createdAtUtc)],
                ]}
              />
              <WorkspacePagination
                itemLabel="users"
                page={userPage}
                pageSize={userPageSize}
                totalCount={filteredUsers.length}
                pageSizeOptions={[10, 20, 50]}
                onPageChange={setUserPage}
                onPageSizeChange={size => { setUserPageSize(size); setUserPage(1); }}
              />
            </>
          )}
        </QueryState>
      </section>

      <section className="platform-panel" aria-label="Tenant roles directory">
        <div className="platform-section-heading">
          <div>
            <h2>Tenant Roles</h2>
            <p>Custom roles created by the tenant and workspace system roles with assigned user counts.</p>
          </div>
          <span className="platform-count-pill">{analytics.customRolesCount} custom · {analytics.totalRoles} total</span>
        </div>
        <div className="platform-filters platform-subpanel-filters">
          <TextField
            size="small"
            label="Search roles"
            value={roleSearch}
            onChange={e => setRoleSearch(e.target.value)}
          />
          <SelectFilter
            label="Type"
            value={roleTypeFilter}
            options={['Custom', 'System']}
            onChange={setRoleTypeFilter}
          />
        </div>
        <QueryState query={rolesQuery} resource="tenant roles">
          {rolesQuery.data && (
            <PlatformTable
              label="Tenant roles"
              rows={filteredRoles}
              columns={[
                ['name', 'Role Name', r => <strong>{readableLabel(r.name)}</strong>],
                ['type', 'Type', r => (
                  <Chip
                    size="small"
                    label={r.isSystem ? 'System' : 'Custom'}
                    className={r.isSystem ? 'platform-role-type-system' : 'platform-role-type-custom'}
                  />
                )],
                ['userCount', 'Users', r => (
                  <button
                    type="button"
                    className="platform-role-count-link"
                    onClick={() => selectRoleFilter(r.name)}
                    title={`Filter users with ${r.name} role`}
                  >
                    {r.userCount} {r.userCount === 1 ? 'user' : 'users'}
                  </button>
                )],
                ['permissionsCount', 'Permissions', r => `${r.permissionsCount} permissions`],
                ['description', 'Description', r => r.description || '—'],
              ]}
            />
          )}
        </QueryState>
      </section>
    </>
  );
}

