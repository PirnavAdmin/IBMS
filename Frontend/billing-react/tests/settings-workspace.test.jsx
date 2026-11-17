import React, { act } from 'react';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { SettingsWorkspace } from '../src/pages/Settings/SettingsWorkspace';
import { ProfileSettings } from '../src/pages/Settings/ProfileSettings';

async function mount(component) {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => root.render(<MemoryRouter initialEntries={['/settings/profile']}>{component}</MemoryRouter>));
  return {
    host,
    close: async () => {
      await act(async () => root.unmount());
      host.remove();
    },
  };
}

test('SettingsWorkspace renders all tabs including Profile Settings', async () => {
  const v = await mount(
    <SettingsWorkspace>
      <div>Content</div>
    </SettingsWorkspace>
  );

  try {
    const tabs = [
      'Taxes & GST',
      'Discounts',
      'Charges',
      'Invoice Numbering',
      'Notifications',
      'Reminders',
      'Countries',
      'Profile Settings',
    ];

    const renderedTabs = [...v.host.querySelectorAll('[role="tab"]')].map(t => t.textContent.trim());
    for (const label of tabs) {
      assert.ok(renderedTabs.includes(label), `Tab ${label} should be present in ${renderedTabs.join(', ')}`);
    }

    const profileTab = [...v.host.querySelectorAll('[role="tab"]')].find(t => t.textContent.trim() === 'Profile Settings');
    assert.ok(profileTab, 'Profile Settings tab must exist');
    assert.equal(profileTab.getAttribute('aria-selected'), 'true');
    assert.equal(profileTab.getAttribute('href'), '/settings/profile');
  } finally {
    await v.close();
  }
});

test('ProfileSettings renders user profile details', async () => {
  const mockUser = {
    userId: 'usr-12345',
    name: 'Sumanth Lanka',
    email: 'sumanth@example.com',
    role: 'TenantAdmin',
    tenantName: 'Acme Corp',
  };
  localStorage.setItem('billing_auth_user', JSON.stringify(mockUser));

  const v = await mount(<ProfileSettings />);

  try {
    assert.ok(v.host.textContent.includes('Profile Settings'));
    assert.ok(v.host.textContent.includes('Manage your personal profile, email, and workspace account preferences.'));
    assert.ok(v.host.textContent.includes('Sumanth Lanka'));
    assert.ok(v.host.textContent.includes('sumanth@example.com'));
    assert.ok(v.host.textContent.includes('TenantAdmin'));
    assert.ok(v.host.textContent.includes('usr-12345'));
    assert.ok(v.host.textContent.includes('Active'));
  } finally {
    await v.close();
    localStorage.clear();
  }
});
