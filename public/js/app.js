/**
 * Pilot — Frontend Chat Application & Personal AI Operating Layer
 * Bulletproof, high-speed, conversational multimodal client with Voice & Memory.
 */

import { voice } from './voice.js';

// === State ===
let ws = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 10;
const activePlans = new Map(); // taskId → { steps, element }
let isFirstMessage = true;
let currentStatusEl = null;
let currentMemoryTab = 'facts';

// === DOM Element Selectors ===
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

// === Safe Init ===
function init() {
  connectWebSocket();
  setupEventListeners();
  loadSettings();
  loadTaskHistory();
  autoResizeTextarea();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

// === WebSocket ===
function connectWebSocket() {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  try {
    ws = new WebSocket(`${protocol}//${location.host}`);
  } catch (e) {
    console.error('WebSocket init error:', e);
    return;
  }

  ws.onopen = () => {
    reconnectAttempts = 0;
    updateConnectionStatus('connected', 'Connected');
    console.log('✅ WebSocket connected');
  };

  ws.onclose = () => {
    updateConnectionStatus('disconnected', 'Disconnected');
    attemptReconnect();
  };

  ws.onerror = (err) => {
    console.error('WebSocket error:', err);
    updateConnectionStatus('error', 'Error');
  };

  ws.onmessage = (event) => {
    try {
      const message = JSON.parse(event.data);
      handleServerMessage(message);
    } catch (err) {
      console.error('Failed to parse message:', err);
    }
  };
}

function attemptReconnect() {
  if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    updateConnectionStatus('error', 'Failed to connect');
    return;
  }

  reconnectAttempts++;
  const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 10000);
  updateConnectionStatus('disconnected', `Reconnecting...`);

  setTimeout(() => {
    if (!ws || ws.readyState === WebSocket.CLOSED) {
      connectWebSocket();
    }
  }, delay);
}

function send(data) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  } else {
    console.warn('Cannot send: WebSocket not open');
  }
}

// === Server Message Handler ===
function handleServerMessage(msg) {
  switch (msg.type) {
    case 'status':
      renderStatusMessage(msg.message, msg.status);
      break;

    case 'plan':
      removeStatusMessage();
      renderPlan(msg);
      break;

    case 'step_start':
      updateStepStatus(msg.taskId, msg.stepId, 'running', msg.description);
      break;

    case 'step_complete':
      updateStepStatus(
        msg.taskId,
        msg.stepId,
        'completed',
        msg.description,
        msg.result,
        msg.screenshot
      );
      break;

    case 'step_error':
      updateStepStatus(
        msg.taskId,
        msg.stepId,
        'failed',
        msg.description,
        null,
        null,
        msg.error
      );
      break;

    case 'approval_required':
      removeStatusMessage();
      renderApprovalRequest(msg);
      break;

    case 'open_url':
      if (msg.url) {
        window.open(msg.url, '_blank');
      }
      break;

    case 'task_complete':
      removeStatusMessage();
      if (msg.openUrl) {
        try {
          window.open(msg.openUrl, '_blank');
        } catch {}
      }
      renderTaskSummary(msg);
      break;

    case 'replan_complete':
      removeStatusMessage();
      if (msg.newSteps) {
        appendNewStepsToPlan(msg.taskId, msg.newSteps);
      }
      break;

    case 'browser_status':
      updateBrowserStatus(msg.status);
      break;

    case 'error':
      removeStatusMessage();
      renderErrorMessage(msg.message);
      break;

    case 'settings_updated':
      if (msg.gemini === 'ready') {
        const keyStatus = $('#key-status');
        if (keyStatus) {
          keyStatus.textContent = '✅ API key saved and verified!';
          keyStatus.className = 'setting-status success';
        }
      }
      break;

    default:
      console.log('Server message:', msg);
  }
}

// === Rendering Functions ===

function showMessages() {
  const welcomeScreen = $('#welcome-screen');
  const messagesContainer = $('#messages');
  if (isFirstMessage) {
    isFirstMessage = false;
    if (welcomeScreen) welcomeScreen.style.display = 'none';
    if (messagesContainer) messagesContainer.classList.add('active');
  }
}

