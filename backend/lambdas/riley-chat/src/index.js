const dynamodb = require('/opt/nodejs/dynamodb-client');
const secretsManager = require('/opt/nodejs/secrets-manager');
const RileyAI = require('/opt/nodejs/riley-ai');
const openaiClient = require('/opt/nodejs/openai-client');
const podopsClient = require('/opt/nodejs/podops-client');

exports.handler = async (event) => {
    console.log('Riley Chat Lambda triggered:', JSON.stringify(event));

    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'OPTIONS,POST,GET'
    };

    try {
        const body = JSON.parse(event.body || '{}');
        const { message, phoneNumber, email, conversationId, channel = 'sms', useAI = true } = body;

        if (!message || (!phoneNumber && !email)) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({
                    error: 'Message and either phoneNumber or email are required'
                })
            };
        }

        // Get or create conversation
        let conversation;
        if (conversationId) {
            conversation = await dynamodb.getConversation(conversationId);
        }

        if (!conversation) {
            conversation = await dynamodb.saveConversation({
                phoneNumber,
                email,
                messages: [],
                status: 'active',
                channel,
                metadata: {
                    source: 'web',
                    startTime: new Date().toISOString()
                }
            });
        }

        // Add user message
        await dynamodb.addMessage(conversation.conversationId, {
            role: 'user',
            content: message,
            timestamp: Date.now()
        });

        // Analyze intent with ChatGPT
        let intentAnalysis = null;
        if (useAI) {
            intentAnalysis = await openaiClient.analyzeIntent(message);
            console.log('Intent analysis:', intentAnalysis);
        }

        // Generate response
        let response;
        if (useAI) {
            // Get training data and personality from settings
            const settings = await dynamodb.getSettings();
            const context = {
                companyName: settings?.company?.name || 'Panda Exteriors',
                personality: settings?.activeBot?.personality || 'Professional and friendly',
                companyDetails: settings?.company || {},
                negativeFilters: settings?.negative || [],
                threadHistory: conversation.messages.slice(-5) // Last 5 messages for context
            };

            // Generate AI response with ChatGPT
            response = await openaiClient.generateResponse(message, context);
        } else {
            // Fall back to RileyAI
            const rileyAI = new RileyAI();
            response = await rileyAI.generateResponse(message, phoneNumber || email, {
                conversationHistory: conversation.messages,
                metadata: conversation.metadata
            });
        }

        // Send response through appropriate channel
        if (channel === 'email' && email) {
            await podopsClient.sendEmail(
                email,
                `Re: ${intentAnalysis?.suggestedAction || 'Your inquiry'}`,
                response,
                conversation.conversationId
            );
        } else if (phoneNumber) {
            await podopsClient.sendSMS(
                phoneNumber,
                response,
                conversation.conversationId
            );
        }

        // Add Riley's response
        await dynamodb.addMessage(conversation.conversationId, {
            role: 'assistant',
            content: response,
            timestamp: Date.now(),
            intent: intentAnalysis
        });

        // Sync with PandaAdmin if it's a qualified lead
        if (intentAnalysis?.intent === 'booking' || intentAnalysis?.urgency === 'high') {
            await podopsClient.syncWithPandaAdmin(conversation.conversationId);
        }

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                conversationId: conversation.conversationId,
                response,
                timestamp: Date.now()
            })
        };

    } catch (error) {
        console.error('Error in Riley Chat:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({
                error: 'Internal server error',
                message: error.message
            })
        };
    }
};