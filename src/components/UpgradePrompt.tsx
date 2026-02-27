import { getCheckoutUrl } from '../lib/billing';
import { CLOUD_FREE_TAB_LIMIT } from '../lib/constants';

interface UpgradePromptProps {
  tabCount: number;
  onDismiss: () => void;
}

export function UpgradePrompt({ tabCount, onDismiss }: UpgradePromptProps) {
  const checkoutUrl = getCheckoutUrl();

  return (
    <div className="border rounded-lg p-4 bg-amber-50 border-amber-200">
      <p className="text-sm font-medium mb-1">
        You've saved {tabCount} of {CLOUD_FREE_TAB_LIMIT} free cloud tabs!
      </p>
      <p className="text-xs text-gray-600 mb-3">
        Upgrade to unlimited cloud backup for $3/month.
      </p>
      <div className="flex gap-2">
        <button
          className="bg-blue-600 text-white px-3 py-1 rounded text-sm"
          onClick={() => { if (checkoutUrl) chrome.tabs.create({ url: checkoutUrl }); }}
        >
          Upgrade
        </button>
        <button
          className="text-gray-500 text-sm hover:underline"
          onClick={onDismiss}
        >
          Not now
        </button>
      </div>
    </div>
  );
}
