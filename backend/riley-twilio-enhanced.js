const AWS = require('aws-sdk');
const twilio = require('twilio');

// Initialize AWS services
const secretsManager = new AWS.SecretsManager({ region: process.env.AWS_REGION || 'us-east-1' });
const dynamodb = new AWS.DynamoDB.DocumentClient();

// Cache for secrets
let twilioClient = null;
let twilioCredentials = null;

// Get Twilio credentials from Secrets Manager
async function getTwilioClient() {
    if (twilioClient) return twilioClient;

    try {
        const result = await secretsManager.getSecretValue({ SecretId: 'TwilioCredentials' }).promise();
        twilioCredentials = JSON.parse(result.SecretString);

        console.log('Twilio credentials loaded successfully');

        // Initialize Twilio client
        twilioClient = twilio(twilioCredentials.accountSid, twilioCredentials.authToken);
        return twilioClient;
    } catch (error) {
        console.error('Error loading Twilio credentials:', error);
        throw error;
    }
}

// Main handler for Twilio webhooks and API
exports.handler = async (event, context) => {
    console.log('Riley Twilio Handler - Event:', JSON.stringify(event, null, 2));

    const path = event.path || event.rawPath || '';
    const httpMethod = event.httpMethod || event.requestContext?.http?.method || 'GET';

    // CORS headers
    const headers = {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type,X-Twilio-Signature',
        'Access-Control-Allow-Methods': 'GET,POST,OPTIONS'
    };

    // Handle OPTIONS
    if (httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ message: 'CORS preflight successful' })
        };
    }

    try {
        // Route based on path
        if (path.includes('/twilio') || path.includes('/webhook')) {
            return await handleTwilioWebhook(event);
        } else if (path.includes('/conversations')) {
            return await getConversations();
        } else if (path.includes('/send')) {
            return await sendMessage(event);
        } else if (path.includes('/stats')) {
            return await getStats();
        }

        // Default response
        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                success: true,
                message: 'Riley Twilio API',
                version: '2.0.0',
                endpoints: {
                    webhook: '/riley/twilio',
                    conversations: '/riley/conversations',
                    send: '/riley/send',
                    stats: '/riley/stats'
                }
            })
        };

    } catch (error) {
        console.error('Handler error:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({
                success: false,
                error: error.message
            })
        };
    }
};

