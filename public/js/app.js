/**
 * Pilot — Frontend Chat Application
 * Handles WebSocket communication, message rendering, and all UI interactions.
 */

// === State ===
let ws = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 10;
const activePlans = new Map(); // taskId → { steps, element }
let isFirstMessage = true;

// === DOM Elements ===
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const messagesContainer = $('#messages');
const welcomeScreen = $('#welcome-screen');
const commandInput = $('#command-input');
const sendBtn = $('#btn-send');
const settingsModal = $('#settings-modal');
const lightbox = $('#lightbox');
const lightboxImg = $('#lightbox-img');
const sidebar = $('#sidebar');
const taskList = $('#task-list');
const connectionStatus = $('#connection-status');
const browserStatus = $('#browser-status');

// === Init ===
document.addEventListener('DOMContentLoaded', () => {
  connectWebSocket();
  setupEventListeners();
  loadSettings();
  loadTaskHistory();
  autoResizeTextarea();
});

// === WebSocket ===
function connectWebSocket() {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  ws = new WebSocket(`${protocol}//${location.host}`);

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
  const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000);
  updateConnectionStatus('disconnected', `Reconnecting (${reconnectAttempts})...`);

  setTimeout(() => {
    if (!ws || ws.readyState === WebSocket.CLOSED) {
      connectWebSocket();
    }
  }, delay);
}

function send(message) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
  }
}

// === Message Handling ===
function handleServerMessage(msg) {
  switch (msg.type) {
    case 'connected':
      updateBrowserStatus(msg.browser);
      if (msg.gemini !== 'ready') {
        showSetupPrompt();
      }
      break;

    case 'plan':
      removeStatusMessage();
      showMessages();
      renderPlan(msg);
      break;

    case 'step_start':
      removeStatusMessage();
      updateStepStatus(msg.taskId, msg.stepId, 'running', msg.description);
      break;

    case 'step_complete':
      updateStepStatus(msg.taskId, msg.stepId, 'completed', null, msg.result, msg.screenshot);
      break;

    case 'step_error':
      updateStepStatus(msg.taskId, msg.stepId, 'failed', null, null, msg.screenshot, msg.error);
      break;

    case 'step_skipped':
      updateStepStatus(msg.taskId, msg.stepId, 'skipped');
      break;

    case 'approval_required':
      removeStatusMessage();
      renderApprovalRequest(msg);
      break;

    case 'task_complete':
      removeStatusMessage();
      renderTaskSummary(msg);
      loadTaskHistory();
      break;

    case 'status':
      renderStatusMessage(msg.message, msg.status);
      break;

    case 'replanning':
      renderStatusMessage(`🔄 Re-planning: ${msg.reason}`, 'replanning');
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

    case 'approval_timeout':
      renderStatusMessage(`⏰ ${msg.message}`, 'warning');
      break;

    default:
      console.log('Unhandled message:', msg);
  }
}

// === Rendering Functions ===

function showMessages() {
  if (isFirstMessage) {
    isFirstMessage = false;
    welcomeScreen.style.display = 'none';
    messagesContainer.classList.add('active');
  }
}

