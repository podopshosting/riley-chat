const https = require('https');
const AWS = require('aws-sdk');
const secretsManager = require('./secrets-manager');

class PodOpsClient {
    constructor() {
        this.baseUrl = null;
        this.apiKey = null;
        this.pandaAdminUrl = null;
        this.pandaAdminApiKey = null;
        this.dynamodb = new AWS.DynamoDB.DocumentClient();
    }

    async getCredentials() {
        if (!this.apiKey) {
            const podopsCredentials = await secretsManager.getPodOpsCredentials();
            this.apiKey = podopsCredentials.apiKey;
            this.baseUrl = podopsCredentials.apiUrl || 'api.podopsconnect.com';

            const pandaAdminCredentials = await secretsManager.getPandaAdminCredentials();
            this.pandaAdminApiKey = pandaAdminCredentials.apiKey;
            this.pandaAdminUrl = pandaAdminCredentials.apiUrl || 'pandaadmin.com';
        }
        return {
            podops: { apiKey: this.apiKey, baseUrl: this.baseUrl },
            pandaAdmin: { apiKey: this.pandaAdminApiKey, url: this.pandaAdminUrl }
        };
    }

    async sendSMS(phoneNumber, message, threadId = null) {
        const requestBody = {
            to: phoneNumber,
            message: message,
            threadId: threadId,
            source: 'riley-chat',
            timestamp: new Date().toISOString()
        };

        return this.makeRequest('/v1/sms/send', 'POST', requestBody);
    }

    async sendEmail(emailAddress, subject, body, threadId = null) {
        const requestBody = {
            to: emailAddress,
            subject: subject,
            body: body,
            threadId: threadId,
            source: 'riley-chat',
            timestamp: new Date().toISOString()
        };

        return this.makeRequest('/v1/email/send', 'POST', requestBody);
    }

    async createContact(contactData) {
        // Send to PandaAdmin for lead management
        const pandaAdminData = {
            firstName: contactData.firstName,
            lastName: contactData.lastName,
            email: contactData.email,
            phone: contactData.phone,
            source: 'riley-chat',
            conversationId: contactData.conversationId,
            createdAt: new Date().toISOString()
        };

        return this.makePandaAdminRequest('/api/contacts', 'POST', pandaAdminData);
    }

    async updateLead(leadId, status, notes) {
        const updateData = {
            leadId: leadId,
            status: status,
            notes: notes,
            updatedAt: new Date().toISOString(),
            updatedBy: 'riley-chat'
        };

        return this.makePandaAdminRequest(`/api/leads/${leadId}`, 'PUT', updateData);
    }

    async getMessageHistory(phoneNumber, limit = 50) {
        // Get message history from PodOps
        return this.makeRequest(`/v1/messages/history?phone=${phoneNumber}&limit=${limit}`, 'GET');
    }

    async syncWithPandaAdmin(conversationId) {
        try {
            // Get conversation from DynamoDB
            const conversation = await this.dynamodb.get({
                TableName: 'riley-conversations',
                Key: { conversationId }
            }).promise();

            if (conversation.Item) {
                // Create or update contact in PandaAdmin
                const contactData = {
                    firstName: conversation.Item.customerName?.split(' ')[0] || 'Unknown',
                    lastName: conversation.Item.customerName?.split(' ')[1] || '',
                    email: conversation.Item.email || '',
                    phone: conversation.Item.phoneNumber,
                    conversationId: conversationId
                };

                return this.createContact(contactData);
            }
        } catch (error) {
            console.error('Error syncing with PandaAdmin:', error);
            throw error;
        }
    }

    async makeRequest(path, method, body = null) {
        const creds = await this.getCredentials();
        return new Promise((resolve, reject) => {
            const options = {
                hostname: creds.podops.baseUrl,
                path: path,
                method: method,
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${creds.podops.apiKey}`,
                    'X-Source': 'riley-chat'
                }
            };

            const req = https.request(options, (res) => {
                let data = '';

                res.on('data', (chunk) => {
                    data += chunk;
                });

                res.on('end', () => {
                    try {
                        const response = JSON.parse(data);
                        if (res.statusCode >= 200 && res.statusCode < 300) {
                            resolve(response);
                        } else {
                            reject(new Error(`PodOps API error: ${response.error || 'Unknown error'}`));
                        }
                    } catch (error) {
                        reject(error);
                    }
                });
            });

            req.on('error', (error) => {
                reject(error);
            });

            if (body) {
                req.write(JSON.stringify(body));
            }
            req.end();
        });
    }

    async makePandaAdminRequest(path, method, body = null) {
        const creds = await this.getCredentials();
        return new Promise((resolve, reject) => {
            const options = {
                hostname: creds.pandaAdmin.url,
                path: path,
                method: method,
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${creds.pandaAdmin.apiKey}`,
                    'X-Source': 'riley-chat'
                }
            };

            const req = https.request(options, (res) => {
                let data = '';

                res.on('data', (chunk) => {
                    data += chunk;
                });

                res.on('end', () => {
                    try {
                        const response = JSON.parse(data);
                        if (res.statusCode >= 200 && res.statusCode < 300) {
                            resolve(response);
                        } else {
                            reject(new Error(`PandaAdmin API error: ${response.error || 'Unknown error'}`));
                        }
                    } catch (error) {
                        reject(error);
                    }
                });
            });

            req.on('error', (error) => {
                reject(error);
            });

            if (body) {
                req.write(JSON.stringify(body));
            }
            req.end();
        });
    }

    async handleIncomingWebhook(event) {
        // Handle incoming webhooks from PodOps
        try {
            const body = JSON.parse(event.body);
            const { type, data } = body;

            switch (type) {
                case 'sms.received':
                    return this.handleIncomingSMS(data);
                case 'email.received':
                    return this.handleIncomingEmail(data);
                case 'lead.updated':
                    return this.handleLeadUpdate(data);
                default:
                    console.log('Unknown webhook type:', type);
            }
        } catch (error) {
            console.error('Error handling webhook:', error);
            throw error;
        }
    }

    async handleIncomingSMS(data) {
        // Process incoming SMS through Riley
        const { from, message, messageId } = data;

        // Store in DynamoDB
        await this.dynamodb.put({
            TableName: 'riley-messages',
            Item: {
                messageId: messageId,
                phoneNumber: from,
                message: message,
                direction: 'inbound',
                timestamp: Date.now(),
                source: 'podops',
                processed: false
            }
        }).promise();

        return { success: true, messageId };
    }

    async handleIncomingEmail(data) {
        // Process incoming email
        const { from, subject, body, messageId } = data;

        await this.dynamodb.put({
            TableName: 'riley-messages',
            Item: {
                messageId: messageId,
                email: from,
                subject: subject,
                body: body,
                direction: 'inbound',
                timestamp: Date.now(),
                source: 'podops',
                channel: 'email',
                processed: false
            }
        }).promise();

        return { success: true, messageId };
    }

    async handleLeadUpdate(data) {
        // Sync lead updates from PandaAdmin
        const { leadId, status, assignedTo } = data;

        await this.dynamodb.update({
            TableName: 'riley-conversations',
            Key: { conversationId: leadId },
            UpdateExpression: 'SET leadStatus = :status, assignedTo = :assignedTo, lastUpdated = :now',
            ExpressionAttributeValues: {
                ':status': status,
                ':assignedTo': assignedTo,
                ':now': Date.now()
            }
        }).promise();

        return { success: true, leadId };
    }
}

module.exports = new PodOpsClient();