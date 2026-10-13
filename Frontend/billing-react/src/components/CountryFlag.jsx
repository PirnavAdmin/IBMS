import React from 'react';
import * as Flags from 'country-flag-icons/react/3x2';

/**
 * CountryFlag
 *
 * Renders authentic, crisp SVG flags for all 195 countries.
 * Eliminates Windows emoji flag limitations (where flags render as "IN", "US", etc.).
 */
export function CountryFlag({
  code,
  name,
  width = 20,
  height = 15,
  style = {},
  className = '',
}) {
  const upperCode = (code || '').toUpperCase().trim();
  const FlagComponent = Flags[upperCode];

  if (FlagComponent) {
    return (
      <FlagComponent
        title={name || upperCode}
        className={`country-flag-svg ${className}`.trim()}
        style={{
          width: typeof width === 'number' ? `${width}px` : width,
          height: typeof height === 'number' ? `${height}px` : height,
          borderRadius: '2px',
          objectFit: 'cover',
          display: 'inline-block',
          verticalAlign: 'middle',
          flexShrink: 0,
          boxShadow: '0 0 1px rgba(0, 0, 0, 0.2)',
          ...style,
        }}
      />
    );
  }

  // Graceful fallback if code is missing or unknown
  return (
    <span
      className={`country-flag-fallback ${className}`.trim()}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: typeof width === 'number' ? `${width}px` : width,
        height: typeof height === 'number' ? `${height}px` : height,
        fontSize: '10px',
        fontWeight: 700,
        backgroundColor: '#f1ede8',
        color: '#582407',
        borderRadius: '2px',
        flexShrink: 0,
        ...style,
      }}
      title={name || upperCode}
    >
      {upperCode ? upperCode.slice(0, 2) : '🌐'}
    </span>
  );
}

export default CountryFlag;
