# NOVA AI — Complete Project Documents

Nov 17, 2026 · @inam

Your Personal AI. Always Ready. — Windows Desktop Voice Assistant with Urdu + English support.

## 1. PRD — Product Requirements Document

NOVA AI ek intelligent Windows desktop voice assistant hai jo Urdu aur English dono mein naturally baat kar sakta hai, tasks automate karta hai, aur user ke sath ek personalized AI companion ki tarah behave karta hai.

### 1.1 Vision & Goals

- **Primary Goal:** Ek fully offline-capable, voice-first AI assistant jo Windows PC par permanently rehta ho
- **Secondary Goal:** Urdu realistic voice support with natural conversation flow
- **Stretch Goal:** Modular skill system jo users khud extend kar sakein

### 1.2 User Personas

| Persona | Description | Key Need |
| --- | --- | --- |
| Power User (Developer) | Technical, uses PC 8+ hrs/day | Code help, file automation, quick answers |
| Professional (Office Worker) | Non-technical, meetings & emails | Notes, reminders, document drafting |
| Student | Research-heavy work | Explanations, summaries, study help |
| Home User | Urdu-speaking, casual use | Natural Urdu conversation, daily tasks |

### 1.3 Core Feature Requirements

**Voice & Language**

- Wake word detection: "Hey Nova" or "Nova"
- Speech-to-Text: Faster-Whisper (local, fast)
- Text-to-Speech: Urdu realistic voice (Edge TTS with Urdu neural voices)
- Bilingual: English + Urdu/Roman Urdu
- Continuous conversation mode (no need to press button every time)
- Interrupt while NOVA is speaking

**AI Brain**

- Configurable LLM backend (Anthropic Claude / OpenAI GPT)
- Context-aware multi-turn conversations
- Persistent memory across sessions
- NOVA's own personality: friendly, professional, helpful

**Skills & Automation**

- Open apps and websites by voice
- Create notes and reminders
- File search and management
- Tell time, date, weather
- Calculations and conversions
- Generate documents and emails
- Control system (volume, brightness, shutdown)

**Memory**

- Short-term: current conversation context
- Long-term: user preferences, facts, history (SQLite)
- Memory review and delete from UI

**UI/UX**

- Futuristic dark dashboard (neon cyan/blue)
- Animated holographic AI avatar
- Sidebar: Home, Memory, Skills, Character, Recent, Settings
- Real-time listening/speaking visual indicators

### 1.4 Non-Goals (Out of Scope v1)

- Mobile app
- Cloud sync of memory
- Multi-user support
- Video/screen sharing

### 1.5 Success Metrics

| Metric | Target |
| --- | --- |
| Wake word response time | < 1 second |
| Speech-to-text latency | < 2 seconds |
| TTS Urdu voice naturalness | Human-like (Edge Neural) |
| App launch via voice | < 3 seconds |
| Memory recall accuracy | > 90% relevant results |
| UI responsiveness | 60fps, no freezing |

## 2. TRD — Technical Requirements Document

### 2.1 Technology Stack

| Layer | Technology | Version | Reason |
| --- | --- | --- | --- |
| Language | Python | 3.11+ | Mature ecosystem, async support |
| Desktop UI | PySide6 (Qt6) | Latest | Native Windows look, GPU-accelerated |
| AI Brain | Anthropic Claude API / OpenAI API | claude-3-5-sonnet / gpt-4o | Configurable, best reasoning |
| Speech-to-Text | faster-whisper | Latest | Local, fast, Urdu support |
| Text-to-Speech | Edge TTS (Microsoft) | Latest | Free, Urdu neural voices (Uzma, Asad) |
| Wake Word | OpenWakeWord | Latest | Local, low CPU |
| Database | SQLite3 | Built-in | Local, no server needed |
| Audio I/O | sounddevice + pyaudio | Latest | Low-latency mic/speaker |
| Automation | subprocess, pathlib, pywinauto | — | Windows app control |
| Config | python-dotenv | — | Secure .env key management |
| Logging | Python logging module | Built-in | Rotating file logs |

### 2.2 System Architecture

```
[Microphone]
     ↓
[OpenWakeWord] → wake detected
     ↓
[faster-whisper STT] → text
     ↓
[AssistantManager]
   ├─ [SkillManager] → direct commands (open app, reminder, etc.)
   └─ [AI Brain (Claude/OpenAI)] → complex queries + personality
          ↓
     [ConversationManager + MemoryManager]
          ↓
     [Edge TTS] → audio
          ↓
     [Speaker Output]
          ↓
     [PySide6 UI update (async signal)]
```

