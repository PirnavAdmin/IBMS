import { useNavbarSearch } from '../../hooks/useNavbarSearch';
import { useState } from 'react';
import { Button, TextField } from '@mui/material';
import SyncAltOutlined from '@mui/icons-material/SyncAltOutlined';
import { useSearchDebounce } from '../../hooks/useSearchDebounce';
import { platformService as api } from './platformService';
import { RowActions, PlatformShell, PlatformRefresh, QueryState, PlatformTable, Pager, SelectFilter, MutationDialog, usePlatformQuery } from './PlatformShared';

export function PlatformUsers() {
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

  return (
    <PlatformShell
      title="Platform Users"
      actions={
        <>
          <PlatformRefresh query={usersQuery} />
          <Button variant="contained" disabled={!roleNames.length} onClick={() => setEditor({ type: 'create' })}>
            Create Administrator
          </Button>
        </>
      }
    >
      <div className="platform-filters">
        <TextField size="small" label="Search users" value={filters.search} onChange={e => change('search', e.target.value)} />
        <SelectFilter label="Status" hideLabel value={filters.status} options={['Active', 'Inactive', 'Suspended']} onChange={v => change('status', v)} />
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
    </PlatformShell>
  );
}
