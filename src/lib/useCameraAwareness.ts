import { useCallback, useEffect, useRef, useState } from 'react';

export interface CameraAwarenessState {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  isActive: boolean;
  isSupported: boolean;
  error: string | null;
  motionLevel: number;
  lastGesture: string | null;
  startCamera: () => Promise<boolean>;
  stopCamera: () => void;
  captureSnapshotBase64: () => string | null;
}

export function useCameraAwareness(autoWatch: boolean, onAutoWave?: () => void): CameraAwarenessState {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const prevLumaRef = useRef<Uint8Array | null>(null);
  const lastTriggerAtRef = useRef<number>(0);
  const sampleCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const [isActive, setIsActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [motionLevel, setMotionLevel] = useState(0);
  const [lastGesture, setLastGesture] = useState<string | null>(null);

  const isSupported =
    typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    prevLumaRef.current = null;
    setIsActive(false);
    setMotionLevel(0);
  }, []);

  const startCamera = useCallback(async (): Promise<boolean> => {
    if (!isSupported) {
      setError('Camera API is unavailable in this browser.');
      return false;
    }
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => undefined);
      }
      setIsActive(true);
      return true;
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.name === 'NotFoundError'
            ? 'No webcam detected on this device.'
            : err.name === 'NotAllowedError'
              ? 'Camera permission denied by browser.'
              : err.message
          : 'Unable to access camera.';
      setError(msg);
      setIsActive(false);
      return false;
    }
  }, [isSupported]);

  useEffect(() => {
    if (isActive && videoRef.current && streamRef.current && !videoRef.current.srcObject) {
      videoRef.current.srcObject = streamRef.current;
      void videoRef.current.play().catch(() => undefined);
    }
  }, [isActive]);

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, [stopCamera]);

  // Lightweight local frame-diff gesture / motion detector
  useEffect(() => {
    if (!isActive) return;

    const timer = window.setInterval(() => {
      const video = videoRef.current;
      if (!video || video.readyState < 2 || video.videoWidth === 0) return;

      if (!sampleCanvasRef.current) {
        sampleCanvasRef.current = document.createElement('canvas');
      }
      const c = sampleCanvasRef.current;
      c.width = 48;
      c.height = 36;
      const ctx = c.getContext('2d', { willReadFrequently: true });
      if (!ctx) return;

      ctx.drawImage(video, 0, 0, 48, 36);
      const data = ctx.getImageData(0, 0, 48, 36).data;
      const curLuma = new Uint8Array(48 * 36);
      for (let i = 0, p = 0; i < curLuma.length; i++, p += 4) {
        curLuma[i] = (data[p] * 3 + data[p + 1] * 6 + data[p + 2]) / 10;
      }

      if (prevLumaRef.current) {
        let diffSum = 0;
        for (let i = 0; i < curLuma.length; i++) {
          diffSum += Math.abs(curLuma[i] - prevLumaRef.current[i]);
        }
        const avgDiff = diffSum / curLuma.length;
        const normalized = Math.min(100, Math.round((avgDiff / 36) * 100));
        setMotionLevel(normalized);

        if (normalized >= 42) {
          setLastGesture('Hand wave / strong gesture');
          if (autoWatch && onAutoWave && Date.now() - lastTriggerAtRef.current > 9000) {
            lastTriggerAtRef.current = Date.now();
            onAutoWave();
          }
        } else if (normalized >= 18) {
          setLastGesture('Active presence');
        }
      }
      prevLumaRef.current = curLuma;
    }, 650);

    return () => window.clearInterval(timer);
  }, [isActive, autoWatch, onAutoWave]);

  const captureSnapshotBase64 = useCallback((): string | null => {
    const video = videoRef.current;
    if (!video || !isActive || video.videoWidth === 0) return null;
    const canvas = document.createElement('canvas');
    canvas.width = Math.min(640, video.videoWidth);
    canvas.height = Math.round((canvas.width / video.videoWidth) * video.videoHeight);
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.84);
    return dataUrl.replace(/^data:image\/jpeg;base64,/, '');
  }, [isActive]);

  return {
    videoRef,
    isActive,
    isSupported,
    error,
    motionLevel,
    lastGesture,
    startCamera,
    stopCamera,
    captureSnapshotBase64,
  };
}