### 2.3 API Integrations

| Integration | Type | Key Storage | Fallback |
| --- | --- | --- | --- |
| Anthropic Claude | REST API | .env file | Switch to OpenAI |
| OpenAI GPT | REST API | .env file | Switch to Claude |
| Edge TTS | Local lib (no key) | — | gTTS fallback |
| faster-whisper | Local model | — | None needed |
| OpenWakeWord | Local model | — | Manual button |

### 2.4 Non-Functional Requirements

**Performance**

- UI thread must never block — all heavy ops run in QThread workers
- Wake word CPU usage < 5%
- STT response < 2s for 10-second speech clip
- LLM API call with timeout: 30s max, with loading indicator

**Security**

- API keys ONLY in `.env` file, never in source code
- Memory DB stored at `%APPDATA%/NOVA_AI/` (not in project folder)
- No auto-execution of AI-generated shell commands without user confirmation dialog
- File delete requires explicit user confirmation

**Compatibility**

- Windows 10 (build 1903+) and Windows 11
- Python 3.11+ required
- Minimum RAM: 4GB (8GB recommended for local Whisper)
- Microphone + speaker required

**Error Handling**

- Microphone not found → show UI error, offer retry
- API key missing/invalid → redirect to Settings page
- Network timeout → fallback message + retry option
- Wake word model download fail → manual trigger mode

### 2.5 Key Python Packages (requirements.txt)

```
PySide6>=6.6.0
faster-whisper>=0.10.0
edge-tts>=6.1.9
openai>=1.0.0
anthropicai>=0.20.0
sounddevice>=0.4.6
pyaudio>=0.2.14
openwakeword>=0.6.0
python-dotenv>=1.0.0
aiohttp>=3.9.0
pywin32>=306
```

## 3. App Flow — User & Admin Experience

### 3.1 Main User Flows

**Flow 1: First Launch (Setup)**

1. User installs via `install.bat`
2. App opens → Welcome screen shows
3. User enters API key (Claude or OpenAI) in Settings
4. User selects TTS voice (Urdu: Uzma-Neural / English: Jenny-Neural)
5. Microphone test runs automatically
6. Wake word calibration completes
7. Dashboard opens — NOVA says: "Assalamualaikum! Mein NOVA hun, aapki madad ke liye tayyar hun."

**Flow 2: Normal Voice Conversation**

```
User says "Hey Nova"
  → Wake LED on avatar pulses cyan
  → Listening indicator activates (animated ring)
  → User speaks command/question
  → STT converts to text (shown in chat bubble)
  → AssistantManager routes:
      - Direct skill? → execute immediately
      - Complex query? → send to AI Brain
  → NOVA responds in voice + text
  → Avatar shows speaking animation
  → Conversation saved to memory
  → Returns to wake word listening mode
```

**Flow 3: Text Input Mode**

1. User clicks text field or presses `Ctrl+Space`
2. Types message, presses Enter
3. Same routing as voice (STT skipped)
4. Response shown as text + spoken aloud

**Flow 4: Skill Execution (e.g., Open App)**

```
User: "Hey Nova, Chrome kholo"
  → Skill: app_launcher.py detects "chrome"
  → Checks if Chrome is installed (registry scan)
  → Opens Chrome via subprocess
  → NOVA: "Chrome khul gaya hai"
```

**Flow 5: Memory Review**

1. User clicks Memory in sidebar
2. Memory page shows: Short-term (today) + Long-term (all time)
3. Search bar: filter by keyword or date
4. Each memory card shows: date, content, source
5. User can delete individual memory or clear all
6. NOVA confirms before delete: "Kya aap ye memory delete karna chahte hain?"

**Flow 6: Settings Update**

1. User clicks Settings sidebar item
2. Tabs: AI Provider, Voice, Microphone, Character, Privacy
3. User changes API key → validation call runs → success toast shown
4. Voice change → preview button plays sample
5. Settings saved to `.env` and `config.db`

### 3.2 Admin / Power User Flows

**Add Custom Skill**

1. User goes to Skills page
2. Clicks "Add Custom Skill"
3. Fills: skill name, trigger phrase, action type, action value
4. Skill saved to `skills_config.db`
5. SkillManager reloads — new skill active immediately

**Character Customization**

1. User goes to Character page
2. Edits: Name (default: NOVA), Personality prompt, Language preference, Response style (formal/casual)
3. Saves → AI Brain system prompt updates
4. NOVA's next response reflects new personality

### 3.3 Error State Flows

