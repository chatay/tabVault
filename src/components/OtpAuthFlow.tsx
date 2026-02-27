import { useState } from 'react';
import { sendOtp, verifyOtp } from '../lib/auth';

const OTP_LENGTH = 6;
const OTP_PLACEHOLDER = '000000';

interface OtpAuthFlowProps {
  onSuccess: () => void;
  /** Optional "cancel" / "dismiss" handler. If omitted, no cancel button is shown on the email step. */
  onDismiss?: () => void;
  /** Label for the primary submit button on the email step (default: "Send code") */
  submitLabel?: string;
  /** Description shown above the email input */
  description?: string;
  /** Visual variant: 'compact' for the popup, 'full' for the settings panel */
  variant?: 'compact' | 'full';
}

export function OtpAuthFlow({
  onSuccess,
  onDismiss,
  submitLabel = 'Send code',
  description,
  variant = 'full',
}: OtpAuthFlowProps) {
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSendCode() {
    const trimmed = email.trim();
    if (!trimmed) return;
    setLoading(true);
    setError(null);
    const result = await sendOtp(trimmed);
    setLoading(false);
    if (result.error) {
      setError(result.error);
    } else {
      setStep('code');
    }
  }

  async function handleResendCode() {
    setLoading(true);
    setError(null);
    const result = await sendOtp(email.trim());
    setLoading(false);
    if (result.error) {
      setError(result.error);
    }
  }

  async function handleVerifyCode() {
    if (code.length !== OTP_LENGTH) return;
    setLoading(true);
    setError(null);
    const result = await verifyOtp(email.trim(), code.trim());
    setLoading(false);
    if (result.error) {
      setError(result.error);
    } else {
      onSuccess();
    }
  }

  function handleUseDifferentEmail() {
    setStep('email');
    setCode('');
    setError(null);
  }

  // --- Code step ---
  if (step === 'code') {
    return (
      <div>
        <p className={variant === 'compact' ? 'text-xs text-gray-600 mb-2' : 'text-sm text-gray-600 mb-3'}>
          {variant === 'compact'
            ? `Check your email for a ${OTP_LENGTH}-digit code.`
            : <>We sent a {OTP_LENGTH}-digit code to <strong>{email.trim()}</strong></>}
        </p>
        <input
          type="text"
          className={
            variant === 'compact'
              ? 'w-full border rounded px-2 py-1 text-sm mb-2 tracking-widest text-center'
              : 'w-full border border-gray-200 rounded-lg px-3 min-h-[44px] text-sm tracking-widest text-center mb-3'
          }
          placeholder={OTP_PLACEHOLDER}
          maxLength={OTP_LENGTH}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
          onKeyDown={(e) => e.key === 'Enter' && handleVerifyCode()}
          autoFocus
        />
        <button
          className={
            variant === 'compact'
              ? 'bg-blue-600 text-white px-3 py-1 rounded text-sm w-full disabled:opacity-50'
              : 'w-full bg-blue-600 text-white text-sm font-medium px-4 min-h-[44px] rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors'
          }
          onClick={handleVerifyCode}
          disabled={loading || code.length !== OTP_LENGTH}
        >
          {loading ? 'Verifying...' : variant === 'compact' ? 'Sign in' : 'Verify'}
        </button>
        {variant === 'full' && (
          <div className="flex items-center gap-4 mt-3 justify-center">
            <button
              className="text-xs text-blue-600 hover:text-blue-800 min-h-[44px] transition-colors"
              onClick={handleResendCode}
              disabled={loading}
            >
              Resend code
            </button>
            <button
              className="text-xs text-gray-500 hover:text-gray-700 min-h-[44px] transition-colors"
              onClick={handleUseDifferentEmail}
            >
              Use a different email
            </button>
          </div>
        )}
        {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
      </div>
    );
  }

  // --- Email step ---
  return (
    <div>
      {description && (
        <p className={variant === 'compact' ? 'text-sm font-medium mb-2' : 'text-xs text-gray-500 text-center mb-4'}>
          {description}
        </p>
      )}
      <input
        type="email"
        className={
          variant === 'compact'
            ? 'w-full border rounded px-2 py-1 text-sm mb-2'
            : 'w-full border border-gray-200 rounded-lg px-3 min-h-[44px] text-sm mb-3'
        }
        placeholder="your@email.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && handleSendCode()}
      />
      <div className={variant === 'compact' ? 'flex gap-2' : ''}>
        <button
          className={
            variant === 'compact'
              ? 'bg-blue-600 text-white px-3 py-1 rounded text-sm disabled:opacity-50'
              : 'w-full bg-blue-600 text-white text-sm font-medium px-4 min-h-[44px] rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors'
          }
          onClick={handleSendCode}
          disabled={loading || !email.trim()}
        >
          {loading ? 'Sending...' : submitLabel}
        </button>
        {onDismiss && variant === 'compact' && (
          <button
            className="text-gray-500 text-sm hover:underline"
            onClick={onDismiss}
          >
            Maybe later
          </button>
        )}
      </div>
      {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
    </div>
  );
}