function addUserMessage(text) {
  removeStatusMessage();
  showMessages();
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
        <div class="spinner"></div> <span>${escapeHtml(msg.summary || 'Executing task...')}</span>
      </div>
    </div>
  `;

  activePlans.set(msg.taskId, { steps: msg.steps, element: div });
  scrollToBottom();
}

function updateStepStatus(taskId, stepId, status, description, result, screenshot, error) {
  const statusEl = $(`#live-status-${taskId}`);
  if (statusEl && description) {
    statusEl.innerHTML = `<div class="spinner"></div> <span>${escapeHtml(description)}...</span>`;
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

function renderTaskSummary(msg) {
  removeStatusMessage();
  let div = msg.taskId ? $(`#msg-${msg.taskId}`) : null;
  if (!div) {
    div = document.createElement('div');
    div.className = 'message agent';
    if (msg.taskId) div.id = `msg-${msg.taskId}`;
    messagesContainer.appendChild(div);
  }

  // Convert markdown-like formatting to HTML
  const summaryHtml = markdownToHtml(msg.summary || 'Completed.');

  div.innerHTML = `
    <div class="message-body">
      <div class="message-header">
        <div class="message-avatar">🧭</div>
        <span class="message-sender">Pilot</span>
        <span class="message-time">${formatTime()}</span>
      </div>
      <div class="agent-output">${summaryHtml}</div>
    </div>
  `;

  scrollToBottom();
}
  scrollToBottom();
}

let currentStatusEl = null;

function removeStatusMessage() {
  if (currentStatusEl && currentStatusEl.parentNode) {
    currentStatusEl.remove();
  }
  currentStatusEl = null;
  const orphans = messagesContainer.querySelectorAll('.status-message');
  orphans.forEach(el => el.remove());
}

function renderStatusMessage(text, status) {
  removeStatusMessage();
  const div = document.createElement('div');
  div.className = 'status-message';
  if (status === 'planning' || status === 'summarizing' || status === 'replanning') {
    div.innerHTML = `<div class="spinner"></div> ${escapeHtml(text)}`;
  } else {
    div.textContent = text;
  }
  currentStatusEl = div;
  messagesContainer.appendChild(div);
  scrollToBottom();
}

function renderErrorMessage(text) {
  showMessages();
  const div = document.createElement('div');
  div.className = 'message agent';
  div.innerHTML = `
    <div class="message-body">
      <div class="error-card">
        <div class="error-header">❌ Error</div>
        <div class="error-body">${escapeHtml(text)}</div>
      </div>
    </div>
  `;
  messagesContainer.appendChild(div);
  scrollToBottom();
}

function showSetupPrompt() {
  showMessages();
  const div = document.createElement('div');
  div.className = 'message agent';
  div.innerHTML = `
    <div class="message-body">
      <div class="message-header">
        <div class="message-avatar">🧭</div>
        <span class="message-sender">Pilot</span>
      </div>
      <p style="margin-bottom: var(--space-md); color: var(--text-secondary);">
        Welcome! Before we get started, I need a <strong>Gemini API key</strong> to power my brain.
      </p>
      <p style="margin-bottom: var(--space-md); color: var(--text-secondary);">
        It's free! Get one from <a href="https://aistudio.google.com" target="_blank">aistudio.google.com</a>, 
        then click <strong>Settings ⚙️</strong> in the top right to paste it in.
      </p>
    </div>
  `;
  messagesContainer.appendChild(div);
}

// === Event Listeners ===
function setupEventListeners() {
  // Send command
  sendBtn.addEventListener('click', sendCommand);
  commandInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendCommand();
    }
  });

  // Example buttons
  $$('.example-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      commandInput.value = btn.dataset.command;
      sendCommand();
    });
  });

  // Settings modal
  $('#btn-settings').addEventListener('click', () => settingsModal.classList.remove('hidden'));
  $('#btn-close-settings').addEventListener('click', () => settingsModal.classList.add('hidden'));
  $('.modal-overlay').addEventListener('click', () => settingsModal.classList.add('hidden'));

  // API key save
  $('#btn-save-key').addEventListener('click', saveApiKey);

  // Sidebar
  $('#btn-history').addEventListener('click', () => {
    sidebar.classList.toggle('hidden');
    loadTaskHistory();
  });
  $('#btn-close-sidebar').addEventListener('click', () => sidebar.classList.add('hidden'));

  // Lightbox
  $('#btn-close-lightbox').addEventListener('click', closeLightbox);
  $('.lightbox-overlay').addEventListener('click', closeLightbox);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeLightbox();
      settingsModal.classList.add('hidden');
    }
  });
}

function sendCommand() {
  const text = commandInput.value.trim();
  if (!text) return;

  addUserMessage(text);
  send({ type: 'command', text });
  commandInput.value = '';
  commandInput.style.height = 'auto';
}

// === Approval ===
window.handleApproval = function(taskId, stepId, approved) {
  send({
    type: approved ? 'approve' : 'reject',
    taskId,
    stepId,
  });

  // Remove approval card
  const el = $(`#approval-${taskId}-${stepId}`);
  if (el) {
    el.style.opacity = '0.5';
    el.querySelector('.approval-actions')?.remove();
    const status = document.createElement('div');
    status.style.marginTop = 'var(--space-sm)';
    status.style.fontSize = '12px';
    status.style.color = approved ? 'var(--success)' : 'var(--text-tertiary)';
    status.textContent = approved ? '✅ Approved' : '⏭️ Skipped';
    el.querySelector('.approval-card')?.appendChild(status);
  }
};