| Error | What NOVA Does | What UI Shows |
| --- | --- | --- |
| Mic not detected | Speaks error message | Red mic icon + tooltip |
| API key invalid | "Please configure your API key" | Redirect to Settings |
| Internet lost | "Offline mode — skill commands only" | Yellow status badge |
| STT timeout | Re-prompts user to speak | Listening ring pulses red |
| Skill fails | Polite error + suggestion | Toast notification |

## 4. UI/UX Design Brief

### 4.1 Visual Language

NOVA AI ka look "Futuristic Holographic Control Room" se inspired hai — jaisa reference images mein Stonic AI dikhta hai.

**Color Palette**

| Element | Color | Hex |
| --- | --- | --- |
| Background (main) | Deep space black | #0A0A0F |
| Background (panel) | Dark navy | #0D1117 |
| Background (card) | Dark blue-grey | #111827 |
| Primary accent | Neon cyan | #00F5FF |
| Secondary accent | Electric blue | #0066FF |
| Danger / Terminate | Neon red | #FF2D55 |
| Success | Neon green | #00FF88 |
| Text primary | White | #FFFFFF |
| Text secondary | Cyan-grey | #8892A4 |
| Border glow | Cyan 30% opacity | rgba(0,245,255,0.3) |

**Typography**

- Headings: Orbitron (Google Font) — futuristic, all-caps feel
- Body text: Inter or Exo 2 — readable, modern
- Code / status: JetBrains Mono — technical display
- Minimum font size: 13px for readability

### 4.2 Layout Structure

```
┌─────────────────────────────────────────────────────┐
│  [NOVA AI Logo]           [Time: 09:11] [Status: ●] │  ← Top Bar (40px)
├──────────┬──────────────────────────┬───────────────┤
│          │                          │               │
│ SIDEBAR  │   MAIN AVATAR AREA       │  CHAT PANEL   │
│ (200px)  │   (Animated Avatar)      │  (350px)      │
│          │   [Listening Ring]       │               │
│ ● HOME   │   [Status Text]          │  User: ...    │
│ ● MEMORY │   [TERMINATE button]     │  NOVA: ...    │
│ ● SKILLS │                          │  User: ...    │
│ ● CHAR.. │                          │               │
│ ● RECENT │                          │  [Text Input] │
│ ● SETTINGS│                         │  [Mic Button] │
└──────────┴──────────────────────────┴───────────────┘
```

### 4.3 Key UI Components

**Avatar / Voice Indicator**

- Central glowing holographic figure (SVG or Lottie animation)
- Three states:
  - **Idle:** Slow breathing pulse, dim cyan glow
  - **Listening:** Bright cyan ring expands/contracts with mic volume
  - **Speaking:** Wavy sound bars animate around avatar
- Circular ring around avatar shows audio waveform in real-time

**Sidebar Navigation**

- Width: 200px, dark panel background
- Each item: icon (SVG) + label + neon left-border on active
- Hover: subtle cyan background highlight
- Active item: left cyan 3px border glow + brighter text

**Chat Bubbles**

- User messages: right-aligned, cyan tinted border
- NOVA messages: left-aligned, dark card with NOVA avatar chip
- Timestamps on each bubble
- Smooth fade-in animation per message

**TERMINATE Button**

- Hexagonal or pill shape, neon red
- Stops NOVA speaking immediately
- Hover: red glow intensifies
- Keyboard shortcut: `Escape`

**Status Indicators**

- Top-right status dot: Green (ready), Cyan (listening), Blue (thinking), Red (error)
- Bottom status bar: current action text ("Listening...", "Processing...", "Speaking...")

### 4.4 Animations

| Animation | Trigger | Style |
| --- | --- | --- |
| Avatar breathing | Always | Slow scale 1.0→1.03, 3s loop |
| Listening ring | On wake word | Expand + pulse, cyan, 0.8s |
| Speaking waves | While TTS plays | Radial bars react to audio |
| Page transition | Sidebar click | Fade in 200ms |
| Chat message | New message | Slide up + fade in 150ms |
| Status dot | State change | Color transition 300ms |
| Mic button | On press | Scale down 0.95 + glow |

### 4.5 Responsive Behavior

- Minimum window size: 1200×700px
- Sidebar collapses to icon-only at < 900px width
- Chat panel hides on < 1100px (accessible via tab)
- All text scales with Windows DPI settings

## 5. Backend Schema — SQLite Database

Sab data local SQLite mein store hota hai at `%APPDATA%/NOVA_AI/nova.db`.

### 5.1 Table: conversations

Short-term aur long-term conversation history.

