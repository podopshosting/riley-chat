// Riley API Configuration
const RILEY_API = {
    // API Gateway endpoints
    baseUrl: 'https://cbtr8iqu56.execute-api.us-east-1.amazonaws.com/prod',

    // Endpoints
    endpoints: {
        riley: '/riley',
        lsa: '/lsa',
        conversations: '/riley/conversations',
        dashboard: '/riley/dashboard'
    },

    // Fetch conversations from API
    async getConversations() {
        try {
            const response = await fetch(this.baseUrl + this.endpoints.conversations, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            return await response.json();
        } catch (error) {
            console.error('Error fetching conversations:', error);
            // Fallback to local data
            return this.getLocalConversations();
        }
    },

    // Fetch LSA data from API
    async getLSAData() {
        try {
            const response = await fetch(this.baseUrl + this.endpoints.lsa, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            console.log('LSA API Response:', data);
            return data;
        } catch (error) {
            console.error('Error fetching LSA data:', error);
            // Fallback to local data
            return this.getLocalLSAData();
        }
    },

    // Send message to Riley
    async sendMessage(message, context = {}) {
        try {
            const response = await fetch(this.baseUrl + this.endpoints.riley, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    message: message,
                    context: context,
                    timestamp: new Date().toISOString()
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            return await response.json();
        } catch (error) {
            console.error('Error sending message to Riley:', error);
            throw error;
        }
    },

    // Get dashboard data
    async getDashboardData() {
        try {
            const response = await fetch(this.baseUrl + this.endpoints.dashboard, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    action: 'dashboard',
                    timestamp: new Date().toISOString()
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            return await response.json();
        } catch (error) {
            console.error('Error fetching dashboard data:', error);
            return null;
        }
    },

    // Fallback: Load local conversations
    async getLocalConversations() {
        try {
            const response = await fetch('./conversations.json?t=' + Date.now());
            return await response.json();
        } catch (error) {
            console.error('Error loading local conversations:', error);
            return { conversations: [] };
        }
    },

    // Fallback: Load local LSA data
    async getLocalLSAData() {
        try {
            const response = await fetch('./data/lsa-leads.json?t=' + Date.now());
            const data = await response.json();
            return {
                success: true,
                data: data
            };
        } catch (error) {
            console.error('Error loading local LSA data:', error);
            return { success: false, data: { rollup: {}, locations: {} } };
        }
    }
};

// Make API available globally
window.RileyAPI = RILEY_API;