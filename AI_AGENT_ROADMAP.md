# 🧭 PILOT — PERSONAL AI AGENT ROADMAP

> **Personal Autonomous Multimodal AI Operating Layer**
> **Vision:** `UNDERSTAND → REASON → PLAN → USE TOOLS → CONTROL COMPUTER → OBSERVE → VERIFY → LEARN FROM CONTEXT → COMPLETE TASK`

---

## 📊 Project Status Tracker

- **Current Level:** **Level 2 — Computer Assistant**
- **Primary Model Provider:** Google Gemini API (`gemini-3.5-flash-lite`, `gemini-3.6-flash`, `gemini-3.5-flash`)
- **Execution Architecture:** Node.js + Express + WebSocket + Playwright Multi-Tab Engine + Windows OS Automation Bridge (CoreAudio + Virtual Media Keys + Process Controller)
- **Storage:** SQLite (`better-sqlite3`) + Cloned Chrome Profile & Session Storage

---

## 🗺️ Master Capability Matrix

### Level 1 — Basic Assistant `[COMPLETED]`
- [x] Natural language interaction (conversational reasoning, direct outputs)
- [x] 0-step instant conversational responses without browser overhead
- [x] Multi-task queueing & state tracking
- [x] Task history persistence in SQLite database
- [x] WebSocket real-time event broadcasting

### Level 2 — Computer & Media Assistant `[COMPLETED]`
- [x] Web media playback (YouTube video search, direct playback, audio unmuting)
- [x] Universal web & AI platform launcher (Gemini, Gamma AI, Perplexity, Claude, DeepSeek, HuggingFace, LeetCode, Canva, Figma, Notion, Wikipedia, etc.)
- [x] Dynamic arbitrary URL / website resolver with automatic foreground elevation
- [x] OS-level media control (Play / Pause / Stop / Next track / Prev track via Windows Virtual Media Keys)
- [x] OS-level master volume control (Set volume %, volume up/down, mute, unmute via CoreAudio IAudioEndpointVolume API)
- [x] Windows native application control (Launch installed apps like VS Code, Notepad, Spotify desktop, Calculator, Terminal, Chrome, Explorer, Settings)
- [x] Process & window verification with WScript.Shell SendKeys desktop typing & foreground focus
- [x] Windows native application termination (Close/Stop running desktop applications on command)

### Level 3 — Web Assistant `[COMPLETED]`
- [x] High-speed Playwright browser engine with instant selector matching
- [x] Multi-tab parallel task execution (isolated tab per `taskId`)
- [x] Multi-tier resilient locator engine (CSS, ARIA role, text, DOM evaluation)
- [x] Self-healing re-planning loop when elements or steps fail
- [x] Vision-based web screenshot analysis and data extraction
- [ ] Deep multi-source web research & structured summarization
- [ ] Automated form filling & file downloading

### Level 4 — Personal Assistant & Memory `[NEXT UPGRADE]`
- [ ] Short-term context memory (multi-turn conversation history within session)
- [ ] Task memory (tracking active goals, retry counts, execution context)
- [ ] Long-term user preferences memory (saved custom settings, aliases, default apps)
- [ ] Knowledge memory (explicit facts & notes saved by user)
- [ ] Voice input (Speech-to-Text) & Voice output (Text-to-Speech)

### Level 5 — Coding & Developer Assistant `[PLANNED]`
- [ ] Local filesystem search, read, create, and modify
- [ ] Project understanding & repository indexing
- [ ] Integrated terminal tool execution with safety verification
- [ ] Git commit & GitHub sync capabilities

### Level 6 — Multimodal Assistant `[PLANNED]`
- [x] Web screenshot inspection via Gemini Vision
- [ ] Full-screen OS desktop capture and OCR
- [ ] PDF document reading and summarization
- [ ] Visual error diagnostics

### Level 7 — Autonomous Agent Workflows `[PLANNED]`
- [ ] Compound personal workflows ("Start my coding setup", "Prepare laptop for meeting")
- [ ] Pre-action verification & post-action confirmation
- [ ] Scheduled automations & background recurring jobs

### Level 8 — Personal AI Operating Layer `[PLANNED]`
- [ ] Cross-application workflows (Browser + Desktop Apps + File System + Cloud APIs)
- [ ] Unified conversational OS bridge
- [ ] Continuous learning from user preferences

---

## 📈 Recent Upgrade Log

### Session 1 (August 30, 2026):
- **Feature 1 (System Media & Master Volume Controller):** Built `src/system/mediaController.js` using Windows CoreAudio COM interface for precise scalar volume setting (0–100%) and User32 virtual media key simulation for Play, Pause, Stop, Next, and Previous track control.
- **Feature 2 (Native Windows App Launcher & Manager):** Built `src/system/appLauncher.js` with application alias registry, background process spawning, verification against `Get-Process`, and process termination (`app_close`).
- **Feature 3 (Action Dispatch & Fast Summaries):** Integrated `media_control`, `app_launch`, and `app_close` in `src/executor/actionHandlers.js` and `src/executor/taskRunner.js` with instant zero-latency local summaries.
