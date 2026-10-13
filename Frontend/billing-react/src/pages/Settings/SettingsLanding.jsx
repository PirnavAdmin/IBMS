import React from 'react';
import {
  Settings,
  DiscountOutlined,
  Inventory2Outlined,
  ArrowForward,
  FormatListNumberedOutlined,
  ReceiptLongOutlined,
  PublicOutlined,
} from '@mui/icons-material';
import { Button } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import './settings.css';

const cards = [
  {
    title: 'Taxes & GST',
    description:
      'Configure tax rules, GST rates, calculation methods, and active billing taxes.',
    icon: ReceiptLongOutlined,
    route: '/settings/taxes',
  },
  {
    title: 'Discount Configuration',
    description:
      'Set maximum discounts, application controls, overrides, and role access.',
    icon: DiscountOutlined,
    route: '/settings/discounts',
  },
  {
    title: 'Charges Configuration',
    description:
      'Manage shipping, handling, late fees, and custom invoice charges.',
    icon: Inventory2Outlined,
    route: '/settings/charges',
  },
  {
    title: 'Invoice Numbering',
    description:
      'Configure document numbering format, dynamic date tokens, and sequence rules.',
    icon: FormatListNumberedOutlined,
    route: '/settings/numbering',
  },
];

function CardPattern({ variant }) {
  return (
    <svg
      className={`settings-card-pattern settings-card-pattern-${variant}`}
      viewBox="0 0 300 220"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      {variant === 3 ? (
        <>
          {Array.from({ length: 9 }, (_, i) => (
            <path key={i} d={`M${145 + i * 17} 15 V220 M65 ${115 + i * 17} H300`} />
          ))}
          {Array.from({ length: 9 }, (_, i) => (
            <path
              key={`arc-${i}`}
              d={`M${110 + i * 7} 230 Q${105 + i * 7} ${130 + i * 5} 305 ${130 + i * 5}`}
            />
          ))}
        </>
      ) : variant === 1 ? (
        <>
          {Array.from({ length: 13 }, (_, i) => (
            <ellipse key={i} cx="322" cy="92" rx={65 + i * 6} ry={62 + i * 6} />
          ))}
          {Array.from({ length: 20 }, (_, i) => (
            <path
              key={`diamond-${i}`}
              d={`M${90 + (i % 4) * 25} ${120 + Math.floor(i / 4) * 23} l4 4 -4 4 -4 -4 Z`}
            />
          ))}
        </>
      ) : variant === 4 ? (
        <>
          {Array.from({ length: 7 }, (_, i) => (
            <circle key={`c-${i}`} cx="260" cy="180" r={25 + i * 22} strokeDasharray="3 3" />
          ))}
          {Array.from({ length: 6 }, (_, i) => (
            <path key={`line-${i}`} d={`M${180 + i * 20} 10 L${260 + i * 10} 220`} />
          ))}
        </>
      ) : (
        Array.from({ length: 15 }, (_, i) => (
          <path
            key={i}
            d={
              variant === 0
                ? `M${15 + i * 7} 235 C${50 + i * 5} ${125 + i * 4}, ${185 + i * 5} ${215 - i * 3}, ${210 + i * 5} ${115 - i * 3} S320 15, 330 10`
                : `M${65 + i * 8} 240 C${140 + i * 5} ${25 + i * 3}, ${165 + i * 5} ${220 + i * 3}, 320 ${95 + i * 6}`
            }
          />
        ))
      )}
    </svg>
  );
}

export function SettingsLanding() {
  const navigate = useNavigate();

  return (
    <main className="settings-page settings-landing">
      <div className="settings-hero">
        <div className="settings-title-icon">
          <Settings />
        </div>
        <div>
          <p className="settings-eyebrow">Configuration & administration</p>
          <h1>Settings</h1>
          <p>Manage the billing rules that shape how your team creates invoices.</p>
        </div>
      </div>
      <section className="settings-card-grid" aria-label="Settings options">
        {cards.map(({ title, description, icon: Icon, route }, index) => (
          <article className="settings-nav-card" key={route}>
            <CardPattern variant={index} />
            <span className="settings-nav-icon" aria-hidden="true">
              <Icon />
            </span>
            <h2>{title}</h2>
            <p>{description}</p>
            <Button
              variant="contained"
              endIcon={<ArrowForward />}
              onClick={() => navigate(route)}
            >
              Configure
            </Button>
          </article>
        ))}

        {/* 5th Settings Card: Country Navigation Card */}
        <article className="settings-nav-card" key="country-setting">
          <CardPattern variant={4} />
          <span className="settings-nav-icon" aria-hidden="true">
            <PublicOutlined />
          </span>
          <h2>Country</h2>
          <p>Select the countries for your application.</p>
          <Button
            variant="contained"
            endIcon={<ArrowForward />}
            onClick={() => navigate('/settings/countries')}
          >
            Configure
          </Button>
        </article>
      </section>
    </main>
  );
}

export default SettingsLanding;
