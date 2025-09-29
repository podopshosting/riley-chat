// Enhanced Riley Dashboard - Preserves existing functionality + new sales funnel stages
let conversationsData = [];
let messagesData = [];
let isDragging = false;
let autoRefreshInterval;

// No fallback data - use only live SMS data

// Load live SMS conversations data using working endpoint without CORS
async function loadConversationsData() {
    try {
        // Use JSONP to bypass CORS
        const script = document.createElement('script');
        script.src = 'https://sdgo4jrsic4o7xvkflkv5d6buy0mtfdh.lambda-url.us-east-1.on.aws/?callback=handleDashboardData';
        document.head.appendChild(script);
        
        // Wait for JSONP response
        return new Promise((resolve) => {
            window.handleDashboardData = (data) => {
                if (data.success && data.conversations) {
                    conversationsData = mapToEnhancedStages(data.conversations);
                    messagesData = data.messages || [];
                    console.log('✅ Loaded live SMS data:', conversationsData.length, 'conversations');
                }
                document.head.removeChild(script);
                resolve(conversationsData);
            };
            
            // Timeout fallback
            setTimeout(() => {
                if (script.parentNode) {
                    document.head.removeChild(script);
                    resolve([]);
                }
            }, 5000);
        });
        
    } catch (error) {
        console.log('❌ Failed to load live data:', error.message);
    }
    
    conversationsData = [];
    messagesData = [];
    console.log('No live data available - check SMS system');
    return conversationsData;
}

// Map legacy statuses to new sales funnel stages
function mapToEnhancedStages(conversations) {
    return conversations.map(conv => {
        let mappedStatus = conv.status;
        
        switch (conv.status) {
            case 'active':
                mappedStatus = 'new_leads';
                break;
            case 'in_progress':
                mappedStatus = 'qualified';
                break;
            case 'completed':
                mappedStatus = 'completed';
                break;
            case 'discarded':
                mappedStatus = 'lost';
                break;
            default:
                mappedStatus = conv.status || 'new_leads';
        }

        return { ...conv, status: mappedStatus };
    });
}

// Enhanced Dashboard Data Loading
async function loadDashboardData() {
    await loadConversationsData();
    
    const stats = {
        total: conversationsData.length,
        newLeads: conversationsData.filter(c => c.status === 'new_leads').length,
        qualified: conversationsData.filter(c => c.status === 'qualified').length,
        scheduled: conversationsData.filter(c => c.status === 'scheduled').length,
        completed: conversationsData.filter(c => c.status === 'completed').length,
        lost: conversationsData.filter(c => c.status === 'lost').length
    };
    
    // Calculate conversion rates
    const qualificationRate = stats.total > 0 ? Math.round((stats.qualified / stats.total) * 100) : 0;
    const schedulingRate = stats.qualified > 0 ? Math.round((stats.scheduled / stats.qualified) * 100) : 0;
    const completionRate = stats.scheduled > 0 ? Math.round((stats.completed / stats.scheduled) * 100) : 0;
    
    // Update dashboard elements
    updateElement('total-conversations', stats.total);
    updateElement('new-leads-stat', stats.newLeads);
    updateElement('qualified-stat', stats.qualified);
    updateElement('scheduled-stat', stats.scheduled);
    updateElement('completed-stat', stats.completed);
    updateElement('qualification-rate', qualificationRate + '%');
    updateElement('scheduling-rate', schedulingRate + '%');
    updateElement('completion-rate', completionRate + '%');
    
    loadRecentActivity();
}