// Handle incoming SMS from Twilio
async function handleTwilioWebhook(event) {
    console.log('Processing Twilio webhook');

    // Parse Twilio data
    let twilioData = {};
    if (typeof event.body === 'string') {
        const params = new URLSearchParams(event.body);
        for (const [key, value] of params) {
            twilioData[key] = value;
        }
    } else {
        twilioData = event.body;
    }

    const {
        From: fromNumber,
        To: toNumber,
        Body: messageBody,
        MessageSid: messageSid,
        FromCity: fromCity,
        FromState: fromState,
        FromZip: fromZip
    } = twilioData;

    console.log(`New message from ${fromNumber}: ${messageBody}`);

    // Store incoming message
    const conversationId = `conv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const timestamp = new Date().toISOString();

    const incomingMessage = {
        id: conversationId,
        conversationId: fromNumber.replace(/\D/g, ''),
        phoneNumber: fromNumber,
        toNumber: toNumber,
        message: messageBody,
        messageSid: messageSid,
        timestamp: timestamp,
        direction: 'inbound',
        status: 'received',
        location: {
            city: fromCity || 'Unknown',
            state: fromState || 'Unknown',
            zip: fromZip || 'Unknown'
        },
        metadata: {
            processed: false,
            sentiment: analyzeSentiment(messageBody),
            intent: detectIntent(messageBody)
        }
    };

    // Save to DynamoDB
    await dynamodb.put({
        TableName: 'riley-conversations',
        Item: incomingMessage
    }).promise();

    // Generate Riley's response
    const response = await generateSmartResponse(messageBody, fromNumber, incomingMessage.metadata.intent);

    // Store Riley's response
    const responseId = `resp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const outgoingMessage = {
        id: responseId,
        conversationId: fromNumber.replace(/\D/g, ''),
        phoneNumber: fromNumber,
        toNumber: toNumber,
        message: response,
        timestamp: new Date().toISOString(),
        direction: 'outbound',
        status: 'sent',
        inReplyTo: messageSid
    };

    await dynamodb.put({
        TableName: 'riley-conversations',
        Item: outgoingMessage
    }).promise();

    // Update contact/lead information
    await updateContact(fromNumber, messageBody, incomingMessage.metadata);

    // Return TwiML response
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Message>${response}</Message>
</Response>`;

    return {
        statusCode: 200,
        headers: {
            'Content-Type': 'text/xml'
        },
        body: twiml
    };
}

// Get conversations from DynamoDB
async function getConversations() {
    const result = await dynamodb.scan({
        TableName: 'riley-conversations',
        Limit: 100,
        ScanIndexForward: false
    }).promise();

    // Group by phone number
    const conversations = {};

    (result.Items || []).forEach(item => {
        const phone = item.phoneNumber;
        if (!conversations[phone]) {
            conversations[phone] = {
                phoneNumber: phone,
                messages: [],
                lastMessage: null,
                lastMessageTime: null,
                status: 'active'
            };
        }

        conversations[phone].messages.push(item);

        if (!conversations[phone].lastMessageTime ||
            item.timestamp > conversations[phone].lastMessageTime) {
            conversations[phone].lastMessage = item.message;
            conversations[phone].lastMessageTime = item.timestamp;
        }
    });

    return {
        statusCode: 200,
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({
            success: true,
            conversations: Object.values(conversations),
            total: Object.keys(conversations).length
        })
    };
}

// Send an SMS message
async function sendMessage(event) {
    const body = JSON.parse(event.body || '{}');
    const { to, message } = body;

    if (!to || !message) {
        return {
            statusCode: 400,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                success: false,
                error: 'Missing required fields: to, message'
            })
        };
    }

    try {
        // Get Twilio client
        const client = await getTwilioClient();

        // Send SMS
        const result = await client.messages.create({
            body: message,
            from: twilioCredentials.phoneNumber,
            to: to
        });

        // Store in DynamoDB
        const messageId = `sent_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        await dynamodb.put({
            TableName: 'riley-conversations',
            Item: {
                id: messageId,
                conversationId: to.replace(/\D/g, ''),
                phoneNumber: to,
                toNumber: to,
                message: message,
                messageSid: result.sid,
                timestamp: new Date().toISOString(),
                direction: 'outbound',
                status: 'sent',
                manual: true
            }
        }).promise();

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                success: true,
                messageSid: result.sid,
                status: result.status
            })
        };
    } catch (error) {
        console.error('Error sending message:', error);
        return {
            statusCode: 500,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                success: false,
                error: error.message
            })
        };
    }
}

// Get conversation statistics
async function getStats() {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();

    // Get today's conversations
    const result = await dynamodb.scan({
        TableName: 'riley-conversations',
        FilterExpression: '#ts >= :today',
        ExpressionAttributeNames: {
            '#ts': 'timestamp'
        },
        ExpressionAttributeValues: {
            ':today': todayStart
        }
    }).promise();

    const messages = result.Items || [];
    const inbound = messages.filter(m => m.direction === 'inbound').length;
    const outbound = messages.filter(m => m.direction === 'outbound').length;
    const uniqueNumbers = [...new Set(messages.map(m => m.phoneNumber))].length;

    return {
        statusCode: 200,
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({
            success: true,
            stats: {
                messagestoday: messages.length,
                inboundToday: inbound,
                outboundToday: outbound,
                uniqueContactsToday: uniqueNumbers,
                responseRate: inbound > 0 ? Math.round((outbound / inbound) * 100) : 0,
                timestamp: now.toISOString()
            }
        })
    };
}

