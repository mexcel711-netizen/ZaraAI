# ZARA Desktop Companion (Windows)

This optional local agent lets the ZARA web app request a small, explicit set of desktop actions. It binds only to `127.0.0.1`, requires a random pairing token, checks the ZARA site origin, and exposes only an allowlist (Chrome, Edge, Notepad, Calculator, HTTP/HTTPS URLs). It does **not** provide arbitrary shell access, file-system access, keystroke injection, or remote desktop access.

## Requirements
- Windows 10/11
- Node.js 20+ or Bun
- ZARA repository dependencies installed (`bun install`)

## Start
Open PowerShell in the repository root:

```powershell
bun install
bun run desktop:companion
```

The terminal prints a one-time pairing token. Keep the terminal open and paste that token into the ZARA **Desktop Bridge** panel. Do not share it. Stop the companion with Ctrl+C.

Optional fixed token (store it securely; do not commit it):

```powershell
$env:NOVA_BRIDGE_TOKEN = "a-long-random-private-token"
bun run desktop:companion
```

## Voice
When paired, ZARA uses Microsoft Edge neural TTS locally:
- Urdu (Pakistan), female: `ur-PK-UzmaNeural`
- English (US), female: `en-US-JennyNeural`

This is cloud-backed speech synthesis, so it needs internet access. Voice availability and pronunciation can vary; test it on your device.

## Safety
- The companion accepts requests only from the production ZARA origin and local Vite development origins.
- Every request requires the pairing token.
- App launch is restricted to the listed applications; folder opening is restricted to known user folders.
- URL opening accepts HTTP/HTTPS only.
- The companion has no remote port exposure; do not change the bind address to `0.0.0.0`.
- This is a local development companion, not a signed Windows installer or Windows service. Keep it running while using desktop actions.


## Natural desktop voice commands
With the companion paired, ZARA understands these supported phrases:
- `Chrome kholo` — launch Chrome on the desktop
- `Chrome ka new tab kholo`, `Chrome ke new tab kholo`, or `new tab kholo` — open a new Chrome tab
- `YouTube kholo`, `Google kholo`, `Gmail kholo`, `WhatsApp kholo`, `GitHub kholo`, or `ChatGPT kholo` — open the site in a Chrome tab
- `Google pe cats search karo` or `Chrome mein cats search karo` — search in a new Chrome tab
- `Edge kholo`, `Notepad kholo`, or `Calculator kholo` — launch the named desktop app

Chrome tab requests use Chrome's `--new-tab` switch, which targets an existing Chrome session when one is already running. Only HTTP/HTTPS destinations are accepted by the companion.

## Emotion-aware voice delivery
The companion passes emotion-dependent rate and pitch to Edge Neural TTS for calm, happy, excited, sad, empathetic, thoughtful, confident, angry, and surprised replies. These are subtle prosody adjustments, not a guarantee of human-level emotional acting. The Urdu female voice is `ur-PK-UzmaNeural`; actual voice naturalness depends on Microsoft's service and should be auditioned on the target PC.

## More Windows actions
Supported additional voice commands:
- `File Explorer kholo` / `Explorer kholo`
- `Task Manager kholo`
- `Settings kholo`
- `Downloads folder kholo`, `Desktop folder kholo`, or `Documents folder kholo`
- Urdu-script equivalents such as `ٹاسک مینیجر کھولو`, `ڈاؤن لوڈز کھولو`, and `فائل ایکسپلورر کھولو`

The companion opens only fixed, known folders under the current Windows user's profile. It does not accept arbitrary paths or run arbitrary PowerShell/shell commands.