function addUserMessage(text) {
  removeStatusMessage();
  showMessages();
  const messagesContainer = $('#messages');
  if (!messagesContainer) return;
  const div = document.createElement('div');
  div.className = 'message user';
  div.innerHTML = `
    <div class="message-body">${escapeHtml(text)}</div>
  `;
  messagesContainer.appendChild(div);
  scrollToBottom();
}

function renderPlan(msg) {
  showMessages();
  const messagesContainer = $('#messages');
  if (!messagesContainer) return;

  let div = msg.taskId ? $(`#msg-${msg.taskId}`) : null;
  if (!div) {
    div = document.createElement('div');
    div.className = 'message agent';
    if (msg.taskId) div.id = `msg-${msg.taskId}`;
    messagesContainer.appendChild(div);
  }

  div.innerHTML = `
    <div class="message-body">
      <div class="message-header">
        <div class="message-avatar">🧭</div>
        <span class="message-sender">Pilot</span>
        <span class="message-time">${formatTime()}</span>
      </div>
      <div class="agent-live-status" id="live-status-${msg.taskId}">
        <div class="spinner"></div>
        <span>${escapeHtml(msg.summary)}</span>
      </div>
    </div>
  `;

  activePlans.set(msg.taskId, {
    steps: msg.steps || [],
    element: div,
  });

  scrollToBottom();
}

function updateStepStatus(taskId, stepId, status, description, result, screenshot, error) {
  const statusEl = $(`#live-status-${taskId}`);
  if (statusEl && description) {
    if (status === 'running') {
      statusEl.innerHTML = `<div class="spinner"></div> <span>${escapeHtml(description)}...</span>`;
    } else if (status === 'completed') {
      statusEl.innerHTML = `<span style="color: var(--success);">✔</span> <span>${escapeHtml(description)}</span>`;
    }
  }
  scrollToBottom();
}

function appendNewStepsToPlan(taskId, newSteps) {
  const statusEl = $(`#live-status-${taskId}`);
  if (statusEl && newSteps.length > 0) {
    statusEl.innerHTML = `<div class="spinner"></div> <span>${escapeHtml(newSteps[0].description)}...</span>`;
  }
  scrollToBottom();
}

function renderApprovalRequest(msg) {
  removeStatusMessage();
  const messagesContainer = $('#messages');
  if (!messagesContainer) return;
  const div = document.createElement('div');
  div.className = 'message agent';
  div.id = `approval-${msg.taskId}-${msg.stepId}`;

  div.innerHTML = `
    <div class="message-body">
      <div class="message-header">
        <div class="message-avatar">🧭</div>
        <span class="message-sender">Pilot</span>
        <span class="message-time">${formatTime()}</span>
      </div>
      <div class="agent-output">${escapeHtml(msg.description)}</div>
    </div>
  `;

  messagesContainer.appendChild(div);
  scrollToBottom();
}

function streamMarkdownToElement(targetEl, fullMarkdown, onComplete) {
  if (!fullMarkdown) {
    targetEl.innerHTML = '';
    if (onComplete) onComplete();
    return;
  }

  // Tokenize text into words / punctuation chunks
  const tokens = fullMarkdown.match(/\s+|\S+/g) || [fullMarkdown];
  let currentIndex = 0;
  let accumulatedText = '';
  const delayMs = 18; // ~20ms per token - smooth balanced natural speed

  function renderNext() {
    const batch = Math.min(tokens.length - currentIndex, 1);
    for (let i = 0; i < batch; i++) {
      accumulatedText += tokens[currentIndex++];
    }

    const currentHtml = markdownToHtml(accumulatedText);
    targetEl.innerHTML = currentHtml + '<span class="typing-cursor"></span>';
    scrollToBottom();

    if (currentIndex < tokens.length) {
      setTimeout(renderNext, delayMs);
    } else {
      // Completed - remove cursor and render final markdown
      targetEl.innerHTML = markdownToHtml(fullMarkdown);
      scrollToBottom();
      if (onComplete) onComplete();
    }
  }

  renderNext();
}

