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
      showMessages();
      renderPlan(msg);
      break;

    case 'step_start':
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
      renderApprovalRequest(msg);
      break;

    case 'task_complete':
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
      if (msg.newSteps) {
        appendNewStepsToPlan(msg.taskId, msg.newSteps);
      }
      break;

    case 'browser_status':
      updateBrowserStatus(msg.status);
      break;

    case 'error':
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
  const div = document.createElement('div');
  div.className = 'message agent';
  div.id = `plan-${msg.taskId}`;

  const stepsHtml = msg.steps.map(step => `
    <div class="plan-step" data-step-id="${step.id}" id="step-${msg.taskId}-${step.id}">
      <div class="step-indicator pending" id="indicator-${msg.taskId}-${step.id}">
        ${step.id}
      </div>
      <div class="step-content">
        <div class="step-description">${escapeHtml(step.description)}</div>
        <div class="step-result" id="result-${msg.taskId}-${step.id}" style="display:none;"></div>
        <div class="step-screenshot" id="screenshot-${msg.taskId}-${step.id}"></div>
      </div>
    </div>
  `).join('');

  div.innerHTML = `
    <div class="message-body">
      <div class="message-header">
        <div class="message-avatar">🧭</div>
        <span class="message-sender">Pilot</span>
        <span class="message-time">${formatTime()}</span>
      </div>
      <div class="plan-card">
        <div class="plan-header">
          <span class="plan-header-icon">📋</span>
          <div class="plan-header-text">
            <h3>Execution Plan</h3>
            <p>${escapeHtml(msg.summary)}</p>
          </div>
          <span class="plan-step-count">${msg.steps.length} steps</span>
        </div>
        <div class="plan-steps" id="steps-container-${msg.taskId}">
          ${stepsHtml}
        </div>
      </div>
    </div>
  `;

  messagesContainer.appendChild(div);
  activePlans.set(msg.taskId, { steps: msg.steps, element: div });
  scrollToBottom();
}

function updateStepStatus(taskId, stepId, status, description, result, screenshot, error) {
  const indicator = $(`#indicator-${taskId}-${stepId}`);
  const resultEl = $(`#result-${taskId}-${stepId}`);
  const screenshotEl = $(`#screenshot-${taskId}-${stepId}`);

  if (indicator) {
    indicator.className = `step-indicator ${status}`;
    const icons = {
      pending: stepId,
      running: '⟳',
      completed: '✓',
      failed: '✗',
      skipped: '—',
    };
    indicator.textContent = icons[status] || stepId;
  }

  if (result && resultEl) {
    resultEl.style.display = 'block';
    resultEl.textContent = typeof result === 'string' ? result : JSON.stringify(result);
  }

  if (error && resultEl) {
    resultEl.style.display = 'block';
    resultEl.className = 'step-error';
    resultEl.textContent = error;
  }

  scrollToBottom();
}

function appendNewStepsToPlan(taskId, newSteps) {
  const container = $(`#steps-container-${taskId}`);
  if (!container) return;

  const html = newSteps.map(step => `
    <div class="plan-step" data-step-id="${step.id}" id="step-${taskId}-${step.id}">
      <div class="step-indicator pending" id="indicator-${taskId}-${step.id}">
        ${step.id}
      </div>
      <div class="step-content">
        <div class="step-description">${escapeHtml(step.description)}</div>
        <div class="step-result" id="result-${taskId}-${step.id}" style="display:none;"></div>
        <div class="step-screenshot" id="screenshot-${taskId}-${step.id}"></div>
      </div>
    </div>
  `).join('');

  container.insertAdjacentHTML('beforeend', html);
  scrollToBottom();
}

function renderApprovalRequest(msg) {
  const div = document.createElement('div');
  div.className = 'message agent';
  div.id = `approval-${msg.taskId}-${msg.stepId}`;

  let screenshotHtml = '';
  if (msg.screenshot) {
    screenshotHtml = `
      <div class="screenshot-thumb" style="margin-bottom: var(--space-md);">
        <img src="data:image/png;base64,${msg.screenshot}" alt="Current page">
      </div>
    `;
  }

  div.innerHTML = `
    <div class="message-body">
      <div class="approval-card">
        <div class="approval-header">
          ⚠️ Approval Required
        </div>
        <div class="approval-desc">${escapeHtml(msg.description)}</div>
        ${screenshotHtml}
        <div class="approval-actions">
          <button class="btn-approve" onclick="handleApproval('${msg.taskId}', ${msg.stepId}, true)">
            ✅ Approve
          </button>
          <button class="btn-reject" onclick="handleApproval('${msg.taskId}', ${msg.stepId}, false)">
            ❌ Skip
          </button>
        </div>
      </div>
    </div>
  `;

  messagesContainer.appendChild(div);
  scrollToBottom();

  // Add lightbox to screenshot
  const thumb = div.querySelector('.screenshot-thumb');
  if (thumb && msg.screenshot) {
    thumb.addEventListener('click', () => openLightbox(`data:image/png;base64,${msg.screenshot}`));
  }
}

function renderTaskSummary(msg) {
  const div = document.createElement('div');
  div.className = 'message agent';

  // Convert markdown-like formatting to HTML
  const summaryHtml = markdownToHtml(msg.summary || 'Completed.');

  if (!msg.totalSteps || msg.totalSteps === 0) {
    div.innerHTML = `
      <div class="message-body">
        <div class="message-header">
          <div class="message-avatar">🧭</div>
          <span class="message-sender">Pilot</span>
          <span class="message-time">${formatTime()}</span>
        </div>
        <div class="direct-response">${summaryHtml}</div>
      </div>
    `;
  } else {
    div.innerHTML = `
      <div class="message-body">
        <div class="summary-card">
          <div class="summary-header">
            <span>⚡</span>
            <h3>Result</h3>
          </div>
          <div class="summary-body">${summaryHtml}</div>
        </div>
      </div>
    `;
  }

  messagesContainer.appendChild(div);
  scrollToBottom();
}

function renderStatusMessage(text, status) {
  const div = document.createElement('div');
  div.className = 'status-message';
  if (status === 'planning' || status === 'summarizing' || status === 'replanning') {
    div.innerHTML = `<div class="spinner"></div> ${escapeHtml(text)}`;
  } else {
    div.textContent = text;
  }
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
