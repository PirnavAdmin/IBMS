import { useNavbarSearch } from '../../hooks/useNavbarSearch';
import { useRef, useState } from 'react';
import { Button, MenuItem, TextField } from '@mui/material';
import VisibilityOutlined from '@mui/icons-material/VisibilityOutlined';
import SyncAltOutlined from '@mui/icons-material/SyncAltOutlined';
import CheckCircleOutline from '@mui/icons-material/CheckCircleOutline';
import BlockOutlined from '@mui/icons-material/BlockOutlined';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useSearchDebounce } from '../../hooks/useSearchDebounce';
import { platformService as api } from './platformService';
import { RowActions, PlatformStatus, PlatformShell, PlatformRefresh, QueryState, PlatformTable, Pager, SelectFilter, MutationDialog, usePlatformQuery, dateText } from './PlatformShared';
import { TenantOrganizationOverview } from './TenantOrganizationOverview';

const fields = [
  { name: 'name', label: 'Company Name', required: true, minLength: 2, maxLength: 256 },
  { name: 'companyEmail', label: 'Contact Email', type: 'email', maxLength: 256 },
  {
    name: 'phone',
    label: 'Phone',
    type: 'tel',
    onlyDigits: true,
    maxLength: 10,
    minLength: 10,
    pattern: '[0-9]{10}',
    placeholder: '10-digit mobile number',
    helperText: 'Enter 10-digit mobile number',
    validate: val => {
      if (!val) return '';
      const clean = String(val).trim();
      if (!/^\d{10}$/.test(clean)) {
        return 'Phone number must be exactly 10 digits.';
      }
      return '';
    },
  },
  { name: 'taxId', label: 'Tax ID', maxLength: 64 },
  { name: 'address', label: 'Address', multiline: true },
];

export function TenantEditor({ tenant, onClose, onDone }) {
  const creating = !tenant;
  const idempotencyKey = useRef(crypto.randomUUID());
  const initial = Object.fromEntries(fields.map(f => [f.name, tenant?.[f.name] || '']));
  const formFields = creating
    ? [...fields, { name: 'tenantCode', label: 'Tenant Code', required: true, pattern: '[a-zA-Z0-9_-]{2,64}', maxLength: 64, minLength: 2 }]
    : [...fields, { name: 'status', label: 'Status', options: ['Active', 'Suspended', 'Inactive'] }];
  return (
    <MutationDialog
      title={creating ? 'Create Tenant' : 'Edit Tenant'}
      onClose={onClose}
      onDone={onDone}
      initial={creating ? { ...initial, tenantCode: '' } : { ...initial, status: tenant?.status || 'Active' }}
      fields={formFields}
      submit={v => {
        const payload = { name: v.name.trim() };
        for (const key of ['companyEmail', 'phone', 'taxId', 'address']) payload[key] = v[key]?.trim() || null;
        if (!creating && v.status) payload.status = v.status;
        return creating
          ? api.createTenant({ ...payload, tenantCode: v.tenantCode.trim(), idempotencyKey: idempotencyKey.current })
          : api.updateTenant(tenant.id, { ...payload, expectedUpdatedAtUtc: tenant.updatedAtUtc });
      }}
    />
  );
}