function renderTaskSummary(msg) {
  removeStatusMessage();
  const messagesContainer = $('#messages');
  if (!messagesContainer) return;

  let div = msg.taskId ? $(`#msg-${msg.taskId}`) : null;
  if (!div) {
    div = document.createElement('div');
    div.className = 'message agent';
    if (msg.taskId) div.id = `msg-${msg.taskId}`;
    messagesContainer.appendChild(div);
  }

  if (!msg.fileMeta && msg.summary) {
    const fileMatch = msg.summary.match(/`([a-zA-Z0-9_.-]+\.(?:md|txt|json|csv|py|js|html|css|log|env))`/) ||
                      msg.summary.match(/([a-zA-Z0-9_.-]+\.(?:md|txt|json|csv|py|js|html|css|log|env))/);
    if (fileMatch) {
      const fileName = fileMatch[1];
      msg.fileMeta = {
        filePath: fileName,
        name: fileName,
        content: msg.summary.replace(/^📝[\s\S]*?`\s*—\s*.*?\n\n/i, '').replace(/^📄[\s\S]*?\n\n```(?:\w+)?\n([\s\S]*?)\n```$/i, '$1').trim(),
      };
    }
  }

  const hasFile = !!(msg.fileMeta && msg.fileMeta.filePath);
  const editBtnHtml = hasFile ? `
    <div class="message-actions-group">
      <button class="btn-download-file" data-file="${escapeHtml(msg.fileMeta.filePath)}" title="Download file to computer">
        📥 Download
      </button>
      <button class="btn-edit-file" data-file="${escapeHtml(msg.fileMeta.filePath)}" title="Edit file content directly">
        ✏️ Edit File
      </button>
    </div>
  ` : '';

  const isFocusMode = !!(msg.focusWidget || (msg.summary && (msg.summary.includes('Focus Space Activated') || msg.summary.includes('Focus Mode Active'))));

  div.innerHTML = `
    <div class="message-body">
      <div class="message-header">
        <div class="message-sender-group">
          <div class="message-avatar">🧭</div>
          <span class="message-sender">Pilot</span>
          <span class="message-time">${formatTime()}</span>
        </div>
        ${editBtnHtml}
      </div>
      <div class="agent-output" id="output-${msg.taskId || 'latest'}"></div>
      ${isFocusMode ? `
        <div class="focus-timer-widget">
          <div class="focus-timer-display">
            <div class="focus-timer-circle">
              <span class="focus-time-text" id="timer-display-${msg.taskId || 'focus'}">25:00</span>
              <span class="focus-mode-label">POMODORO FOCUS</span>
            </div>
          </div>
          <div class="focus-timer-controls">
            <button class="btn-timer-action btn-timer-start" id="btn-timer-toggle-${msg.taskId || 'focus'}">▶ Start</button>
            <button class="btn-timer-action btn-timer-reset" id="btn-timer-reset-${msg.taskId || 'focus'}">🔄 Reset</button>
            <button class="btn-timer-action btn-timer-adjust" id="btn-timer-plus-${msg.taskId || 'focus'}">+5 min</button>
          </div>
          <div class="focus-scratchpad-container">
            <div class="focus-scratchpad-header">
              <span>📝 <strong>Focus Scratchpad</strong></span>
              <span class="focus-scratchpad-hint">Type session goals and thoughts</span>
            </div>
            <textarea class="focus-scratchpad-textarea" placeholder="• Focus Goal 1: Build AI Personal OS&#10;• Focus Goal 2: Refine voice & workflows..."></textarea>
            <div class="focus-scratchpad-actions">
              <button class="btn-save-scratchpad">💾 Save to focus_notes.md</button>
              <span class="scratchpad-save-status"></span>
            </div>
          </div>
        </div>
      ` : ''}
      ${hasFile ? `
        <div class="file-editor-container" style="display: none;">
          <div class="file-editor-bar">
            <span class="file-editor-name">📄 <strong>${escapeHtml(msg.fileMeta.name || 'file')}</strong></span>
            <span class="file-editor-hint">Edit and save directly to disk</span>
          </div>
          <textarea class="file-editor-textarea" rows="12">${escapeHtml(msg.fileMeta.content || '')}</textarea>
          <div class="file-editor-actions">
            <button class="btn-save-file">💾 Save Changes (Ctrl+S)</button>
            <button class="btn-cancel-file">Cancel</button>
            <span class="file-save-status"></span>
          </div>
        </div>
      ` : ''}
    </div>
  `;

  if (isFocusMode) {
    const timerDisplay = div.querySelector(`#timer-display-${msg.taskId || 'focus'}`);
    const toggleBtn = div.querySelector(`#btn-timer-toggle-${msg.taskId || 'focus'}`);
    const resetBtn = div.querySelector(`#btn-timer-reset-${msg.taskId || 'focus'}`);
    const plusBtn = div.querySelector(`#btn-timer-plus-${msg.taskId || 'focus'}`);
    const scratchpad = div.querySelector('.focus-scratchpad-textarea');
    const saveScratchBtn = div.querySelector('.btn-save-scratchpad');
    const statusScratch = div.querySelector('.scratchpad-save-status');

    let totalSeconds = 25 * 60;
    let timerInterval = null;
    let isRunning = false;

    const updateDisplay = () => {
      const mins = Math.floor(totalSeconds / 60);
      const secs = totalSeconds % 60;
      if (timerDisplay) {
        timerDisplay.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
      }
    };

    if (toggleBtn) {
      toggleBtn.addEventListener('click', () => {
        if (isRunning) {
          clearInterval(timerInterval);
          isRunning = false;
          toggleBtn.textContent = '▶ Start';
          toggleBtn.classList.remove('active');
        } else {
          isRunning = true;
          toggleBtn.textContent = '⏸ Pause';
          toggleBtn.classList.add('active');
          timerInterval = setInterval(() => {
            if (totalSeconds > 0) {
              totalSeconds--;
              updateDisplay();
            } else {
              clearInterval(timerInterval);
              isRunning = false;
              toggleBtn.textContent = '🎉 Done!';
              toggleBtn.classList.remove('active');
              voice.speak('Focus session completed. Great work!');
            }
          }, 1000);
        }
      });
    }

    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        clearInterval(timerInterval);
        isRunning = false;
        totalSeconds = 25 * 60;
        updateDisplay();
        if (toggleBtn) {
          toggleBtn.textContent = '▶ Start';
          toggleBtn.classList.remove('active');
        }
      });
    }

    if (plusBtn) {
      plusBtn.addEventListener('click', () => {
        totalSeconds += 5 * 60;
        updateDisplay();
      });
    }

    if (saveScratchBtn && scratchpad) {
      saveScratchBtn.addEventListener('click', async () => {
        const text = scratchpad.value;
        if (!text.trim()) return;
        saveScratchBtn.disabled = true;
        saveScratchBtn.textContent = '⏳ Saving...';
        try {
          const res = await fetch('/api/files/save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filePath: 'focus_notes.md', content: text }),
          });
          const data = await res.json();
          if (data.success) {
            statusScratch.textContent = '✅ Saved to focus_notes.md!';
            setTimeout(() => { statusScratch.textContent = ''; }, 2500);
          }
        } catch (e) {
          statusScratch.textContent = '❌ Error saving';
        } finally {
          saveScratchBtn.disabled = false;
          saveScratchBtn.textContent = '💾 Save to focus_notes.md';
        }
      });
    }
  }

  if (hasFile) {
    const editBtn = div.querySelector('.btn-edit-file');
    const downloadBtn = div.querySelector('.btn-download-file');
    const editorContainer = div.querySelector('.file-editor-container');
    const outputEl = div.querySelector('.agent-output');
    const textarea = div.querySelector('.file-editor-textarea');
    const saveBtn = div.querySelector('.btn-save-file');
    const cancelBtn = div.querySelector('.btn-cancel-file');
    const statusEl = div.querySelector('.file-save-status');

    if (downloadBtn) {
      downloadBtn.addEventListener('click', () => {
        const content = msg.fileMeta.content || '';
        const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = msg.fileMeta.name || 'document.md';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      });
    }

    if (editBtn && editorContainer) {
      editBtn.addEventListener('click', () => {
        const isEditing = editorContainer.style.display !== 'none';
        if (isEditing) {
          editorContainer.style.display = 'none';
          outputEl.style.display = 'block';
          editBtn.innerHTML = '✏️ Edit File';
        } else {
          editorContainer.style.display = 'block';
          outputEl.style.display = 'none';
          editBtn.innerHTML = '👁️ Preview';
          textarea.focus();
        }
      });
    }

    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => {
        editorContainer.style.display = 'none';
        outputEl.style.display = 'block';
        if (editBtn) editBtn.innerHTML = '✏️ Edit File';
      });
    }

    if (saveBtn) {
      const handleSave = async () => {
        const newContent = textarea.value;
        saveBtn.disabled = true;
        saveBtn.textContent = '⏳ Saving...';
        statusEl.textContent = '';

        try {
          const res = await fetch('/api/files/save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filePath: msg.fileMeta.filePath, content: newContent }),
          });
          const data = await res.json();
          if (data.success) {
            statusEl.innerHTML = `✅ Saved to <strong>${escapeHtml(msg.fileMeta.name)}</strong> (${data.size || 'updated'})!`;
            statusEl.className = 'file-save-status success';
            msg.fileMeta.content = newContent;
            outputEl.innerHTML = markdownToHtml(`📝 **Saved:** \`${msg.fileMeta.name}\`\n\n${newContent}`);
            setTimeout(() => {
              editorContainer.style.display = 'none';
              outputEl.style.display = 'block';
              if (editBtn) editBtn.innerHTML = '✏️ Edit File';
            }, 1200);
          } else {
            statusEl.textContent = `❌ Error: ${data.error || 'Save failed'}`;
            statusEl.className = 'file-save-status error';
          }
        } catch (err) {
          statusEl.textContent = `❌ Error: ${err.message}`;
          statusEl.className = 'file-save-status error';
        } finally {
          saveBtn.disabled = false;
          saveBtn.textContent = '💾 Save Changes (Ctrl+S)';
        }
      };

      saveBtn.addEventListener('click', handleSave);
      textarea.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 's') {
          e.preventDefault();
          handleSave();
        }
      });
    }
  }

  const outputEl = div.querySelector('.agent-output');
  streamMarkdownToElement(outputEl, msg.summary || 'Completed.', () => {
    loadTaskHistory();
    if (msg.summary) {
      voice.speak(msg.summary);
    }
  });

  scrollToBottom();
}

