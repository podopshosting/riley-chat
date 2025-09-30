#!/bin/bash

# Riley Chat Deployment Script - New Architecture
# This script deploys the separated Lambda functions and sets up DynamoDB tables

set -e

REGION="us-east-1"
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
LAYER_NAME="riley-shared-layer"
API_ID="o9d5yb7oqe"

echo "🚀 Starting Riley Chat deployment to $REGION..."

# Step 1: Create DynamoDB tables
echo "📊 Setting up DynamoDB tables..."

# Create conversations table
aws dynamodb create-table \
    --table-name riley-conversations \
    --attribute-definitions \
        AttributeName=conversationId,AttributeType=S \
        AttributeName=phoneNumber,AttributeType=S \
        AttributeName=timestamp,AttributeType=N \
        AttributeName=status,AttributeType=S \
    --key-schema \
        AttributeName=conversationId,KeyType=HASH \
    --global-secondary-indexes \
        IndexName=phoneNumber-timestamp-index,Keys=["{AttributeName=phoneNumber,KeyType=HASH}","{AttributeName=timestamp,KeyType=RANGE}"],Projection="{ProjectionType=ALL}",BillingMode=PAY_PER_REQUEST \
        IndexName=status-timestamp-index,Keys=["{AttributeName=status,KeyType=HASH}","{AttributeName=timestamp,KeyType=RANGE}"],Projection="{ProjectionType=ALL}",BillingMode=PAY_PER_REQUEST \
    --billing-mode PAY_PER_REQUEST \
    --region $REGION 2>/dev/null || echo "Table riley-conversations already exists"

# Create LSA leads table
aws dynamodb create-table \
    --table-name riley-lsa-leads \
    --attribute-definitions \
        AttributeName=leadId,AttributeType=S \
        AttributeName=timestamp,AttributeType=N \
        AttributeName=phone,AttributeType=S \
    --key-schema \
        AttributeName=leadId,KeyType=HASH \
    --global-secondary-indexes \
        IndexName=phone-timestamp-index,Keys=["{AttributeName=phone,KeyType=HASH}","{AttributeName=timestamp,KeyType=RANGE}"],Projection="{ProjectionType=ALL}",BillingMode=PAY_PER_REQUEST \
    --billing-mode PAY_PER_REQUEST \
    --region $REGION 2>/dev/null || echo "Table riley-lsa-leads already exists"

# Step 2: Build and deploy Lambda layer
echo "📦 Building Lambda layer..."
cd backend/layers/riley-shared/nodejs
npm install --production
cd ..

# Package the layer
zip -r riley-shared-layer.zip nodejs -x "*/\.*"

# Publish the layer
LAYER_VERSION=$(aws lambda publish-layer-version \
    --layer-name $LAYER_NAME \
    --description "Shared code for Riley Lambda functions" \
    --zip-file fileb://riley-shared-layer.zip \
    --compatible-runtimes nodejs18.x \
    --region $REGION \
    --query Version \
    --output text)

LAYER_ARN="arn:aws:lambda:$REGION:$ACCOUNT_ID:layer:$LAYER_NAME:$LAYER_VERSION"
echo "✅ Layer published: $LAYER_ARN"

cd ../../../

# Step 3: Deploy Lambda functions
echo "🔧 Deploying Lambda functions..."

# Function deployment helper
deploy_function() {
    local FUNCTION_NAME=$1
    local HANDLER=$2
    local TIMEOUT=$3

    echo "  Deploying $FUNCTION_NAME..."

    cd backend/lambdas/$FUNCTION_NAME

    # Create deployment package
    zip -r deployment.zip src/ package.json -x "*/\.*"

    # Check if function exists
    if aws lambda get-function --function-name $FUNCTION_NAME --region $REGION 2>/dev/null; then
        # Update existing function
        aws lambda update-function-code \
            --function-name $FUNCTION_NAME \
            --zip-file fileb://deployment.zip \
            --region $REGION > /dev/null

        aws lambda update-function-configuration \
            --function-name $FUNCTION_NAME \
            --layers $LAYER_ARN \
            --timeout $TIMEOUT \
            --region $REGION > /dev/null
    else
        # Create new function
        aws lambda create-function \
            --function-name $FUNCTION_NAME \
            --runtime nodejs18.x \
            --role arn:aws:iam::$ACCOUNT_ID:role/riley-lambda-role \
            --handler $HANDLER \
            --zip-file fileb://deployment.zip \
            --layers $LAYER_ARN \
            --timeout $TIMEOUT \
            --memory-size 256 \
            --environment Variables={AWS_REGION=$REGION} \
            --region $REGION > /dev/null
    fi

    rm deployment.zip
    cd ../../../
    echo "  ✅ $FUNCTION_NAME deployed"
}