function PendingTenantApprovalsView({ onApproved }) {
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
  const query = usePlatformQuery('tenant-approvals', queryParams, signal => api.users(queryParams, signal));
  useNavbarSearch(filters.search, value => setFilters(f => ({ ...f, search: value, page: 1 })), 'Search pending tenant approvals');
  const change = (key, value) => setFilters(f => ({ ...f, [key]: value, page: 1 }));
  const pendingCompanyMap = (() => {
    try { return JSON.parse(localStorage.getItem('billing_pending_company_names') || '{}'); } catch { return {}; }
  })();
  const resolveCompanyName = row => {
    if (row?.tenantId > 1 && row?.tenantName) return row.tenantName;
    const mapped = row?.email ? pendingCompanyMap[String(row.email).trim().toLowerCase()] : '';
    if (mapped) return mapped;
    if (row?.tenantName && !/^default\s+(organization|company)$/i.test(row.tenantName.trim())) return row.tenantName;
    return row?.tenantName || row?.tenantCode || '';
  };
  const slugifyTenantCode = name => {
    const clean = String(name || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    const base = (clean.length >= 2 ? clean : 'company').slice(0, 48).replace(/-+$/g, '');
    return `${base}-${Math.floor(1000 + Math.random() * 9000)}`;
  };
  const selectedUser = editor?.user;
  const selectedCompanyName = selectedUser ? resolveCompanyName(selectedUser) : '';

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
          <MenuItem value="Active">Approved Tenants</MenuItem>
          <MenuItem value="Rejected">Declined</MenuItem>
        </TextField>
      </div>
      <QueryState query={query} resource="pending tenant approvals">
        {query.data && (
          <>
            <PlatformTable
              label="Pending tenant approval requests"
              rows={query.data.items || []}
              columns={[
                ['tenantName', 'Company Name', r => resolveCompanyName(r) || '—'],
                ['name', 'Owner Name'],
                ['email', 'Email'],
                ['roles', 'Role', r => r.roles?.length ? r.roles.join(', ') : 'TenantAdmin'],
                ['createdAtUtc', 'Registered', r => dateText(r.createdAtUtc)],
                ['status', 'Status'],
                [
                  'actions',
                  'Actions',
                  r => (
                    <RowActions
                      label={resolveCompanyName(r) || r.name}
                      items={[
                        {
                          label: r.status === 'Active' ? 'View / Reconfirm Approval' : 'Approve Tenant',
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
          title={'Approve tenant: ' + (selectedCompanyName || selectedUser.name)}
          description={`Approve ${selectedCompanyName || 'this company'} for ${selectedUser.email}. Once approved, the tenant is stored in SuperAdmin and ${selectedUser.name} can sign in as TenantAdmin.`}
          initial={{
            companyName: selectedCompanyName,
            role: 'TenantAdmin',
            note: '',
          }}
          fields={[
            { name: 'companyName', label: 'Company Name', required: true, disabled: true },
            { name: 'role', label: 'Permission Role', required: true, disabled: true, options: ['TenantAdmin'] },
            { name: 'note', label: 'Approval Note (optional)', maxLength: 500, multiline: true },
          ]}
          submit={async v => {
            const targetCompany = (v.companyName || selectedCompanyName || `${selectedUser.name} Organization`).trim();
            let approved;
            try {
              approved = await api.approveUser(selectedUser.id, {
                tenantId: selectedUser.tenantId && selectedUser.tenantId > 1 ? selectedUser.tenantId : undefined,
                companyName: targetCompany,
                roles: ['TenantAdmin'],
                note: v.note,
              });
            } catch (err) {
              const code = err?.response?.status ?? err?.status;
              if (code !== 404 && code !== 405) throw err;
              await api.assignRoles(selectedUser.id, ['TenantAdmin']);
              await api.userStatus(selectedUser.id, 'Active');
              approved = { id: selectedUser.id, tenantId: selectedUser.tenantId };
            }

            if (!approved?.tenantId || Number(approved.tenantId) <= 1) {
              const createdTenant = await api.createTenant({
                name: targetCompany,
                tenantCode: slugifyTenantCode(targetCompany),
                companyEmail: selectedUser.email,
                status: 'Active',
                idempotencyKey: crypto.randomUUID(),
              });
              if (createdTenant?.id) {
                await api.assignTenant(selectedUser.id, {
                  userId: selectedUser.id,
                  tenantId: createdTenant.id,
                  applicationId: 'IBMS',
                });
              }
            }

            try {
              const key = 'billing_pending_company_names';
              const stored = JSON.parse(localStorage.getItem(key) || '{}');
              delete stored[String(selectedUser.email || '').trim().toLowerCase()];
              localStorage.setItem(key, JSON.stringify(stored));
            } catch {}

            return approved;
          }}
          onDone={() => {
            void query.refetch();
            void onApproved?.();
          }}
          onClose={() => setEditor(null)}
        />
      )}
      {editor?.type === 'reject' && (
        <MutationDialog
          title={'Decline tenant: ' + (selectedUser.tenantName || selectedUser.name)}
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

export function PlatformTenants() {
  const [filters, setFilters] = useState({ page: 1, pageSize: 20, search: '', status: '' });
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const [tab, setTab] = useState(params.get('tab') === 'approvals' ? 'approvals' : 'directory');
  const [creating, setCreating] = useState(params.get('create') === '1');
  const [statusEditor, setStatusEditor] = useState(null);
  const search = useSearchDebounce(filters.search);
  const query = usePlatformQuery('tenants', { ...filters, search }, signal => api.tenants({ ...filters, search }, signal));
  const change = (key, value) => setFilters(f => ({ ...f, [key]: value, page: 1 }));
  useNavbarSearch(filters.search, value => change('search', value), 'Search tenants');

  const switchTab = nextTab => {
    setTab(nextTab);
    const next = new URLSearchParams(params);
    if (nextTab === 'approvals') next.set('tab', 'approvals');
    else next.delete('tab');
    setParams(next, { replace: true });
    if (nextTab === 'directory') void query.refetch();
  };

  return (
    <PlatformShell
      title="Tenant Management"
      actions={
        <>
          <PlatformRefresh query={query} />
          <Button variant="contained" disabled={query.isPending || query.isError} onClick={() => setCreating(true)}>
            Create Tenant
          </Button>
        </>
      }
    >
      <div className="platform-users-tabs" role="tablist" aria-label="Tenant management sections">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'directory'}
          className={`platform-users-tab${tab === 'directory' ? ' is-active' : ''}`}
          onClick={() => switchTab('directory')}
        >
          Tenants Directory
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'approvals'}
          className={`platform-users-tab${tab === 'approvals' ? ' is-active' : ''}`}
          onClick={() => switchTab('approvals')}
        >
          Pending Approvals
        </button>
      </div>

      {tab === 'directory' ? (
        <>
          <div className="platform-filters">
            <TextField size="small" label="Search tenants" value={filters.search} onChange={e => change('search', e.target.value)} />
            <SelectFilter label="Status" value={filters.status} options={['Active', 'Suspended', 'Inactive']} onChange={v => change('status', v)} />
          </div>
          <QueryState query={query} resource="tenants">
            {query.data && (
              <>
                <PlatformTable
                  label="Tenant directory"
                  rows={query.data.items}
                  columns={[
                    ['id', 'ID'],
                    ['tenantCode', 'Tenant Code'],
                    ['name', 'Company'],
                    ['companyEmail', 'Contact Email'],
                    ['status', 'Status', r => <PlatformStatus value={r.status} />],
                    ['createdAtUtc', 'Created', r => dateText(r.createdAtUtc)],
                    ['actions', 'Actions', r => <RowActions label={r.name || r.tenantCode || 'tenant'} items={[{ label: 'View details', icon: <VisibilityOutlined fontSize="small" />, onClick: () => navigate('/platform/tenants/' + r.id) }, { label: 'Change Status', icon: <SyncAltOutlined fontSize="small" />, onClick: () => setStatusEditor(r) }]} />],
                  ]}
                />
                <Pager itemLabel="tenants" data={query.data} filters={filters} setFilters={setFilters} />
              </>
            )}
          </QueryState>
        </>
      ) : (
        <PendingTenantApprovalsView onApproved={() => query.refetch()} />
      )}

      {creating && <TenantEditor onClose={() => { setCreating(false); params.delete('create'); setParams(params, { replace: true }); }} onDone={r => navigate('/platform/tenants/' + r.id)} />}
      {statusEditor && <MutationDialog title={`Change Status: ${statusEditor.name}`} description="Suspending or deactivating a tenant terminates its active sessions and prevents users from logging in. Confirm the target status and provide an audit reason." initial={{ status: statusEditor.status || 'Active', reason: '' }} fields={[{ name: 'status', label: 'Status', required: true, options: ['Active', 'Suspended', 'Inactive'] }, { name: 'reason', label: 'Reason', required: true, minLength: 5, multiline: true }]} submit={v => api.tenantStatus(statusEditor.id, v)} onClose={() => setStatusEditor(null)} onDone={() => { setStatusEditor(null); query.refetch(); }} />}
    </PlatformShell>
  );
}

export function PlatformTenantDetails() {
  const { id } = useParams();
  const query = usePlatformQuery('tenant', id, signal => api.tenant(id, signal));
  const usersQuery = usePlatformQuery('tenant-users', id, signal => api.tenantUsers(Number(id), signal));
  const rolesQuery = usePlatformQuery('tenant-roles', id, signal => api.tenantRoles(Number(id), signal));
  const [editor, setEditor] = useState(null);
  const t = query.data;
  const combinedRefresh = { isFetching: query.isFetching || usersQuery.isFetching || rolesQuery.isFetching, refetch: () => { query.refetch(); usersQuery.refetch(); rolesQuery.refetch(); } };
  return (
    <PlatformShell title={t ? t.name : 'Tenant Details'} actions={<><PlatformRefresh query={combinedRefresh} /><Button component={Link} to="/platform/tenants" variant="outlined" className="workspace-back-button">Back to Tenants</Button></>}>
      <QueryState query={query} resource="tenant details">
        {t && (
          <>
            <section className="platform-panel">
              <dl>{[['tenantCode', 'Code'], ['companyEmail', 'Email'], ['phone', 'Phone'], ['taxId', 'Tax ID'], ['address', 'Address'], ['status', 'Status'], ['userCount', 'Users'], ['createdAtUtc', 'Created']].map(([key, label]) => <div key={key}><dt>{label}</dt><dd>{key === 'createdAtUtc' ? dateText(t[key]) : key === 'status' ? <PlatformStatus value={t[key]} /> : t[key] ?? '—'}</dd></div>)}</dl>
              <div className="platform-actions">
                <Button onClick={() => setEditor('edit')}>Edit Tenant</Button>
                <Button onClick={() => setEditor('status')}>Change Status</Button>
                <Button component={Link} to={'/platform/audit?tenantId=' + t.id}>Administration Activity</Button>
              </div>
            </section>
            <TenantOrganizationOverview tenantUserCount={t.userCount} usersQuery={usersQuery} rolesQuery={rolesQuery} />
            <section className="platform-panel">
              <h2>Assigned Administrators</h2>
              <PlatformTable rows={t.assignedAdmins || []} columns={[['name', 'Name'], ['email', 'Email'], ['status', 'Status'], ['roles', 'Roles', r => r.roles?.join(', ')]]} />
            </section>
            {editor === 'edit' && <TenantEditor tenant={t} onClose={() => setEditor(null)} onDone={() => { setEditor(null); query.refetch(); }} />}
            {editor === 'status' && <MutationDialog title="Change Tenant Status" description="Suspending or deactivating a tenant terminates its active sessions and prevents users from logging in. Confirm the target status and provide an audit reason." initial={{ status: t.status, reason: '' }} fields={[{ name: 'status', label: 'Status', required: true, options: ['Active', 'Suspended', 'Inactive'] }, { name: 'reason', label: 'Reason', required: true, minLength: 5, multiline: true }]} submit={v => api.tenantStatus(t.id, v)} onClose={() => setEditor(null)} onDone={() => { setEditor(null); query.refetch(); }} />}
          </>
        )}
      </QueryState>
    </PlatformShell>
  );
}