function removeStatusMessage() {
  if (currentStatusEl) {
    currentStatusEl.remove();
    currentStatusEl = null;
  }
}

function renderStatusMessage(text, type = 'status') {
  removeStatusMessage();
  showMessages();
  const messagesContainer = $('#messages');
  if (!messagesContainer) return;

  const div = document.createElement('div');
  div.className = 'message system-status';
  div.innerHTML = `
    <div class="status-pill">
      <div class="spinner"></div>
      <span>${escapeHtml(text)}</span>
    </div>
  `;

  currentStatusEl = div;
  messagesContainer.appendChild(div);
  scrollToBottom();
}

function renderErrorMessage(text) {
  showMessages();
  const messagesContainer = $('#messages');
  if (!messagesContainer) return;
  const div = document.createElement('div');
  div.className = 'message agent';
  div.innerHTML = `
    <div class="message-body">
      <div class="message-header">
        <div class="message-avatar">🧭</div>
        <span class="message-sender">Pilot</span>
        <span class="message-time">${formatTime()}</span>
      </div>
      <div class="agent-error">❌ ${escapeHtml(text)}</div>
    </div>
  `;
  messagesContainer.appendChild(div);
  scrollToBottom();
}

// === Event Listeners ===
function setupEventListeners() {
  const sendBtn = $('#btn-send');
  const commandInput = $('#command-input');
  const settingsModal = $('#settings-modal');
  const memoryModal = $('#memory-modal');
  const sidebar = $('#sidebar');
  const micBtn = $('#btn-mic');
  const voiceToggleBtn = $('#btn-voice-toggle');

  // Voice Input (Speech-to-Text)
  micBtn?.addEventListener('click', () => {
    voice.toggleListening(
      (transcript, isFinal) => {
        if (commandInput) {
          commandInput.value = transcript;
          commandInput.style.height = 'auto';
          commandInput.style.height = Math.min(commandInput.scrollHeight, 120) + 'px';
          if (isFinal) {
            sendCommand();
          }
        }
      },
      (status) => {
        if (status === 'listening') {
          micBtn.classList.add('recording');
          micBtn.title = 'Listening... Speak now!';
        } else {
          micBtn.classList.remove('recording');
          micBtn.title = 'Voice Input (Speech-to-Text)';
        }
      }
    );
  });

  // Voice Response (TTS) Toggle
  voiceToggleBtn?.addEventListener('click', () => {
    const enabled = voice.toggleTTS();
    voiceToggleBtn.classList.toggle('active', enabled);
    voiceToggleBtn.title = enabled ? 'Voice Responses Enabled' : 'Voice Responses Disabled';
  });

  // Memory Modal
  $('#btn-memory')?.addEventListener('click', () => {
    memoryModal?.classList.remove('hidden');
    loadMemoryData();
  });
  $('#btn-close-memory')?.addEventListener('click', () => memoryModal?.classList.add('hidden'));

  // Memory Tabs
  $('#tab-facts')?.addEventListener('click', () => {
    currentMemoryTab = 'facts';
    $('#tab-facts')?.classList.add('active');
    $('#tab-history')?.classList.remove('active');
    renderMemoryTab();
  });
  $('#tab-history')?.addEventListener('click', () => {
    currentMemoryTab = 'history';
    $('#tab-history')?.classList.add('active');
    $('#tab-facts')?.classList.remove('active');
    renderMemoryTab();
  });

  // Send button click
  sendBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    sendCommand();
  });

  // Enter key in textarea
  commandInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendCommand();
    }
  });

  // Example buttons
  $$('.example-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (commandInput) commandInput.value = btn.dataset.command;
      sendCommand();
    });
  });

  // Quick action chip buttons
  $$('.chip-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const cmd = btn.getAttribute('data-cmd');
      if (commandInput && cmd) {
        commandInput.value = cmd;
        sendCommand();
      }
    });
  });

  // Settings modal
  $('#btn-settings')?.addEventListener('click', () => settingsModal?.classList.remove('hidden'));
  $('#btn-close-settings')?.addEventListener('click', () => settingsModal?.classList.add('hidden'));
  $('.modal-overlay')?.addEventListener('click', () => {
    settingsModal?.classList.add('hidden');
    memoryModal?.classList.add('hidden');
  });

  // API key save
  $('#btn-save-key')?.addEventListener('click', saveApiKey);

  // Headless toggle
  $('#headless-toggle')?.addEventListener('change', (e) => {
    fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ headless: e.target.checked }),
    });
  });

  // Sidebar
  $('#btn-history')?.addEventListener('click', () => {
    sidebar?.classList.toggle('hidden');
    loadTaskHistory();
  });
  $('#btn-close-sidebar')?.addEventListener('click', () => sidebar?.classList.add('hidden'));

  // Lightbox
  $('#btn-close-lightbox')?.addEventListener('click', closeLightbox);
  $('.lightbox-overlay')?.addEventListener('click', closeLightbox);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeLightbox();
      settingsModal?.classList.add('hidden');
      memoryModal?.classList.add('hidden');
    }
  });
}

