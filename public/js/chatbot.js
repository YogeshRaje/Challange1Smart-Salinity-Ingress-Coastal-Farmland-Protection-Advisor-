/**
 * chatbot.js — AI Chat Interface
 * Multi-agent chat with real-time agent activity indicators
 */

const CHAT_API = '/api';
let sessionId = null;
let isProcessing = false;

document.addEventListener('DOMContentLoaded', () => {
  setupChat();
  setupSampleQueries();
});

// ─── CHAT SETUP ───────────────────────────────────────────────
async function setupChat() {
  // Create a session on load
  try {
    const resp = await fetch(`${CHAT_API}/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: `user_${Date.now()}` })
    });
    const data = await resp.json();
    sessionId = data.session_id;
  } catch (e) {
    // Session creation failed; will work without persistent session
    sessionId = null;
  }

  const input = document.getElementById('chatInput');
  const sendBtn = document.getElementById('chatSendBtn');

  sendBtn.addEventListener('click', sendMessage);

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });
}

function setupSampleQueries() {
  document.querySelectorAll('.sample-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const query = btn.dataset.query;
      document.getElementById('chatInput').value = query;

      // Switch to chat view if not already there
      const chatNavBtn = document.querySelector('.nav-btn[data-view="chat"]');
      if (chatNavBtn) chatNavBtn.click();

      setTimeout(() => sendMessage(), 100);
    });
  });
}

// ─── SEND MESSAGE ─────────────────────────────────────────────
async function sendMessage() {
  if (isProcessing) return;

  const input = document.getElementById('chatInput');
  const query = input.value.trim();
  if (!query) return;

  isProcessing = true;
  input.value = '';
  document.getElementById('chatSendBtn').disabled = true;

  // Render user message
  appendMessage('user', '👤', 'You', query);

  // Show agent activity
  showAgentActivity('🎯 Orchestrator routing your query...');
  setAgentStatus('agentOrchestrator', 'working', 'Routing');

  // Scroll to bottom
  scrollToBottom();

  try {
    const startTime = Date.now();

    const response = await fetch(`${CHAT_API}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, session_id: sessionId })
    });

    const data = await response.json();

    if (data.error) {
      throw new Error(data.message || data.error);
    }

    // Update session
    if (data.session_id) sessionId = data.session_id;

    // Update agent status indicators
    updateAgentStatuses(data);

    hideAgentActivity();

    // Render AI response
    appendAIMessage(data);

  } catch (error) {
    hideAgentActivity();
    resetAllAgents();

    appendMessage('system', '⚠️', 'System Error', 
      `Failed to get response: ${error.message}\n\nMake sure the server is running (npm start) and your IBM watsonx.ai credentials are configured in .env`);
  } finally {
    isProcessing = false;
    document.getElementById('chatSendBtn').disabled = false;
    input.focus();
    scrollToBottom();
  }
}

// ─── RENDER MESSAGES ──────────────────────────────────────────
function appendMessage(type, avatar, name, content) {
  const container = document.getElementById('chatMessages');
  const div = document.createElement('div');
  div.className = `chat-message ${type}-message`;

  div.innerHTML = `
    <div class="message-avatar">${avatar}</div>
    <div class="message-content">
      <strong>${escapeHtml(name)}</strong>
      <p>${escapeHtml(content)}</p>
      <div class="message-meta">${new Date().toLocaleTimeString()}</div>
    </div>
  `;

  container.appendChild(div);
  scrollToBottom();
  return div;
}

function appendAIMessage(data) {
  const container = document.getElementById('chatMessages');
  const div = document.createElement('div');
  div.className = 'chat-message ai-message';

  const agentIcons = {
    'OrchestratorAgent': '🎯', 'SalinityMonitor': '📊',
    'CropRecommendation': '🌾', 'LandReclamation': '🌿', 'IrrigationAdvisory': '💧'
  };

  const agentTags = (data.agents_used || [data.primary_agent]).map(name =>
    `<span class="agent-tag">${agentIcons[name] || '🤖'} ${name.replace('Agent', '')}</span>`
  ).join('');

  const urgencyBadge = data.routing?.urgency ? 
    `<span class="badge badge-${data.routing.urgency === 'critical' ? 'CRITICAL' : 
      data.routing.urgency === 'high' ? 'HIGH' : 
      data.routing.urgency === 'medium' ? 'MODERATE' : 'SAFE'}">${data.routing.urgency.toUpperCase()}</span>` : '';

  // Format the answer: convert newlines to paragraph-like structure
  const formattedAnswer = formatAnswer(data.answer);

  div.innerHTML = `
    <div class="message-avatar">🌊</div>
    <div class="message-content" style="max-width:82%">
      <strong>Smart Salinity Advisor</strong>
      <div style="margin-bottom:8px">${agentTags} ${urgencyBadge}</div>
      <div class="ai-answer">${formattedAnswer}</div>
      <div class="message-meta">
        ${data.processing_time_ms}ms · Session ${(data.session_id || '').slice(-6)} · ${new Date(data.timestamp).toLocaleTimeString()}
      </div>
    </div>
  `;

  container.appendChild(div);
  scrollToBottom();

  // Reset agent statuses after showing answer
  setTimeout(resetAllAgents, 2000);
}

function formatAnswer(text) {
  if (!text) return '<em>No response received.</em>';
  return escapeHtml(text)
    .replace(/\n\n/g, '</p><p style="margin-top:10px">')
    .replace(/\n/g, '<br>')
    .replace(/^/, '<p>')
    .replace(/$/, '</p>');
}

// ─── AGENT ACTIVITY ───────────────────────────────────────────
function showAgentActivity(text) {
  const activity = document.getElementById('agentActivity');
  const activityText = document.getElementById('agentActivityText');
  activity.style.display = 'flex';
  activityText.textContent = text;
}

function hideAgentActivity() {
  document.getElementById('agentActivity').style.display = 'none';
}

function updateAgentStatuses(data) {
  const agentsUsed = data.agents_used || [data.primary_agent];
  const agentStatusMap = {
    'OrchestratorAgent': 'agentOrchestrator',
    'SalinityMonitor': 'agentSalinity',
    'CropRecommendation': 'agentCrop',
    'LandReclamation': 'agentReclam',
    'IrrigationAdvisory': 'agentIrr'
  };

  // Reset all first
  Object.values(agentStatusMap).forEach(id => setAgentStatus(id, 'idle', 'Idle'));

  // Mark used agents as done
  agentsUsed.forEach(agentName => {
    const elId = agentStatusMap[agentName];
    if (elId) {
      setAgentStatus(elId, 'done', 'Done');
      const card = document.getElementById(elId)?.closest('.agent-card');
      if (card) card.classList.add('active');
    }
  });
}

function resetAllAgents() {
  const ids = ['agentOrchestrator', 'agentSalinity', 'agentCrop', 'agentReclam', 'agentIrr'];
  ids.forEach(id => setAgentStatus(id, 'idle', 'Idle'));
  document.querySelectorAll('.agent-card').forEach(card => {
    card.classList.remove('active');
    if (card.classList.contains('orchestrator')) return; // Keep orchestrator styled
  });
}

function setAgentStatus(elementId, state, label) {
  const el = document.getElementById(elementId);
  if (!el) return;
  el.textContent = label;
  el.className = `agent-status ${state === 'working' ? 'working' : state === 'done' ? 'done' : ''}`;
}

// ─── UTILITIES ────────────────────────────────────────────────
function scrollToBottom() {
  const container = document.getElementById('chatMessages');
  if (container) {
    requestAnimationFrame(() => {
      container.scrollTop = container.scrollHeight;
    });
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
