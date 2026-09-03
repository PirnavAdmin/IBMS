import React from 'react';

export const HoverboardCard = ({ children, className = '', ...props }) => (
  <div className={`login-hoverboard-card hoverboard-card ${className}`} {...props}>
    {children}
  </div>
);

export default HoverboardCard;