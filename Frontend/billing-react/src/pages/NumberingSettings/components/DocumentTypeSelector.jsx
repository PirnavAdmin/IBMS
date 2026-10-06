import React from 'react';
import {
  ReceiptLongOutlined,
  RequestQuoteOutlined,
  PaymentsOutlined,
  DescriptionOutlined,
  CheckCircle,
} from '@mui/icons-material';
import { DOCUMENT_TYPE_CARDS } from '../validation/numberingValidation';

const getDocTypeIcon = (id) => {
  switch (id) {
    case 'Invoice':
      return <ReceiptLongOutlined />;
    case 'Credit Note':
      return <RequestQuoteOutlined />;
    case 'Payment Receipt':
      return <PaymentsOutlined />;
    case 'Debit Note':
    default:
      return <DescriptionOutlined />;
  }
};

export const DocumentTypeSelector = ({ selectedType, onSelectType }) => {
  return (
    <div className="doc-type-grid">
      {DOCUMENT_TYPE_CARDS.map((item) => {
        const isSelected = selectedType === item.id;
        return (
          <button
            type="button"
            key={item.id}
            className={`doc-type-card ${isSelected ? 'is-selected' : ''}`}
            onClick={() => onSelectType(item.id)}
            aria-pressed={isSelected}
          >
            {isSelected && (
              <span className="doc-type-checkmark">
                <CheckCircle style={{ fontSize: '1.2rem' }} />
              </span>
            )}
            <div className="doc-type-icon">{getDocTypeIcon(item.id)}</div>
            <div className="doc-type-text">
              <strong>{item.title}</strong>
              <small>{item.description}</small>
            </div>
          </button>
        );
      })}
    </div>
  );
};

export default DocumentTypeSelector;
