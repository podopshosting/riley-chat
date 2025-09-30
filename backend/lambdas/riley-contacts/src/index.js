const AWS = require('aws-sdk');
const dynamodb = new AWS.DynamoDB.DocumentClient();

exports.handler = async (event) => {
    console.log('Riley Contacts Lambda triggered:', JSON.stringify(event));

    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'OPTIONS,POST,GET,PUT,DELETE'
    };

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    try {
        const method = event.httpMethod;
        const path = event.path;
        const queryParams = event.queryStringParameters || {};

        // Route requests
        if (path.includes('/contacts') && method === 'GET' && queryParams.contactId) {
            return await getContact(queryParams.contactId, headers);
        } else if (path.includes('/contacts') && method === 'GET') {
            return await getAllContacts(queryParams, headers);
        } else if (path.includes('/contacts') && method === 'POST') {
            return await createContact(event, headers);
        } else if (path.includes('/contacts') && method === 'PUT') {
            return await updateContact(event, headers);
        } else if (path.includes('/contacts') && method === 'DELETE') {
            return await deleteContact(queryParams.contactId, headers);
        } else if (path.includes('/custom-fields') && method === 'GET') {
            return await getCustomFields(headers);
        } else if (path.includes('/custom-fields') && method === 'POST') {
            return await createCustomField(event, headers);
        } else if (path.includes('/segments') && method === 'GET') {
            return await getSegments(headers);
        } else if (path.includes('/segments') && method === 'POST') {
            return await createSegment(event, headers);
        } else {
            return { statusCode: 404, headers, body: JSON.stringify({ error: 'Not found' }) };
        }
    } catch (error) {
        console.error('Error:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: 'Internal server error', message: error.message })
        };
    }
};

// Get single contact with activity history
async function getContact(contactId, headers) {
    const contact = await dynamodb.get({
        TableName: 'riley-contacts',
        Key: { contactId }
    }).promise();

    if (!contact.Item) {
        return { statusCode: 404, headers, body: JSON.stringify({ error: 'Contact not found' }) };
    }

    // Get conversation history
    const conversations = await dynamodb.query({
        TableName: 'riley-conversations',
        IndexName: 'phoneNumber-index',
        KeyConditionExpression: 'phoneNumber = :phone',
        ExpressionAttributeValues: { ':phone': contact.Item.phoneNumber }
    }).promise();

    // Format activity history
    const activity = conversations.Items.map(conv => ({
        conversationId: conv.conversationId,
        messages: conv.messages || [],
        startTime: conv.metadata?.startTime,
        status: conv.status,
        channel: conv.channel || 'sms'
    }));

    return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
            contact: contact.Item,
            activity: activity,
            totalConversations: activity.length
        })
    };
}

// Get all contacts with optional filtering
async function getAllContacts(queryParams, headers) {
    const { leadStatus, segment, limit = 100, lastKey } = queryParams;

    let result;

    if (leadStatus) {
        // Query by lead status
        result = await dynamodb.query({
            TableName: 'riley-contacts',
            IndexName: 'status-index',
            KeyConditionExpression: 'leadStatus = :status',
            ExpressionAttributeValues: { ':status': leadStatus },
            Limit: parseInt(limit),
            ExclusiveStartKey: lastKey ? JSON.parse(Buffer.from(lastKey, 'base64').toString()) : undefined
        }).promise();
    } else {
        // Scan all contacts
        result = await dynamodb.scan({
            TableName: 'riley-contacts',
            Limit: parseInt(limit),
            ExclusiveStartKey: lastKey ? JSON.parse(Buffer.from(lastKey, 'base64').toString()) : undefined
        }).promise();
    }

    // Filter by segment if specified
    let contacts = result.Items;
    if (segment) {
        const segmentData = await dynamodb.get({
            TableName: 'riley-segments',
            Key: { segmentId: segment }
        }).promise();

        if (segmentData.Item) {
            contacts = filterBySegment(contacts, segmentData.Item);
        }
    }

    return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
            contacts,
            count: contacts.length,
            lastKey: result.LastEvaluatedKey ? Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString('base64') : null
        })
    };
}

