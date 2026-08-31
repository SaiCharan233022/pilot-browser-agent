# 🧭 PILOT — PERSONAL AI AGENT ROADMAP

> **Personal Autonomous Multimodal AI Operating Layer**
> **Vision:** `UNDERSTAND → REASON → PLAN → USE TOOLS → CONTROL COMPUTER → OBSERVE → VERIFY → LEARN FROM CONTEXT → COMPLETE TASK`

---

## 📊 Project Status Tracker

- **Current Level:** **Level 4 — Personal Assistant & Memory (Completed) & Transitioning to Level 5 (Coding & Developer Assistant)**
- **Primary Model Provider:** Google Gemini API (`gemini-3.5-flash-lite`, `gemini-3.6-flash`, `gemini-3.5-flash`)
- **Execution Architecture:** Node.js + Express + WebSocket + Playwright Multi-Tab Engine + Windows OS Automation Bridge (CoreAudio + Virtual Media Keys + Process Controller) + Safe Filesystem Engine
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

### Level 4 — Personal Assistant & Memory `[COMPLETED]`
- [x] Short-term context memory (multi-turn conversation turns persisted in SQLite `conversation_turns`)
- [x] Contextual target tracking (`last_target`, `last_intent`, `last_url` in SQLite `agent_memory`)
- [x] Windows Media & Audio Session Status Query (`media_status` via WinRT GSMTC & CoreAudio)
- [x] Long-term user preferences & knowledge memory (`user_knowledge` table in SQLite with `remember_fact`, `recall_knowledge`, `forget_fact`)
- [ ] Voice input (Speech-to-Text) & Voice output (Text-to-Speech)

### Level 5 — Coding & Developer Assistant `[IN PROGRESS]`
- [x] Safe local filesystem intelligence (`file_search`, `file_read`, `file_list` in `src/system/fileExplorer.js`)
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
- **Feature 1 (System Media & Master Volume Controller):** Built `src/system/mediaController.js` using Windows CoreAudio COM interface for volume (0–100%) and virtual media keys.
- **Feature 2 (Native Windows App Launcher & Manager):** Built `src/system/appLauncher.js` with alias registry, process verification, and `app_close`.
- **Feature 3 (Action Dispatch & Fast Summaries):** Integrated `media_control`, `app_launch`, and `app_close` in `src/executor/actionHandlers.js`.

### Session 2 (August 31, 2026):
- **Feature 1 (Real-Time Windows Media & Audio Session Status):** Added `getMediaStatus()` querying WinRT GSMTC + active audio processes.
- **Feature 2 (Contextual Multi-Turn Memory Layer):** Built `src/storage/memory.js` with SQLite tables `agent_memory` and `conversation_turns`.
- **Feature 3 (Regression & Additive Verification):** Full 11-step regression confirming 100% pass across media control, volume, laptop app launching, contextual app termination, and universal website opening.

### Session 3 (August 31, 2026):
- **Feature 1 (Long-Term Knowledge & User Preferences Memory):** Created `user_knowledge` SQLite table with full lifecycle actions (`remember_fact`, `recall_knowledge`, `forget_fact`) in `src/storage/memory.js`.
- **Feature 2 (Safe Local Filesystem Explorer):** Built `src/system/fileExplorer.js` with recursive pattern/wildcard searching (`file_search`), safe capped file reading (`file_read`), and directory inspection (`file_list`).
- **Feature 3 (Full Regression & Verification):** 13/13 automated test cases passed (100%), confirming zero regressions across existing capabilities.
