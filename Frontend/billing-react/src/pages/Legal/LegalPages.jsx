import { Link } from 'react-router-dom';
import { InvoiceBillingLogo } from '../../components/InvoiceBillingLogo';
import './legal-pages.css';

const documents = {
  terms: {
    title: 'Terms & Conditions',
    intro: 'Project terms for using INVOICE.BILLING / IBMS billing workspaces.',
    sections: [
      ['About the service', 'INVOICE.BILLING provides tools for customer records, products and services, quotations, invoices, payments, credit notes and configured communications. The software supports business administration; it does not replace professional accounting, tax or legal advice.'],
      ['Your account and workspace', 'Provide accurate account information, keep sign-in credentials private and use only workspaces you are authorized to access. Workspace administrators are responsible for assigning appropriate access to their users.'],
      ['Your billing records', 'Review customer details, prices, taxes, dates and totals before issuing documents or recording payments. You are responsible for the information you enter, the documents you send and the records your business needs to retain.'],
      ['Acceptable use', 'Use the service for lawful, authorized business activity. Do not attempt to access another organization\'s data, bypass authentication, disrupt the service or upload harmful content. Only enter customer information that you are authorized to use.'],
      ['Connected services', 'Configured email delivery and other integrations may depend on separate service providers. Review the relevant provider terms and your workspace settings. Do not enter payment-card secrets, PINs or one-time codes into billing notes.'],
      ['Final business terms', 'Before these terms are published for production use, the operator must confirm its legal identity and contact details, any subscription or payment conditions, cancellation or refund terms, service commitments, liability provisions and applicable law. This draft does not invent those arrangements.'],
    ],
  },
  privacy: {
    title: 'Privacy Policy',
    intro: 'A project privacy draft explaining the information used by IBMS billing and account features.',
    sections: [
      ['Information used by the service', 'Account features use information such as your name, work email and authentication credentials. Billing features may process customer contact and address details, tax identifiers, product or service information, quotations, invoices, payment records, credit notes, communication history and audit activity.'],
      ['Why information is used', 'The application uses relevant information to authenticate users, control workspace access, manage billing records, render documents and previews, process configured communications and show operational history. The operator must confirm the lawful basis for its actual processing where required.'],
      ['Browser storage', 'The current frontend stores authentication tokens and basic profile details in browser local storage to support the signed-in session. Use an appropriate device for your business account and sign out when you finish, especially on shared devices.'],
      ['Providers and disclosures', 'Configured backend services and integrations may process information needed for their features. The operator must identify the actual hosting, email and other service providers, any international transfers and other recipients before publishing a final policy. No claim about selling data or third-party tracking is made in this draft.'],
      ['Retention and requests', 'Retention periods and the official privacy-request contact are not yet finalized in this draft. Contact the organization administering your workspace about access, corrections or deletion requests. The operator must document the available process and any applicable recordkeeping requirements.'],
      ['Review before production', 'Confirm the operator identity and privacy contact, actual data flows, purposes and lawful bases, providers and transfers, retention periods, security practices and available individual rights before adopting this policy. Review changes when the service or its data practices change.'],
    ],
  },
};

function LegalPage({ kind }) {
  const doc = documents[kind];
  return <main className="ibms-legal-page">
    <article className="ibms-legal-document">
      <header><div className="ibms-legal-brand"><InvoiceBillingLogo tone="auth" size={28} /><span>INVOICE.BILLING</span></div><p className="ibms-legal-eyebrow">Project draft for review</p><h1>{doc.title}</h1><p>{doc.intro}</p></header>
      <aside className="ibms-legal-review" aria-label="Document review status">Draft for project review. Business details and actual data practices must be confirmed before production use. These pages do not establish legal compliance.</aside>
      {doc.sections.map(([title, text]) => <section key={title}><h2>{title}</h2><p>{text}</p></section>)}
      <footer><Link to="/register">Back to Create Account</Link><Link to={kind === 'terms' ? '/privacy' : '/terms'}>{kind === 'terms' ? 'Privacy Policy' : 'Terms & Conditions'}</Link></footer>
    </article>
  </main>;
}
export const TermsAndConditions = () => <LegalPage kind="terms" />;
export const PrivacyPolicy = () => <LegalPage kind="privacy" />;
