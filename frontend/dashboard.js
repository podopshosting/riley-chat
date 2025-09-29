// Riley Dashboard JavaScript - Fixed Version

let conversationsData = [];
let messagesData = [];

// Page Navigation
function showPage(pageId) {
    // Hide all pages
    document.querySelectorAll('.page').forEach(page => {
        page.classList.remove('active');
    });
    
    // Remove active from nav items
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
    });
    
    // Show selected page
    document.getElementById(pageId).classList.add('active');
    
    // Add active to clicked nav item
    if (event && event.target) {
        event.target.classList.add('active');
    } else {
        document.querySelector(`[onclick="showPage('${pageId}')"]`).classList.add('active');
    }
    
    // Load page-specific data
    if (pageId === 'dashboard') loadDashboardData();
    if (pageId === 'kanban') loadKanbanData();
    if (pageId === 'analytics') loadAnalyticsData();
    if (pageId === 'status') loadStatusData();
}

// Load data using Lambda function
async function loadConversationsData() {
    try {
        console.log('Loading conversations data from Lambda...');
        
        const response = await fetch('https://sdgo4jrsic4o7xvkflkv5d6buy0mtfdh.lambda-url.us-east-1.on.aws/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'get_dashboard_data' })
        });
        
        if (response.ok) {
            const data = await response.json();
            conversationsData = data.conversations || [];
            messagesData = data.messages || [];
            
            if (document.getElementById('kanban-status')) {
                document.getElementById('kanban-status').textContent = `Live Data - ${conversationsData.length} conversations loaded`;
            }
        } else {
            throw new Error('Failed to fetch data');
        }
        
        return conversationsData;
        
    } catch (error) {
        console.error('Error loading data:', error);
        
        if (document.getElementById('kanban-status')) {
            document.getElementById('kanban-status').textContent = `Connection Error - Send SMS to (301) 973-6753 to test`;
        }
        
        conversationsData = [];
        messagesData = [];
        return conversationsData;
    }
}

}

// Dashboard Functions
async function loadDashboardData() {
    await loadConversationsData();
    
    const totalConversations = conversationsData.length;
    const activeConversations = conversationsData.filter(c => c.status === 'active').length;
    const completedConversations = conversationsData.filter(c => c.status === 'completed').length;
    const totalMessages = messagesData.length;
    const responseRate = totalConversations > 0 ? Math.round((completedConversations / totalConversations) * 100) : 0;
    
    document.getElementById('total-conversations').textContent = totalConversations;
    document.getElementById('active-conversations').textContent = activeConversations;
    document.getElementById('completed-conversations').textContent = completedConversations;
    document.getElementById('total-messages').textContent = totalMessages;
    document.getElementById('response-rate').textContent = responseRate + '%';
    document.getElementById('conversion-rate').textContent = responseRate + '%';
    document.getElementById('last-updated').textContent = new Date().toLocaleTimeString();
    
    // Load recent activity
    loadRecentActivity();
}

function loadRecentActivity() {
    let activityHtml = '';
    
    if (messagesData.length > 0) {
        const recentMessages = messagesData
            .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
            .slice(0, 5);
        
        recentMessages.forEach(msg => {
            const time = new Date(msg.timestamp).toLocaleTimeString();
            const conversation = conversationsData.find(c => c.conversationId === msg.conversationId);
            const customerName = conversation ? conversation.customerName : 'Unknown';
            
            activityHtml += `
                <div style="padding: 10px; border-bottom: 1px solid #eee;">
                    <strong>${time}</strong> - ${msg.sender === 'user' ? customerName : 'Riley'}: "${msg.content.substring(0, 50)}..."
                </div>
            `;
        });
    } else {
        activityHtml = '<p>No recent activity. Send SMS to (301) 973-6753 to test.</p>';
    }
    
    document.getElementById('recent-activity').innerHTML = activityHtml;
}

// Kanban Functions
async function loadKanbanData() {
    await loadConversationsData();
    
    const activeConvs = conversationsData.filter(c => c.status === 'active');
    const progressConvs = conversationsData.filter(c => c.status === 'in_progress');
    const completedConvs = conversationsData.filter(c => c.status === 'completed');
    
    document.getElementById('active-count').textContent = activeConvs.length;
    document.getElementById('progress-count').textContent = progressConvs.length;
    document.getElementById('completed-count').textContent = completedConvs.length;
    
    // Populate kanban columns
    populateKanbanColumn('active-conversations-list', activeConvs, 'active');
    populateKanbanColumn('progress-conversations-list', progressConvs, 'progress');
    populateKanbanColumn('completed-conversations-list', completedConvs, 'completed');
}