// Generate smart response based on intent
async function generateSmartResponse(message, phoneNumber, intent) {
    const responses = {
        greeting: "Hi! I'm Riley from Panda Exteriors. How can I help you today? Are you interested in roofing, siding, or another exterior service?",

        roofing: "Great! We specialize in roofing services. Would you like to schedule a free inspection? Please reply with your preferred date and time, and we'll confirm your appointment.",

        siding: "Excellent! We offer premium siding installation and repair. Can I schedule a free consultation for you? What day works best this week?",

        pricing: "I'd be happy to provide you with a detailed quote! We offer free estimates. Can I have someone call you to schedule an in-person assessment? Reply YES to confirm.",

        scheduling: "Perfect! I can help schedule that for you. What day and time works best? Our team is available Monday-Saturday, 8 AM to 6 PM.",

        emergency: "For emergency services, please call our 24/7 hotline at (555) 999-8888. Someone will assist you immediately. Stay safe!",

        confirmation: "Great! I've noted your interest. Our scheduling team will call you within the next 2 hours to confirm your appointment. Is this the best number to reach you at?",

        thanks: "You're welcome! Is there anything else I can help you with today?",

        contact: "You can reach us at info@pandaexteriors.com or call (555) 123-4567. Would you prefer I have someone contact you directly?",

        default: "Thanks for reaching out to Panda Exteriors! I can help you with:\n• Roofing services\n• Siding installation\n• Free estimates\n• Scheduling appointments\n\nWhat would you like to know more about?"
    };

    return responses[intent] || responses.default;
}

// Detect intent from message
function detectIntent(message) {
    const lower = message.toLowerCase();

    if (lower.match(/^(hi|hello|hey|sup|greetings)/)) return 'greeting';
    if (lower.includes('roof') || lower.includes('shingle')) return 'roofing';
    if (lower.includes('siding') || lower.includes('vinyl')) return 'siding';
    if (lower.includes('price') || lower.includes('cost') || lower.includes('quote')) return 'pricing';
    if (lower.includes('schedule') || lower.includes('appointment') || lower.includes('book')) return 'scheduling';
    if (lower.includes('emergency') || lower.includes('urgent') || lower.includes('leak')) return 'emergency';
    if (lower.includes('thank') || lower.includes('thanks')) return 'thanks';
    if (lower.includes('email') || lower.includes('contact')) return 'contact';
    if (lower === 'yes' || lower === 'y' || lower === 'ok' || lower === 'sure') return 'confirmation';

    return 'default';
}

// Analyze sentiment
function analyzeSentiment(message) {
    const positive = ['yes', 'great', 'good', 'perfect', 'thanks', 'excellent', 'wonderful'];
    const negative = ['no', 'bad', 'terrible', 'awful', 'hate', 'angry', 'upset'];

    const lower = message.toLowerCase();

    if (positive.some(word => lower.includes(word))) return 'positive';
    if (negative.some(word => lower.includes(word))) return 'negative';

    return 'neutral';
}

// Update contact information
async function updateContact(phoneNumber, message, metadata) {
    const contactId = phoneNumber.replace(/\D/g, '');

    try {
        await dynamodb.update({
            TableName: 'riley-contacts',
            Key: { id: contactId },
            UpdateExpression: 'SET #phone = :phone, #lastContact = :now, #intent = :intent, #sentiment = :sentiment, #messageCount = if_not_exists(#messageCount, :zero) + :one',
            ExpressionAttributeNames: {
                '#phone': 'phoneNumber',
                '#lastContact': 'lastContact',
                '#intent': 'lastIntent',
                '#sentiment': 'lastSentiment',
                '#messageCount': 'messageCount'
            },
            ExpressionAttributeValues: {
                ':phone': phoneNumber,
                ':now': new Date().toISOString(),
                ':intent': metadata.intent,
                ':sentiment': metadata.sentiment,
                ':zero': 0,
                ':one': 1
            }
        }).promise();
    } catch (error) {
        console.log('Contact update error (table may not exist):', error.message);
    }
}