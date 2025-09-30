#!/bin/bash

# Riley Chatbot - Twilio Integration Setup
# This script sets up the Twilio webhook and integrates with Riley Lambda

set -e

echo "================================================"
echo "Riley Twilio Integration Setup"
echo "================================================"

# Configuration
REGION="us-east-1"
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
API_GATEWAY_ID="cbtr8iqu56"

echo ""
echo "📱 Setting up Twilio Webhook Integration..."
echo ""

# Step 1: Create DynamoDB table for conversations
echo "Step 1: Creating DynamoDB table for conversations..."
aws dynamodb create-table \
    --table-name riley-conversations \
    --attribute-definitions \
        AttributeName=id,AttributeType=S \
        AttributeName=phoneNumber,AttributeType=S \
    --key-schema \
        AttributeName=id,KeyType=HASH \
    --global-secondary-indexes \
        "IndexName=PhoneNumberIndex,Keys=[{AttributeName=phoneNumber,KeyType=HASH}],Projection={ProjectionType=ALL},ProvisionedThroughput={ReadCapacityUnits=5,WriteCapacityUnits=5}" \
    --provisioned-throughput ReadCapacityUnits=5,WriteCapacityUnits=5 \
    --region $REGION 2>/dev/null || echo "  Table already exists"

# Step 2: Update Lambda to include Twilio webhook
echo ""
echo "Step 2: Adding Twilio webhook handler to Lambda..."

cd "/Users/Brian 1/Documents/GitHub/riley-chat/backend/riley-consolidated"

# Copy the Twilio webhook handler
cp ../twilio-webhook.js .

# Update the main handler to include Twilio webhook
cat > riley-consolidated-with-twilio.js << 'EOF'
const AWS = require('aws-sdk');
const twilioWebhook = require('./twilio-webhook');

// Initialize AWS services
const secretsManager = new AWS.SecretsManager({ region: process.env.AWS_REGION });
const dynamodb = new AWS.DynamoDB.DocumentClient();

// Main handler that routes to different Riley functions
exports.handler = async (event, context) => {
    console.log('Riley Handler - Event:', JSON.stringify(event, null, 2));

    const path = event.path || event.rawPath || '';
    const httpMethod = event.httpMethod || event.requestContext?.http?.method || 'GET';

    // CORS headers
    const corsHeaders = {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,X-Twilio-Signature',
        'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS'
    };

    // Handle OPTIONS
    if (httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            headers: corsHeaders,
            body: JSON.stringify({ message: 'CORS preflight successful' })
        };
    }

    try {
        // Route to Twilio webhook handler
        if (path.includes('/twilio') || path.includes('/webhook')) {
            return await twilioWebhook.handler(event);
        }

        // Get conversations from DynamoDB
        if (path.includes('/conversations')) {
            const result = await dynamodb.scan({
                TableName: 'riley-conversations',
                Limit: 50
            }).promise().catch(err => {
                console.log('DynamoDB error:', err);
                return { Items: [] };
            });

            return {
                statusCode: 200,
                headers: corsHeaders,
                body: JSON.stringify({
                    success: true,
                    conversations: result.Items || []
                })
            };
        }

        // Default response
        return {
            statusCode: 200,
            headers: corsHeaders,
            body: JSON.stringify({
                success: true,
                message: 'Riley API is running',
                version: '2.0.0',
                endpoints: {
                    twilio: '/riley/twilio',
                    conversations: '/riley/conversations'
                }
            })
        };

    } catch (error) {
        console.error('Error:', error);
        return {
            statusCode: 500,
            headers: corsHeaders,
            body: JSON.stringify({
                success: false,
                error: error.message
            })
        };
    }
};
EOF

mv riley-consolidated-with-twilio.js riley-consolidated.js

# Create deployment package
echo "  Creating deployment package..."
zip -r riley-consolidated.zip riley-consolidated.js twilio-webhook.js node_modules -q

# Deploy to Lambda
echo "  Deploying updated Lambda function..."
aws lambda update-function-code \
    --function-name riley-consolidated \
    --zip-file fileb://riley-consolidated.zip \
    --region $REGION > /dev/null

# Update Lambda configuration for DynamoDB access
echo "  Updating Lambda permissions for DynamoDB..."
aws lambda update-function-configuration \
    --function-name riley-consolidated \
    --timeout 60 \
    --region $REGION > /dev/null

# Step 3: Set up API Gateway routes for Twilio
echo ""
echo "Step 3: Setting up API Gateway routes..."

