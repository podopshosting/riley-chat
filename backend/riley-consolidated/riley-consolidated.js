const AWS = require('aws-sdk');
const twilioWebhook = require('./twilio-webhook');

// Initialize AWS services
const secretsManager = new AWS.SecretsManager({ region: process.env.AWS_REGION });
const dynamodb = new AWS.DynamoDB.DocumentClient();

// Main handler that routes to different Riley functions
exports.handler = async (event, context) => {
    console.log('Riley Handler - Event:', JSON.stringify(event, null, 2));

    const path = event.path || event.rawPath || '';
    const httpMethod = event.httpMethod || event.requestContext?.http?.method || 'GET';

    // CORS headers
    const corsHeaders = {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,X-Twilio-Signature',
        'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS'
    };

    // Handle OPTIONS
    if (httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            headers: corsHeaders,
            body: JSON.stringify({ message: 'CORS preflight successful' })
        };
    }

    try {
        // Route to Twilio webhook handler
        if (path.includes('/twilio') || path.includes('/webhook')) {
            return await twilioWebhook.handler(event);
        }

        // Get conversations from DynamoDB
        if (path.includes('/conversations')) {
            const result = await dynamodb.scan({
                TableName: 'riley-conversations',
                Limit: 50
            }).promise().catch(err => {
                console.log('DynamoDB error:', err);
                return { Items: [] };
            });

            return {
                statusCode: 200,
                headers: corsHeaders,
                body: JSON.stringify({
                    success: true,
                    conversations: result.Items || []
                })
            };
        }

        // Default response
        return {
            statusCode: 200,
            headers: corsHeaders,
            body: JSON.stringify({
                success: true,
                message: 'Riley API is running',
                version: '2.0.0',
                endpoints: {
                    twilio: '/riley/twilio',
                    conversations: '/riley/conversations'
                }
            })
        };

    } catch (error) {
        console.error('Error:', error);
        return {
            statusCode: 500,
            headers: corsHeaders,
            body: JSON.stringify({
                success: false,
                error: error.message
            })
        };
    }
};
