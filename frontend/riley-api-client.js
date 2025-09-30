// Riley API Client
// Handles all API communications with the Riley backend

window.RileyAPI = {
    // API Configuration
    config: {
        baseUrl: 'https://cbtr8iqu56.execute-api.us-east-1.amazonaws.com/prod',
        timeout: 30000
    },

    // Helper function for API calls
    async apiCall(endpoint, options = {}) {
        const url = `${this.config.baseUrl}${endpoint}`;
        const defaultOptions = {
            headers: {
                'Content-Type': 'application/json',
                ...options.headers
            },
            ...options
        };

        try {
            const response = await fetch(url, defaultOptions);
            if (!response.ok) {
                throw new Error(`API Error: ${response.status} ${response.statusText}`);
            }
            return await response.json();
        } catch (error) {
            console.error(`API call failed: ${endpoint}`, error);
            throw error;
        }
    },

    // Get all conversations
    async getConversations(limit = 50) {
        return this.apiCall('/riley/conversations', {
            method: 'GET'
        });
    },

    // Get conversation by ID
    async getConversation(conversationId) {
        return this.apiCall(`/riley/conversations/${conversationId}`, {
            method: 'GET'
        });
    },

    // Get conversations by phone number
    async getConversationsByPhone(phoneNumber) {
        return this.apiCall(`/riley/conversations?phoneNumber=${encodeURIComponent(phoneNumber)}`, {
            method: 'GET'
        });
    },

    // Update conversation status
    async updateConversationStatus(conversationId, status) {
        return this.apiCall(`/riley/conversations/${conversationId}/status`, {
            method: 'POST',
            body: JSON.stringify({ status })
        });
    },

    // Add message to conversation
    async addMessage(conversationId, message, role = 'user') {
        return this.apiCall(`/riley/conversations/${conversationId}/messages`, {
            method: 'POST',
            body: JSON.stringify({ message, role })
        });
    },

    // Send a chat message (creates new conversation if needed)
    async sendChatMessage(message, phoneNumber, conversationId = null) {
        return this.apiCall('/riley', {
            method: 'POST',
            body: JSON.stringify({
                message,
                phoneNumber,
                conversationId
            })
        });
    },

    // Submit LSA lead
    async submitLSALead(leadData) {
        return this.apiCall('/lsa', {
            method: 'POST',
            body: JSON.stringify(leadData)
        });
    },

    // Test Twilio webhook (for testing only)
    async testTwilioWebhook(from, body) {
        const formData = new URLSearchParams();
        formData.append('From', from);
        formData.append('To', '+18885551234'); // Test number
        formData.append('Body', body);
        formData.append('MessageSid', `test_${Date.now()}`);

        return this.apiCall('/riley/twilio', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: formData.toString()
        });
    },

    // Get conversation statistics
    async getStats() {
        try {
            const data = await this.getConversations();
            if (data && data.stats) {
                return data.stats;
            }

            // Calculate stats from conversations if not provided
            const conversations = data.conversations || [];
            return {
                total: conversations.length,
                active: conversations.filter(c => c.status === 'active').length,
                resolved: conversations.filter(c => c.status === 'resolved').length,
                pending: conversations.filter(c => c.status === 'pending').length
            };
        } catch (error) {
            console.error('Error getting stats:', error);
            return { total: 0, active: 0, resolved: 0, pending: 0 };
        }
    },

    // Health check
    async healthCheck() {
        try {
            const response = await this.apiCall('/riley', {
                method: 'POST',
                body: JSON.stringify({
                    message: 'ping',
                    phoneNumber: '+10000000000'
                })
            });
            return { status: 'healthy', response };
        } catch (error) {
            return { status: 'unhealthy', error: error.message };
        }
    }
};

// Auto-initialize on load
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        console.log('Riley API Client initialized');
    });
} else {
    console.log('Riley API Client initialized');
}