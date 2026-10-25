# ExamTrace

**Smart Desktop Examination & Activity Monitoring System**

ExamTrace is a desktop application that lets an examiner create and manage
multiple-choice examinations, and lets candidates take timed exams in a monitored
desktop environment. It is built with Electron, React and Vite, and stores all
data locally as JSON. It works fully offline (the optional AI question generator
is the only feature that needs the internet).

> Academic project for an Application Development elective. It records selected
> desktop activity to support exam review. It is **not** a tamper-proof or
> cheating-proof proctoring system.

---

## Features

- **Two modes** — Candidate (default) and Examiner (passcode-protected).
- **Examiner tools** — create / edit / delete exams, manage MCQs, change passcode,
  configure settings. All examiner actions are authorized in the Main process.
- **Examination engine** — timed MCQ exams with a question palette, mark-for-review,
  a Main-authoritative countdown, manual + automatic (time-expiry) submission, and
  scoring done in Main.
- **Activity monitoring** — window focus/blur + minimize, fullscreen exit/enter,
  and system idle / lock / unlock / suspend / resume, shown as a neutral timeline.
- **Durable results** — history, detailed reports (from a saved exam snapshot),
  simple analytics, renderer-reload recovery and full app-restart recovery.
- **Optional extras** — camera preview, HTML report export, and Groq-assisted
  draft question generation (examiner reviews every question).

---

## Tech stack

- **Electron** (Main process, lifecycle, windows, OS integration)
- **React + Vite** (renderer UI, plain JavaScript)
- **Node.js `fs` + JSON** for persistence (`app.getPath("userData")`)
- **Node `crypto`** (`scrypt` + `timingSafeEqual`) for the examiner passcode
- No database, no cloud, no backend server.

---

## Requirements

- macOS (built and tested on Apple Silicon)
- Node.js 18+ and npm

## Setup & run (development)

```bash
npm install
npm run dev
```

`npm run dev` starts the Vite dev server and launches the Electron app pointed at
it. On first launch you will be asked to create an examiner passcode.

## Build a packaged app

```bash
npm run pack   # unpacked app in release/mac-arm64/ExamTrace.app (no code signing)
npm run dist   # DMG installer (also unsigned)
```

The packaged app disables DevTools (`devTools: false` when packaged) and loads the
built files from `dist/`.

## Reset development data

All data lives in the macOS application-support folder. To start completely fresh
(new first-run), quit ExamTrace and delete:

```
~/Library/Application Support/ExamTrace
```

---

## Architecture

```
React Renderer  ->  Preload (contextBridge)  ->  Secure IPC  ->  Electron Main
   (UI only)        (window.examTrace API)                    |-> OS (BrowserWindow, powerMonitor)
                                                              |-> JSON storage (userData)
```

- **Main process** owns everything important: examiner authentication and
  authorization, the exam state and timer, monitoring, scoring, file persistence,
  native notifications/dialogs, and AI generation.
- **Preload** exposes a small, named `window.examTrace` API via `contextBridge`.
  The renderer never sees raw `ipcRenderer`, Node, or the answer keys.
- **Renderer** is React UI only.

Security settings on the window: `contextIsolation: true`, `nodeIntegration:
false`, `sandbox: true`, `devTools` enabled only in development.

### Project layout

```
electron/
  main.cjs            app lifecycle, BrowserWindow, startup recovery
  preload.cjs         contextBridge -> window.examTrace
  windowRef.cjs       lets Main services push events to the renderer
  ipc/handlers.cjs    all ipcMain handlers + authorization checks
  services/
    storageService.cjs      atomic, queued JSON reads/writes
    authService.cjs         scrypt passcode setup/verify/lock
    examService.cjs         exam CRUD, validation, sample exam
    examSessionService.cjs  active attempt, timer, scoring, recovery
    monitoringService.cjs   window + powerMonitor activity timeline
    attemptService.cjs      finalized attempts + checkpoints
    settingsService.cjs     settings + per-mode authorization
    groqService.cjs         optional AI question drafts (Main-only key)
    reportExport.cjs        HTML report builder
src/
  App.jsx, api.js, components/, screens/, styles/
```

### Data files (in userData)

| File | Holds |
|------|-------|
| `exams.json` | exam definitions |
| `attempts.json` | finalized attempts (scores, answers, monitoring events) |
| `active-attempt.json` | in-progress checkpoint for restart recovery |
| `settings.json` | preferences (and the local Groq key, if set) |
| `examiner-auth.json` | passcode salt + hash (never the passcode) |

