const AWS = require('aws-sdk');

// Initialize AWS services - uses Lambda's current region
const secretsManager = new AWS.SecretsManager({ region: process.env.AWS_REGION });
const dynamodb = new AWS.DynamoDB.DocumentClient();

// Cache for secrets to avoid repeated calls
let secretsCache = {};
const CACHE_EXPIRY = 3600000; // 1 hour

// Enhanced secret retrieval with caching and fallback
async function getSecret(secretName) {
    // Check cache first
    if (secretsCache[secretName] &&
        secretsCache[secretName].timestamp > Date.now() - CACHE_EXPIRY) {
        console.log(`Using cached secret: ${secretName}`);
        return secretsCache[secretName].value;
    }

    try {
        console.log(`Fetching secret: ${secretName} from region: ${process.env.AWS_REGION}`);
        const result = await secretsManager.getSecretValue({ SecretId: secretName }).promise();
        const secretValue = JSON.parse(result.SecretString);

        // Cache the secret
        secretsCache[secretName] = {
            value: secretValue,
            timestamp: Date.now()
        };

        return secretValue;
    } catch (error) {
        console.error(`Error getting secret ${secretName}:`, error);

        // Try alternative secret names for migration compatibility
        if (secretName === 'SalesForceCredentials' && !secretName.includes('East')) {
            console.log('Trying fallback secret name: SalesForceCredentialsEast2');
            return await getSecret('SalesForceCredentialsEast2');
        }

        throw error;
    }
}

// Main handler with comprehensive error handling
exports.handler = async (event, context) => {
    console.log('Riley Consolidated Handler - Starting');
    console.log('Event:', JSON.stringify(event, null, 2));
    console.log('Context:', JSON.stringify({
        functionName: context.functionName,
        functionVersion: context.functionVersion,
        invokedFunctionArn: context.invokedFunctionArn,
        memoryLimitInMB: context.memoryLimitInMB,
        awsRequestId: context.awsRequestId,
        logGroupName: context.logGroupName,
        logStreamName: context.logStreamName,
        identity: context.identity,
        clientContext: context.clientContext
    }, null, 2));

    // Parse the request
    const httpMethod = event.httpMethod || event.requestContext?.http?.method || 'GET';
    const path = event.path || event.rawPath || '/';
    const queryParams = event.queryStringParameters || {};
    const headers = event.headers || {};
    const body = event.body ? (typeof event.body === 'string' ? JSON.parse(event.body) : event.body) : {};
    const action = queryParams.action || body.action || '';

    // CORS headers for all responses
    const corsHeaders = {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
        'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS'
    };

    // Handle OPTIONS requests for CORS
    if (httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            headers: corsHeaders,
            body: JSON.stringify({ message: 'CORS preflight successful' })
        };
    }

    try {
        let response;

        // Route to appropriate handler based on path/action
        if (path.includes('/lsa') || action === 'lsa') {
            response = await handleLSA(event, body);
        } else if (path.includes('/dashboard') || action === 'dashboard') {
            response = await handleDashboard(event, body);
        } else if (path.includes('/twilio') || action === 'twilio') {
            response = await handleTwilio(event, body);
        } else if (path.includes('/crm') || action === 'crm') {
            response = await handleCRM(event, body);
        } else if (path.includes('/sheets') || action === 'sheets') {
            response = await handleSheets(event, body);
        } else if (path.includes('/api') || action === 'api') {
            response = await handleAPI(event, body);
        } else {
            // Default handler
            response = await handleStandalone(event, body);
        }

        // Ensure response has proper structure
        if (!response.statusCode) {
            response = {
                statusCode: 200,
                headers: corsHeaders,
                body: JSON.stringify(response)
            };
        } else {
            response.headers = { ...corsHeaders, ...response.headers };
        }

        console.log('Response:', JSON.stringify(response, null, 2));
        return response;

    } catch (error) {
        console.error('Riley Consolidated Error:', error);
        console.error('Stack trace:', error.stack);

        return {
            statusCode: error.statusCode || 500,
            headers: corsHeaders,
            body: JSON.stringify({
                success: false,
                error: error.message,
                requestId: context.awsRequestId
            })
        };
    }
};

// LSA (Lead Service Assistant) Handler
async function handleLSA(event, body) {
    console.log('Handling LSA request');

    try {
        // Get SalesForce credentials from Secrets Manager
        const credentials = await getSecret('SalesForceCredentials');

        // TODO: Implement actual LSA logic here
        // For now, returning mock data

        return {
            statusCode: 200,
            body: JSON.stringify({
                success: true,
                message: 'LSA function executed',
                service: 'lsa',
                timestamp: new Date().toISOString()
            })
        };
    } catch (error) {
        console.error('LSA handler error:', error);
        throw error;
    }
}

// Dashboard Handler
async function handleDashboard(event, body) {
    console.log('Handling Dashboard request');

    try {
        // TODO: Implement dashboard data retrieval from DynamoDB

        return {
            statusCode: 200,
            body: JSON.stringify({
                success: true,
                message: 'Dashboard function executed',
                service: 'dashboard',
                timestamp: new Date().toISOString()
            })
        };
    } catch (error) {
        console.error('Dashboard handler error:', error);
        throw error;
    }
}

// Twilio Webhook Handler
async function handleTwilio(event, body) {
    console.log('Handling Twilio webhook');

    try {
        // Parse Twilio webhook data
        const twilioData = body;

        // TODO: Process Twilio webhook
        // Store conversation in DynamoDB

        return {
            statusCode: 200,
            body: JSON.stringify({
                success: true,
                message: 'Twilio webhook processed',
                service: 'twilio',
                timestamp: new Date().toISOString()
            })
        };
    } catch (error) {
        console.error('Twilio handler error:', error);
        throw error;
    }
}

// CRM Handler
async function handleCRM(event, body) {
    console.log('Handling CRM request');

    try {
        // Get SalesForce credentials from Secrets Manager
        const credentials = await getSecret('SalesForceCredentials');

        // TODO: Implement Salesforce integration

        return {
            statusCode: 200,
            body: JSON.stringify({
                success: true,
                message: 'CRM function executed',
                service: 'crm',
                timestamp: new Date().toISOString()
            })
        };
    } catch (error) {
        console.error('CRM handler error:', error);
        throw error;
    }
}

// Sheets Webhook Handler
async function handleSheets(event, body) {
    console.log('Handling Sheets webhook');

    try {
        // TODO: Process Google Sheets webhook

        return {
            statusCode: 200,
            body: JSON.stringify({
                success: true,
                message: 'Sheets webhook processed',
                service: 'sheets',
                timestamp: new Date().toISOString()
            })
        };
    } catch (error) {
        console.error('Sheets handler error:', error);
        throw error;
    }
}

// API Handler
async function handleAPI(event, body) {
    console.log('Handling API request');

    try {
        // Example: Get Twitter credentials if needed
        // const twitterCreds = await getSecret('twitterKeys');

        // TODO: Implement API functionality

        return {
            statusCode: 200,
            body: JSON.stringify({
                success: true,
                message: 'API function executed',
                service: 'api',
                timestamp: new Date().toISOString()
            })
        };
    } catch (error) {
        console.error('API handler error:', error);
        throw error;
    }
}

// Standalone Handler (default)
async function handleStandalone(event, body) {
    console.log('Handling Standalone request');

    return {
        statusCode: 200,
        body: JSON.stringify({
            success: true,
            message: 'Riley standalone function executed',
            service: 'standalone',
            version: '1.0.0',
            timestamp: new Date().toISOString()
        })
    };
}