```sql
CREATE TABLE conversations (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id  TEXT NOT NULL,          -- UUID per app session
    role        TEXT NOT NULL,          -- 'user' or 'assistant'
    content     TEXT NOT NULL,          -- message text
    language    TEXT DEFAULT 'en',      -- 'en' or 'ur'
    timestamp   DATETIME DEFAULT CURRENT_TIMESTAMP,
    is_archived INTEGER DEFAULT 0       -- 1 = moved to long-term
);
CREATE INDEX idx_conversations_session ON conversations(session_id);
CREATE INDEX idx_conversations_timestamp ON conversations(timestamp);
```

### 5.2 Table: memories

Long-term facts NOVA remembers about the user.

```sql
CREATE TABLE memories (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    category    TEXT NOT NULL,          -- 'preference', 'fact', 'reminder', 'note'
    key         TEXT,                   -- e.g. 'user_name', 'favorite_color'
    value       TEXT NOT NULL,          -- the remembered fact
    source      TEXT,                   -- 'user_stated' or 'ai_inferred'
    confidence  REAL DEFAULT 1.0,       -- 0.0 to 1.0
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    is_deleted  INTEGER DEFAULT 0
);
CREATE INDEX idx_memories_category ON memories(category);
CREATE INDEX idx_memories_key ON memories(key);
```

### 5.3 Table: skills\_config

Default + user-defined skills.