// === Settings ===
async function loadSettings() {
  try {
    const res = await fetch('/api/settings');
    const settings = await res.json();

    if (settings.hasApiKey) {
      const keyStatus = $('#key-status');
      keyStatus.textContent = '✅ API key configured';
      keyStatus.className = 'setting-status success';
    }

    $('#headless-toggle').checked = settings.headless;
  } catch (err) {
    console.error('Failed to load settings:', err);
  }
}

function saveApiKey() {
  const key = $('#api-key-input').value.trim();
  if (!key) return;

  send({ type: 'set_api_key', apiKey: key });

  const keyStatus = $('#key-status');
  keyStatus.textContent = '⏳ Saving...';
  keyStatus.className = 'setting-status';

  // Clear input
  $('#api-key-input').value = '';

  // Update status after a moment
  setTimeout(() => {
    keyStatus.textContent = '✅ API key saved!';
    keyStatus.className = 'setting-status success';
  }, 500);
}

// === Task History ===
async function loadTaskHistory() {
  try {
    const res = await fetch('/api/tasks');
    const { tasks } = await res.json();

    taskList.innerHTML = tasks.length === 0
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

    showMessages();

    // Clear current messages and render the historical task
    // Add user command
    addUserMessage(task.command);

    // Add summary if available
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
  lightboxImg.src = src;
  lightbox.classList.remove('hidden');
}

function closeLightbox() {
  lightbox.classList.add('hidden');
  lightboxImg.src = '';
}

// === UI Helpers ===
function updateConnectionStatus(status, text) {
  const dot = connectionStatus.querySelector('.status-dot');
  const label = connectionStatus.querySelector('.status-text');
  dot.className = `status-dot ${status === 'connected' ? 'connected' : status === 'error' ? 'error' : ''}`;
  label.textContent = text;
}

function updateBrowserStatus(status) {
  const dot = browserStatus.querySelector('.browser-dot');
  const label = browserStatus.querySelector('.browser-label');

  if (status === 'open' || status === 'launching') {
    dot.classList.add('active');
    label.textContent = status === 'launching' ? 'Browser: Launching...' : 'Browser: Active';
  } else {
    dot.classList.remove('active');
    label.textContent = 'Browser: Idle';
  }
}

function scrollToBottom() {
  requestAnimationFrame(() => {
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  });
}

function autoResizeTextarea() {
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

/**
 * Basic markdown to HTML converter for task summaries.
 */
function markdownToHtml(md) {
  if (!md) return '';
  let html = escapeHtml(md);

  // Headers
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');

  // Bold & italic
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

  // Inline code
  html = html.replace(/`(.+?)`/g, '<code>$1</code>');

  // Unordered lists
  html = html.replace(/^[*-] (.+)$/gm, '<li>$1</li>');
  html = html.replace(/(<li>.*<\/li>\n?)+/gs, '<ul>$&</ul>');

  // Ordered lists
  html = html.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');

  // Tables
  html = html.replace(/\|(.+)\|/g, (match) => {
    const cells = match.split('|').filter(c => c.trim());
    if (cells.every(c => /^[-:]+$/.test(c.trim()))) return ''; // separator row
    const tag = html.indexOf(match) < html.indexOf('\n') ? 'th' : 'td';
    const row = cells.map(c => `<${tag}>${c.trim()}</${tag}>`).join('');
    return `<tr>${row}</tr>`;
  });
  // Wrap table rows
  if (html.includes('<tr>')) {
    html = html.replace(/(<tr>.*<\/tr>\n?)+/gs, '<table>$&</table>');
  }

  // Line breaks (but not inside elements)
  html = html.replace(/\n\n/g, '</p><p>');
  html = html.replace(/\n/g, '<br>');

  // Links
  html = html.replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" target="_blank">$1</a>');

  return `<p>${html}</p>`;
}
