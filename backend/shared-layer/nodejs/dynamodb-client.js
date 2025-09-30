const AWS = require('aws-sdk');

class DynamoDBClient {
    constructor() {
        this.client = new AWS.DynamoDB.DocumentClient({
            region: process.env.AWS_REGION || 'us-east-1'
        });
    }

    async saveConversation(conversation) {
        const params = {
            TableName: 'riley-conversations',
            Item: {
                conversationId: conversation.id || `${conversation.phoneNumber}-${Date.now()}`,
                phoneNumber: conversation.phoneNumber,
                timestamp: Date.now(),
                messages: conversation.messages || [],
                status: conversation.status || 'active',
                metadata: conversation.metadata || {},
                ttl: Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60) // 30 days
            }
        };

        try {
            await this.client.put(params).promise();
            return params.Item;
        } catch (error) {
            console.error('Error saving conversation:', error);
            throw error;
        }
    }

    async getConversation(conversationId) {
        const params = {
            TableName: 'riley-conversations',
            Key: { conversationId }
        };

        try {
            const result = await this.client.get(params).promise();
            return result.Item;
        } catch (error) {
            console.error('Error getting conversation:', error);
            throw error;
        }
    }

    async getConversationsByPhone(phoneNumber) {
        const params = {
            TableName: 'riley-conversations',
            IndexName: 'phoneNumber-timestamp-index',
            KeyConditionExpression: 'phoneNumber = :phone',
            ExpressionAttributeValues: {
                ':phone': phoneNumber
            },
            ScanIndexForward: false,
            Limit: 10
        };

        try {
            const result = await this.client.query(params).promise();
            return result.Items;
        } catch (error) {
            console.error('Error getting conversations by phone:', error);
            throw error;
        }
    }

    async getRecentConversations(limit = 50) {
        const params = {
            TableName: 'riley-conversations',
            IndexName: 'status-timestamp-index',
            KeyConditionExpression: '#status = :status',
            ExpressionAttributeNames: {
                '#status': 'status'
            },
            ExpressionAttributeValues: {
                ':status': 'active'
            },
            ScanIndexForward: false,
            Limit: limit
        };

        try {
            const result = await this.client.query(params).promise();
            return result.Items;
        } catch (error) {
            console.error('Error getting recent conversations:', error);
            throw error;
        }
    }

    async updateConversationStatus(conversationId, status) {
        const params = {
            TableName: 'riley-conversations',
            Key: { conversationId },
            UpdateExpression: 'SET #status = :status, updatedAt = :now',
            ExpressionAttributeNames: {
                '#status': 'status'
            },
            ExpressionAttributeValues: {
                ':status': status,
                ':now': Date.now()
            },
            ReturnValues: 'ALL_NEW'
        };

        try {
            const result = await this.client.update(params).promise();
            return result.Attributes;
        } catch (error) {
            console.error('Error updating conversation status:', error);
            throw error;
        }
    }

    async addMessage(conversationId, message) {
        const params = {
            TableName: 'riley-conversations',
            Key: { conversationId },
            UpdateExpression: 'SET messages = list_append(if_not_exists(messages, :empty), :msg), updatedAt = :now',
            ExpressionAttributeValues: {
                ':msg': [message],
                ':empty': [],
                ':now': Date.now()
            },
            ReturnValues: 'ALL_NEW'
        };

        try {
            const result = await this.client.update(params).promise();
            return result.Attributes;
        } catch (error) {
            console.error('Error adding message:', error);
            throw error;
        }
    }
}

module.exports = new DynamoDBClient();