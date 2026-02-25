import { useState } from 'react';
import { sendOtp, verifyOtp } from '../lib/auth';

interface AuthPromptProps {
  onSuccess: () => void;
  onDismiss: () => void;
}

export function AuthPrompt({ onSuccess, onDismiss }: AuthPromptProps) {
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSendCode() {
    if (!email.trim()) return;
    setLoading(true);
    setError(null);
    const result = await sendOtp(email.trim());
    setLoading(false);
    if (result.error) {
      setError(result.error);
    } else {
      setStep('code');
    }
  }

  async function handleVerifyCode() {
    if (!code.trim()) return;
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

  return (
    <div className="border rounded-lg p-4 bg-blue-50">
      <p className="text-sm font-medium mb-2">
        Protect your tabs with cloud backup?
      </p>

      {step === 'email' && (
        <>
          <input
            type="email"
            className="w-full border rounded px-2 py-1 text-sm mb-2"
            placeholder="your@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSendCode()}
          />
          <div className="flex gap-2">
            <button
              className="bg-blue-600 text-white px-3 py-1 rounded text-sm disabled:opacity-50"
              onClick={handleSendCode}
              disabled={loading || !email.trim()}
            >
              {loading ? 'Sending...' : 'Send code'}
            </button>
            <button
              className="text-gray-500 text-sm hover:underline"
              onClick={onDismiss}
            >
              Maybe later
            </button>
          </div>
        </>
      )}

      {step === 'code' && (
        <>
          <p className="text-xs text-gray-600 mb-2">
            Check your email for a 6-digit code.
          </p>
          <input
            type="text"
            className="w-full border rounded px-2 py-1 text-sm mb-2 tracking-widest text-center"
            placeholder="000000"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            onKeyDown={(e) => e.key === 'Enter' && handleVerifyCode()}
          />
          <button
            className="bg-blue-600 text-white px-3 py-1 rounded text-sm w-full disabled:opacity-50"
            onClick={handleVerifyCode}
            disabled={loading || code.length !== 6}
          >
            {loading ? 'Verifying...' : 'Sign in'}
          </button>
        </>
      )}

      {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
    </div>
  );
}
