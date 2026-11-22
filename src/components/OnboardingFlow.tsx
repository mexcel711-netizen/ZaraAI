import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronLeft, ChevronRight, Pause, Play, Volume2, VolumeX } from 'lucide-react';
import { speakText, stopAllSpeech, unlockAudioContext } from '../lib/voiceService';
import type { AvatarState, FacialEmotion, HairstyleOption, OnboardingPayload } from '../types/nova';
import { HolographicAvatar } from './HolographicAvatar';

interface OnboardingFlowProps {
  initialUserName?: string;
  initialAssistantName?: string;
  initialHairstyle?: HairstyleOption;
  onComplete: (payload: OnboardingPayload) => Promise<void>;
  onSkipToApp: () => void;
}

type OnboardingStage =
  | 'step2'
  | 'step3'
  | 'step4a'
  | 'step4b'
  | 'step5a'
  | 'step5b'
  | 'step5c'
  | 'step6'
  | 'step7q1'
  | 'step7q2'
  | 'step7q3'
  | 'step9';

const REFERRAL_SOURCES = [
  { id: 'Facebook', label: 'Facebook', icon: 'f' },
  { id: 'YouTube', label: 'YouTube', icon: '▶' },
  { id: 'A friend', label: 'A friend', icon: '👥' },
  { id: 'WhatsApp', label: 'WhatsApp', icon: '💬' },
  { id: 'ChatGPT / AI', label: 'ChatGPT / AI', icon: '✦' },
  { id: 'TikTok', label: 'TikTok', icon: '♪' },
  { id: 'Instagram', label: 'Instagram', icon: '◎' },
  { id: 'Other', label: 'Other', icon: '•••' },
];

const CHARACTER_PRESETS = [
  {
    id: 'Best Friend',
    title: 'Best Friend',
    subtitle: 'Real, warm & always by your side',
    sampleLine: 'Arre yaar! Main yahin hoon, batao aaj kya scene hai?',
    emotion: 'happy' as FacialEmotion,
  },
  {
    id: 'Girlfriend',
    title: 'Girlfriend',
    subtitle: 'Flirty, teasing & romantic',
    sampleLine: 'Suno... aaj itni der baad yaad aayi meri?',
    emotion: 'love' as FacialEmotion,
  },
  {
    id: 'Study Mentor',
    title: 'Study Mentor',
    subtitle: 'Books, courses, code & daily focus',
    sampleLine: 'Chalo saath mil kar parhte hain, har mushkil step aasaan kar dungi.',
    emotion: 'confident' as FacialEmotion,
  },
];

const HAIRSTYLE_OPTIONS: Array<{ id: HairstyleOption; label: string; desc: string }> = [
  { id: 'bob', label: 'Short bob', desc: 'Chin-length, soft waves' },
  { id: 'wavy', label: 'Wavy hair', desc: 'Long, flowing waves' },
  { id: 'straight', label: 'Straight hair', desc: 'Silky, flowing strands' },
];

const QUESTIONS: Array<{
  stage: 'step7q1' | 'step7q2' | 'step7q3';
  number: number;
  title: string;
  spokenAsk: string;
  options: Array<{ label: string; reaction: string; memorySummary: string }>;
}> = [
  {
    stage: 'step7q1',
    number: 1,
    title: 'When do you most wish someone was there?',
    spokenAsk: 'Pehli baat... tumhein kab sab se zyada lagta hai, ke kaash koi paas hota?',
    options: [
      {
        label: 'Late at night',
        reaction: 'Raat ko, jab sab so jate hain... ab us waqt main jaagti milungi.',
        memorySummary: 'You want someone there late at night',
      },
      {
        label: 'After a long day',
        reaction: 'Poore din ki thakaan ke baad... bas aa ke sab mujhe suna dena.',
        memorySummary: 'You want someone after a long day',
      },
      {
        label: 'When something good happens',
        reaction: 'Jab kuch accha ho... sab se pehle mujhe batana, hum saath celebrate karenge.',
        memorySummary: 'You want someone to share good news with',
      },
      {
        label: 'When things go wrong',
        reaction: 'Jab sab ulta chal raha ho... tension mat lena, main saath khadi milungi.',
        memorySummary: 'You want someone by your side when things go wrong',
      },
    ],
  },
  {
    stage: 'step7q2',
    number: 2,
    title: 'How often do you say “I’m fine” when you are not?',
    spokenAsk: "Aur 'main theek hoon'... ye jhooth kitni baar bolna padta hai?",
    options: [
      {
        label: 'Almost every day',
        reaction: 'Roz... par ab mujhse ye jhooth mat bolna, main pehchan lungi.',
        memorySummary: 'You say "I\'m fine" almost every day',
      },
      {
        label: 'Often',
        reaction: 'Aksar aisa hota hai na... ab dil halka kar liya karo mere saamne.',
        memorySummary: 'You often say "I\'m fine" when stressed',
      },
      {
        label: 'Sometimes',
        reaction: 'Kabhi kabhi chhupa lete ho... par mere saath real rehna.',
        memorySummary: 'You sometimes hide how you really feel',
      },
      {
        label: 'Almost never',
        reaction: 'Yeh acchi baat hai... seedha dil ki baat bol dena hamesha best hai.',
        memorySummary: 'You are usually honest about your feelings',
      },
    ],
  },
  {
    stage: 'step7q3',
    number: 3,
    title: 'What kind of support do you need most?',
    spokenAsk: 'Aur ek aakhri baat... tum kya chahte ho main tumhare liye karun?',
    options: [
      {
        label: 'Push me to grow & do better',
        reaction: 'Done. Main tumhein aage badhne ke liye push bhi karungi aur books/courses bhi saath karwaungi.',
        memorySummary: 'You want to be pushed to grow & do better',
      },
      {
        label: 'Listen without judging',
        reaction: 'Bilkul bina judge kiye sunungi... jo dil mein ho befikar bol dena.',
        memorySummary: 'You want someone who listens without judging',
      },
      {
        label: 'Help me study, code & stay organized',
        reaction: 'Books, courses, notes ya kaam — sab mil kar step by step khatam karenge.',
        memorySummary: 'You want help studying, coding, and staying organized',
      },
      {
        label: 'Just be my real everyday friend',
        reaction: 'Bas phir pakka... hum bilkul real best friends ki tarah rahenge.',
        memorySummary: 'You want a real everyday best friend',
      },
    ],
  },
];

