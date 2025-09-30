const AWS = require('aws-sdk');
const dynamodb = new AWS.DynamoDB.DocumentClient();

exports.handler = async (event) => {
    console.log('Riley Settings Lambda triggered:', JSON.stringify(event));

    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'OPTIONS,POST,GET,PUT'
    };

    // Handle OPTIONS preflight
    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            headers,
            body: ''
        };
    }

    try {
        const method = event.httpMethod;
        const path = event.path;

        // Route based on method and path
        if (path.includes('/settings') && method === 'GET') {
            return await getSettings(headers);
        } else if (path.includes('/settings') && method === 'PUT') {
            return await saveSettings(event, headers);
        } else if (path.includes('/scripts') && method === 'GET') {
            return await getScripts(headers);
        } else if (path.includes('/scripts') && method === 'POST') {
            return await saveScript(event, headers);
        } else if (path.includes('/scripts') && method === 'DELETE') {
            return await deleteScript(event, headers);
        } else {
            return {
                statusCode: 404,
                headers,
                body: JSON.stringify({ error: 'Endpoint not found' })
            };
        }

    } catch (error) {
        console.error('Error in Riley Settings:', error);
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

// Get all settings
async function getSettings(headers) {
    try {
        const result = await dynamodb.get({
            TableName: 'riley-settings',
            Key: { settingId: 'default' }
        }).promise();

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify(result.Item || {
                settingId: 'default',
                settings: {},
                company: {},
                negative: [],
                responses: [],
                personalities: [],
                threads: [],
                activeBot: null
            })
        };
    } catch (error) {
        console.error('Error getting settings:', error);
        throw error;
    }
}

// Save settings
async function saveSettings(event, headers) {
    try {
        const body = JSON.parse(event.body || '{}');

        const item = {
            settingId: 'default',
            ...body,
            lastUpdated: Date.now(),
            updatedBy: body.updatedBy || 'admin'
        };

        await dynamodb.put({
            TableName: 'riley-settings',
            Item: item
        }).promise();

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                success: true,
                message: 'Settings saved successfully',
                item
            })
        };
    } catch (error) {
        console.error('Error saving settings:', error);
        throw error;
    }
}

// Get all scripts
async function getScripts(headers) {
    try {
        const result = await dynamodb.scan({
            TableName: 'riley-scripts'
        }).promise();

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                scripts: result.Items || [],
                count: result.Count || 0
            })
        };
    } catch (error) {
        console.error('Error getting scripts:', error);
        throw error;
    }
}

// Save script
async function saveScript(event, headers) {
    try {
        const body = JSON.parse(event.body || '{}');
        const { name, content, type, description } = body;

        if (!name || !content) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ error: 'Name and content are required' })
            };
        }

        const scriptId = body.id || `script-${Date.now()}`;

        const item = {
            scriptId,
            name,
            content,
            type: type || 'text/plain',
            size: content.length,
            description: description || '',
            preview: content.substring(0, 200),
            uploadedAt: Date.now(),
            uploadedBy: body.uploadedBy || 'admin'
        };

        await dynamodb.put({
            TableName: 'riley-scripts',
            Item: item
        }).promise();

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                success: true,
                message: 'Script saved successfully',
                script: item
            })
        };
    } catch (error) {
        console.error('Error saving script:', error);
        throw error;
    }
}

// Delete script
async function deleteScript(event, headers) {
    try {
        const scriptId = event.queryStringParameters?.scriptId;

        if (!scriptId) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ error: 'scriptId is required' })
            };
        }

        await dynamodb.delete({
            TableName: 'riley-scripts',
            Key: { scriptId }
        }).promise();

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                success: true,
                message: 'Script deleted successfully'
            })
        };
    } catch (error) {
        console.error('Error deleting script:', error);
        throw error;
    }
}