```sql
CREATE TABLE skills_config (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    skill_name      TEXT UNIQUE NOT NULL,   -- 'open_app', 'web_search', etc.
    trigger_phrases TEXT NOT NULL,          -- JSON array of phrases
    action_type     TEXT NOT NULL,          -- 'launch', 'url', 'system', 'ai'
    action_value    TEXT,                   -- path, url, command, or prompt
    is_enabled      INTEGER DEFAULT 1,
    is_custom       INTEGER DEFAULT 0,      -- 1 = user-created
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### 5.4 Table: reminders

```sql
CREATE TABLE reminders (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    title       TEXT NOT NULL,
    remind_at   DATETIME NOT NULL,
    is_done     INTEGER DEFAULT 0,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### 5.5 Table: notes

```sql
CREATE TABLE notes (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    title       TEXT,
    content     TEXT NOT NULL,
    tags        TEXT,                   -- JSON array
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### 5.6 Table: app\_config

All settings stored here (except API keys — those stay in .env).

```sql
CREATE TABLE app_config (
    key         TEXT PRIMARY KEY,
    value       TEXT NOT NULL,
    updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);
-- Default rows:
-- ('ai_provider', 'anthropic')
-- ('tts_voice', 'ur-PK-UzmaNeural')
-- ('stt_model', 'base')
-- ('wake_word', 'hey nova')
-- ('language', 'ur')
-- ('theme', 'dark')
-- ('startup_launch', '0')
-- ('assistant_name', 'NOVA')
-- ('personality', 'friendly_professional')
```

### 5.7 Relationships Diagram

```
conversations ──── (session_id groups turns per session)
memories ──────── (standalone facts, referenced by AI Brain)
skills_config ─── (loaded at startup by SkillManager)
reminders ──────── (checked every minute by background worker)
notes ──────────── (CRUD via Skills + Memory page)
app_config ──────── (read at startup, written on Settings save)
```

## 6. Implementation Plan — 7 Phases

### Phase 1: Project Setup & Desktop UI (Week 1–2)

**Goal:** Working window with full futuristic dashboard — no backend yet.

| Task | File(s) | Est. Time |
| --- | --- | --- |
| Project folder structure | All directories | 1 hr |
| `requirements.txt` + `.env.example` | Root | 30 min |
| `install.bat` + `run.bat` | Root | 30 min |
| Main window + sidebar | `ui/main_window.py` | 4 hrs |
| Dashboard with animated avatar | `ui/dashboard.py` | 6 hrs |
| QSS dark theme styles | `ui/styles.qss` | 3 hrs |
| Sidebar navigation (all pages stub) | `ui/*.py` | 2 hrs |
| Status bar + clock widget | `ui/main_window.py` | 1 hr |

**Deliverable:** App launches, sidebar navigates, avatar animates — no voice yet.

### Phase 2: Voice Input & Output (Week 2–3)

**Goal:** NOVA can listen and speak.

| Task | File(s) | Est. Time |
| --- | --- | --- |
| Microphone capture (sounddevice) | `core/voice_engine.py` | 2 hrs |
| faster-whisper STT integration | `core/speech_recognition.py` | 3 hrs |
| Edge TTS with Urdu voice | `core/voice_engine.py` | 3 hrs |
| OpenWakeWord wake detection | `core/wake_word.py` | 4 hrs |
| Voice→text→display pipeline | `core/assistant_manager.py` | 2 hrs |
| Mic button + UI thread signals | `ui/dashboard.py` | 2 hrs |

**Deliverable:** Say "Hey Nova" → NOVA listens → text appears on screen → NOVA speaks response (echo for now).

### Phase 3: AI Brain & Conversation (Week 3–4)

**Goal:** Real AI responses with personality.

| Task | File(s) | Est. Time |
| --- | --- | --- |
| AI provider abstraction class | `core/ai_brain.py` | 3 hrs |
| Anthropic Claude integration | `core/ai_brain.py` | 2 hrs |
| OpenAI GPT integration | `core/ai_brain.py` | 2 hrs |
| NOVA personality system prompt | `character/personality.py` | 2 hrs |
| Conversation history (in-memory) | `core/conversation.py` | 2 hrs |
| Interrupt-while-speaking support | `core/voice_engine.py` | 3 hrs |

**Deliverable:** Full voice conversation — NOVA answers questions in Urdu/English with personality.

### Phase 4: Persistent Memory (Week 4–5)

**Goal:** NOVA remembers across sessions.

| Task | File(s) | Est. Time |
| --- | --- | --- |
| SQLite setup + schema creation | `memory/database.py` | 2 hrs |
| Conversation save/retrieve | `memory/memory_manager.py` | 3 hrs |
| Long-term memory extraction | `memory/memory_manager.py` | 4 hrs |
| Memory page UI | `ui/memory_page.py` | 4 hrs |
| Memory search + delete | `ui/memory_page.py` | 2 hrs |

**Deliverable:** Memory page shows all history. NOVA recalls user preferences in next session.

### Phase 5: Skills & Automation (Week 5–6)

**Goal:** NOVA can do real tasks on Windows.

| Task | File(s) | Est. Time |
| --- | --- | --- |
| Skill routing engine | `skills/skill_manager.py` | 3 hrs |
| App launcher (voice command) | `skills/app_launcher.py` | 2 hrs |
| Web browser open + search | `skills/web_search.py` | 2 hrs |
| File search | `skills/file_manager.py` | 3 hrs |
| Notes + reminders (with DB) | `skills/notes.py` | 3 hrs |
| System control (volume, shutdown) | `skills/system_control.py` | 3 hrs |
| Skills page UI | `ui/skills_page.py` | 3 hrs |

**Deliverable:** 10+ working voice commands. Skills page shows enable/disable toggles.

### Phase 6: Character & Settings (Week 6–7)

**Goal:** Fully configurable NOVA.

| Task | File(s) | Est. Time |
| --- | --- | --- |
| Character page UI | `ui/character_page.py` | 3 hrs |
| Settings page UI (all tabs) | `ui/settings_page.py` | 5 hrs |
| API key save/validate | `ui/settings_page.py` | 2 hrs |
| Voice preview in settings | `ui/settings_page.py` | 1 hr |
| Startup launch option | `main.py` | 1 hr |
| Privacy: memory clear all | `ui/settings_page.py` | 1 hr |

**Deliverable:** Every settings panel works. NOVA's name and personality fully customizable.

### Phase 7: Testing, Polish & Packaging (Week 7–8)

**Goal:** Stable, distributable application.

| Task | File(s) | Est. Time |
| --- | --- | --- |
| Unit tests (memory, skills, voice) | `tests/` | 4 hrs |
| Error handling review | All core files | 3 hrs |
| Logging system | All files | 2 hrs |
| Performance profiling | — | 2 hrs |
| README.md complete | Root | 2 hrs |
| PyInstaller packaging (optional) | `build.bat` | 3 hrs |
| Final bug fixes | — | Ongoing |

**Deliverable:** Fully working NOVA AI — ready to use and optionally distribute as .exe.

### Total Estimated Time

| Phase | Duration | Hours |
| --- | --- | --- |
| Phase 1: UI | Week 1–2 | \~18 hrs |
| Phase 2: Voice | Week 2–3 | \~16 hrs |
| Phase 3: AI Brain | Week 3–4 | \~14 hrs |
| Phase 4: Memory | Week 4–5 | \~15 hrs |
| Phase 5: Skills | Week 5–6 | \~19 hrs |
| Phase 6: Settings | Week 6–7 | \~13 hrs |
| Phase 7: Testing | Week 7–8 | \~16 hrs |
| **Total** | **\~8 weeks** | **\~111 hrs** |