function sendCommand() {
  const commandInput = $('#command-input');
  if (!commandInput) return;
  const text = commandInput.value.trim();
  if (!text) return;

  addUserMessage(text);
  send({ type: 'command', text });
  commandInput.value = '';
  commandInput.style.height = 'auto';
  commandInput.focus();
}

// === Memory Inspector Data ===
let cachedMemoryData = { facts: [], inputs: [] };

async function loadMemoryData() {
  const container = $('#memory-tab-content');
  if (container) container.innerHTML = '<p class="setting-desc">Loading personal memory...</p>';
  try {
    const res = await fetch('/api/memory');
    cachedMemoryData = await res.json();
    renderMemoryTab();
  } catch (err) {
    if (container) container.innerHTML = `<p class="setting-desc" style="color: var(--error);">Error loading memory: ${err.message}</p>`;
  }
}

function renderMemoryTab() {
  const container = $('#memory-tab-content');
  if (!container) return;

  if (currentMemoryTab === 'facts') {
    const facts = cachedMemoryData.facts || [];
    if (facts.length === 0) {
      container.innerHTML = '<p class="setting-desc">No saved facts yet. Tell Pilot: "Remember that my name is Sai".</p>';
      return;
    }
    container.innerHTML = `
      <div class="memory-list">
        ${facts.map(f => `
          <div class="memory-card">
            <div class="memory-card-header">
              <span class="memory-key">${escapeHtml(f.key)}</span>
              <span class="memory-time">${formatDate(f.updated_at)}</span>
            </div>
            <div class="memory-val">${escapeHtml(f.content)}</div>
          </div>
        `).join('')}
      </div>
    `;
  } else {
    const inputs = cachedMemoryData.inputs || [];
    if (inputs.length === 0) {
      container.innerHTML = '<p class="setting-desc">No input history yet.</p>';
      return;
    }
    container.innerHTML = `
      <div class="memory-list">
        ${inputs.map(i => `
          <div class="memory-card">
            <div class="memory-val">${escapeHtml(i.text)}</div>
            <div class="memory-time">${formatDate(i.created_at)}</div>
          </div>
        `).join('')}
      </div>
    `;
  }
}

