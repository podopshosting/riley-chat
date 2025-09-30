const AWS = require('aws-sdk');

class SecretsManager {
    constructor() {
        this.client = new AWS.SecretsManager({
            region: process.env.AWS_REGION || 'us-east-1'
        });
        this.cache = new Map();
        this.cacheTimeout = 300000; // 5 minutes
    }

    async getSecret(secretName) {
        // Check cache first
        if (this.cache.has(secretName)) {
            const cached = this.cache.get(secretName);
            if (Date.now() - cached.timestamp < this.cacheTimeout) {
                return cached.value;
            }
        }

        try {
            const data = await this.client.getSecretValue({ SecretId: secretName }).promise();
            const secret = JSON.parse(data.SecretString);

            // Cache the secret
            this.cache.set(secretName, {
                value: secret,
                timestamp: Date.now()
            });

            return secret;
        } catch (error) {
            console.error(`Error getting secret ${secretName}:`, error);
            throw error;
        }
    }

    async getTwilioCredentials() {
        return this.getSecret('TwilioCredentials');
    }

    async getDatabaseCredentials() {
        return this.getSecret('RileyDatabaseCredentials');
    }

    async getSalesforceCredentials() {
        return this.getSecret('SalesforceCredentials');
    }
}

module.exports = new SecretsManager();