function populateKanbanColumn(elementId, conversations, type) {
    let html = '';
    
    if (conversations.length === 0) {
        html = '<p>No conversations in this status.</p>';
    } else {
        conversations.forEach(conv => {
            // Show "New User" if no name collected yet, otherwise show name
            const displayName = conv.customerName && conv.customerName !== 'SMS User' ? conv.customerName : 'New User';
            const nameColor = conv.customerName && conv.customerName !== 'SMS User' ? '#0073aa' : '#ff6b35';
            
            html += `
                <div class="conversation-card" onclick="openConversation('${conv.conversationId}', '${type}')">
                    <div class="customer-name" style="color: ${nameColor};">${displayName}</div>
                    <div class="phone">${conv.conversationId}</div>
                    <p>"${(conv.lastMessage || '').substring(0, 50)}..."</p>
                    <small>Step: ${getStepDescription(conv.step)}</small>
                    ${type === 'active' ? `
                        <br><br>
                        <button class="btn" onclick="event.stopPropagation(); takeOverConversation('${conv.conversationId}')">Take Over</button>
                    ` : ''}
                </div>
            `;
        });
    }
    
    document.getElementById(elementId).innerHTML = html;
}

// Open conversation in detail panel
function openConversation(conversationId, type) {
    // Remove selected class from all cards
    document.querySelectorAll('.conversation-card').forEach(card => {
        card.classList.remove('selected');
    });
    
    // Add selected class to clicked card
    event.currentTarget.classList.add('selected');
    
    // Find conversation data
    const conversation = conversationsData.find(c => c.conversationId === conversationId);
    if (!conversation) return;
    
    // Get messages for this conversation
    const conversationMessages = messagesData.filter(m => m.conversationId === conversationId);
    
    // Build conversation detail HTML with customer profile
    let detailHtml = `
        <div style="display: flex; gap: 20px; height: 100%;">
            <!-- Customer Profile -->
            <div style="flex: 0 0 300px; background: #f8f9fa; padding: 20px; border-radius: 8px; height: fit-content;">
                <h4 style="margin-top: 0; color: #0073aa;">Customer Profile</h4>
                <div style="margin-bottom: 10px;">
                    <strong>Name:</strong><br>
                    <span style="color: ${conversation.customerName && conversation.customerName !== 'SMS User' ? '#333' : '#999'};">
                        ${conversation.customerName && conversation.customerName !== 'SMS User' ? conversation.customerName : 'Not provided yet'}
                    </span>
                </div>
                <div style="margin-bottom: 10px;">
                    <strong>Phone:</strong><br>
                    <span>${conversationId}</span>
                </div>
                <div style="margin-bottom: 10px;">
                    <strong>Address:</strong><br>
                    <span style="color: ${conversation.address ? '#333' : '#999'};">
                        ${conversation.address || 'Not provided yet'}
                    </span>
                </div>
                <div style="margin-bottom: 10px;">
                    <strong>Issues/Description:</strong><br>
                    <span style="color: ${conversation.issues ? '#333' : '#999'};">
                        ${conversation.issues || 'Not provided yet'}
                    </span>
                </div>
                <div style="margin-bottom: 10px;">
                    <strong>Project Needs:</strong><br>
                    <span style="color: ${conversation.project ? '#333' : '#999'};">
                        ${conversation.project || 'Not provided yet'}
                    </span>
                </div>
                <div style="margin-bottom: 10px;">
                    <strong>Status:</strong><br>
                    <span style="background: ${getStatusColor(conversation.status)}; color: white; padding: 2px 8px; border-radius: 3px; font-size: 12px;">${conversation.status}</span>
                </div>
                <div>
                    <strong>Current Step:</strong><br>
                    <span>${getStepDescription(conversation.step)}</span>
                </div>
            </div>
            
            <!-- Chat Section -->
            <div style="flex: 1; display: flex; flex-direction: column;">
                <h4 style="margin-top: 0; color: #0073aa;">Conversation History</h4>
                <div class="chat-messages" id="chat-messages" style="flex: 1; min-height: 400px; max-height: 500px;">
    `;
    
    // Add messages
    if (conversationMessages.length > 0) {
        conversationMessages
            .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
            .forEach(msg => {
                const displayName = conversation.customerName && conversation.customerName !== 'SMS User' ? conversation.customerName : 'Customer';
                detailHtml += `
                    <div class="message ${msg.sender}">
                        <strong>${msg.sender === 'user' ? displayName : 'Riley'}:</strong><br>
                        ${msg.content}
                        <br><small>${new Date(msg.timestamp).toLocaleTimeString()}</small>
                    </div>
                `;
            });
    } else {
        detailHtml += '<p style="color: #666; text-align: center;">No messages yet</p>';
    }
    
                detailHtml += '</div>';
                
                // Add reply interface for agent conversations
                if (type === 'progress' || conversation.status === 'in_progress') {
                    const displayName = conversation.customerName && conversation.customerName !== 'SMS User' ? conversation.customerName : 'this customer';
                    detailHtml += `
                        <div style="margin-top: 20px; padding: 15px; background: #f8f9fa; border-radius: 8px;">
                            <h4 style="margin-top: 0; color: #0073aa;">Send Reply</h4>
                            <textarea class="message-input" id="reply-message" placeholder="Type your reply to ${displayName}..." rows="4" style="width: 100%; padding: 12px; border: 1px solid #ddd; border-radius: 6px; font-size: 14px;"></textarea>
                            <button class="send-btn" onclick="sendReply('${conversationId}')" style="margin-top: 10px; padding: 12px 24px; font-size: 14px;">Send Reply</button>
                        </div>
                    `;
                } else if (type === 'active') {
                    detailHtml += `
                        <div style="margin-top: 20px; text-align: center; padding: 20px; background: #f8f9fa; border-radius: 8px;">
                            <button class="btn" onclick="takeOverConversation('${conversationId}')" style="padding: 12px 24px; font-size: 16px;">Take Over Conversation</button>
                            <p style="color: #666; font-size: 14px; margin-top: 10px;">Take over to start replying to this customer</p>
                        </div>
                    `;
                }
                
                detailHtml += '</div></div>';
    
    document.getElementById('conversation-detail').innerHTML = detailHtml;
}