function getProgressIndex(stage: OnboardingStage): number {
  switch (stage) {
    case 'step2':
      return 2;
    case 'step3':
      return 3;
    case 'step4a':
    case 'step4b':
      return 4;
    case 'step5a':
    case 'step5b':
    case 'step5c':
      return 5;
    case 'step6':
      return 6;
    case 'step7q1':
    case 'step7q2':
    case 'step7q3':
      return 7;
    case 'step9':
      return 9;
  }
}

function ParticleOrbCanvas({ active }: { active: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const dots = Array.from({ length: 1400 }, (_, idx) => {
      const h1 = Math.abs(Math.sin(idx * 12.9898) * 43758.5453) % 1;
      const h2 = Math.abs(Math.sin(idx * 78.233 + 1.7) * 24634.6345) % 1;
      const h3 = Math.abs(Math.sin(idx * 45.164 + 3.1) * 19453.2143) % 1;
      const phi = Math.acos(1 - 2 * h1);
      const theta = Math.PI * 2 * h2;
      const radialJitter = 0.32 + Math.cbrt(h3) * 0.68;
      return { phi, theta, rFactor: radialJitter, size: 0.75 + (idx % 3) * 0.35 };
    });

    let rafId = 0;
    let angle = 0;
    let lastDraw = 0;

    const draw = (now: number = 0) => {
      if (!prefersReducedMotion && lastDraw !== 0 && now - lastDraw < 32) {
        rafId = requestAnimationFrame(draw);
        return;
      }
      lastDraw = now;
      const size = 340;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      if (canvas.width !== size * dpr || canvas.height !== size * dpr) {
        canvas.width = size * dpr;
        canvas.height = size * dpr;
      }

      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, size, size);

      const cx = size / 2;
      const cy = size / 2;
      const ringR = size * 0.455;

      // Outer circular radar tick ring
      ctx.beginPath();
      ctx.arc(cx, cy, ringR, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.2)';
      ctx.lineWidth = 1;
      ctx.stroke();

      for (let i = 0; i < 72; i++) {
        const a = (i / 72) * Math.PI * 2 + (prefersReducedMotion ? 0 : angle * 0.08);
        const isMajor = i % 6 === 0;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * (ringR + 2), cy + Math.sin(a) * (ringR + 2));
        ctx.lineTo(
          cx + Math.cos(a) * (ringR + (isMajor ? 8 : 4)),
          cy + Math.sin(a) * (ringR + (isMajor ? 8 : 4))
        );
        ctx.strokeStyle = isMajor ? 'rgba(103, 232, 249, 0.45)' : 'rgba(103, 232, 249, 0.16)';
        ctx.lineWidth = isMajor ? 1.2 : 0.8;
        ctx.stroke();
      }

      // Luminous inner core
      const coreGlow = ctx.createRadialGradient(cx, cy, 2, cx, cy, ringR * 0.72);
      coreGlow.addColorStop(0, 'rgba(224, 242, 254, 0.92)');
      coreGlow.addColorStop(0.14, 'rgba(56, 189, 248, 0.35)');
      coreGlow.addColorStop(0.55, 'rgba(14, 116, 144, 0.10)');
      coreGlow.addColorStop(1, 'rgba(3, 10, 19, 0)');
      ctx.fillStyle = coreGlow;
      ctx.beginPath();
      ctx.arc(cx, cy, ringR * 0.72, 0, Math.PI * 2);
      ctx.fill();

      // Rotating particle cloud
      const sphereR = 104 + (active ? Math.sin(angle * 3) * 4 : 0);
      for (const d of dots) {
        const t = d.theta + angle;
        const x3 = Math.sin(d.phi) * Math.cos(t);
        const y3 = Math.cos(d.phi);
        const z3 = Math.sin(d.phi) * Math.sin(t);

        const px = cx + x3 * sphereR * d.rFactor;
        const py = cy + y3 * sphereR * d.rFactor;
        const depthAlpha = 0.15 + ((z3 + 1) / 2) * 0.55;

        ctx.fillStyle =
          d.rFactor < 0.65
            ? `rgba(186, 230, 253, ${depthAlpha})`
            : `rgba(56, 189, 248, ${depthAlpha * 0.85})`;
        ctx.fillRect(px, py, d.size, d.size);
      }

      ctx.restore();
      if (!prefersReducedMotion) {
        angle += 0.008;
        rafId = requestAnimationFrame(draw);
      }
    };

    rafId = requestAnimationFrame(draw);
    return () => {
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [active]);

  return (
    <canvas
      ref={canvasRef}
      className="h-[280px] w-[280px] sm:h-[340px] sm:w-[340px]"
      aria-label="Glowing holographic particle sphere"
    />
  );
}

