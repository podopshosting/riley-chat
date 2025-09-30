const AWS = require('aws-sdk');
const dynamodb = new AWS.DynamoDB.DocumentClient();
const secretsManager = new AWS.SecretsManager({ region: process.env.AWS_REGION });

// Twilio webhook handler for Riley chatbot
exports.handler = async (event) => {
    console.log('Twilio Webhook Event:', JSON.stringify(event, null, 2));

    // CORS headers for all responses
    const headers = {
        'Content-Type': 'text/xml',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type,X-Twilio-Signature',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
    };

    // Handle OPTIONS request for CORS
    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            headers,
            body: ''
        };
    }

    try {
        // Parse Twilio webhook data
        let twilioData;
        if (typeof event.body === 'string') {
            // Parse URL-encoded form data from Twilio
            twilioData = {};
            const params = new URLSearchParams(event.body);
            for (const [key, value] of params) {
                twilioData[key] = value;
            }
        } else {
            twilioData = event.body;
        }

        console.log('Parsed Twilio Data:', twilioData);

        // Extract important fields
        const {
            From: fromNumber,
            To: toNumber,
            Body: messageBody,
            MessageSid: messageSid,
            AccountSid: accountSid,
            FromCity: fromCity,
            FromState: fromState,
            FromCountry: fromCountry,
            NumMedia: numMedia
        } = twilioData;

        // Store conversation in DynamoDB
        const conversationId = `${fromNumber}_${Date.now()}`;
        const timestamp = new Date().toISOString();

        const conversationItem = {
            id: conversationId,
            phoneNumber: fromNumber,
            toNumber: toNumber,
            message: messageBody,
            messageSid: messageSid,
            timestamp: timestamp,
            location: {
                city: fromCity || 'Unknown',
                state: fromState || 'Unknown',
                country: fromCountry || 'US'
            },
            status: 'active',
            type: 'inbound',
            processed: false
        };

        // Save to DynamoDB
        await dynamodb.put({
            TableName: 'riley-conversations',
            Item: conversationItem
        }).promise().catch(err => {
            console.log('DynamoDB table may not exist yet, continuing...', err);
        });

        // Generate Riley's response
        const rileyResponse = await generateRileyResponse(messageBody, fromNumber);

        // Create TwiML response
        const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Message>${rileyResponse}</Message>
</Response>`;

        // Log the response for monitoring
        console.log('Riley Response:', rileyResponse);

        // Store Riley's response in DynamoDB
        const responseItem = {
            id: `riley_${conversationId}`,
            phoneNumber: fromNumber,
            toNumber: toNumber,
            message: rileyResponse,
            timestamp: new Date().toISOString(),
            type: 'outbound',
            status: 'sent',
            inReplyTo: messageSid
        };

        await dynamodb.put({
            TableName: 'riley-conversations',
            Item: responseItem
        }).promise().catch(err => {
            console.log('Could not store response, continuing...', err);
        });

        return {
            statusCode: 200,
            headers,
            body: twiml
        };

    } catch (error) {
        console.error('Error processing Twilio webhook:', error);

        // Return a friendly error message to the sender
        const errorTwiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Message>Thanks for your message! Our team will get back to you shortly.</Message>
</Response>`;

        return {
            statusCode: 200,
            headers,
            body: errorTwiml
        };
    }
};

// Generate Riley's AI response based on the message
async function generateRileyResponse(message, phoneNumber) {
    const lowerMessage = message.toLowerCase().trim();

    // Simple keyword-based responses for now
    // This can be enhanced with OpenAI/Claude API integration later

    // Greetings
    if (lowerMessage.match(/^(hi|hello|hey|sup|greetings)/)) {
        return "Hi! I'm Riley from Panda Exteriors. How can I help you today? Are you interested in roofing, siding, or another exterior service?";
    }

    // Roofing inquiries
    if (lowerMessage.includes('roof') || lowerMessage.includes('shingle')) {
        return "Great! We specialize in roofing services. Would you like to schedule a free inspection? Please reply with your preferred date and time, and we'll confirm your appointment.";
    }

    // Siding inquiries
    if (lowerMessage.includes('siding') || lowerMessage.includes('vinyl')) {
        return "Excellent! We offer premium siding installation and repair. Can I schedule a free consultation for you? What day works best this week?";
    }

    // Pricing questions
    if (lowerMessage.includes('price') || lowerMessage.includes('cost') || lowerMessage.includes('quote')) {
        return "I'd be happy to provide you with a detailed quote! We offer free estimates. Can I have someone call you to schedule an in-person assessment? Reply YES to confirm.";
    }

    // Scheduling
    if (lowerMessage.includes('schedule') || lowerMessage.includes('appointment') || lowerMessage.includes('book')) {
        return "Perfect! I can help schedule that for you. What day and time works best? Our team is available Monday-Saturday, 8 AM to 6 PM.";
    }

    // Confirmation
    if (lowerMessage === 'yes' || lowerMessage === 'y' || lowerMessage === 'ok' || lowerMessage === 'sure') {
        return "Great! I've noted your interest. Our scheduling team will call you within the next 2 hours to confirm your appointment. Is this the best number to reach you at?";
    }

    // Contact info request
    if (lowerMessage.includes('email') || lowerMessage.includes('contact')) {
        return "You can reach us at info@pandaexteriors.com or call (555) 123-4567. Would you prefer I have someone contact you directly?";
    }

    // Thank you
    if (lowerMessage.includes('thank') || lowerMessage.includes('thanks')) {
        return "You're welcome! Is there anything else I can help you with today?";
    }

    // Emergency
    if (lowerMessage.includes('emergency') || lowerMessage.includes('urgent') || lowerMessage.includes('leak')) {
        return "For emergency services, please call our 24/7 hotline at (555) 999-8888. Someone will assist you immediately. Stay safe!";
    }

    // Default response for unrecognized messages
    return "Thanks for reaching out to Panda Exteriors! I can help you with:\n• Roofing services\n• Siding installation\n• Free estimates\n• Scheduling appointments\n\nWhat would you like to know more about?";
}

// Export for Lambda
module.exports.generateRileyResponse = generateRileyResponse;