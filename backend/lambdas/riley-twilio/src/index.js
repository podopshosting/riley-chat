const twilio = require('twilio');
const dynamodb = require('/opt/nodejs/dynamodb-client');
const secretsManager = require('/opt/nodejs/secrets-manager');
const RileyAI = require('/opt/nodejs/riley-ai');
const businessHoursHelper = require('/opt/nodejs/business-hours-helper');
const openaiClient = require('/opt/nodejs/openai-client');

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

        // Check if outside business hours
        const shouldSendAfterHours = await businessHoursHelper.shouldSendAfterHoursMessage();
        let response;

        if (shouldSendAfterHours && conversation.messages.length <= 1) {
            // Send after-hours message (only for first message)
            response = businessHoursHelper.getAfterHoursMessage();
            console.log('Sending after-hours message:', response);
        } else {
            // Generate Riley's response with ChatGPT if available, otherwise RileyAI
            try {
                const intentAnalysis = await openaiClient.analyzeIntent(body);
                const settings = await dynamodb.getSettings();
                const context = {
                    companyName: settings?.company?.name || 'Panda Exteriors',
                    personality: settings?.settings?.personality || 'Professional and friendly',
                    companyDetails: settings?.company || {},
                    negativeFilters: settings?.negative || [],
                    threadHistory: conversation.messages.slice(-5)
                };

                response = await openaiClient.generateResponse(body, context);

                // Check for appointment booking
                if (intentAnalysis?.intent === 'booking' || intentAnalysis?.intent === 'appointment') {
                    await dynamodb.updateConversation(conversation.conversationId, {
                        appointmentRequested: true,
                        appointmentStatus: 'pending_confirmation',
                        leadStatus: 'engaged'
                    });
                }
            } catch (error) {
                console.log('ChatGPT unavailable, using RileyAI:', error.message);
                const rileyAI = new RileyAI();
                response = await rileyAI.generateResponse(body, from, {
                    conversationHistory: conversation.messages,
                    metadata: conversation.metadata,
                    channel: 'sms'
                });
            }
        }

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