const dynamodb = require('/opt/nodejs/dynamodb-client');

exports.handler = async (event) => {
    console.log('Riley Conversations Lambda triggered:', JSON.stringify(event));

    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'OPTIONS,POST,GET'
    };

    try {
        const method = event.httpMethod;
        const path = event.path;
        const pathParameters = event.pathParameters || {};
        const queryStringParameters = event.queryStringParameters || {};

        // GET /conversations - Get recent conversations
        if (method === 'GET' && !pathParameters.id) {
            const limit = parseInt(queryStringParameters.limit) || 50;
            const phoneNumber = queryStringParameters.phoneNumber;

            let conversations;
            if (phoneNumber) {
                conversations = await dynamodb.getConversationsByPhone(phoneNumber);
            } else {
                conversations = await dynamodb.getRecentConversations(limit);
            }

            // Calculate stats
            const stats = {
                total: conversations.length,
                active: conversations.filter(c => c.status === 'active').length,
                resolved: conversations.filter(c => c.status === 'resolved').length,
                averageMessages: Math.round(
                    conversations.reduce((sum, c) => sum + (c.messages?.length || 0), 0) /
                    (conversations.length || 1)
                )
            };

            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({
                    conversations,
                    stats,
                    timestamp: Date.now()
                })
            };
        }

        // GET /conversations/{id} - Get specific conversation
        if (method === 'GET' && pathParameters.id) {
            const conversation = await dynamodb.getConversation(pathParameters.id);

            if (!conversation) {
                return {
                    statusCode: 404,
                    headers,
                    body: JSON.stringify({
                        error: 'Conversation not found'
                    })
                };
            }

            return {
                statusCode: 200,
                headers,
                body: JSON.stringify(conversation)
            };
        }

        // POST /conversations/{id}/status - Update conversation status
        if (method === 'POST' && pathParameters.id && path.includes('/status')) {
            const body = JSON.parse(event.body || '{}');
            const { status } = body;

            if (!status || !['active', 'resolved', 'pending'].includes(status)) {
                return {
                    statusCode: 400,
                    headers,
                    body: JSON.stringify({
                        error: 'Invalid status. Must be active, resolved, or pending'
                    })
                };
            }

            const updated = await dynamodb.updateConversationStatus(pathParameters.id, status);

            return {
                statusCode: 200,
                headers,
                body: JSON.stringify(updated)
            };
        }

        // POST /conversations/{id}/messages - Add message to conversation
        if (method === 'POST' && pathParameters.id && path.includes('/messages')) {
            const body = JSON.parse(event.body || '{}');
            const { message, role } = body;

            if (!message || !role) {
                return {
                    statusCode: 400,
                    headers,
                    body: JSON.stringify({
                        error: 'Message and role are required'
                    })
                };
            }

            const updated = await dynamodb.addMessage(pathParameters.id, {
                role,
                content: message,
                timestamp: Date.now()
            });

            return {
                statusCode: 200,
                headers,
                body: JSON.stringify(updated)
            };
        }

        // Default response for unmatched routes
        return {
            statusCode: 404,
            headers,
            body: JSON.stringify({
                error: 'Not found',
                path,
                method
            })
        };

    } catch (error) {
        console.error('Error in Riley Conversations:', error);
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