# Deploy all functions
deploy_function "riley-chat" "src/index.handler" 30
deploy_function "riley-twilio" "src/index.handler" 30
deploy_function "riley-conversations" "src/index.handler" 30
deploy_function "riley-lsa" "src/index.handler" 30

# Step 4: Update API Gateway integrations
echo "🌐 Updating API Gateway integrations..."

update_integration() {
    local RESOURCE_PATH=$1
    local FUNCTION_NAME=$2
    local HTTP_METHOD=$3

    echo "  Updating $RESOURCE_PATH -> $FUNCTION_NAME..."

    # Get resource ID
    RESOURCE_ID=$(aws apigateway get-resources \
        --rest-api-id $API_ID \
        --region $REGION \
        --query "items[?path=='$RESOURCE_PATH'].id" \
        --output text)

    if [ -z "$RESOURCE_ID" ]; then
        echo "  ⚠️  Resource $RESOURCE_PATH not found"
        return
    fi

    # Update integration
    aws apigateway put-integration \
        --rest-api-id $API_ID \
        --resource-id $RESOURCE_ID \
        --http-method $HTTP_METHOD \
        --type AWS_PROXY \
        --integration-http-method POST \
        --uri "arn:aws:apigateway:$REGION:lambda:path/2015-03-31/functions/arn:aws:lambda:$REGION:$ACCOUNT_ID:function:$FUNCTION_NAME/invocations" \
        --region $REGION > /dev/null

    # Add Lambda permission
    aws lambda add-permission \
        --function-name $FUNCTION_NAME \
        --statement-id "apigateway-$HTTP_METHOD-$(date +%s)" \
        --action lambda:InvokeFunction \
        --principal apigateway.amazonaws.com \
        --source-arn "arn:aws:execute-api:$REGION:$ACCOUNT_ID:$API_ID/*/$HTTP_METHOD$RESOURCE_PATH" \
        --region $REGION 2>/dev/null || true
}

# Update all API Gateway integrations
update_integration "/riley" "riley-chat" "POST"
update_integration "/riley/twilio" "riley-twilio" "POST"
update_integration "/riley/conversations" "riley-conversations" "GET"
update_integration "/riley/conversations" "riley-conversations" "POST"
update_integration "/lsa" "riley-lsa" "POST"

# Step 5: Deploy API changes
echo "🚀 Deploying API Gateway..."
aws apigateway create-deployment \
    --rest-api-id $API_ID \
    --stage-name prod \
    --region $REGION > /dev/null

echo "✅ Deployment complete!"
echo ""
echo "📌 API Endpoints:"
echo "  - Chat: https://$API_ID.execute-api.$REGION.amazonaws.com/prod/riley"
echo "  - Twilio: https://$API_ID.execute-api.$REGION.amazonaws.com/prod/riley/twilio"
echo "  - Conversations: https://$API_ID.execute-api.$REGION.amazonaws.com/prod/riley/conversations"
echo "  - LSA: https://$API_ID.execute-api.$REGION.amazonaws.com/prod/lsa"
echo ""
echo "📊 DynamoDB Tables:"
echo "  - riley-conversations"
echo "  - riley-lsa-leads"
echo ""
echo "🎯 Next steps:"
echo "  1. Test the endpoints"
echo "  2. Update frontend to use new conversation API"
echo "  3. Configure Twilio webhook URL"
echo "  4. Monitor CloudWatch logs"