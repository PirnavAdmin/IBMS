import React, { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { FeedbackSnackbar } from '../../components/FeedbackSnackbar';
import { TaxList } from '../Taxes/Taxes';

export function SettingsLanding() {
  const location = useLocation();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [countryNotice, setCountryNotice] = useState(location.state?.countrySaved || '');
  React.useEffect(() => {
    if (location.state?.countrySaved) navigate(location.pathname, { replace: true, state: { ...location.state, countrySaved: undefined } });
  }, [location, navigate]);
  return <>
    <FeedbackSnackbar message={countryNotice} onClose={() => setCountryNotice('')} />
    <main className="tax-settings-page"><TaxList search={search} setSearch={setSearch} /></main>
  </>;
}
export default SettingsLanding;
