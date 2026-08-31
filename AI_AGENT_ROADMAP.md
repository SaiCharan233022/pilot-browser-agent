# 🧭 PILOT — PERSONAL AI AGENT ROADMAP

> **Personal Autonomous Multimodal AI Operating Layer**
> **Vision:** `UNDERSTAND → REASON → PLAN → USE TOOLS → CONTROL COMPUTER → OBSERVE → VERIFY → LEARN FROM CONTEXT → COMPLETE TASK`

---

## 📊 Project Status Tracker

- **Current Level:** **Level 6 — Multimodal & Personal AI Operating Layer `[COMPLETED & OPERATIONAL]`**
- **Primary Model Provider:** Google Gemini API (`gemini-3.5-flash-lite`, `gemini-3.6-flash`, `gemini-3.5-flash`)
- **Execution Architecture:** Node.js + Express + WebSocket + Playwright Multi-Tab Engine + Windows OS Automation Bridge (CoreAudio + Virtual Media Keys + Process Controller) + Safe Filesystem Engine + Terminal Sandbox + PDF Stream Extractor + Screen Vision Perception
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
- [x] Deep multi-source web research & structured summarization

### Level 4 — Personal Assistant & Memory `[COMPLETED]`
- [x] Short-term context memory (multi-turn conversation turns persisted in SQLite `conversation_turns`)
- [x] Continuous unbroken input history logging & search (`show my input history`, `what did I ask earlier?`)
- [x] Contextual target tracking (`last_target`, `last_intent`, `last_url` in SQLite `agent_memory`)
- [x] Windows Media & Audio Session Status Query (`media_status` via WinRT GSMTC & CoreAudio)
- [x] Long-term user preferences & knowledge memory (`user_knowledge` table in SQLite with `remember_fact`, `recall_knowledge`, `forget_fact`)
- [x] UI Speech-to-Text (STT) voice input with mic animation
- [x] UI Text-to-Speech (TTS) natural voice readout synthesis for responses
- [x] Interactive Personal Memory & Knowledge Inspector Modal

### Level 5 — Coding & Developer Assistant `[COMPLETED]`
- [x] Safe local filesystem intelligence (`file_search`, `file_read`, `file_list` in `src/system/fileExplorer.js`)
- [x] Safe terminal & script execution sandbox (`terminal_command` in `src/system/terminalRunner.js`)
- [x] Blocklist-protected destructive command filters (`rm -rf`, `format`, `del /s`)
- [x] Code block syntax formatting in chat UI

### Level 6 — Multimodal Assistant `[COMPLETED]`
- [x] Full-screen OS desktop & viewport screenshot capture (`src/perception/screenCapture.js`)
- [x] Multimodal screen inspection & visual reasoning via Gemini Vision (`desktop_screen_inspect`)
- [x] PDF document text stream extraction & reading (`pdf_read` in `src/system/pdfExtractor.js`)

### Level 7 — Autonomous Agent Workflows `[OPERATIONAL]`
- [x] Compound personal workflows ("Open Spotify and play music", "Open notepad and type...")
- [x] Pre-action verification & post-action confirmation
- [x] Multi-turn memory preservation across system restarts

---

## 📈 Recent Upgrade Log

### Session 4 (August 31, 2026):
- **Feature 1 (Desktop Vision & Screen Perception):** Built `src/perception/screenCapture.js` and `captureDesktop.ps1` with Gemini Vision screen analysis (`desktop_screen_inspect`).
- **Feature 2 (Safe Terminal & Code Sandbox):** Built `src/system/terminalRunner.js` with command execution, timeout protection, and destructive command filtering (`terminal_command`).
- **Feature 3 (PDF Document Text Engine):** Built `src/system/pdfExtractor.js` with fast PDF parsing and extraction (`pdf_read`).
- **Feature 4 (Continuous Input History):** Built automatic unbroken input recording and instant recall (`history_query`).
- **Feature 5 (Voice STT & TTS Layer):** Built `public/js/voice.js` with Web Speech recognition, microphone pulse visualizer, and response speech synthesis.
- **Feature 6 (Memory Inspector Drawer):** Added interactive UI modal to inspect stored knowledge facts and browse recent inputs.
- **Feature 7 (100% Master Test Suite):** 13/13 test cases passed across all system, memory, file, terminal, and browser capabilities.