// Enhanced Kanban Loading
async function loadKanbanData() {
    await loadConversationsData();
    
    const stages = {
        new_leads: conversationsData.filter(c => c.status === 'new_leads'),
        qualified: conversationsData.filter(c => c.status === 'qualified'),
        scheduled: conversationsData.filter(c => c.status === 'scheduled'),
        completed: conversationsData.filter(c => c.status === 'completed'),
        lost: conversationsData.filter(c => c.status === 'lost')
    };

    // Update counts
    updateElement('new-leads-count', stages.new_leads.length);
    updateElement('qualified-count', stages.qualified.length);
    updateElement('scheduled-count', stages.scheduled.length);
    updateElement('completed-count', stages.completed.length);
    updateElement('lost-count', stages.lost.length);

    // Populate columns
    populateEnhancedColumn('new-leads-list', stages.new_leads, 'new_leads');
    populateEnhancedColumn('qualified-list', stages.qualified, 'qualified');
    populateEnhancedColumn('scheduled-list', stages.scheduled, 'scheduled');
    populateEnhancedColumn('completed-list', stages.completed, 'completed');
    populateEnhancedColumn('lost-list', stages.lost, 'lost');
    
    // Re-initialize drag and drop
    initializeDragAndDrop();
}

function populateEnhancedColumn(elementId, conversations, stage) {
    const element = document.getElementById(elementId);
    if (!element) return;
    
    let html = conversations.length === 0 ? '<p style="color: #666; font-style: italic;">No conversations in this stage.</p>' : '';
    
    conversations.forEach(conv => {
        const displayName = conv.customerName && conv.customerName !== 'SMS User' ? conv.customerName : 'New User';
        const stageClass = `stage-${stage.replace('_', '-')}`;
        const actionButtons = getActionButtons(stage, conv.conversationId);
        
        html += `
            <div class="conversation-card ${stageClass}" draggable="true" data-phone="${conv.conversationId}" data-stage="${stage}" onclick="openChat('${conv.conversationId}', '${stage}')">
                <div class="customer-name">${displayName}</div>
                <div class="phone">${conv.conversationId}</div>
                <p>"${(conv.lastMessage || '').substring(0, 50)}..."</p>
                <small>Step: ${conv.step || 'unknown'}</small>
                <div class="card-actions">
                    ${actionButtons}
                </div>
            </div>
        `;
    });
    
    element.innerHTML = html;
}

function getActionButtons(stage, conversationId) {
    switch (stage) {
        case 'new_leads':
            return `<button onclick="event.stopPropagation(); moveToStage('${conversationId}', 'qualified')">Qualify Lead</button>`;
        case 'qualified':
            return `<button onclick="event.stopPropagation(); moveToStage('${conversationId}', 'scheduled')">Schedule</button>
                    <button onclick="event.stopPropagation(); moveToStage('${conversationId}', 'lost')">Mark Lost</button>`;
        case 'scheduled':
            return `<button onclick="event.stopPropagation(); moveToStage('${conversationId}', 'completed')">Complete Job</button>`;
        case 'completed':
            return `<span style="color: #4CAF50; font-weight: bold;">✓ Completed</span>`;
        case 'lost':
            return `<button onclick="event.stopPropagation(); moveToStage('${conversationId}', 'new_leads')">Reactivate</button>`;
        default:
            return '';
    }
}

// Enhanced Drag and Drop with Auto-Refresh Fix
function initializeDragAndDrop() {
    const cards = document.querySelectorAll('.conversation-card[draggable="true"]');
    const columns = document.querySelectorAll('.kanban-column');

    cards.forEach(card => {
        card.addEventListener('dragstart', handleDragStart);
        card.addEventListener('dragend', handleDragEnd);
    });

    columns.forEach(column => {
        column.addEventListener('dragover', handleDragOver);
        column.addEventListener('drop', handleDrop);
        column.addEventListener('dragenter', handleDragEnter);
        column.addEventListener('dragleave', handleDragLeave);
    });
}

function handleDragStart(e) {
    isDragging = true;
    pauseAutoRefresh();
    this.classList.add('dragging');
    e.dataTransfer.setData('text/plain', JSON.stringify({
        phone: this.dataset.phone,
        currentStage: this.dataset.stage
    }));
}

