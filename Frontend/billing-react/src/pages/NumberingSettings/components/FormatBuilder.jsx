import React from 'react';
import { DeleteOutline, Add } from '@mui/icons-material';
import { SUPPORTED_TOKENS } from '../validation/numberingValidation';

const TOKEN_LABELS = {
  '(YEAR)': 'Year',
  '(YY)': 'Year',
  '(MONTH)': 'Month',
  '(MM)': 'Month',
  '(DAY)': 'Day',
  '(FY)': 'Fiscal Year',
  '(QUARTER)': 'Quarter',
  '(SEQUENCE)': 'Sequence',
};

export const FormatBuilder = ({
  prefix = '',
  suffix = '',
  tokens = '',
  onAddToken,
  onClearTokens,
}) => {
  // Normalize tokens: map curly braces to normal brackets for UI display
  const normalizedTokens = (tokens || '').replace(/\{/g, '(').replace(/\}/g, ')');
  // Parse tokens string into individual blocks and delimiters
  // e.g. "(YEAR)-(MONTH)-" -> ["(YEAR)", "(MONTH)"]
  const tokenMatches = normalizedTokens.match(/(\([^)]+\)|[^\s()\-]+)/g) || [];

  return (
    <div className="format-builder-section">
      <div className="format-builder-track-wrap">
        <div className="format-builder-track">
          {/* 1. Prefix Block */}
          <div className="format-block-item">
            <div className="format-pill is-static">
              {prefix || '(empty)'}
            </div>
            <span className="format-pill-label">Prefix</span>
          </div>

          <span className="format-divider">-</span>

          {/* 2. Middle Tokens */}
          {tokenMatches.length > 0 ? (
            tokenMatches.map((t, idx) => {
              const isToken = t.startsWith('(') && t.endsWith(')');
              const label = isToken ? TOKEN_LABELS[t.toUpperCase()] || 'Token' : 'Delimiter';
              return (
                <React.Fragment key={idx}>
                  <div className="format-block-item">
                    <div className={`format-pill ${isToken ? 'is-token' : 'is-delimiter'}`}>
                      {t}
                    </div>
                    <span className="format-pill-label">{label}</span>
                  </div>
                  {idx < tokenMatches.length - 1 && <span className="format-divider">-</span>}
                </React.Fragment>
              );
            })
          ) : null}

          <span className="format-divider">-</span>

          {/* 3. Sequence Block */}
          <div className="format-block-item">
            <div className="format-pill is-sequence">
              {'(SEQUENCE)'}
            </div>
            <span className="format-pill-label">Sequence</span>
          </div>

          <span className="format-divider">-</span>

          {/* 4. Suffix Block */}
          <div className="format-block-item">
            <div className="format-pill is-static">
              {suffix || '(empty)'}
            </div>
            <span className="format-pill-label">Suffix</span>
          </div>
        </div>
      </div>

      {/* Available Tokens Row */}
      <div className="available-tokens-panel">
        <span className="available-tokens-label">Available Tokens</span>
        <div className="available-tokens-list">
          {SUPPORTED_TOKENS.map((item) => (
            <button
              type="button"
              key={item.token}
              className="available-token-chip"
              onClick={() => onAddToken(item.token)}
              title={`Click to add ${item.token} (${item.desc})`}
            >
              {item.token}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default FormatBuilder;