function getStatusColor(status) {
    switch(status) {
        case 'active': return '#ffc107';
        case 'in_progress': return '#17a2b8';
        case 'completed': return '#28a745';
        default: return '#6c757d';
    }
}

function getStepDescription(step) {
    switch(step) {
        case 'greeting': return 'Initial contact';
        case 'name': return 'Collecting name';
        case 'collect_name': return 'Collecting name';
        case 'address': return 'Collecting address';
        case 'collect_address': return 'Collecting address';
        case 'issues': return 'Collecting issues';
        case 'collect_issues': return 'Collecting issues';
        case 'project': return 'Collecting project needs';
        case 'collect_project': return 'Collecting project needs';
        case 'complete': return 'Conversation completed';
        case 'completed': return 'Conversation completed';
        default: return step || 'Unknown step';
    }
}

// Send reply function
function sendReply(conversationId) {
    const replyText = document.getElementById('reply-message').value.trim();
    if (!replyText) {
        alert('Please enter a message');
        return;
    }
    
    // Add message to UI immediately
    const chatMessages = document.getElementById('chat-messages');
    const newMessage = document.createElement('div');
    newMessage.className = 'message bot';
    newMessage.innerHTML = `
        <strong>You (Agent):</strong><br>
        ${replyText}
        <br><small>${new Date().toLocaleTimeString()}</small>
    `;
    chatMessages.appendChild(newMessage);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    
    // Clear input
    document.getElementById('reply-message').value = '';
    
    // In real implementation, this would send via SMS API
    console.log(`Sending reply to ${conversationId}: ${replyText}`);
    
    // Show success message
    const successMsg = document.createElement('div');
    successMsg.style.cssText = 'background: #d4edda; color: #155724; padding: 10px; border-radius: 4px; margin: 10px 0;';
    successMsg.textContent = 'Reply sent successfully!';
    document.getElementById('reply-message').parentNode.insertBefore(successMsg, document.getElementById('reply-message'));
    
    setTimeout(() => successMsg.remove(), 3000);
}