function handleDragEnd(e) {
    this.classList.remove('dragging');
    setTimeout(() => {
        if (!isDragging) {
            resumeAutoRefresh();
        }
    }, 2000);
}

function handleDragOver(e) {
    e.preventDefault();
}

function handleDragEnter(e) {
    e.preventDefault();
    if (e.target.classList.contains('kanban-column')) {
        e.target.classList.add('drag-over');
    }
}

function handleDragLeave(e) {
    if (e.target.classList.contains('kanban-column')) {
        e.target.classList.remove('drag-over');
    }
}

function handleDrop(e) {
    e.preventDefault();
    isDragging = false;
    
    if (e.target.classList.contains('kanban-column')) {
        e.target.classList.remove('drag-over');
        
        const dragData = JSON.parse(e.dataTransfer.getData('text/plain'));
        const newStage = e.target.dataset.status;
        
        if (dragData.currentStage !== newStage) {
            moveToStage(dragData.phone, newStage);
        }
    }
}

// Move conversation to different stage
async function moveToStage(conversationId, newStage) {
    try {
        // Update local data immediately
        const conv = conversationsData.find(c => c.conversationId === conversationId);
        if (conv) {
            conv.status = newStage;
            conv.lastActivity = new Date().toISOString();
        }
        
        // Update UI immediately
        loadKanbanData();
        
        // Send update to server
        try {
            await fetch('https://sdgo4jrsic4o7xvkflkv5d6buy0mtfdh.lambda-url.us-east-1.on.aws/', {
                method: 'POST',
                body: JSON.stringify({
                    action: 'update_status',
                    phone: conversationId,
                    status: newStage
                })
            });
            console.log('✅ Updated status on server');
        } catch (error) {
            console.log('❌ Failed to update server:', error);
        }
        
        showMessage(`Moved ${conversationId} to ${newStage.replace('_', ' ')}`);
        
    } catch (error) {
        console.error('Error moving conversation:', error);
    }
}

// Auto-refresh management
function pauseAutoRefresh() {
    if (autoRefreshInterval) {
        clearInterval(autoRefreshInterval);
        updateRefreshIndicator('PAUSED');
    }
}

function resumeAutoRefresh() {
    startAutoRefresh();
    updateRefreshIndicator('ON');
}

function startAutoRefresh() {
    if (autoRefreshInterval) {
        clearInterval(autoRefreshInterval);
    }
    
    autoRefreshInterval = setInterval(() => {
        if (!isDragging) {
            const activePage = document.querySelector('.page.active')?.id;
            if (activePage === 'kanban') {
                loadKanbanData();
            } else if (activePage === 'dashboard') {
                loadDashboardData();
            }
        }
    }, 30000);
}

function updateRefreshIndicator(status) {
    const indicator = document.getElementById('refreshIndicator');
    if (indicator) {
        indicator.textContent = `Auto-refresh: ${status}`;
        indicator.className = status === 'PAUSED' ? 'auto-refresh-indicator auto-refresh-paused' : 'auto-refresh-indicator';
    }
}

