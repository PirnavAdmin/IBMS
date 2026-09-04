import React, { useRef, useEffect } from 'react';

export const OtpInputGroup = ({ otp, onChange, disabled = false, autoFocus = true }) => {
  const inputRefs = useRef([]);

  useEffect(() => {
    if (autoFocus) {
      inputRefs.current[0]?.focus();
    }
  }, [autoFocus]);

  const handleDigitChange = (index, value) => {
    const digit = value.replace(/\D/g, '').slice(-1);
    const newOtp = [...otp];
    newOtp[index] = digit;
    onChange(newOtp);
    if (digit && index < otp.length - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, otp.length);
    if (!pasted) return;
    const newOtp = [...otp];
    pasted.split('').forEach((c, i) => {
      if (i < otp.length) newOtp[i] = c;
    });
    onChange(newOtp);
    inputRefs.current[Math.min(pasted.length, otp.length - 1)]?.focus();
  };

  return (
    <div className="otp-input-group" onPaste={handlePaste}>
      {otp.map((digit, idx) => (
        <input
          key={idx}
          ref={(el) => (inputRefs.current[idx] = el)}
          type="text"
          inputMode="numeric"
          maxLength={1}
          value={digit}
          onChange={(e) => handleDigitChange(idx, e.target.value)}
          onKeyDown={(e) => handleKeyDown(idx, e)}  
          className="otp-digit-input"
          autoComplete="one-time-code"
          disabled={disabled}
        />
      ))}
    </div>
  );
};

export default OtpInputGroup;