// Create new contact
async function createContact(event, headers) {
    const body = JSON.parse(event.body || '{}');
    const { firstName, lastName, email, phoneNumber, tags = [], customFields = {}, leadStatus = 'new' } = body;

    if (!phoneNumber && !email) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Phone or email required' }) };
    }

    const contactId = `contact-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const contact = {
        contactId,
        firstName: firstName || '',
        lastName: lastName || '',
        email: email || '',
        phoneNumber: phoneNumber || '',
        fullName: `${firstName || ''} ${lastName || ''}`.trim(),
        leadStatus,
        tags,
        customFields,
        source: body.source || 'manual',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        lastActivity: Date.now(),
        conversationCount: 0,
        notes: body.notes || ''
    };

    await dynamodb.put({
        TableName: 'riley-contacts',
        Item: contact
    }).promise();

    return {
        statusCode: 201,
        headers,
        body: JSON.stringify({ success: true, contact })
    };
}

// Update contact
async function updateContact(event, headers) {
    const body = JSON.parse(event.body || '{}');
    const { contactId, ...updates } = body;

    if (!contactId) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'contactId required' }) };
    }

    // Build update expression
    const updateExpressions = [];
    const expressionAttributeNames = {};
    const expressionAttributeValues = {};

    Object.keys(updates).forEach((key, index) => {
        updateExpressions.push(`#attr${index} = :val${index}`);
        expressionAttributeNames[`#attr${index}`] = key;
        expressionAttributeValues[`:val${index}`] = updates[key];
    });

    updateExpressions.push(`#updatedAt = :updatedAt`);
    expressionAttributeNames['#updatedAt'] = 'updatedAt';
    expressionAttributeValues[':updatedAt'] = Date.now();

    const result = await dynamodb.update({
        TableName: 'riley-contacts',
        Key: { contactId },
        UpdateExpression: `SET ${updateExpressions.join(', ')}`,
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: expressionAttributeValues,
        ReturnValues: 'ALL_NEW'
    }).promise();

    return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: true, contact: result.Attributes })
    };
}

// Delete contact
async function deleteContact(contactId, headers) {
    if (!contactId) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'contactId required' }) };
    }

    await dynamodb.delete({
        TableName: 'riley-contacts',
        Key: { contactId }
    }).promise();

    return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: true, message: 'Contact deleted' })
    };
}

// Get custom fields
async function getCustomFields(headers) {
    const result = await dynamodb.scan({
        TableName: 'riley-custom-fields'
    }).promise();

    return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ fields: result.Items || [] })
    };
}

// Create custom field
async function createCustomField(event, headers) {
    const body = JSON.parse(event.body || '{}');
    const { name, type, options = [], required = false } = body;

    if (!name || !type) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Name and type required' }) };
    }

    const fieldId = `field-${Date.now()}`;

    const field = {
        fieldId,
        name,
        type, // text, number, select, multiselect, date, boolean
        options,
        required,
        createdAt: Date.now()
    };

    await dynamodb.put({
        TableName: 'riley-custom-fields',
        Item: field
    }).promise();

    return {
        statusCode: 201,
        headers,
        body: JSON.stringify({ success: true, field })
    };
}

// Get segments
async function getSegments(headers) {
    const result = await dynamodb.scan({
        TableName: 'riley-segments'
    }).promise();

    return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ segments: result.Items || [] })
    };
}

// Create segment
async function createSegment(event, headers) {
    const body = JSON.parse(event.body || '{}');
    const { name, conditions = [], description = '' } = body;

    if (!name) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Name required' }) };
    }

    const segmentId = `segment-${Date.now()}`;

    const segment = {
        segmentId,
        name,
        description,
        conditions, // Array of {field, operator, value}
        createdAt: Date.now(),
        contactCount: 0
    };

    await dynamodb.put({
        TableName: 'riley-segments',
        Item: segment
    }).promise();

    return {
        statusCode: 201,
        headers,
        body: JSON.stringify({ success: true, segment })
    };
}

// Filter contacts by segment conditions
function filterBySegment(contacts, segment) {
    return contacts.filter(contact => {
        return segment.conditions.every(condition => {
            const { field, operator, value } = condition;
            const contactValue = contact[field] || contact.customFields?.[field];

            switch (operator) {
                case 'equals':
                    return contactValue === value;
                case 'contains':
                    return String(contactValue).toLowerCase().includes(String(value).toLowerCase());
                case 'startsWith':
                    return String(contactValue).startsWith(value);
                case 'greaterThan':
                    return Number(contactValue) > Number(value);
                case 'lessThan':
                    return Number(contactValue) < Number(value);
                case 'in':
                    return Array.isArray(value) && value.includes(contactValue);
                default:
                    return true;
            }
        });
    });
}