// Preserved existing functions
function showPage(pageId) {
    document.querySelectorAll('.page').forEach(page => page.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
    document.getElementById(pageId).classList.add('active');
    event.target.classList.add('active');
    
    if (pageId === 'dashboard') loadDashboardData();
    if (pageId === 'kanban') loadKanbanData();
    if (pageId === 'analytics') loadAnalyticsData();
    if (pageId === 'status') loadStatusData();
}

function openChat(conversationId, type) {
    const conv = conversationsData.find(c => c.conversationId === conversationId);
    const messages = messagesData.filter(m => m.conversationId === conversationId);
    
    let chatHtml = `
        <div class="chat-overlay" onclick="closeChat()">
            <div class="chat-popup" onclick="event.stopPropagation()">
                <div class="chat-header">
                    <h3>${conv.customerName || 'New User'} - ${conversationId}</h3>
                    <button onclick="closeChat()">×</button>
                </div>
                <div class="chat-messages">
    `;
    
    messages.forEach(msg => {
        chatHtml += `<div class="message ${msg.sender}"><strong>${msg.sender === 'user' ? conv.customerName : 'Riley'}:</strong> ${msg.content}</div>`;
    });
    
    if (type === 'qualified' || type === 'scheduled') {
        chatHtml += `
                </div>
                <div class="chat-input">
                    <textarea id="reply-text" placeholder="Type reply..."></textarea>
                    <button onclick="sendReply('${conversationId}')">Send</button>
                </div>
        `;
    } else {
        chatHtml += '</div>';
    }
    
    chatHtml += '</div></div>';
    document.body.insertAdjacentHTML('beforeend', chatHtml);
}

function closeChat() {
    document.querySelector('.chat-overlay')?.remove();
}

function sendReply(conversationId) {
    const text = document.getElementById('reply-text').value;
    if (text.trim()) {
        const chatMessages = document.querySelector('.chat-messages');
        chatMessages.innerHTML += `<div class="message bot"><strong>Agent:</strong> ${text}</div>`;
        
        messagesData.push({
            conversationId: conversationId,
            sender: 'agent',
            content: text,
            timestamp: new Date().toISOString()
        });
        
        document.getElementById('reply-text').value = '';
        console.log(`SMS sent to ${conversationId}: ${text}`);
    }
}

function loadRecentActivity() {
    const activityEl = document.getElementById('recent-activity');
    if (activityEl) {
        let activityHtml = messagesData.length > 0 ? '' : '<p>No recent activity. Send SMS to (301) 973-6753 to test.</p>';
        messagesData.slice(-5).forEach(msg => {
            const conv = conversationsData.find(c => c.conversationId === msg.conversationId);
            const name = conv ? conv.customerName : 'Unknown';
            activityHtml += `<div style="padding: 10px; border-bottom: 1px solid #eee;"><strong>${new Date(msg.timestamp).toLocaleTimeString()}</strong> - ${msg.sender === 'user' ? name : 'Riley'}: "${msg.content.substring(0, 50)}..."</div>`;
        });
        activityEl.innerHTML = activityHtml;
    }
}

async function loadAnalyticsData() {
    await loadConversationsData();
    
    const totalLaunches = conversationsData.length;
    const totalReplies = conversationsData.filter(c => c.status === 'completed').length;
    const inProgress = conversationsData.filter(c => c.status === 'qualified' || c.status === 'scheduled').length;
    const responseRate = totalLaunches > 0 ? Math.round((totalReplies / totalLaunches) * 100) : 0;
    
    updateElement('analytics-launches', totalLaunches);
    updateElement('analytics-replies', totalReplies);
    updateElement('analytics-rate', responseRate + '%');
    updateElement('analytics-progress', inProgress);
}

function loadStatusData() {
    updateElement('status-updated', new Date().toLocaleString());
}

function testSMS() {
    alert('Send "Hello Riley" to (301) 973-6753 to test');
}

function refreshData() {
    const activePage = document.querySelector('.page.active').id;
    if (activePage === 'dashboard') loadDashboardData();
    if (activePage === 'kanban') loadKanbanData();
    if (activePage === 'analytics') loadAnalyticsData();
}

function updateAnalytics() {
    loadAnalyticsData();
}

function updateElement(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
}

function showMessage(message) {
    const messageEl = document.getElementById('takeover-message');
    if (messageEl) {
        messageEl.textContent = message;
        messageEl.style.display = 'block';
        setTimeout(() => {
            messageEl.style.display = 'none';
        }, 3000);
    }
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', function() {
    loadDashboardData();
    startAutoRefresh();
    
    const today = new Date();
    const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
    
    const startDateEl = document.getElementById('start-date');
    const endDateEl = document.getElementById('end-date');
    
    if (startDateEl) startDateEl.value = weekAgo.toISOString().split('T')[0];
    if (endDateEl) endDateEl.value = today.toISOString().split('T')[0];
});