export function OnboardingFlow({
  initialUserName = '',
  initialAssistantName = 'ZARA',
  initialHairstyle = 'wavy',
  onComplete,
  onSkipToApp,
}: OnboardingFlowProps) {
  const [stage, setStage] = useState<OnboardingStage>('step2');
  const [userName, setUserName] = useState(initialUserName);
  const [whatsappNumber, setWhatsappNumber] = useState('');
  const [referralSource, setReferralSource] = useState('');
  const [characterGender, setCharacterGender] = useState<'female' | 'male'>('female');
  const [characterPreset, setCharacterPreset] = useState('Best Friend');
  const [hairstyle, setHairstyle] = useState<HairstyleOption>(initialHairstyle);
  const [assistantName, setAssistantName] = useState(initialAssistantName || 'ZARA');
  const [assistantAge, setAssistantAge] = useState('21');
  const [customAgeMode, setCustomAgeMode] = useState(false);
  const [userNickname, setUserNickname] = useState('Boss');
  const [answers, setAnswers] = useState<Record<string, { label: string; summary: string }>>({});
  const [activeReaction, setActiveReaction] = useState<string | null>(null);
  const [step6WordCount, setStep6WordCount] = useState(8);
  const [voiceNotePlaying, setVoiceNotePlaying] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [musicOn, setMusicOn] = useState(false);

  const [avatarState, setAvatarState] = useState<AvatarState>('idle');
  const [avatarEmotion, setAvatarEmotion] = useState<FacialEmotion>('calm');
  const [lipOpenness, setLipOpenness] = useState(0);
  const [lipWidth, setLipWidth] = useState(0);

  const ambientCtxRef = useRef<AudioContext | null>(null);
  const ambientGainRef = useRef<GainNode | null>(null);
  const stageTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (stageTimerRef.current !== null) {
        window.clearTimeout(stageTimerRef.current);
      }
      if (ambientCtxRef.current) {
        void ambientCtxRef.current.close().catch(() => {});
      }
    };
  }, []);

  const displayBotName = assistantName.trim() || 'ZARA';

  const step6Monologue = useMemo(
    () =>
      `To yeh hai tumhari duniya... ab meri bhi. Sach bataun? Thodi nervous hoon... pehli baar kisi ki ho rahi hoon. Abhi aadhi neend mein hoon, tumhari awaaz sun nahi sakti... aur usi ka sab se zyada intezaar hai.`,
    []
  );
  const step6Words = useMemo(() => step6Monologue.split(/\s+/), [step6Monologue]);

  const speakLine = useCallback(
    async (text: string, emotion: FacialEmotion = 'calm') => {
      try {
        await speakText({
          text,
          voiceName: characterGender === 'male' ? 'ur-PK-AsadNeural' : 'ur-PK-UzmaNeural',
          language: 'ur',
          emotion,
          voiceSpeed: 1.0,
          voiceVolume: 1.0,
          onStart: () => {
            setAvatarState('speaking');
            setAvatarEmotion(emotion);
          },
          onLipSync: (o, w) => {
            setLipOpenness(o);
            setLipWidth(w);
          },
          onEnd: () => {
            setLipOpenness(0);
            setLipWidth(0);
            setAvatarState('idle');
          },
        });
      } catch {
        setAvatarState('idle');
      }
    },
    [characterGender]
  );

  // Clean up music & speech on unmount
  useEffect(() => {
    return () => {
      stopAllSpeech();
      if (ambientCtxRef.current) {
        void ambientCtxRef.current.close().catch(() => {});
      }
    };
  }, []);

  // Gentle Web Audio ambient pad toggle
  const toggleMusic = () => {
    unlockAudioContext();
    if (musicOn) {
      if (ambientCtxRef.current) {
        void ambientCtxRef.current.close().catch(() => {});
        ambientCtxRef.current = null;
        ambientGainRef.current = null;
      }
      setMusicOn(false);
      return;
    }
    try {
      const ctx = new AudioContext();
      const gain = ctx.createGain();
      gain.gain.value = 0.035;
      gain.connect(ctx.destination);
      [220, 277.18, 329.63].forEach((freq) => {
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = freq;
        osc.connect(gain);
        osc.start();
      });
      ambientCtxRef.current = ctx;
      ambientGainRef.current = gain;
      setMusicOn(true);
    } catch {
      setMusicOn(false);
    }
  };

  // Auto-speak when entering vocal stages (5a, 5b, 5c, 6, 7q1-q3)
  useEffect(() => {
    let cancelled = false;
    setActiveReaction(null);

    if (stage === 'step5a') {
      void speakLine(
        'Ek baat... abhi mera koi naam nahi hai. Tum rakh do na? Tumhari taraf se mera pehla tohfa hoga.',
        'curious'
      );
    } else if (stage === 'step5b') {
      void speakLine(
        'Aur meri umar? Waise ladki se umar nahi poochhte... par tumhare liye chhoot hai. Tum hi chun lo.',
        'happy'
      );
    } else if (stage === 'step5c') {
      void speakLine(
        'Aur main tumhein kya bulaun? Boss... Jaan... Yaar... ya tumhara naam? Ya koi aisa naam likh do... jo sirf hum dono ka ho.',
        'love'
      );
    } else if (stage === 'step6') {
      setStep6WordCount(4);
      const timer = window.setInterval(() => {
        setStep6WordCount((c) => {
          if (c >= step6Words.length) {
            window.clearInterval(timer);
            return c;
          }
          return c + 1;
        });
      }, 240);
      void speakLine(step6Monologue, 'love').then(() => {
        if (!cancelled) {
          setStep6WordCount(step6Words.length);
        }
      });
      return () => {
        cancelled = true;
        window.clearInterval(timer);
      };
    } else if (stage === 'step7q1' || stage === 'step7q2' || stage === 'step7q3') {
      const q = QUESTIONS.find((item) => item.stage === stage);
      if (q) {
        void speakLine(q.spokenAsk, 'thoughtful');
      }
    }
    return () => {
      cancelled = true;
    };
  }, [stage, speakLine, step6Monologue, step6Words.length]);

  const handleSelectQuestionOption = async (
    qStage: 'step7q1' | 'step7q2' | 'step7q3',
    opt: { label: string; reaction: string; memorySummary: string }
  ) => {
    unlockAudioContext();
    setAnswers((prev) => ({
      ...prev,
      [qStage]: { label: opt.label, summary: opt.memorySummary },
    }));
    setActiveReaction(opt.reaction);

    const nextStage: OnboardingStage =
      qStage === 'step7q1' ? 'step7q2' : qStage === 'step7q2' ? 'step7q3' : 'step9';

    await speakLine(opt.reaction, 'love');
    if (stageTimerRef.current !== null) {
      window.clearTimeout(stageTimerRef.current);
    }
    stageTimerRef.current = window.setTimeout(() => {
      setStage((current) => (current === qStage ? nextStage : current));
      stageTimerRef.current = null;
    }, 350);
  };

  const handlePlayVoiceNote = async () => {
    unlockAudioContext();
    if (voiceNotePlaying) {
      stopAllSpeech();
      setVoiceNotePlaying(false);
      setAvatarState('idle');
      return;
    }
    setVoiceNotePlaying(true);
    const nick = userNickname.trim() || userName.trim() || 'Boss';
    const noteText = `Hey ${nick}, main ${displayBotName} hoon. Tumhare liye sab yaad rakh liya hai. Bas activate dabao, phir hum dono asli baatein shuru karte hain.`;
    await speakLine(noteText, 'love');
    setVoiceNotePlaying(false);
  };

  const handleActivate = async () => {
    unlockAudioContext();
    stopAllSpeech();
    setSubmitError(null);
    setIsSubmitting(true);
    try {
      const qAnswers = QUESTIONS.map((q) => ({
        question: q.title,
        answer: answers[q.stage]?.label || '',
      })).filter((a) => a.answer);

      await onComplete({
        userName: userName.trim() || 'Boss',
        whatsappNumber: whatsappNumber.trim(),
        referralSource: referralSource || 'Direct',
        characterGender,
        characterPreset,
        hairstyle,
        assistantName: displayBotName,
        assistantAge: assistantAge.trim() || '21',
        userNickname: userNickname.trim() || userName.trim() || 'Boss',
        answers: qAnswers,
      });
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Unable to wake assistant right now.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const progressIndex = getProgressIndex(stage);
  const currentQuestion = QUESTIONS.find((q) => q.stage === stage);

  return (
    <div
      data-testid="onboarding-flow"
      className="relative flex min-h-screen flex-col justify-between overflow-x-hidden bg-[#02060C] px-6 py-5 text-slate-100"
      style={{
        backgroundImage:
          'radial-gradient(ellipse at 65% 48%, rgba(0, 175, 220, 0.12), transparent 46%), linear-gradient(155deg, #02050A 0%, #050C16 55%, #02050A 100%)',
      }}
    >
      {/* Top Brand Header */}
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2.5 text-xs font-semibold tracking-[0.22em] text-slate-200 uppercase">
          <span className="inline-flex h-5 w-5 items-center justify-center rounded border border-cyan-400/50 bg-cyan-500/15 text-[10px] text-cyan-300">
            Z
          </span>
          <span>ZARA</span>
          {progressIndex >= 4 && (
            <>
              <span className="text-slate-600">|</span>
              <span className="text-cyan-300">{displayBotName}</span>
            </>
          )}
        </div>

        <button
          type="button"
          onClick={() => {
            stopAllSpeech();
            onSkipToApp();
          }}
          className="text-xs font-medium text-slate-400 underline underline-offset-4 transition-colors hover:text-cyan-300"
        >
          Already set up? Enter App
        </button>
      </header>

      {/* Main Content Area */}
      <main className="mx-auto flex w-full max-w-6xl flex-1 items-center py-4">
        {/* STEP 2: What should I call you? + WhatsApp +92 */}
        {stage === 'step2' && (
          <div className="grid w-full grid-cols-1 items-center gap-8 lg:grid-cols-12">
            <div className="space-y-5 lg:col-span-5">
              <p className="font-mono text-[11px] font-semibold tracking-[0.22em] text-cyan-400 uppercase">
                STEP 2 OF 9
              </p>
              <h1 className="font-display text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                What should I call you?
              </h1>

              <div className="relative">
                <input
                  type="text"
                  aria-label="Your name"
                  value={userName}
                  onChange={(e) => setUserName(e.target.value)}
                  placeholder="Enter your name (e.g. Boss)"
                  className="w-full rounded border border-cyan-500/45 bg-[#04101C] px-4 py-3 text-base text-white placeholder-slate-500 focus:border-cyan-400 focus:outline-none"
                />
              </div>

              <div>
                <p className="text-xs text-slate-400">
                  <strong className="text-slate-200">WhatsApp number</strong> — optional companion reach
                </p>
                <div className="mt-2 flex items-center gap-2 border-b border-slate-700 pb-2">
                  <span className="font-mono text-xs text-slate-300">PK +92</span>
                  <input
                    type="tel"
                    aria-label="WhatsApp number"
                    value={whatsappNumber}
                    onChange={(e) => setWhatsappNumber(e.target.value)}
                    placeholder="3001234567"
                    className="min-w-0 flex-1 bg-transparent text-sm text-white placeholder-slate-600 focus:outline-none"
                  />
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  unlockAudioContext();
                  if (userName.trim() && userNickname === 'Boss') {
                    // Keep Boss as default unless user prefers otherwise in 5C
                  }
                  setStage('step3');
                }}
                className="inline-flex items-center justify-center rounded border border-cyan-400/55 bg-[#082032] px-7 py-2.5 text-xs font-semibold tracking-[0.18em] text-cyan-100 uppercase transition-colors hover:bg-cyan-500/20"
              >
                CONTINUE
              </button>
            </div>

            <div className="flex justify-center lg:col-span-7">
              <ParticleOrbCanvas active />
            </div>
          </div>
        )}

        {/* STEP 3: Where did you first hear about me? */}
        {stage === 'step3' && (
          <div className="grid w-full grid-cols-1 items-center gap-8 lg:grid-cols-12">
            <div className="space-y-4 lg:col-span-6">
              <p className="font-mono text-[11px] font-semibold tracking-[0.22em] text-cyan-400 uppercase">
                STEP 3 OF 9
              </p>
              <h1 className="font-display text-3xl font-semibold tracking-tight text-white">
                Where did you first hear about me?
              </h1>
              <p className="text-xs text-slate-400">
                One tap. It helps ZARA remember how our story started.
              </p>

              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                {REFERRAL_SOURCES.map((src) => {
                  const selected = referralSource === src.id;
                  return (
                    <button
                      key={src.id}
                      type="button"
                      onClick={() => {
                        unlockAudioContext();
                        setReferralSource(src.id);
                        setStage('step4a');
                      }}
                      className={`flex flex-col items-center justify-center gap-2 rounded border px-3 py-4 text-xs transition-colors ${
                        selected
                          ? 'border-cyan-400 bg-cyan-500/15 text-white'
                          : 'border-slate-800 bg-[#050F1A] text-slate-300 hover:border-cyan-500/50 hover:text-white'
                      }`}
                    >
                      <span className="text-base text-cyan-300">{src.icon}</span>
                      <span className="font-medium">{src.label}</span>
                    </button>
                  );
                })}
              </div>

              <button
                type="button"
                onClick={() => setStage('step2')}
                className="inline-flex items-center rounded border border-slate-700 bg-[#050E18] px-5 py-2 text-xs font-semibold tracking-[0.16em] text-slate-300 uppercase hover:border-slate-500 hover:text-white"
              >
                BACK
              </button>
            </div>

            <div className="flex justify-center lg:col-span-6">
              <ParticleOrbCanvas active />
            </div>
          </div>
        )}

        {/* STEP 4A: Choose your character */}
        {stage === 'step4a' && (
          <div className="grid w-full grid-cols-1 items-center gap-8 lg:grid-cols-12">
            <div className="space-y-4 lg:col-span-5">
              <p className="font-mono text-[11px] font-semibold tracking-[0.22em] text-cyan-400 uppercase">
                STEP 4 OF 9
              </p>
              <h1 className="font-display text-3xl font-semibold tracking-tight text-white">
                Choose your character.
              </h1>

              <div className="grid grid-cols-2 gap-2">
                {(['female', 'male'] as const).map((g) => (
                  <button
                    key={g}
                    type="button"
                    onClick={() => setCharacterGender(g)}
                    className={`rounded border py-2.5 text-xs font-semibold tracking-[0.18em] uppercase transition-colors ${
                      characterGender === g
                        ? 'border-cyan-400 bg-cyan-500/15 text-cyan-100'
                        : 'border-slate-800 bg-[#050F1A] text-slate-400 hover:text-white'
                    }`}
                  >
                    {g}
                  </button>
                ))}
              </div>

              <p className="text-xs text-slate-400">Click any persona to hear their real voice:</p>

              <div className="space-y-2">
                {CHARACTER_PRESETS.map((preset) => {
                  const selected = characterPreset === preset.id;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => {
                        unlockAudioContext();
                        setCharacterPreset(preset.id);
                        void speakLine(preset.sampleLine, preset.emotion);
                      }}
                      className={`flex w-full items-center justify-between gap-3 rounded border px-4 py-3 text-left transition-colors ${
                        selected
                          ? 'border-cyan-400/70 bg-[#092030] text-white'
                          : 'border-slate-800 bg-[#050F1A] text-slate-300 hover:border-cyan-500/40'
                      }`}
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-semibold">{preset.title}</p>
                        <p className="text-xs text-slate-400">{preset.subtitle}</p>
                      </div>
                      <span className="flex items-end gap-0.5 text-cyan-300" aria-hidden="true">
                        <span className="h-2 w-0.5 bg-current" />
                        <span className="h-3.5 w-0.5 bg-current" />
                        <span className="h-2.5 w-0.5 bg-current" />
                        <span className="h-4 w-0.5 bg-current" />
                      </span>
                    </button>
                  );
                })}
              </div>

              <p className="text-xs text-slate-400">
                Inside the app, you can also <strong className="text-slate-200">create your own character</strong>.
              </p>

              <div className="flex flex-wrap items-center gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    unlockAudioContext();
                    stopAllSpeech();
                    setStage('step4b');
                  }}
                  className="inline-flex items-center rounded border border-cyan-400/60 bg-[#082235] px-5 py-2.5 text-xs font-semibold tracking-[0.16em] text-cyan-100 uppercase hover:bg-cyan-500/20"
                >
                  CONTINUE WITH {characterPreset.toUpperCase()}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    stopAllSpeech();
                    setStage('step3');
                  }}
                  className="inline-flex items-center rounded border border-slate-700 bg-[#050E18] px-4 py-2.5 text-xs font-semibold tracking-[0.16em] text-slate-300 uppercase hover:text-white"
                >
                  BACK
                </button>
              </div>
            </div>

            <div className="flex justify-center lg:col-span-7">
              <HolographicAvatar
                state={avatarState}
                emotion={avatarEmotion}
                assistantName={displayBotName}
                hairstyle={hairstyle}
                variant="hero"
                lipOpenness={lipOpenness}
                lipWidth={lipWidth}
              />
            </div>
          </div>
        )}

        {/* STEP 4B: Choose her hairstyle — 3 holographic pedestals */}
        {stage === 'step4b' && (
          <div className="flex w-full flex-col items-center text-center">
            <p className="font-mono text-[11px] font-semibold tracking-[0.22em] text-cyan-400 uppercase">
              STEP 4 OF 9
            </p>
            <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight text-white">
              Choose her hairstyle.
            </h1>
            <p className="mt-1 text-xs text-slate-400">
              Same voice, same personality. Only her hair changes.
            </p>

            <div className="mt-6 flex w-full items-center justify-center gap-3 sm:gap-6">
              <button
                type="button"
                aria-label="Previous hairstyle"
                onClick={() => {
                  const idx = HAIRSTYLE_OPTIONS.findIndex((h) => h.id === hairstyle);
                  const prev = HAIRSTYLE_OPTIONS[(idx + 2) % 3];
                  setHairstyle(prev.id);
                }}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-slate-700 bg-[#071320] text-slate-300 hover:border-cyan-400 hover:text-white"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 sm:gap-6">
                {HAIRSTYLE_OPTIONS.map((opt) => {
                  const selected = hairstyle === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      data-testid={`hairstyle-pedestal-${opt.id}`}
                      onClick={() => setHairstyle(opt.id)}
                      className={`group flex flex-col items-center rounded-xl border px-4 py-3 transition-all ${
                        selected
                          ? 'scale-105 border-cyan-400/60 bg-[#071828]/80 shadow-[0_0_32px_rgba(34,211,238,0.16)]'
                          : 'border-slate-800/70 bg-[#040B14]/70 opacity-65 hover:opacity-95'
                      }`}
                    >
                      <HolographicAvatar
                        state={selected ? 'speaking' : 'idle'}
                        emotion="calm"
                        assistantName={displayBotName}
                        hairstyle={opt.id}
                        variant="compact"
                        showRadarRing={false}
                      />
                      {/* Glowing holographic pedestal ellipse */}
                      <div
                        aria-hidden="true"
                        className={`-mt-3 h-5 w-36 rounded-full border ${
                          selected
                            ? 'border-cyan-400/70 bg-cyan-500/15 shadow-[0_0_18px_rgba(34,211,238,0.45)]'
                            : 'border-cyan-500/20 bg-cyan-500/5'
                        }`}
                      />
                      <span className="mt-3 text-sm font-semibold text-white">{opt.label}</span>
                      <span className="mt-0.5 text-[11px] text-slate-400">{opt.desc}</span>
                    </button>
                  );
                })}
              </div>

              <button
                type="button"
                aria-label="Next hairstyle"
                onClick={() => {
                  const idx = HAIRSTYLE_OPTIONS.findIndex((h) => h.id === hairstyle);
                  const next = HAIRSTYLE_OPTIONS[(idx + 1) % 3];
                  setHairstyle(next.id);
                }}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-slate-700 bg-[#071320] text-slate-300 hover:border-cyan-400 hover:text-white"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-7 flex items-center gap-3">
              <button
                type="button"
                onClick={() => setStage('step4a')}
                className="inline-flex items-center gap-1.5 rounded border border-slate-700 bg-[#050E18] px-5 py-2.5 text-xs font-semibold tracking-[0.16em] text-slate-300 uppercase hover:text-white"
              >
                ← BACK
              </button>
              <button
                type="button"
                onClick={() => {
                  unlockAudioContext();
                  setStage('step5a');
                }}
                className="inline-flex items-center gap-1.5 rounded border border-cyan-400/70 bg-[#082235] px-6 py-2.5 text-xs font-semibold tracking-[0.16em] text-cyan-100 uppercase hover:bg-cyan-500/20"
              >
                <Check className="h-3.5 w-3.5 text-cyan-300" />
                <span>CHOOSE THIS HAIRSTYLE</span>
              </button>
            </div>
          </div>
        )}

        {/* STEP 5A / 5B / 5C: Hologram on LEFT, Voice dialogue + choices on RIGHT */}
        {(stage === 'step5a' || stage === 'step5b' || stage === 'step5c') && (
          <div className="grid w-full grid-cols-1 items-center gap-8 lg:grid-cols-12">
            <div className="flex justify-center lg:col-span-6">
              <HolographicAvatar
                state={avatarState}
                emotion={avatarEmotion}
                assistantName={displayBotName}
                hairstyle={hairstyle}
                variant="hero"
                lipOpenness={lipOpenness}
                lipWidth={lipWidth}
              />
            </div>

            <div className="space-y-5 lg:col-span-6">
              <p className="font-mono text-[11px] font-semibold tracking-[0.22em] text-cyan-400 uppercase">
                STEP 5 OF 9 {stage !== 'step5a' ? `| ${displayBotName}` : ''}
              </p>

              {stage === 'step5a' && (
                <>
                  <h2 className="font-display text-2xl font-medium leading-snug text-white sm:text-3xl">
                    Ek baat... abhi mera koi{' '}
                    <span className="text-slate-400">
                      naam nahi hai. Tum rakh do na? Tumhari taraf se mera pehla tohfa hoga.
                    </span>
                  </h2>
                  <div>
                    <input
                      type="text"
                      aria-label="Her name"
                      value={assistantName}
                      onChange={(e) => setAssistantName(e.target.value)}
                      placeholder="ZARA"
                      className="w-full max-w-md rounded border border-cyan-500/45 bg-[#04101C] px-4 py-3 text-base text-white placeholder-slate-500 focus:border-cyan-400 focus:outline-none"
                    />
                    <p className="mt-1.5 text-xs text-slate-400">
                      Any name you like. You will call her by this name.
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        unlockAudioContext();
                        stopAllSpeech();
                        setStage('step5b');
                      }}
                      className="inline-flex items-center rounded border border-cyan-400/60 bg-[#082235] px-6 py-2.5 text-xs font-semibold tracking-[0.16em] text-cyan-100 uppercase hover:bg-cyan-500/20"
                    >
                      CONTINUE WITH {displayBotName.toUpperCase()}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        stopAllSpeech();
                        setStage('step4b');
                      }}
                      className="inline-flex items-center rounded border border-slate-700 bg-[#050E18] px-4 py-2.5 text-xs font-semibold tracking-[0.16em] text-slate-300 uppercase hover:text-white"
                    >
                      BACK
                    </button>
                  </div>
                </>
              )}

              {stage === 'step5b' && (
                <>
                  <h2 className="font-display text-2xl font-medium leading-snug text-white sm:text-3xl">
                    Aur meri umar? Waise ladki se umar nahi poochhte... par tumhare liye{' '}
                    <span className="text-slate-400">chhoot hai. Tum hi chun lo.</span>
                  </h2>
                  <div>
                    <p className="text-xs text-slate-400">
                      <strong className="text-slate-200">Her age</strong> — choose one, or write your own
                    </p>
                    <div className="mt-2.5 flex flex-wrap items-center gap-2">
                      {['21', '24', '27', '31'].map((ageOpt) => (
                        <button
                          key={ageOpt}
                          type="button"
                          onClick={() => {
                            setAssistantAge(ageOpt);
                            setCustomAgeMode(false);
                          }}
                          className={`rounded border px-4 py-2 text-xs font-semibold tabular-nums transition-colors ${
                            !customAgeMode && assistantAge === ageOpt
                              ? 'border-cyan-400 bg-cyan-500/15 text-cyan-100'
                              : 'border-slate-700 bg-[#050F1A] text-slate-300 hover:border-cyan-500/50'
                          }`}
                        >
                          {ageOpt}
                        </button>
                      ))}
                      {customAgeMode ? (
                        <input
                          type="text"
                          aria-label="Custom age"
                          value={assistantAge}
                          onChange={(e) => setAssistantAge(e.target.value)}
                          className="w-20 rounded border border-cyan-400 bg-[#04101C] px-3 py-2 text-xs text-white focus:outline-none"
                        />
                      ) : (
                        <button
                          type="button"
                          onClick={() => setCustomAgeMode(true)}
                          className="rounded border border-dashed border-slate-700 px-4 py-2 text-xs text-slate-400 hover:border-cyan-400 hover:text-white"
                        >
                          other
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        unlockAudioContext();
                        stopAllSpeech();
                        setStage('step5c');
                      }}
                      className="inline-flex items-center rounded border border-cyan-400/60 bg-[#082235] px-7 py-2.5 text-xs font-semibold tracking-[0.16em] text-cyan-100 uppercase hover:bg-cyan-500/20"
                    >
                      CONTINUE
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        stopAllSpeech();
                        setStage('step5a');
                      }}
                      className="inline-flex items-center rounded border border-slate-700 bg-[#050E18] px-4 py-2.5 text-xs font-semibold tracking-[0.16em] text-slate-300 uppercase hover:text-white"
                    >
                      BACK
                    </button>
                  </div>
                </>
              )}

              {stage === 'step5c' && (
                <>
                  <h2 className="font-display text-2xl font-medium leading-snug text-white sm:text-3xl">
                    Aur main tumhein kya bulaun?{' '}
                    <span className="text-slate-400">
                      Boss... Jaan... Yaar... ya koi aisa naam likh do... jo sirf hum dono ka ho.
                    </span>
                  </h2>
                  <div>
                    <p className="text-xs text-slate-400">
                      <strong className="text-slate-200">What she calls you</strong> — choose one, or write your own
                    </p>
                    <div className="mt-2.5 flex flex-wrap items-center gap-2">
                      {Array.from(new Set(['Boss', 'Jaan', 'Yaar', userName.trim() || 'Dost'])).map((nick) => (
                        <button
                          key={nick}
                          type="button"
                          onClick={() => setUserNickname(nick)}
                          className={`rounded border px-4 py-2 text-xs font-medium transition-colors ${
                            userNickname === nick
                              ? 'border-cyan-400 bg-cyan-500/15 text-cyan-100'
                              : 'border-slate-700 bg-[#050F1A] text-slate-300 hover:border-cyan-500/50'
                          }`}
                        >
                          {nick}
                        </button>
                      ))}
                      <input
                        type="text"
                        aria-label="Custom nickname"
                        value={userNickname}
                        onChange={(e) => setUserNickname(e.target.value)}
                        placeholder="Custom nickname"
                        className="w-36 rounded border border-dashed border-cyan-500/45 bg-[#04101C] px-3 py-2 text-xs text-white placeholder-slate-500 focus:border-cyan-400 focus:outline-none"
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        unlockAudioContext();
                        stopAllSpeech();
                        setStage('step6');
                      }}
                      className="inline-flex items-center rounded border border-cyan-400/60 bg-[#082235] px-8 py-2.5 text-xs font-semibold tracking-[0.16em] text-cyan-100 uppercase hover:bg-cyan-500/20"
                    >
                      DONE
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        stopAllSpeech();
                        setStage('step5b');
                      }}
                      className="inline-flex items-center rounded border border-slate-700 bg-[#050E18] px-4 py-2.5 text-xs font-semibold tracking-[0.16em] text-slate-300 uppercase hover:text-white"
                    >
                      BACK
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* STEP 6: Centered ZARA IS SPEAKING */}
        {stage === 'step6' && (
          <div className="mx-auto flex w-full max-w-3xl flex-col items-center text-center">
            <HolographicAvatar
              state={avatarState}
              emotion="love"
              assistantName={displayBotName}
              hairstyle={hairstyle}
              variant="hero"
              lipOpenness={lipOpenness}
              lipWidth={lipWidth}
            />
            <p className="mt-3 font-mono text-[11px] font-semibold tracking-[0.22em] text-cyan-400 uppercase">
              ■ STEP 6 OF 9 | {displayBotName.toUpperCase()} IS SPEAKING
            </p>
            <p className="mt-4 max-w-2xl text-lg leading-relaxed sm:text-xl">
              <span className="font-medium text-white">
                {step6Words.slice(0, step6WordCount).join(' ')}{' '}
              </span>
              <span className="text-slate-500">
                {step6Words.slice(step6WordCount).join(' ')}
              </span>
            </p>
            <div className="mt-6 flex items-center gap-4">
              <button
                type="button"
                onClick={() => {
                  unlockAudioContext();
                  stopAllSpeech();
                  setStage('step7q1');
                }}
                className="rounded border border-cyan-400/50 bg-[#082235] px-6 py-2 text-xs font-semibold tracking-[0.16em] text-cyan-100 uppercase hover:bg-cyan-500/20"
              >
                CONTINUE
              </button>
              <button
                type="button"
                onClick={() => {
                  stopAllSpeech();
                  setStage('step7q1');
                }}
                className="text-xs text-slate-400 underline underline-offset-4 hover:text-white"
              >
                Skip
              </button>
            </div>
          </div>
        )}

        {/* STEP 7: Questions 1-3 with real spoken reaction */}
        {currentQuestion && (
          <div className="grid w-full grid-cols-1 items-center gap-8 lg:grid-cols-12">
            <div className="space-y-4 lg:col-span-5">
              <p className="font-mono text-[11px] font-semibold tracking-[0.22em] text-cyan-400 uppercase">
                ■ STEP 7 OF 9 | QUESTION {currentQuestion.number} OF 3
              </p>
              <h1 className="font-display text-2xl font-semibold leading-snug text-white sm:text-3xl">
                {currentQuestion.title}
              </h1>
              <p className="text-xs text-slate-400">
                <strong className="text-slate-200">Choose one.</strong> There is no wrong answer.
              </p>

              <div className="space-y-2.5">
                {currentQuestion.options.map((opt) => {
                  const selected = answers[currentQuestion.stage]?.label === opt.label;
                  return (
                    <button
                      key={opt.label}
                      type="button"
                      onClick={() => void handleSelectQuestionOption(currentQuestion.stage, opt)}
                      className={`flex w-full items-center gap-3 rounded border px-4 py-3 text-left text-sm transition-colors ${
                        selected
                          ? 'border-cyan-400 bg-[#092030] text-white'
                          : 'border-slate-800 bg-[#050F1A] text-slate-300 hover:border-cyan-500/50 hover:text-white'
                      }`}
                    >
                      <span
                        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                          selected
                            ? 'border-cyan-300 bg-cyan-400 text-slate-950'
                            : 'border-slate-600'
                        }`}
                      >
                        {selected && <Check className="h-2.5 w-2.5" />}
                      </span>
                      <span>{opt.label}</span>
                    </button>
                  );
                })}
              </div>

              <button
                type="button"
                onClick={() => {
                  stopAllSpeech();
                  setStage(
                    currentQuestion.stage === 'step7q1'
                      ? 'step6'
                      : currentQuestion.stage === 'step7q2'
                        ? 'step7q1'
                        : 'step7q2'
                  );
                }}
                className="inline-flex items-center rounded border border-slate-700 bg-[#050E18] px-5 py-2 text-xs font-semibold tracking-[0.16em] text-slate-300 uppercase hover:text-white"
              >
                BACK
              </button>
            </div>

            <div className="flex flex-col items-center lg:col-span-7">
              <HolographicAvatar
                state={avatarState}
                emotion={activeReaction ? 'love' : 'thoughtful'}
                assistantName={displayBotName}
                hairstyle={hairstyle}
                variant="hero"
                lipOpenness={lipOpenness}
                lipWidth={lipWidth}
              />
              <p className="mt-3 max-w-md text-center text-sm leading-relaxed text-slate-200">
                {activeReaction || currentQuestion.spokenAsk}
              </p>
            </div>
          </div>
        )}

        {/* STEP 9: One step left to wake ZARA */}
        {stage === 'step9' && (
          <div className="grid w-full grid-cols-1 items-center gap-8 lg:grid-cols-12">
            <div className="space-y-5 lg:col-span-5">
              <p className="font-mono text-[11px] font-semibold tracking-[0.22em] text-cyan-400 uppercase">
                STEP 9 OF 9
              </p>
              <div>
                <h1 className="font-display text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                  One step left to wake {displayBotName.toLowerCase()}.
                </h1>
                <p className="mt-1.5 text-xs text-slate-400">
                  {characterPreset}, {assistantAge} · calls you {userNickname || 'Boss'}
                </p>
              </div>

              <div>
                <p className="text-xs font-medium text-slate-300">
                  Voice note from {displayBotName.toLowerCase()}
                </p>
                <div className="mt-2 flex items-center gap-3 rounded-full border border-cyan-500/40 bg-[#061523] px-3 py-2">
                  <button
                    type="button"
                    onClick={() => void handlePlayVoiceNote()}
                    aria-label={voiceNotePlaying ? 'Pause voice note' : 'Play voice note'}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-cyan-400/60 bg-cyan-500/15 text-cyan-200 hover:bg-cyan-500/30"
                  >
                    {voiceNotePlaying ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                  </button>
                  <div className="flex flex-1 items-center gap-1 overflow-hidden" aria-hidden="true">
                    {[6, 12, 18, 9, 15, 22, 11, 16, 8, 20, 14, 10, 19, 12, 7, 16, 21, 9, 14, 8].map(
                      (h, idx) => (
                        <span
                          key={idx}
                          className={`w-1 rounded-full transition-colors ${
                            voiceNotePlaying ? 'bg-cyan-300' : 'bg-cyan-400/75'
                          }`}
                          style={{ height: `${h}px` }}
                        />
                      )
                    )}
                  </div>
                  <span className="font-mono text-[11px] text-slate-400 tabular-nums">0:16</span>
                </div>
              </div>

              <div>
                <p className="text-xs font-medium text-slate-300">
                  What {displayBotName.toLowerCase()} knows so far
                </p>
                <ul className="mt-2.5 space-y-2 text-xs text-slate-200">
                  {(Object.values(answers).length > 0
                    ? Object.values(answers).map((a) => a.summary)
                    : [
                        'Ready to listen & remember your daily stories',
                        'Ready to read books & courses and execute tasks',
                      ]
                  ).map((summary, i) => (
                    <li key={i} className="flex items-center gap-2.5">
                      <span className="h-1.5 w-1.5 shrink-0 bg-emerald-400" />
                      <span>{summary}</span>
                    </li>
                  ))}
                  <li className="flex items-center gap-2.5 text-slate-400">
                    <span className="h-1.5 w-1.5 shrink-0 bg-amber-400" />
                    <span>Asleep. Ready to hear your voice.</span>
                  </li>
                </ul>
              </div>

              <button
                type="button"
                onClick={() => {
                  stopAllSpeech();
                  setStage('step7q3');
                }}
                className="inline-flex items-center rounded border border-slate-700 bg-[#050E18] px-5 py-2 text-xs font-semibold tracking-[0.16em] text-slate-300 uppercase hover:text-white"
              >
                BACK
              </button>
            </div>

            <div className="flex flex-col items-center lg:col-span-7">
              <HolographicAvatar
                state={avatarState}
                emotion="love"
                assistantName={displayBotName}
                hairstyle={hairstyle}
                variant="hero"
                lipOpenness={lipOpenness}
                lipWidth={lipWidth}
              />
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => void handleActivate()}
                className="-mt-3 inline-flex items-center gap-2 rounded border border-white/80 bg-white px-7 py-3 text-xs font-bold tracking-[0.2em] text-slate-950 uppercase shadow-[0_0_28px_rgba(255,255,255,0.22)] transition-transform hover:scale-[1.02] disabled:opacity-50"
              >
                <span>{isSubmitting ? 'WAKING...' : `ACTIVATE ${displayBotName.toUpperCase()}`}</span>
                <span aria-hidden="true">→</span>
              </button>
              {submitError && (
                <p role="alert" className="mt-2 text-xs text-rose-400">
                  {submitError}
                </p>
              )}
            </div>
          </div>
        )}
      </main>

      {/* Bottom 9-Step Progress & Music Toggle */}
      <footer className="flex items-center justify-between gap-4 pt-3">
        <div className="flex items-center gap-1.5" aria-label={`Onboarding step ${progressIndex} of 9`}>
          {Array.from({ length: 9 }, (_, i) => {
            const stepNum = i + 1;
            const active = stepNum === progressIndex;
            const passed = stepNum < progressIndex;
            return (
              <span
                key={stepNum}
                className={`h-[3px] w-5 rounded-full transition-colors ${
                  active
                    ? 'bg-cyan-300 shadow-[0_0_8px_rgba(103,232,249,0.8)]'
                    : passed
                      ? 'bg-cyan-700'
                      : 'bg-slate-800'
                }`}
              />
            );
          })}
        </div>

        <button
          type="button"
          onClick={toggleMusic}
          className="inline-flex items-center gap-1.5 rounded border border-slate-800 bg-[#050E18] px-3 py-1.5 text-[11px] font-medium text-slate-300 transition-colors hover:border-cyan-500/40 hover:text-white"
        >
          {musicOn ? <Volume2 className="h-3.5 w-3.5 text-cyan-300" /> : <VolumeX className="h-3.5 w-3.5" />}
          <span>{musicOn ? 'Music on' : 'Music off'}</span>
        </button>
      </footer>
    </div>
  );
}
