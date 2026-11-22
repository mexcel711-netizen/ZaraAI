import { useEffect, useRef, type CSSProperties } from 'react';
import {
  computeBlinkDurationMs,
  createBlinkScheduler,
  getPortraitEyeGeometry,
  stepBlinkScheduler,
  type EyeBox,
} from '../lib/avatarBlink';
import {
  DEFAULT_MOOD_INTENSITY,
  resolveEmotionPresetConfig,
} from '../lib/emotionAndSpeech';
import {
  computeHairAirWisps,
  computeTargetHairWind,
  computeVoiceWaveBars,
  stepHairWind,
} from '../lib/hairPhysics';
import type { AvatarState, FacialEmotion, HairstyleOption, HeartState, MoodMode } from '../types/nova';

interface HolographicAvatarProps {
  state: AvatarState;
  emotion: FacialEmotion;
  activeMood?: MoodMode;
  moodIntensity?: number;
  emotionPresetsEnabled?: boolean;
  assistantName: string;
  hairstyle?: HairstyleOption;
  heart?: HeartState;
  variant?: 'stage' | 'hero' | 'compact';
  showRadarRing?: boolean;
  showVoiceWaves?: boolean;
  micLevel?: number;
  lipOpenness?: number;
  lipWidth?: number;
  deepThinking?: boolean;
}

const HAIRSTYLE_IMAGES: Record<HairstyleOption, string> = {
  bob: '/src/assets/images/zara_bob_hologram_1795079124903.jpg',
  wavy: '/src/assets/images/nova_wavy_hologram_1795067914360.jpg',
  straight: '/src/assets/images/zara_straight_hologram_1795079125416.jpg',
};

const OFFSCREEN_SIZE = 512;
const VOICE_WAVE_BAR_COUNT = 15;


