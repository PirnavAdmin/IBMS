import { useState } from 'react';
import { Tooltip } from '@mui/material';

export function CustomerEmailLink({ email }) {
  const value = email.trim();
  const [truncated, setTruncated] = useState(false);
  const checkOverflow = event => {
    const link = event.currentTarget;
    setTruncated(link.scrollWidth > link.clientWidth);
  };

  return (
    <Tooltip title={truncated ? value : ''} describeChild arrow>
      <a
        className="customer-email-link"
        href={`mailto:${value}`}
        onMouseEnter={checkOverflow}
        onFocus={checkOverflow}
      >
        {value}
      </a>
    </Tooltip>
  );
}
