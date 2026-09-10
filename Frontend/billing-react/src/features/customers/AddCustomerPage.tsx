import { Button } from '@mui/material';
import { ArrowBack } from '@mui/icons-material';
import { Link } from 'react-router-dom';
import './customers.css';

export function AddCustomerPage() {
  return (
    <main className="customers-page">
      <nav className="customers-breadcrumb" aria-label="Breadcrumb">
        <Link to="/customers">Customers</Link>
        <span>/</span>
        <strong>Add Customer</strong>
      </nav>
      <header className="customers-heading">
        <div><h1>Add Customer</h1></div>
        <Button component={Link} to="/customers" variant="outlined" startIcon={<ArrowBack />}>
          Back to customers
        </Button>
      </header>
    </main>
  );
}