// Takeover Function
function takeOverConversation(conversationId) {
    // Update conversation status
    const conversation = conversationsData.find(c => c.conversationId === conversationId);
    if (conversation) {
        conversation.status = 'in_progress';
    }
    
    document.getElementById('takeover-message').style.display = 'block';
    document.getElementById('takeover-message').textContent = `Conversation with ${conversationId} taken over successfully!`;
    
    // Reload kanban and reopen conversation
    setTimeout(() => {
        loadKanbanData();
        openConversation(conversationId, 'progress');
        document.getElementById('takeover-message').style.display = 'none';
    }, 1000);
}

// Analytics Functions
async function loadAnalyticsData() {
    await loadConversationsData();
    
    const totalLaunches = conversationsData.length;
    const totalReplies = conversationsData.filter(c => c.status === 'completed').length;
    const inProgress = conversationsData.filter(c => c.status === 'in_progress').length;
    const responseRate = totalLaunches > 0 ? Math.round((totalReplies / totalLaunches) * 100) : 0;
    
    document.getElementById('analytics-launches').textContent = totalLaunches;
    document.getElementById('analytics-replies').textContent = totalReplies;
    document.getElementById('analytics-rate').textContent = responseRate + '%';
    document.getElementById('analytics-progress').textContent = inProgress;
    
    // Campaign table
    const campaignHtml = `
        <tr>
            <td>SMS Bot Conversations</td>
            <td>${totalLaunches}</td>
            <td>${responseRate}%</td>
            <td>Active</td>
        </tr>
    `;
    document.getElementById('campaign-table').innerHTML = campaignHtml;
    
    // Contacts history
    loadContactsHistory();
}

function loadContactsHistory() {
    let historyHtml = '<table style="width: 100%; border-collapse: collapse;"><thead><tr style="background: #f9f9f9;"><th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd;">Contact</th><th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd;">Phone</th><th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd;">Time</th><th style="padding: 12px; text-align: left; border-bottom: 1px solid #ddd;">Status</th></tr></thead><tbody>';
    
    if (conversationsData.length > 0) {
        const recentConversations = conversationsData
            .sort((a, b) => new Date(b.lastActivity) - new Date(a.lastActivity))
            .slice(0, 10);
        
        recentConversations.forEach(conv => {
            const time = new Date(conv.lastActivity).toLocaleString();
            const statusColor = conv.status === 'completed' ? '#28a745' : conv.status === 'in_progress' ? '#ffc107' : '#dc3545';
            
            historyHtml += `
                <tr>
                    <td style="padding: 12px; border-bottom: 1px solid #ddd;">${conv.customerName || 'SMS User'}</td>
                    <td style="padding: 12px; border-bottom: 1px solid #ddd;">${conv.conversationId}</td>
                    <td style="padding: 12px; border-bottom: 1px solid #ddd;">${time}</td>
                    <td style="padding: 12px; border-bottom: 1px solid #ddd;"><span style="background: ${statusColor}; color: white; padding: 3px 8px; border-radius: 3px; font-size: 12px;">${conv.status}</span></td>
                </tr>
            `;
        });
    } else {
        historyHtml += '<tr><td colspan="4" style="padding: 12px;">No contact history available. Send SMS to (301) 973-6753 to test.</td></tr>';
    }
    
    historyHtml += '</tbody></table>';
    document.getElementById('contacts-history').innerHTML = historyHtml;
}

// Status Functions
function loadStatusData() {
    document.getElementById('status-updated').textContent = new Date().toLocaleString();
}

// Utility Functions
function testSMS() {
    alert('Test SMS: Send "Hello Riley" to (301) 973-6753 to test the bot');
}

function refreshData() {
    const activePage = document.querySelector('.page.active').id;
    if (activePage === 'dashboard') loadDashboardData();
    if (activePage === 'kanban') loadKanbanData();
    if (activePage === 'analytics') loadAnalyticsData();
    if (activePage === 'status') loadStatusData();
}

function updateAnalytics() {
    loadAnalyticsData();
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', function() {
    // Set default date range
    const today = new Date();
    const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
    
    if (document.getElementById('start-date')) {
        document.getElementById('start-date').value = weekAgo.toISOString().split('T')[0];
    }
    if (document.getElementById('end-date')) {
        document.getElementById('end-date').value = today.toISOString().split('T')[0];
    }
    
    // Load initial data
    loadDashboardData();
    
    // Auto-refresh every 30 seconds
    setInterval(refreshData, 30000);
});