---

## How key parts work (viva notes)

- **Why Main owns the timer** — React can be reloaded or lose focus; the Main
  process computes remaining time from an absolute `deadline`, so the countdown
  stays correct and never resets.
- **Why answer keys stay in Main** — `getActiveExam` returns only question text and
  options. Correct answers are revealed only in the result, after grading in Main.
- **Why hiding a button isn't security** — every examiner-only IPC handler
  re-checks authorization in Main, so a candidate can't call them directly.
- **Passcode security** — stored as a `scrypt` hash with a random salt; verified
  with `timingSafeEqual`. The passcode is never stored or logged.
- **Monitoring dedup** — a single "away" flag means a minimize-plus-blur counts as
  one focus-departure interval, not two.
- **Recovery** — renderer reload restores from Main memory; a full restart restores
  from `active-attempt.json` (or finalizes once if the deadline passed while
  closed, without inventing events for the gap).

---

## Testing

Main-process logic is covered by headless test scripts (155 checks across storage,
authentication/authorization, the exam engine, monitoring dedup, and persistence/
recovery). UI flows are verified by running the app. Report actual results — do not
assume a test passed without running it.

---

## Optional: connected mode (teacher server)

ExamTrace can optionally connect to a small **Express + SQLite** server so a teacher
publishes exams and students on the same network take them, graded on the server.
This is **opt-in** — with no server configured, ExamTrace is fully standalone, and
**local exams are always available** (even when the server is down or has none
published).

**Run the server** (on the teacher's computer, separate from the app — it is *not*
embedded in the packaged `.app`; needs Node ≥ 22.5 for the built-in `node:sqlite`):

```bash
npm run server        # localhost only (http://127.0.0.1:3000)
npm run server:lan    # also reachable by other devices on the same Wi-Fi
```

The server prints its address. Data lives in `server/data/examtrace.db`
(reset = delete that file).

**Teacher:** open ExamTrace → **Connection** → enter the server address → **Connect**
→ create/log in to the teacher account (account creation is **localhost-only**, so
only the teacher's own machine can create it). Then create an exam as usual and press
**Publish to students** in Manage Exams. **Preview** lets you take an exam as a student
without it counting as an official result.

**Student:** open ExamTrace → **Connection** → enter the teacher's address → **Connect**.
Published teacher exams appear in a **Teacher Exams** section next to your local exams
(no exam code needed). Starting one creates an official attempt; answers are graded on
the server.

**Teacher results:** the **Teacher Results** screen lists every official attempt with
scores and a detailed report.

How it stays safe: all networking runs in the Electron Main process; teacher exam
**answer keys never leave the server** (students get sanitized questions and the server
grades); submissions need a server-issued credential; the teacher password is stored
as a scrypt hash; and the existing local exam engine is untouched.

**Connected-mode limitations (academic LAN prototype):** plain HTTP, so the teacher
password/token are observable on an untrusted network — assume a trusted classroom
LAN (HTTPS is out of scope). A full app restart does not auto-resume an in-progress
*teacher* attempt (renderer reload is fine). Session tokens reset if the server
restarts.

## Known limitations

- Local, application-level access control only — someone who can edit local files
  or the app itself is not prevented.
- Monitoring records facts (focus loss, inactivity, etc.); it does **not** prove
  misconduct and does not pause the timer.
- Candidate names are self-reported, not verified identity; history is shared local
  history on this device, not secure per-student history.
- Fullscreen and camera are monitoring aids, not a lockdown.
- A Groq API key bundled in a local desktop app is not truly secret; for a real
  product the key would live on a server.

---

## Demo sequence (~3 minutes)

1. Launch ExamTrace (Candidate Mode) — the built-in **Computer Science
   Fundamentals** exam is listed.
2. Open **Examiner Mode**, enter the passcode; show **Create Exam** / **Manage Exams**.
3. **Lock Examiner Mode**, return to Candidate Mode.
4. Start the sample exam, enter a name, read the monitoring disclosure.
5. Answer a few questions; use navigation and mark-for-review.
6. Switch to another app and back — show the recorded focus event.
7. Exit fullscreen — show the recorded event + warning.
8. (Demo Mode on) sit idle ~10s — show inactivity detection.
9. Submit — show the result (score, correct/incorrect) and the detailed report
   (monitoring summary + timeline).
10. Open **History / Analytics**; **restart** the app and show history persists and
    Examiner Mode is locked again.
