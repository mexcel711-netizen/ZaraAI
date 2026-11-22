import { useMemo, type CSSProperties } from 'react';
import {
  computeVoiceFrequencyBars,
  formatVolumePercent,
  getVolumeIntensityLabel,
  normalizeVoiceVolume,
} from '../lib/voiceHistory';
import type { VoiceCommandStatus } from '../types/nova';

interface VoiceFrequencyBarsProps {
  volumeLevel: number;
  status: VoiceCommandStatus;
  idSeed: number;
  isRunning?: boolean;
  barCount?: number;
}

export function VoiceFrequencyBars({
  volumeLevel,
  status,
  idSeed,
  isRunning = false,
  barCount = 14,
}: VoiceFrequencyBarsProps) {
  const normalizedVolume = normalizeVoiceVolume(volumeLevel, 0.5);
  const percentLabel = formatVolumePercent(normalizedVolume);
  const intensityLabel = getVolumeIntensityLabel(normalizedVolume);

  const bars = useMemo(
    () =>
      computeVoiceFrequencyBars({
        volumeLevel: normalizedVolume,
        idSeed,
        barCount,
      }),
    [normalizedVolume, idSeed, barCount]
  );

  const barToneClass =
    status === 'matched'
      ? 'bg-emerald-400'
      : status === 'failed'
        ? 'bg-rose-400'
        : 'bg-cyan-400';

  return (
    <div
      data-testid="voice-frequency-bars"
      data-volume={normalizedVolume.toFixed(2)}
      data-active={isRunning ? 'true' : 'false'}
      role="img"
      aria-label={`Voice command volume ${percentLabel} (${intensityLabel})`}
      title={`Captured volume: ${percentLabel} (${intensityLabel})`}
      className="voice-frequency-bars inline-flex items-end gap-2.5 shrink-0 select-none"
    >
      <div
        aria-hidden="true"
        className="flex h-7 items-end gap-[2.5px] border-b border-slate-800/90 pb-[1px]"
      >
        {bars.map((bar) => {
          const highOpacity = isRunning
            ? Math.min(1, bar.opacity + 0.12)
            : bar.opacity;
          const lowOpacity = Math.max(0.32, Math.round(highOpacity * 0.62 * 100) / 100);
          const style = {
            '--bar-min': String(bar.minScale),
            '--bar-max': String(bar.maxScale),
            '--bar-duration': `${bar.durationMs}ms`,
            '--bar-delay': `${bar.delayMs}ms`,
            '--bar-opacity-low': String(lowOpacity),
            '--bar-opacity-high': String(highOpacity),
          } as CSSProperties;

          return (
            <span
              key={bar.index}
              style={style}
              className={`voice-frequency-bar block h-full w-[2.5px] rounded-t-[1px] transition-colors duration-200 ${barToneClass} ${
                isRunning ? 'brightness-125' : 'group-hover:brightness-110'
              }`}
            />
          );
        })}
      </div>

      <span className="font-mono text-[11px] font-medium leading-none text-slate-400 tabular-nums w-8 text-right">
        {percentLabel}
      </span>
    </div>
  );
}