export function HolographicAvatar({
  state,
  emotion,
  activeMood = 'auto',
  moodIntensity = DEFAULT_MOOD_INTENSITY,
  emotionPresetsEnabled = false,
  assistantName,
  hairstyle = 'wavy',
  heart,
  variant = 'stage',
  showRadarRing = true,
  showVoiceWaves,
  micLevel = 0,
  lipOpenness = 0,
  lipWidth = 0,
  deepThinking = false,
}: HolographicAvatarProps) {
  const preset = resolveEmotionPresetConfig({
    activeMood,
    emotion,
    moodIntensity,
    presetsEnabled: emotionPresetsEnabled,
  });

  const shouldShowWaves = showVoiceWaves ?? variant !== 'compact';
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const waveContainerRef = useRef<HTMLDivElement | null>(null);
  const waveBarRefs = useRef<Array<HTMLSpanElement | null>>([]);
  const stateRef = useRef<AvatarState>(state);
  const emotionRef = useRef<FacialEmotion>(preset.resolvedMood);
  const presetsEnabledRef = useRef<boolean>(emotionPresetsEnabled);
  const speedFactorRef = useRef<number>(preset.effectiveSpeedFactor);
  const moodIntensityRef = useRef<number>(preset.intensity);
  const baseRgbRef = useRef<[number, number, number]>(preset.baseRgb);
  const hairstyleRef = useRef<HairstyleOption>(hairstyle);
  const heartBpmRef = useRef<number>(heart?.heartbeatBpm ?? 74);
  const showRingRef = useRef<boolean>(showRadarRing);
  const micRef = useRef<number>(micLevel);
  const lipOpenRef = useRef<number>(lipOpenness);
  const lipWidthRef = useRef<number>(lipWidth);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    emotionRef.current = preset.resolvedMood;
    presetsEnabledRef.current = emotionPresetsEnabled;
    speedFactorRef.current = preset.effectiveSpeedFactor;
    moodIntensityRef.current = preset.intensity;
    baseRgbRef.current = preset.baseRgb;
  }, [
    preset.resolvedMood,
    emotionPresetsEnabled,
    preset.effectiveSpeedFactor,
    preset.intensity,
    preset.baseRgb,
  ]);

  useEffect(() => {
    heartBpmRef.current = heart?.heartbeatBpm ?? 74;
  }, [heart?.heartbeatBpm]);

  useEffect(() => {
    hairstyleRef.current = hairstyle;
  }, [hairstyle]);

  useEffect(() => {
    showRingRef.current = showRadarRing;
  }, [showRadarRing]);

  useEffect(() => {
    micRef.current = micLevel;
  }, [micLevel]);

  useEffect(() => {
    lipOpenRef.current = lipOpenness;
  }, [lipOpenness]);

  useEffect(() => {
    lipWidthRef.current = lipWidth;
  }, [lipWidth]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Preload all 3 hairstyle portraits into feathered offscreen canvases for instant switching
    const offscreenCache: Partial<Record<HairstyleOption, HTMLCanvasElement>> = {};
    (['wavy', 'bob', 'straight'] as HairstyleOption[]).forEach((styleKey) => {
      const img = new Image();
      img.onload = () => {
        const off = document.createElement('canvas');
        off.width = OFFSCREEN_SIZE;
        off.height = OFFSCREEN_SIZE;
        const offCtx = off.getContext('2d');
        if (offCtx) {
          offCtx.clearRect(0, 0, OFFSCREEN_SIZE, OFFSCREEN_SIZE);
          offCtx.drawImage(img, 0, 0, OFFSCREEN_SIZE, OFFSCREEN_SIZE);
          offCtx.save();
          offCtx.globalCompositeOperation = 'destination-in';
          const feather = offCtx.createRadialGradient(256, 246, 112, 256, 256, 238);
          feather.addColorStop(0, 'rgba(0,0,0,1)');
          feather.addColorStop(0.64, 'rgba(0,0,0,0.94)');
          feather.addColorStop(0.85, 'rgba(0,0,0,0.34)');
          feather.addColorStop(1, 'rgba(0,0,0,0)');
          offCtx.fillStyle = feather;
          offCtx.fillRect(0, 0, OFFSCREEN_SIZE, OFFSCREEN_SIZE);
          offCtx.restore();
          offscreenCache[styleKey] = off;
        }
      };
      img.src = HAIRSTYLE_IMAGES[styleKey];
    });

    const emotionWeights: Record<FacialEmotion, number> = {
      calm: 1,
      happy: 0,
      love: 0,
      sad: 0,
      surprised: 0,
      excited: 0,
      empathetic: 0,
      thoughtful: 0,
      confident: 0,
      angry: 0,
      curious: 0,
    };

    const canvasLogicalSize = variant === 'hero' ? 360 : variant === 'compact' ? 200 : 280;

    let rafId = 0;
    let phase = 0;
    let windPhase = 0;
    let currentWind = 0.32;
    let lastWindAttr = '';
    let lastWaveActiveAttr = '';
    let lastBlinkPhaseAttr = '';
    let lastBlinkDurationAttr = '';
    let lastDrawTime = 0;
    const minFrameMs = variant === 'compact' ? 42 : 28;
    let blinkState = createBlinkScheduler({
      nowMs: typeof performance !== 'undefined' ? performance.now() : 0,
      moodIntensity: moodIntensityRef.current,
      emotion: emotionRef.current,
    });

    const drawSingleEyeBlink = (
      eye: EyeBox,
      drawX: number,
      drawY: number,
      drawSize: number,
      blinkAmount: number,
      baseRgb: [number, number, number],
      lashAccent: string
    ) => {
      const ex = drawX + eye.x * drawSize;
      const ey = drawY + eye.y * drawSize;
      const rx = eye.rx * drawSize;
      const ry = eye.ry * drawSize;
      const lidDrop = Math.min(1, Math.max(0, blinkAmount));

      ctx.save();
      ctx.translate(ex, ey);
      ctx.rotate(eye.tilt);

      // Soft orbital eyelid shadow covering the bright glowing sclera from top down
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(0, 0, rx * 1.25, ry * 1.32, 0, 0, Math.PI * 2);
      ctx.clip();

      const upperY = -ry * 1.25;
      const lowerEdgeY = -ry * 0.95 + lidDrop * (ry * 2.15);
      const shadeR = Math.max(4, Math.round(baseRgb[0] * 0.72));
      const shadeG = Math.max(22, Math.round(baseRgb[1] * 1.15));
      const shadeB = Math.max(38, Math.round(baseRgb[2] * 1.25));

      const lidGrad = ctx.createLinearGradient(0, upperY, 0, lowerEdgeY + 2);
      lidGrad.addColorStop(0, `rgba(${shadeR}, ${shadeG}, ${shadeB}, ${(0.78 * lidDrop).toFixed(3)})`);
      lidGrad.addColorStop(0.68, `rgba(7, 30, 48, ${(0.90 * lidDrop).toFixed(3)})`);
      lidGrad.addColorStop(1, `rgba(12, 46, 68, ${(0.84 * lidDrop).toFixed(3)})`);

      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = lidGrad;
      ctx.beginPath();
      ctx.moveTo(-rx * 1.35, upperY);
      ctx.lineTo(rx * 1.35, upperY);
      ctx.lineTo(rx * 1.35, lowerEdgeY);
      ctx.quadraticCurveTo(0, lowerEdgeY + ry * (0.28 + 0.32 * lidDrop), -rx * 1.35, lowerEdgeY);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      // Luminous curved holographic upper lash-line descending cleanly with the eyelid
      const creaseCtrlY = lowerEdgeY + ry * (0.28 * lidDrop - 0.14 * (1 - lidDrop));
      ctx.globalCompositeOperation = 'screen';
      ctx.lineCap = 'round';
      ctx.strokeStyle = lashAccent;
      ctx.globalAlpha = 0.25 + lidDrop * 0.55;
      ctx.lineWidth = Math.max(1.0, drawSize * 0.0052);
      ctx.beginPath();
      ctx.moveTo(-rx * 0.95, lowerEdgeY - ry * 0.08);
      ctx.quadraticCurveTo(0, creaseCtrlY, rx * 0.95, lowerEdgeY - ry * 0.05);
      ctx.stroke();

      ctx.restore();
    };

    const drawPortraitBlink = (
      drawX: number,
      drawY: number,
      drawSize: number,
      styleKey: HairstyleOption,
      blinkAmount: number,
      baseRgb: [number, number, number],
      lashAccent: string
    ) => {
      if (blinkAmount <= 0.02) return;
      const eyes = getPortraitEyeGeometry(styleKey);
      drawSingleEyeBlink(eyes.left, drawX, drawY, drawSize, blinkAmount, baseRgb, lashAccent);
      drawSingleEyeBlink(eyes.right, drawX, drawY, drawSize, blinkAmount, baseRgb, lashAccent);
    };

    const drawGlowingHairAir = (
      drawX: number,
      drawY: number,
      drawSize: number,
      hairPhase: number,
      styleKey: HairstyleOption,
      glowPrimary: string,
      glowSoft: string
    ) => {
      // 1. Steady soft holographic sheen localized over the hair crown (zero brightness pulsing)
      const hairGlowX =
        styleKey === 'bob'
          ? drawX + drawSize * 0.48
          : styleKey === 'straight'
            ? drawX + drawSize * 0.42
            : drawX + drawSize * 0.44;
      const hairGlowY = drawY + drawSize * 0.29;
      const hairGlowR = drawSize * 0.35;

      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      const hairHalo = ctx.createRadialGradient(
        hairGlowX,
        hairGlowY,
        drawSize * 0.04,
        hairGlowX,
        hairGlowY,
        hairGlowR
      );
      hairHalo.addColorStop(0, glowPrimary);
      hairHalo.addColorStop(0.55, glowSoft);
      hairHalo.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.globalAlpha = 0.28;
      ctx.fillStyle = hairHalo;
      ctx.beginPath();
      ctx.arc(hairGlowX, hairGlowY, hairGlowR, 0, Math.PI * 2);
      ctx.fill();

      // 2. Layered silky luminous hair strands flowing smoothly in the air (zero portrait distortion)
      const wisps = computeHairAirWisps({
        hairstyle: styleKey,
        phase: hairPhase,
        drawX,
        drawY,
        drawSize,
        intensity: prefersReducedMotion ? 0.35 : 1,
      });

      ctx.lineCap = 'round';
      ctx.globalAlpha = 1;
      for (const w of wisps) {
        // Outer soft silk hair bloom
        const bloomGrad = ctx.createLinearGradient(w.x0, w.y0, w.x1, w.y1);
        bloomGrad.addColorStop(0, 'rgba(125, 211, 252, 0)');
        bloomGrad.addColorStop(0.32, `rgba(125, 211, 252, ${(w.alpha * 0.38).toFixed(3)})`);
        bloomGrad.addColorStop(0.74, `rgba(56, 189, 248, ${(w.alpha * 0.30).toFixed(3)})`);
        bloomGrad.addColorStop(1, 'rgba(56, 189, 248, 0)');

        ctx.strokeStyle = bloomGrad;
        ctx.lineWidth = w.lineWidth * 2.4;
        ctx.beginPath();
        ctx.moveTo(w.x0, w.y0);
        ctx.bezierCurveTo(w.cx1, w.cy1, w.cx2, w.cy2, w.x1, w.y1);
        ctx.stroke();

        // Crisp inner silky hair filament
        const coreGrad = ctx.createLinearGradient(w.x0, w.y0, w.x1, w.y1);
        coreGrad.addColorStop(0, 'rgba(224, 242, 254, 0)');
        coreGrad.addColorStop(0.28, `rgba(224, 242, 254, ${Math.min(0.85, w.alpha * 1.45).toFixed(3)})`);
        coreGrad.addColorStop(0.72, `rgba(103, 232, 249, ${Math.min(0.75, w.alpha * 1.1).toFixed(3)})`);
        coreGrad.addColorStop(1, 'rgba(56, 189, 248, 0)');

        ctx.strokeStyle = coreGrad;
        ctx.lineWidth = Math.max(0.85, w.lineWidth * 0.9);
        ctx.beginPath();
        ctx.moveTo(w.x0, w.y0);
        ctx.bezierCurveTo(w.cx1, w.cy1, w.cx2, w.cy2, w.x1, w.y1);
        ctx.stroke();
      }
      ctx.restore();
    };

    const renderFrame = (now: number = 0) => {
      const frameInterval = blinkState.isBlinking ? 14 : minFrameMs;
      if (!prefersReducedMotion && lastDrawTime !== 0 && now - lastDrawTime < frameInterval) {
        rafId = requestAnimationFrame(renderFrame);
        return;
      }
      lastDrawTime = now;

      const dpr = variant === 'compact' ? 1 : Math.min(window.devicePixelRatio || 1, 2);
      const width = canvasLogicalSize;
      const height = canvasLogicalSize;
      if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
        canvas.width = width * dpr;
        canvas.height = height * dpr;
      }

      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, width, height);

      const cx = width / 2;
      const cy = height / 2;
      const curState = stateRef.current;
      const curEmotion = emotionRef.current;
      const curStyle = hairstyleRef.current;
      const curMic = micRef.current;
      const curLipOpen = lipOpenRef.current;
      const curLipWidth = lipWidthRef.current;

      (Object.keys(emotionWeights) as FacialEmotion[]).forEach((k) => {
        const target = k === curEmotion ? 1 : 0;
        emotionWeights[k] += (target - emotionWeights[k]) * 0.08;
      });

      const targetWind = prefersReducedMotion
        ? 0
        : computeTargetHairWind({
            state: curState,
            micLevel: curMic,
            lipOpenness: curLipOpen,
            ambientBreeze: true,
          });
      currentWind = prefersReducedMotion ? 0 : stepHairWind(currentWind, targetWind);

      const windLabel = currentWind.toFixed(2);
      if (containerRef.current && windLabel !== lastWindAttr) {
        lastWindAttr = windLabel;
        containerRef.current.dataset.hairWind = windLabel;
      }

      blinkState = stepBlinkScheduler(blinkState, now, {
        moodIntensity: moodIntensityRef.current,
        emotion: curEmotion,
        prefersReducedMotion,
      });
      if (containerRef.current) {
        if (blinkState.phase !== lastBlinkPhaseAttr) {
          lastBlinkPhaseAttr = blinkState.phase;
          containerRef.current.dataset.blink = blinkState.phase;
        }
        const durLabel = String(blinkState.blinkDurationMs);
        if (durLabel !== lastBlinkDurationAttr) {
          lastBlinkDurationAttr = durLabel;
          containerRef.current.dataset.blinkDurationMs = durLabel;
        }
      }

      const curSpeed = Math.max(0.45, Math.min(2.8, speedFactorRef.current || 1));
      const waveSpeed =
        (curState === 'thinking'
          ? 0.042
          : curState === 'speaking'
            ? 0.036
            : curState === 'listening'
              ? 0.028
              : 0.018) * curSpeed;
      if (!prefersReducedMotion) {
        phase += waveSpeed;
        windPhase += 0.026 * curSpeed;
      }

      if (waveContainerRef.current) {
        const waveState = computeVoiceWaveBars({
          state: curState,
          micLevel: curMic,
          lipOpenness: curLipOpen,
          lipWidth: curLipWidth,
          phase: prefersReducedMotion ? 0 : phase,
          barCount: VOICE_WAVE_BAR_COUNT,
        });
        const activeStr = waveState.active ? 'true' : 'false';
        if (activeStr !== lastWaveActiveAttr) {
          lastWaveActiveAttr = activeStr;
          waveContainerRef.current.dataset.active = activeStr;
        }
        waveState.bars.forEach((barScale, idx) => {
          const barEl = waveBarRefs.current[idx];
          if (!barEl) return;
          const safeScale = prefersReducedMotion ? (waveState.active ? 0.55 : 0.16) : barScale;
          barEl.style.transform = `scaleY(${safeScale})`;
          barEl.style.opacity = waveState.active
            ? `${(0.48 + safeScale * 0.52).toFixed(2)}`
            : '0.32';
        });
      }

      const palette =
        curState === 'error' || curEmotion === 'angry'
          ? { primary: '#FF4D6D', secondary: '#FB7185', glow: 'rgba(255,77,109,0.28)', tint: 'rgba(255,77,109,0.22)' }
          : curEmotion === 'love'
            ? { primary: '#FB7185', secondary: '#F472B6', glow: 'rgba(251,113,133,0.32)', tint: 'rgba(244,114,182,0.24)' }
            : curEmotion === 'excited'
              ? { primary: '#38BDF8', secondary: '#34D399', glow: 'rgba(56,189,248,0.28)', tint: 'rgba(52,211,153,0.16)' }
              : curEmotion === 'sad'
                ? { primary: '#60A5FA', secondary: '#818CF8', glow: 'rgba(96,165,250,0.26)', tint: 'rgba(79,70,229,0.22)' }
                : curEmotion === 'happy'
                  ? { primary: '#22D3EE', secondary: '#10B981', glow: 'rgba(16,185,129,0.26)', tint: 'rgba(16,185,129,0.14)' }
                  : curEmotion === 'empathetic'
                    ? { primary: '#5EEAD4', secondary: '#818CF8', glow: 'rgba(94,234,212,0.28)', tint: 'rgba(129,140,248,0.18)' }
                    : curEmotion === 'surprised'
                      ? { primary: '#7DD3FC', secondary: '#38BDF8', glow: 'rgba(125,211,252,0.34)', tint: 'rgba(56,189,248,0.20)' }
                      : { primary: '#38BDF8', secondary: '#22D3EE', glow: 'rgba(34,211,238,0.26)', tint: 'rgba(34,211,238,0.08)' };

      // 1. Crisp Circular Radar Degree-Tick Ring (matching reference onboarding screenshots)
      const ringRadius = width * 0.455;
      if (showRingRef.current) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, ringRadius, 0, Math.PI * 2);
        ctx.strokeStyle =
          curState === 'speaking' ? 'rgba(56, 189, 248, 0.34)' : 'rgba(56, 189, 248, 0.18)';
        ctx.lineWidth = 1;
        ctx.stroke();

        // Inner thin ring
        ctx.beginPath();
        ctx.arc(cx, cy, ringRadius - 10, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(34, 211, 238, 0.08)';
        ctx.lineWidth = 1;
        ctx.stroke();

        // 72 Static high-precision degree ticks around perimeter (never rotates or jitters)
        for (let i = 0; i < 72; i++) {
          const a = (i / 72) * Math.PI * 2;
          const isMajor = i % 6 === 0;
          const rIn = ringRadius + 2;
          const rOut = ringRadius + (isMajor ? 8 : 4);
          ctx.beginPath();
          ctx.moveTo(cx + Math.cos(a) * rIn, cy + Math.sin(a) * rIn);
          ctx.lineTo(cx + Math.cos(a) * rOut, cy + Math.sin(a) * rOut);
          ctx.strokeStyle = isMajor ? 'rgba(103, 232, 249, 0.48)' : 'rgba(103, 232, 249, 0.16)';
          ctx.lineWidth = isMajor ? 1.2 : 0.8;
          ctx.stroke();
        }
        ctx.restore();
      }

      // 2. Central radial volumetric glow inside circle (honors Emotion Presets base color when active)
      const [baseR, baseG, baseB] = baseRgbRef.current;
      if (presetsEnabledRef.current) {
        const baseFill = ctx.createRadialGradient(cx, cy, width * 0.04, cx, cy, ringRadius - 2);
        baseFill.addColorStop(0, `rgba(${baseR}, ${baseG}, ${baseB}, 0.85)`);
        baseFill.addColorStop(0.72, `rgba(${baseR}, ${baseG}, ${baseB}, 0.48)`);
        baseFill.addColorStop(1, 'rgba(3, 10, 19, 0)');
        ctx.fillStyle = baseFill;
        ctx.beginPath();
        ctx.arc(cx, cy, ringRadius - 2, 0, Math.PI * 2);
        ctx.fill();
      }

      const beatHz = Math.max(0.8, Math.min(2.2, ((heartBpmRef.current || 74) / 60) * Math.sqrt(curSpeed)));
      const beatBreath = prefersReducedMotion
        ? 0
        : Math.pow(0.5 + 0.5 * Math.sin((now / 1000) * Math.PI * 2 * beatHz), 2);
      const auraRadius = ringRadius * (0.91 + beatBreath * 0.03);
      const aura = ctx.createRadialGradient(cx, cy - 6, width * 0.06, cx, cy, auraRadius);
      aura.addColorStop(0, palette.glow);
      aura.addColorStop(0.58, presetsEnabledRef.current ? `rgba(${baseR}, ${baseG}, ${baseB}, 0.28)` : 'rgba(14, 116, 144, 0.10)');
      aura.addColorStop(1, 'rgba(3, 10, 19, 0)');
      ctx.fillStyle = aura;
      ctx.beginPath();
      ctx.arc(cx, cy, auraRadius, 0, Math.PI * 2);
      ctx.fill();

      // 3. Crisp Undistorted Holographic Portrait + Floating Glowing Hair Wisps in the Air
      const drawSize = width * 0.84;
      const drawX = cx - drawSize / 2;
      const drawY = cy - drawSize / 2 + 2;
      const offscreen = offscreenCache[curStyle] || offscreenCache.wavy;

      if (offscreen) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, ringRadius - 2, 0, Math.PI * 2);
        ctx.clip();
        ctx.globalCompositeOperation = 'screen';
        ctx.drawImage(offscreen, drawX, drawY, drawSize, drawSize);
        drawPortraitBlink(
          drawX,
          drawY,
          drawSize,
          curStyle,
          blinkState.blinkAmount,
          baseRgbRef.current,
          palette.primary
        );
        drawGlowingHairAir(
          drawX,
          drawY,
          drawSize,
          windPhase,
          curStyle,
          palette.glow,
          palette.tint
        );
        ctx.restore();

        if (emotionWeights.love + emotionWeights.sad + emotionWeights.happy + emotionWeights.angry > 0.1) {
          ctx.save();
          ctx.globalCompositeOperation = 'screen';
          const emoGrad = ctx.createRadialGradient(cx, cy - 12, 10, cx, cy, ringRadius * 0.9);
          emoGrad.addColorStop(0, palette.tint);
          emoGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
          ctx.fillStyle = emoGrad;
          ctx.beginPath();
          ctx.arc(cx, cy, ringRadius, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
      }

      ctx.restore();

      if (!prefersReducedMotion) {
        rafId = requestAnimationFrame(renderFrame);
      }
    };

    rafId = requestAnimationFrame(renderFrame);
    return () => {
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [variant]);

  const sizeClasses =
    variant === 'hero'
      ? 'h-[280px] w-[280px] sm:h-[340px] sm:w-[340px]'
      : variant === 'compact'
        ? 'h-[172px] w-[172px]'
        : 'h-[214px] w-[214px] sm:h-[234px] sm:w-[234px]';

  const waveActive =
    state === 'speaking' ||
    state === 'listening' ||
    lipOpenness > 0.03 ||
    micLevel > 0.06;

  const waveBarTone =
    state === 'error' || preset.resolvedMood === 'angry'
      ? 'bg-rose-400 shadow-[0_0_8px_rgba(251,113,133,0.55)]'
      : preset.resolvedMood === 'love'
        ? 'bg-pink-400 shadow-[0_0_8px_rgba(244,114,182,0.55)]'
        : preset.resolvedMood === 'empathetic'
          ? 'bg-teal-300 shadow-[0_0_8px_rgba(20,184,166,0.55)]'
          : preset.resolvedMood === 'sad'
            ? 'bg-indigo-300 shadow-[0_0_8px_rgba(99,102,241,0.55)]'
            : state === 'listening'
              ? 'bg-emerald-300 shadow-[0_0_8px_rgba(52,211,153,0.55)]'
              : 'bg-cyan-300 shadow-[0_0_8px_rgba(34,211,238,0.55)]';

  const activeFocus = state === 'thinking' || deepThinking;
  const resolvedMood = preset.resolvedMood;
  const avatarStyle = {
    '--avatar-glow-color': preset.glowColor,
    '--avatar-base-color': preset.baseColor,
    '--avatar-mood-intensity': String(preset.intensity),
    '--avatar-anim-duration-scale': String(preset.durationScale),
    '--avatar-mood-scale': String(preset.canvasScale),
    '--avatar-aura-scale': String(preset.auraScale),
  } as CSSProperties;

  return (
    <div
      ref={containerRef}
      style={avatarStyle}
      className="relative flex w-full flex-col items-center justify-center"
      data-testid="holographic-avatar"
      data-state={state}
      data-focus={activeFocus ? 'active' : 'off'}
      data-emotion={emotion}
      data-active-mood={activeMood}
      data-mood={resolvedMood}
      data-mood-intensity={preset.intensity.toFixed(2)}
      data-emotion-presets={emotionPresetsEnabled ? 'true' : 'false'}
      data-base-color={preset.baseColor}
      data-anim-speed={preset.effectiveSpeedFactor.toFixed(2)}
      data-hairstyle={hairstyle}
      data-hair-wind="0.32"
      data-blink="open"
      data-blink-duration-ms={String(computeBlinkDurationMs(preset.intensity, resolvedMood))}
      data-heartbeat-bpm={String(heart?.heartbeatBpm ?? 74)}
      data-feeling={heart?.currentFeeling ?? 'warm'}
    >
      <canvas
        ref={canvasRef}
        className={sizeClasses}
        aria-label={`${assistantName} ${hairstyle}-hair holographic portrait: ${state}, mood ${resolvedMood}`}
      />

      {shouldShowWaves && (
        <div
          ref={waveContainerRef}
          data-testid="avatar-voice-waves"
          data-active={waveActive ? 'true' : 'false'}
          aria-hidden="true"
          className="mt-1 flex h-[20px] items-center justify-center gap-[3.5px] px-3"
        >
          {Array.from({ length: VOICE_WAVE_BAR_COUNT }, (_, idx) => (
            <span
              key={idx}
              ref={(el) => {
                waveBarRefs.current[idx] = el;
              }}
              className={`h-full w-[2.5px] origin-center rounded-full transition-colors duration-200 ${waveBarTone}`}
              style={{ transform: 'scaleY(0.16)', opacity: 0.34 }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
