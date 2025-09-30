const dynamodb = require('/opt/nodejs/dynamodb-client');
const secretsManager = require('/opt/nodejs/secrets-manager');

exports.handler = async (event) => {
    console.log('Riley LSA Lambda triggered:', JSON.stringify(event));

    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'OPTIONS,POST,GET'
    };

    try {
        const body = JSON.parse(event.body || '{}');

        // Extract LSA form data
        const {
            name,
            email,
            phone,
            address,
            city,
            state,
            zip,
            service,
            urgency,
            bestTime,
            comments,
            source,
            campaign
        } = body;

        // Validate required fields
        if (!name || !phone) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({
                    error: 'Name and phone are required'
                })
            };
        }

        // Create lead record
        const leadId = `lead-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const lead = {
            leadId,
            timestamp: Date.now(),
            createdAt: new Date().toISOString(),

            // Contact information
            name,
            email: email || '',
            phone,

            // Address
            address: address || '',
            city: city || '',
            state: state || '',
            zip: zip || '',

            // Service details
            service: service || 'general',
            urgency: urgency || 'normal',
            bestTime: bestTime || 'anytime',
            comments: comments || '',

            // Tracking
            source: source || 'website',
            campaign: campaign || 'direct',
            status: 'new',

            // Metadata
            userAgent: event.headers['User-Agent'] || '',
            ipAddress: event.requestContext?.identity?.sourceIp || '',
            referrer: event.headers['Referer'] || ''
        };

        // Save to DynamoDB
        const params = {
            TableName: 'riley-lsa-leads',
            Item: lead
        };

        const dynamoClient = new (require('aws-sdk')).DynamoDB.DocumentClient({
            region: process.env.AWS_REGION || 'us-east-1'
        });

        await dynamoClient.put(params).promise();

        // Send notification (placeholder for email/SMS notification)
        console.log('New LSA Lead:', lead);

        // If Twilio is configured, send SMS notification
        try {
            const twilioCredentials = await secretsManager.getTwilioCredentials();
            if (twilioCredentials && twilioCredentials.accountSid) {
                const twilio = require('twilio')(
                    twilioCredentials.accountSid,
                    twilioCredentials.authToken
                );

                // Send to admin
                await twilio.messages.create({
                    body: `New LSA Lead: ${name} - ${phone} - Service: ${service} - Urgency: ${urgency}`,
                    from: twilioCredentials.phoneNumber,
                    to: twilioCredentials.adminPhone || '+1234567890' // Replace with actual admin phone
                });
            }
        } catch (smsError) {
            console.error('SMS notification failed:', smsError);
            // Don't fail the request if SMS fails
        }

        // Return success response
        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                success: true,
                leadId,
                message: 'Thank you! We\'ll contact you soon.',
                timestamp: Date.now()
            })
        };

    } catch (error) {
        console.error('Error in Riley LSA:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({
                error: 'Internal server error',
                message: 'Failed to process your request. Please try again.'
            })
        };
    }
};