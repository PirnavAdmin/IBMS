import { useNavbarSearch } from '../../hooks/useNavbarSearch';
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Button, MenuItem, TextField } from '@mui/material';
import SyncAltOutlined from '@mui/icons-material/SyncAltOutlined';
import CheckCircleOutline from '@mui/icons-material/CheckCircleOutline';
import BlockOutlined from '@mui/icons-material/BlockOutlined';
import { useSearchDebounce } from '../../hooks/useSearchDebounce';
import { platformService as api } from './platformService';
import { RowActions, PlatformShell, PlatformRefresh, QueryState, PlatformTable, Pager, SelectFilter, MutationDialog, usePlatformQuery, dateText } from './PlatformShared';

function PendingApprovalsView() {
  const [filters, setFilters] = useState({ page: 1, pageSize: 20, search: '', status: 'PendingApproval' });
  const [editor, setEditor] = useState(null);
  const search = useSearchDebounce(filters.search);
  const queryParams = {
    page: filters.page,
    pageSize: filters.pageSize,
    search,
    status: filters.status || 'PendingApproval',
    ...(filters.status === 'Active' ? { identityType: 'SelfRegistered' } : {}),
  };
  const query = usePlatformQuery('user-approvals', queryParams, signal => api.users(queryParams, signal));
  const tenantsQuery = usePlatformQuery('approval-tenants', { page: 1, pageSize: 100 }, signal => api.tenants({ page: 1, pageSize: 100 }, signal));
  const rolesQuery = usePlatformQuery('roles', null, api.roles);

  useNavbarSearch(filters.search, value => setFilters(f => ({ ...f, search: value, page: 1 })), 'Search pending account requests');

  const change = (key, value) => setFilters(f => ({ ...f, [key]: value, page: 1 }));
  const tenantOptions = (tenantsQuery.data?.items || []).map(t => ({ value: t.id, label: `${t.name} (${t.tenantCode})` }));
  if (tenantOptions.length === 0) tenantOptions.push({ value: 1, label: 'Default Organization' });

  const roleOptions = (rolesQuery.data || [])
    .map(r => r.name)
    .filter(name => name && name !== 'SuperAdmin');
  const effectiveRoleOptions = roleOptions.length ? roleOptions : ['Customer', 'User', 'Accountant', 'BillingManager', 'TenantAdmin'];
  const selectedUser = editor?.user;

  return (
    <>
      <div className="platform-filters">
        <TextField size="small" label="Search requests" value={filters.search} onChange={e => change('search', e.target.value)} />
        <TextField
          select
          size="small"
          InputLabelProps={{ shrink: true }}
          label="Approval status"
          value={filters.status}
          onChange={e => change('status', e.target.value)}
        >
          <MenuItem value="PendingApproval">Pending Approval</MenuItem>
          <MenuItem value="Active">Approved (Self-Registered)</MenuItem>
          <MenuItem value="Rejected">Declined</MenuItem>
        </TextField>
      </div>
      <QueryState query={query} resource="account approval requests">
        {query.data && (
          <>
            <PlatformTable
              label="Account approval requests"
              rows={query.data.items || []}
              columns={[
                ['name', 'Name'],
                ['email', 'Email'],
                ['roles', 'Role', r => r.roles?.length ? r.roles.join(', ') : 'Customer'],
                ['tenantName', 'Tenant', r => r.tenantName || r.tenantCode || 'Default Organization'],
                ['createdAtUtc', 'Registered', r => dateText(r.createdAtUtc)],
                ['status', 'Status'],
                [
                  'actions',
                  'Actions',
                  r => (
                    <RowActions
                      label={r.name}
                      items={[
                        {
                          label: r.status === 'Active' ? 'Update Permission' : 'Approve Account',
                          icon: <CheckCircleOutline fontSize="small" />,
                          onClick: () => setEditor({ type: 'approve', user: r }),
                        },
                        ...(r.status !== 'Rejected'
                          ? [{
                              label: 'Decline Request',
                              icon: <BlockOutlined fontSize="small" />,
                              onClick: () => setEditor({ type: 'reject', user: r }),
                            }]
                          : []),
                      ]}
                    />
                  ),
                ],
              ]}
            />
            <Pager itemLabel="requests" data={query.data} filters={filters} setFilters={setFilters} />
          </>
        )}
      </QueryState>
      {editor?.type === 'approve' && (
        <MutationDialog
          title={'Approve account: ' + selectedUser.name}
          description={`Grant login permission for ${selectedUser.email}. Once approved, this user will be able to sign in.`}
          initial={{
            tenantId: selectedUser.tenantId ?? tenantOptions[0]?.value ?? 1,
            role: selectedUser.roles?.find(r => r !== 'SuperAdmin') || 'Customer',
            note: '',
          }}
          fields={[
            { name: 'tenantId', label: 'Assign Tenant', required: true, options: tenantOptions },
            { name: 'role', label: 'Permission Role', required: true, options: effectiveRoleOptions },
            { name: 'note', label: 'Approval Note (optional)', maxLength: 500, multiline: true },
          ]}
          submit={v =>
            api.approveUser(selectedUser.id, {
              tenantId: Number(v.tenantId || 1),
              roles: [v.role || 'Customer'],
              note: v.note,
            })
          }
          onClose={() => setEditor(null)}
        />
      )}
      {editor?.type === 'reject' && (
        <MutationDialog
          title={'Decline account: ' + selectedUser.name}
          description={`Keep sign-in blocked for ${selectedUser.email}.`}
          initial={{ reason: '' }}
          fields={[{ name: 'reason', label: 'Reason (optional)', maxLength: 500, multiline: true }]}
          submit={v => api.rejectUser(selectedUser.id, { reason: v.reason })}
          onClose={() => setEditor(null)}
        />
      )}
    </>
  );
}

