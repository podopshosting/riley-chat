const AWS = require('aws-sdk');

// Initialize AWS services
// Use current Lambda region instead of hardcoding
const secretsManager = new AWS.SecretsManager({ region: process.env.AWS_REGION });

// Helper function to get secrets
async function getSecret(secretName) {
    try {
        const result = await secretsManager.getSecretValue({ SecretId: secretName }).promise();
        return JSON.parse(result.SecretString);
    } catch (error) {
        console.error(`Error getting secret ${secretName}:`, error);
        throw error;
    }
}

// Main handler that routes to different Riley functions
exports.handler = async (event, context) => {
    console.log('Riley Consolidated Handler - Event:', JSON.stringify(event, null, 2));
    
    // Determine which Riley function to execute based on the path or action
    const path = event.path || event.rawPath || '';
    const action = event.queryStringParameters?.action || event.action || '';
    
    try {
        // Route to appropriate Riley function based on path/action
        if (path.includes('/lsa') || action === 'lsa') {
            return await handleLSA(event, context);
        } else if (path.includes('/dashboard') || action === 'dashboard') {
            return await handleDashboard(event, context);
        } else if (path.includes('/twilio') || action === 'twilio') {
            return await handleTwilio(event, context);
        } else if (path.includes('/crm') || action === 'crm') {
            return await handleCRM(event, context);
        } else if (path.includes('/sheets') || action === 'sheets') {
            return await handleSheets(event, context);
        } else if (path.includes('/api') || action === 'api') {
            return await handleAPI(event, context);
        } else {
            // Default to standalone API
            return await handleStandalone(event, context);
        }
    } catch (error) {
        console.error('Riley Consolidated Error:', error);
        return {
            statusCode: 500,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
                'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS'
            },
            body: JSON.stringify({
                success: false,
                error: error.message
            })
        };
    }
};

// LSA (Lead Service Assistant) Handler
async function handleLSA(event, context) {
    console.log('Handling LSA request');
    
    // Get SalesForce credentials
    const salesforceCredentials = await getSecret('SalesForceCredentialsEast2');
    
    return {
        statusCode: 200,
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({
            success: true,
            message: 'LSA function executed',
            service: 'lsa'
        })
    };
}

// Dashboard Handler
async function handleDashboard(event, context) {
    console.log('Handling Dashboard request');
    
    return {
        statusCode: 200,
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({
            success: true,
            message: 'Dashboard function executed',
            service: 'dashboard'
        })
    };
}

// Twilio Webhook Handler
async function handleTwilio(event, context) {
    console.log('Handling Twilio webhook');
    
    return {
        statusCode: 200,
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({
            success: true,
            message: 'Twilio webhook processed',
            service: 'twilio'
        })
    };
}

// CRM Handler
async function handleCRM(event, context) {
    console.log('Handling CRM request');
    
    // Get SalesForce credentials
    const salesforceCredentials = await getSecret('SalesForceCredentialsEast2');
    
    return {
        statusCode: 200,
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({
            success: true,
            message: 'CRM function executed',
            service: 'crm'
        })
    };
}

// Sheets Webhook Handler
async function handleSheets(event, context) {
    console.log('Handling Sheets webhook');
    
    return {
        statusCode: 200,
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({
            success: true,
            message: 'Sheets webhook processed',
            service: 'sheets'
        })
    };
}

// API Handler
async function handleAPI(event, context) {
    console.log('Handling API request');
    
    // Get Twitter credentials if needed
    const twitterCredentials = await getSecret('twitterKeysEast2');
    
    return {
        statusCode: 200,
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({
            success: true,
            message: 'API function executed',
            service: 'api'
        })
    };
}

// Standalone Handler (default)
async function handleStandalone(event, context) {
    console.log('Handling Standalone request');
    
    return {
        statusCode: 200,
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({
            success: true,
            message: 'Riley standalone function executed',
            service: 'standalone'
        })
    };
}