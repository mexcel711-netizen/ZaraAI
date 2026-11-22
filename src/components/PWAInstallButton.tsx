import { useState } from 'react';
import { Download, MonitorSmartphone, Share2, WifiOff, X } from 'lucide-react';
import { useOnlineStatus, usePWAInstall } from '../lib/usePWAInstall';

interface PWAInstallButtonProps {
  compact?: boolean;
  onOpenLaptopTab?: () => void;
}

export function PWAInstallButton({ compact = false, onOpenLaptopTab }: PWAInstallButtonProps) {
  const { canInstall, isInstalled, isIOS, triggerInstall } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  if (canInstall) {
    return (
      <button
        type="button"
        onClick={() => void triggerInstall()}
        className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-300 transition-colors hover:border-emerald-400 hover:bg-emerald-500/20 whitespace-nowrap shrink-0"
      >
        <Download className="h-3.5 w-3.5" />
        <span>{compact ? 'Install App' : 'Install ZARA on Laptop'}</span>
      </button>
    );
  }

  if (isIOS) {
    return (
      <div className="relative">
        <button
          type="button"
          onClick={() => setShowIOSGuide((v) => !v)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-500/35 bg-[#0C1526] px-3 py-1.5 text-xs font-medium text-cyan-300 transition-colors hover:border-cyan-400 whitespace-nowrap shrink-0"
        >
          <Share2 className="h-3.5 w-3.5" />
          <span>Install</span>
        </button>
        {showIOSGuide && (
          <div className="absolute right-0 top-10 z-50 w-64 rounded-xl border border-slate-700 bg-[#0B1220] p-3.5 text-xs text-slate-200 shadow-2xl">
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold text-white">Install ZARA on iOS</span>
              <button
                type="button"
                aria-label="Close install instructions"
                onClick={() => setShowIOSGuide(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <p className="mt-1.5 leading-relaxed text-slate-300">
              Tap the Safari <strong>Share</strong> icon and choose{' '}
              <strong>Add to Home Screen</strong> to launch ZARA as a standalone app.
            </p>
          </div>
        )}
      </div>
    );
  }

  if (onOpenLaptopTab) {
    return (
      <button
        type="button"
        onClick={onOpenLaptopTab}
        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700/90 bg-[#0C1526] px-3 py-1.5 text-xs font-medium text-slate-200 transition-colors hover:border-cyan-400 hover:text-white whitespace-nowrap shrink-0"
      >
        <MonitorSmartphone className="h-3.5 w-3.5 text-cyan-400" />
        <span>{compact ? 'Desktop App' : 'Get Desktop App'}</span>
      </button>
    );
  }

  return null;
}

export function OfflineIndicator() {
  const isOnline = useOnlineStatus();
  if (isOnline) return null;

  return (
    <div
      role="status"
      className="flex items-center justify-center gap-2 border-b border-amber-500/30 bg-amber-500/15 px-4 py-1.5 text-xs font-medium text-amber-200"
    >
      <WifiOff className="h-3.5 w-3.5" />
      <span>Offline mode — local skills &amp; cached workspace remain accessible.</span>
    </div>
  );
}
