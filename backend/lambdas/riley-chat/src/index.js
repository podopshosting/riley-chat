const dynamodb = require('/opt/nodejs/dynamodb-client');
const secretsManager = require('/opt/nodejs/secrets-manager');
const RileyAI = require('/opt/nodejs/riley-ai');

exports.handler = async (event) => {
    console.log('Riley Chat Lambda triggered:', JSON.stringify(event));

    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'OPTIONS,POST,GET'
    };

    try {
        const body = JSON.parse(event.body || '{}');
        const { message, phoneNumber, conversationId } = body;

        if (!message || !phoneNumber) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({
                    error: 'Message and phoneNumber are required'
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
                messages: [],
                status: 'active',
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

        // Generate AI response
        const rileyAI = new RileyAI();
        const response = await rileyAI.generateResponse(message, phoneNumber, {
            conversationHistory: conversation.messages,
            metadata: conversation.metadata
        });

        // Add Riley's response
        await dynamodb.addMessage(conversation.conversationId, {
            role: 'assistant',
            content: response,
            timestamp: Date.now()
        });

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