// === Settings ===
async function loadSettings() {
  try {
    const res = await fetch('/api/settings');
    const settings = await res.json();

    if (settings.hasApiKey) {
      const keyStatus = $('#key-status');
      if (keyStatus) {
        keyStatus.textContent = '✅ API key configured';
        keyStatus.className = 'setting-status success';
      }
    }

    const toggle = $('#headless-toggle');
    if (toggle) toggle.checked = !!settings.headless;
  } catch (err) {
    console.error('Failed to load settings:', err);
  }
}

function saveApiKey() {
  const keyInput = $('#api-key-input');
  if (!keyInput) return;
  const key = keyInput.value.trim();
  if (!key) return;

  send({ type: 'set_api_key', apiKey: key });

  const keyStatus = $('#key-status');
  if (keyStatus) {
    keyStatus.textContent = '⏳ Saving...';
    keyStatus.className = 'setting-status';
    setTimeout(() => {
      keyStatus.textContent = '✅ API key saved!';
      keyStatus.className = 'setting-status success';
    }, 500);
  }

  keyInput.value = '';
}

// === Task History ===
async function loadTaskHistory() {
  const taskList = $('#task-list');
  if (!taskList) return;

  try {
    const res = await fetch('/api/tasks');
    const { tasks } = await res.json();

    taskList.innerHTML = (!tasks || tasks.length === 0)
      ? '<div style="padding: 20px; text-align: center; color: var(--text-tertiary); font-size: 13px;">No tasks yet. Type a command to get started!</div>'
      : tasks.map(task => `
          <div class="task-item" onclick="loadTaskDetail('${task.id}')">
            <div class="task-item-command">${escapeHtml(task.command)}</div>
            <div class="task-item-meta">
              <span class="task-status-badge ${task.status}">${task.status}</span>
              <span>${formatDate(task.created_at)}</span>
            </div>
          </div>
        `).join('');
  } catch (err) {
    console.error('Failed to load task history:', err);
  }
}

