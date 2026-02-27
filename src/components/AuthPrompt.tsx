import { OtpAuthFlow } from './OtpAuthFlow';

interface AuthPromptProps {
  onSuccess: () => void;
  onDismiss: () => void;
}

export function AuthPrompt({ onSuccess, onDismiss }: AuthPromptProps) {
  return (
    <div className="border rounded-lg p-4 bg-blue-50">
      <OtpAuthFlow
        onSuccess={onSuccess}
        onDismiss={onDismiss}
        submitLabel="Send code"
        description="Protect your tabs with cloud backup?"
        variant="compact"
      />
    </div>
  );
}
