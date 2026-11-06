const fs = require('fs');
const path = 'Frontend/billing-react/src/services/notificationInboxService.js';
let content = fs.readFileSync(path, 'utf8');

const regex = /const routes = \{[\s\S]*?'credit-notes': \['creditnotes\.view', '\/credit-notes\/'\],?\s*\};/;
const replacement = `const routes = {
    invoices: ['invoices.view', '/invoices/'],
    payments: ['payments.view', '/payments/'],
    customers: ['customers.view', '/customers/'],
    'credit-notes': ['creditnotes.view', '/credit-notes/'],
    quotations: ['quotations.view', '/quotations?id='],
    notifications: ['settings.view', '/settings/notifications/history?id='],
    exports: ['billing.view', '/export-jobs?id='],
    jobs: ['settings.view', '/background-jobs?id='],
  };`;

if (regex.test(content)) {
  content = content.replace(regex, replacement);
  fs.writeFileSync(path, content, 'utf8');
  console.log('Successfully updated notification routes');
} else {
  console.log('Regex did not match');
}