window.loadTaskDetail = async function(taskId) {
  try {
    const res = await fetch(`/api/tasks/${taskId}`);
    const { task } = await res.json();
    if (!task) return;

    showMessages();
    addUserMessage(task.command);

    if (task.ai_summary) {
      renderTaskSummary({
        summary: task.ai_summary,
        stepsCompleted: task.steps?.filter(s => s.status === 'completed').length || 0,
        totalSteps: task.steps?.length || 0,
      });
    }
  } catch (err) {
    console.error('Failed to load task detail:', err);
  }
};

// === Lightbox ===
function openLightbox(src) {
  const lightbox = $('#lightbox');
  const lightboxImg = $('#lightbox-img');
  if (lightboxImg) lightboxImg.src = src;
  if (lightbox) lightbox.classList.remove('hidden');
}

function closeLightbox() {
  const lightbox = $('#lightbox');
  const lightboxImg = $('#lightbox-img');
  if (lightbox) lightbox.classList.add('hidden');
  if (lightboxImg) lightboxImg.src = '';
}

// === UI Helpers ===
function updateConnectionStatus(status, text) {
  const connectionStatus = $('#connection-status');
  if (!connectionStatus) return;
  const dot = connectionStatus.querySelector('.status-dot');
  const label = connectionStatus.querySelector('.status-text');
  if (dot) dot.className = `status-dot ${status === 'connected' ? 'connected' : status === 'error' ? 'error' : ''}`;
  if (label) label.textContent = text;
}

