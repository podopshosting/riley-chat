#!/bin/bash

# Deploy updates to Riley Chat Lambda functions

RILEY_REGION="us-east-1"
LAYER_ARN="arn:aws:lambda:us-east-1:899383035514:layer:riley-shared-layer:5"

echo "Deploying updated Lambda functions..."

# Update riley-chat function
echo "Updating riley-chat..."
cd backend/lambdas/riley-chat
zip -r riley-chat.zip src/
aws lambda update-function-code --function-name riley-chat --zip-file fileb://riley-chat.zip --region $RILEY_REGION
aws lambda update-function-configuration --function-name riley-chat --layers $LAYER_ARN --region $RILEY_REGION
rm riley-chat.zip
cd ../../..

# Update riley-twilio function
echo "Updating riley-twilio..."
cd backend/lambdas/riley-twilio
zip -r riley-twilio.zip src/
aws lambda update-function-code --function-name riley-twilio --zip-file fileb://riley-twilio.zip --region $RILEY_REGION
aws lambda update-function-configuration --function-name riley-twilio --layers $LAYER_ARN --region $RILEY_REGION
rm riley-twilio.zip
cd ../../..

# Update riley-conversations function
echo "Updating riley-conversations..."
cd backend/lambdas/riley-conversations
zip -r riley-conversations.zip src/
aws lambda update-function-code --function-name riley-conversations --zip-file fileb://riley-conversations.zip --region $RILEY_REGION
aws lambda update-function-configuration --function-name riley-conversations --layers $LAYER_ARN --region $RILEY_REGION
rm riley-conversations.zip
cd ../../..

# Update riley-lsa function
echo "Updating riley-lsa..."
cd backend/lambdas/riley-lsa
zip -r riley-lsa.zip src/
aws lambda update-function-code --function-name riley-lsa --zip-file fileb://riley-lsa.zip --region $RILEY_REGION
aws lambda update-function-configuration --function-name riley-lsa --layers $LAYER_ARN --region $RILEY_REGION
rm riley-lsa.zip
cd ../../..

# Add PodOps webhook Lambda
echo "Creating riley-podops-webhook..."
cd backend/lambdas
mkdir -p riley-podops-webhook/src
cat > riley-podops-webhook/src/index.js << 'EOF'
const podopsClient = require('/opt/nodejs/podops-client');

exports.handler = async (event) => {
    console.log('PodOps Webhook received:', JSON.stringify(event));

    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'OPTIONS,POST'
    };

    try {
        const result = await podopsClient.handleIncomingWebhook(event);

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify(result)
        };
    } catch (error) {
        console.error('Error handling PodOps webhook:', error);
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
EOF

cd riley-podops-webhook
zip -r riley-podops-webhook.zip src/
aws lambda create-function \
    --function-name riley-podops-webhook \
    --runtime nodejs18.x \
    --role arn:aws:iam::899383035514:role/riley-lambda-role \
    --handler src/index.handler \
    --zip-file fileb://riley-podops-webhook.zip \
    --timeout 30 \
    --memory-size 256 \
    --layers $LAYER_ARN \
    --region $RILEY_REGION \
    2>/dev/null || \
aws lambda update-function-code --function-name riley-podops-webhook --zip-file fileb://riley-podops-webhook.zip --region $RILEY_REGION

aws lambda update-function-configuration --function-name riley-podops-webhook --layers $LAYER_ARN --region $RILEY_REGION

rm riley-podops-webhook.zip
cd ../../..

echo ""
echo "✅ Lambda functions updated successfully!"
echo ""
echo "Next steps:"
echo "1. Run ./update-secrets.sh to add API keys to AWS Secrets Manager"
echo "2. Update PodOps and PandaAdmin API keys in Secrets Manager"
echo "3. Configure PodOps webhook URL: https://3bs6b8x5jl.execute-api.us-east-1.amazonaws.com/prod/webhook/podops"