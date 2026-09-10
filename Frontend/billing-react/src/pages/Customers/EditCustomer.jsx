import { Alert, Breadcrumbs, Button, Card, Link, Snackbar, TextField } from '@mui/material';
import { Link as RouterLink, useParams } from 'react-router-dom';
import { useRef, useState } from 'react';
import { useCustomerProfile, useCustomerMutation } from '../../hooks/useCustomer';
import { customerUpdatePayload, validateCustomerEdit } from '../../services/customerEdit';
import { CustomerState } from '../../components/customers/CustomerShared';
import '../../styles/Customers.css';

const fields = [['name', 'Customer Name', true], ['email', 'Email', true, 'email'], ['phone', 'Phone'], ['website', 'Website', false, 'url']];
const formValues = customer => Object.fromEntries(fields.map(([key]) => [key, customer[key] ?? '']));

function EditForm({ customer, customerId, reload }) {
  const [values, setValues] = useState(() => formValues(customer));
  const [savedCustomer, setSavedCustomer] = useState(() => customerUpdatePayload(customer, customer));
  const [errors, setErrors] = useState({});
  const [success, setSuccess] = useState(false);
  const submitting = useRef(false);
  const mutation = useCustomerMutation(customerId);
  async function save(event) {
    event.preventDefault();
    if (submitting.current) return;
    setSuccess(false);
    mutation.reset();
    const validation = validateCustomerEdit(values);
    setErrors(validation);
    if (Object.keys(validation).length) return;
    submitting.current = true;
    try {
      const updated = await mutation.mutateAsync([customerUpdatePayload(savedCustomer, values)]);
      // Keep the server's new concurrency token for subsequent saves.
      const fresh = updated?.id ? updated : (await reload()).data;
      if (fresh) {
        setSavedCustomer(customerUpdatePayload(fresh, fresh));
        setValues(formValues(fresh));
      }
      setSuccess(true);
    } catch {
      // The mutation exposes API errors; preserve the user's input for correction.
    } finally {
      submitting.current = false;
    }
  }
  return <Card className="customer-card"><h1>Edit Customer</h1><p>{customerId} · Contact and customer information</p>
    <form onSubmit={save} noValidate aria-busy={mutation.isPending}>
      {mutation.isError && <Alert severity="error">{mutation.error.message}</Alert>}
      {Object.values(errors).some(Boolean) && <Alert severity="error">Please correct the highlighted fields.</Alert>}
      <div className="customer-form">{fields.map(([key, label, required, type]) => <TextField key={key} label={label} required={Boolean(required)} type={type || 'text'} value={values[key] ?? ''} disabled={mutation.isPending} error={Boolean(errors[key])} helperText={errors[key]} onChange={(event) => { setValues({ ...values, [key]: event.target.value }); setErrors(previous => ({ ...previous, [key]: undefined })); }} inputProps={{ maxLength: key === 'phone' ? 64 : 256 }} />)}</div>
      <div className="customer-actions"><Button variant="contained" type="submit" disabled={mutation.isPending}>{mutation.isPending ? 'Saving…' : 'Save Changes'}</Button><Button component={RouterLink} to={`/customers/${customerId}`} disabled={mutation.isPending}>Back to Customer</Button></div>
    </form><Snackbar open={success} autoHideDuration={4000} onClose={() => setSuccess(false)}><Alert severity="success" onClose={() => setSuccess(false)}>Customer updated successfully.</Alert></Snackbar>
  </Card>;
}
export function EditCustomer() {
  const { customerId } = useParams();
  const query = useCustomerProfile(customerId);
  return <main className="customer-page"><Breadcrumbs sx={{ mb: 3 }}><Link component={RouterLink} to="/customers">Customers</Link><Link component={RouterLink} to={`/customers/${encodeURIComponent(customerId)}`}>Customer Details</Link><span>Edit Customer</span></Breadcrumbs><CustomerState query={query} />{query.isSuccess && <EditForm key={customerId} customerId={customerId} customer={query.data} reload={query.refetch} />}</main>;
}