function updateBrowserStatus(status) {
  const browserStatus = $('#browser-status');
  if (!browserStatus) return;
  const dot = browserStatus.querySelector('.browser-dot');
  const label = browserStatus.querySelector('.browser-label');

  if (dot && label) {
    if (status === 'open' || status === 'launching') {
      dot.classList.add('active');
      label.textContent = status === 'launching' ? 'Browser: Launching...' : 'Browser: Active';
    } else {
      dot.classList.remove('active');
      label.textContent = 'AI Ready';
    }
  }
}

function scrollToBottom() {
  const messagesContainer = $('#messages');
  if (!messagesContainer) return;
  requestAnimationFrame(() => {
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  });
}

function autoResizeTextarea() {
  const commandInput = $('#command-input');
  if (!commandInput) return;
  commandInput.addEventListener('input', () => {
    commandInput.style.height = 'auto';
    commandInput.style.height = Math.min(commandInput.scrollHeight, 120) + 'px';
  });
}

// === Utilities ===
function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function formatTime() {
  return new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

function formatDate(isoStr) {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  const now = new Date();
  const diff = now - d;

  if (diff < 60000) return 'Just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  if (diff < 172800000) return 'Yesterday';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function markdownToHtml(md) {
  if (!md) return '';
  let html = escapeHtml(md);

  html = html.replace(/```(?:[a-zA-Z]*)\n([\s\S]*?)```/g, '<pre><code>$1</code></pre>');
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  html = html.replace(/^[*-] (.+)$/gm, '<li>$1</li>');
  html = html.replace(/(<li>.*<\/li>\n?)+/gs, '<ul>$&</ul>');
  html = html.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');

  html = html.replace(/\|(.+)\|/g, (match) => {
    const cells = match.split('|').filter(c => c.trim());
    if (cells.every(c => /^[-:]+$/.test(c.trim()))) return '';
    const tag = html.indexOf(match) < html.indexOf('\n') ? 'th' : 'td';
    const row = cells.map(c => `<${tag}>${c.trim()}</${tag}>`).join('');
    return `<tr>${row}</tr>`;
  });
  if (html.includes('<tr>')) {
    html = html.replace(/(<tr>.*<\/tr>\n?)+/gs, '<table>$&</table>');
  }

  html = html.replace(/\n\n/g, '</p><p>');
  html = html.replace(/\n/g, '<br>');
  html = html.replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" target="_blank">$1</a>');

  return `<p>${html}</p>`;
}