# Get resource IDs
ROOT_ID=$(aws apigateway get-resources --rest-api-id "$API_GATEWAY_ID" --region "$REGION" --query 'items[?path==`/`].id' --output text)
RILEY_ID=$(aws apigateway get-resources --rest-api-id "$API_GATEWAY_ID" --region "$REGION" --query 'items[?pathPart==`riley`].id' --output text)

# Create /riley/twilio resource
echo "  Creating /riley/twilio endpoint..."
TWILIO_ID=$(aws apigateway create-resource \
    --rest-api-id "$API_GATEWAY_ID" \
    --parent-id "$RILEY_ID" \
    --path-part twilio \
    --region "$REGION" \
    --query 'id' \
    --output text 2>/dev/null || \
    aws apigateway get-resources --rest-api-id "$API_GATEWAY_ID" --region "$REGION" --query 'items[?pathPart==`twilio`].id' --output text)

# Create /riley/conversations resource
echo "  Creating /riley/conversations endpoint..."
CONV_ID=$(aws apigateway create-resource \
    --rest-api-id "$API_GATEWAY_ID" \
    --parent-id "$RILEY_ID" \
    --path-part conversations \
    --region "$REGION" \
    --query 'id' \
    --output text 2>/dev/null || \
    aws apigateway get-resources --rest-api-id "$API_GATEWAY_ID" --region "$REGION" --query 'items[?pathPart==`conversations`].id' --output text)

# Set up methods
for RESOURCE_ID in "$TWILIO_ID" "$CONV_ID"; do
    for METHOD in GET POST; do
        aws apigateway put-method \
            --rest-api-id "$API_GATEWAY_ID" \
            --resource-id "$RESOURCE_ID" \
            --http-method "$METHOD" \
            --authorization-type NONE \
            --region "$REGION" 2>/dev/null || true

        aws apigateway put-integration \
            --rest-api-id "$API_GATEWAY_ID" \
            --resource-id "$RESOURCE_ID" \
            --http-method "$METHOD" \
            --type AWS_PROXY \
            --integration-http-method POST \
            --uri "arn:aws:apigateway:${REGION}:lambda:path/2015-03-31/functions/arn:aws:lambda:${REGION}:${ACCOUNT_ID}:function:riley-consolidated/invocations" \
            --region "$REGION" > /dev/null
    done

    # Set up OPTIONS for CORS
    aws apigateway put-method \
        --rest-api-id "$API_GATEWAY_ID" \
        --resource-id "$RESOURCE_ID" \
        --http-method OPTIONS \
        --authorization-type NONE \
        --region "$REGION" 2>/dev/null || true
done

# Deploy API Gateway
echo "  Deploying API Gateway..."
aws apigateway create-deployment \
    --rest-api-id "$API_GATEWAY_ID" \
    --stage-name prod \
    --region "$REGION" > /dev/null

# Step 4: Deploy updated dashboard
echo ""
echo "Step 4: Deploying updated admin dashboard..."
cd "/Users/Brian 1/Documents/GitHub/riley-chat/frontend"
aws s3 cp admin-dashboard.html s3://riley-dashboard-1754514173/ --region $REGION

echo ""
echo "================================================"
echo "✅ Twilio Integration Setup Complete!"
echo "================================================"
echo ""
echo "🔗 Your Twilio Webhook URL:"
echo "   https://${API_GATEWAY_ID}.execute-api.${REGION}.amazonaws.com/prod/riley/twilio"
echo ""
echo "📱 To configure in Twilio:"
echo "1. Go to Twilio Console > Phone Numbers"
echo "2. Select your phone number"
echo "3. In 'Messaging' section, set webhook to:"
echo "   ${WEBHOOK_URL}"
echo "4. Set method to: HTTP POST"
echo ""
echo "🖥️ Admin Dashboard:"
echo "   https://riley-dashboard-1754514173.s3-website-us-east-1.amazonaws.com/admin-dashboard.html"
echo ""
echo "📊 API Endpoints:"
echo "   - Twilio Webhook: /prod/riley/twilio"
echo "   - Conversations: /prod/riley/conversations"
echo "   - LSA Data: /prod/lsa"
echo ""
echo "🔑 Required Twilio Credentials:"
echo "   To complete the integration, you'll need:"
echo "   - Twilio Account SID"
echo "   - Twilio Auth Token"
echo "   - Twilio Phone Number"
echo ""
echo "   Store these in AWS Secrets Manager:"
echo "   aws secretsmanager create-secret --name TwilioCredentials \\"
echo "     --secret-string '{\"accountSid\":\"YOUR_SID\",\"authToken\":\"YOUR_TOKEN\",\"phoneNumber\":\"+1XXXXXXXXXX\"}' \\"
echo "     --region $REGION"