export function PlatformUsers() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = searchParams.get('tab') === 'approvals' ? 'approvals' : 'admins';
  const [tab, setTab] = useState(initialTab);
  const [filters, setFilters] = useState({ page: 1, pageSize: 20, search: '', status: '', role: 'SuperAdmin' });
  const [editor, setEditor] = useState(null);
  const search = useSearchDebounce(filters.search);
  const query = usePlatformQuery('users', { ...filters, search }, signal => api.users({ ...filters, search }, signal));
  const roles = usePlatformQuery('roles', null, api.roles);
  const roleNames = (roles.data || []).map(r => r.name).filter(Boolean);
  useNavbarSearch(filters.search, value => setFilters(f => ({ ...f, search: value, page: 1 })), 'Search platform users');
  const change = (key, value) => setFilters(f => ({ ...f, [key]: value, page: 1 }));
  const user = editor?.user;
  const usersQuery = { ...query, refetch: () => { roles.refetch(); return query.refetch(); } };
  const visibleUsers = (query.data?.items || []).map(item => ({
    ...item,
    roles: item.roles?.includes('SuperAdmin')
      ? ['SuperAdmin']
      : (item.roles?.filter(role => role !== 'TenantAdmin') || ['SuperAdmin']),
  }));

  const switchTab = nextTab => {
    setTab(nextTab);
    if (nextTab === 'approvals') setSearchParams({ tab: 'approvals' }, { replace: true });
    else setSearchParams({}, { replace: true });
  };

  return (
    <PlatformShell
      title="Platform Users"
      actions={
        tab === 'admins' ? (
          <>
            <PlatformRefresh query={usersQuery} />
            <Button variant="contained" disabled={!roleNames.length} onClick={() => setEditor({ type: 'create' })}>
              Create Administrator
            </Button>
          </>
        ) : (
          <PlatformRefresh query={query} />
        )
      }
    >
      <div className="platform-users-tabs" role="tablist" aria-label="Platform users sections">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'admins'}
          className={`platform-users-tab${tab === 'admins' ? ' is-active' : ''}`}
          onClick={() => switchTab('admins')}
        >
          Platform Administrators
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'approvals'}
          className={`platform-users-tab${tab === 'approvals' ? ' is-active' : ''}`}
          onClick={() => switchTab('approvals')}
        >
          Account Approvals
        </button>
      </div>

      {tab === 'admins' ? (
        <>
          <div className="platform-filters">
            <TextField size="small" label="Search users" value={filters.search} onChange={e => change('search', e.target.value)} />
            <SelectFilter label="Status" value={filters.status} options={['Active', 'Inactive', 'Suspended']} onChange={v => change('status', v)} />
          </div>
          {Boolean(query.data) && (roles.isError || roles.fetchStatus === 'paused') && <QueryState query={roles} resource="available roles" />}
          <QueryState query={usersQuery} resource="platform users">
            {query.data && (
              <>
                <PlatformTable
                  label="Platform user directory"
                  rows={visibleUsers}
                  columns={[
                    ['name', 'Name'],
                    ['email', 'Email'],
                    ['roles', 'Roles', r => r.roles?.length ? r.roles.join(', ') : 'SuperAdmin'],
                    ['tenantName', 'Tenant', r => r.tenantName || r.tenantCode || (r.tenantId == null ? 'Platform' : r.tenantId)],
                    ['status', 'Status'],
                    ['actions', 'Actions', r => <RowActions label={r.name} items={[{ label: 'Change Status', icon: <SyncAltOutlined fontSize="small" />, onClick: () => setEditor({ type: 'status', user: r }) }]} />],
                  ]}
                />
                <Pager itemLabel="users" data={query.data} filters={filters} setFilters={setFilters} />
              </>
            )}
          </QueryState>
          {editor?.type === 'create' && (
            <MutationDialog
              title="Create Administrator"
              description="Add a platform SuperAdmin account."
              initial={{ name: '', email: '', password: '', role: 'SuperAdmin' }}
              fields={[
                { name: 'name', label: 'Name', required: true, minLength: 2, maxLength: 256 },
                { name: 'email', label: 'Email', required: true, type: 'email', maxLength: 256 },
                { name: 'password', label: 'Initial Password', required: true, type: 'password', minLength: 8 },
                { name: 'role', label: 'Role', required: true, options: roleNames.filter(r => r === 'SuperAdmin') },
              ]}
              submit={v => api.createUser({ name: v.name, email: v.email, password: v.password, roles: [v.role || 'SuperAdmin'], identityType: 'Platform', applicationId: 'IBMS' })}
              onClose={() => setEditor(null)}
            />
          )}
          {editor?.type === 'status' && (
            <MutationDialog
              title={'Change status: ' + user.name}
              initial={{ status: user.status }}
              fields={[{ name: 'status', label: 'Status', required: true, options: ['Active', 'Inactive'] }]}
              submit={v => api.userStatus(user.id, v.status)}
              onClose={() => setEditor(null)}
            />
          )}
        </>
      ) : (
        <PendingApprovalsView />
      )}
    </PlatformShell>
  );
}
