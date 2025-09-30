const twilio = require('twilio');
const dynamodb = require('/opt/nodejs/dynamodb-client');
const secretsManager = require('/opt/nodejs/secrets-manager');
const RileyAI = require('/opt/nodejs/riley-ai');

exports.handler = async (event) => {
    console.log('Riley Twilio Lambda triggered:', JSON.stringify(event));

    try {
        // Parse Twilio webhook data
        const params = new URLSearchParams(event.body);
        const from = params.get('From');
        const to = params.get('To');
        const body = params.get('Body');
        const messageSid = params.get('MessageSid');

        if (!from || !body) {
            return {
                statusCode: 400,
                headers: { 'Content-Type': 'text/xml' },
                body: '<?xml version="1.0" encoding="UTF-8"?><Response></Response>'
            };
        }

        console.log(`Received SMS from ${from}: ${body}`);

        // Get or create conversation
        const conversations = await dynamodb.getConversationsByPhone(from);
        let conversation = conversations && conversations[0];

        if (!conversation) {
            conversation = await dynamodb.saveConversation({
                phoneNumber: from,
                messages: [],
                status: 'active',
                metadata: {
                    source: 'twilio-sms',
                    twilioNumber: to,
                    startTime: new Date().toISOString()
                }
            });
        }

        // Add incoming message
        await dynamodb.addMessage(conversation.conversationId, {
            role: 'user',
            content: body,
            timestamp: Date.now(),
            messageSid
        });

        // Generate Riley's response
        const rileyAI = new RileyAI();
        const response = await rileyAI.generateResponse(body, from, {
            conversationHistory: conversation.messages,
            metadata: conversation.metadata,
            channel: 'sms'
        });

        // Add Riley's response to conversation
        await dynamodb.addMessage(conversation.conversationId, {
            role: 'assistant',
            content: response,
            timestamp: Date.now()
        });

        // Generate TwiML response
        const twiml = new twilio.twiml.MessagingResponse();
        twiml.message(response);

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'text/xml' },
            body: twiml.toString()
        };

    } catch (error) {
        console.error('Error in Riley Twilio:', error);

        // Return empty TwiML on error to prevent Twilio errors
        const twiml = new twilio.twiml.MessagingResponse();
        twiml.message('Sorry, I\'m having technical difficulties. Please try again later.');

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'text/xml' },
            body: twiml.toString()
        };
    }
};