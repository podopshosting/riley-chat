#!/bin/bash

# Riley Chatbot Deployment Script - Secure Version
# This script deploys Lambda functions to us-east-1 and ensures proper secrets management

set -e

echo "================================================"
echo "Riley Chatbot Secure Deployment Script"
echo "================================================"

# Configuration
REGION="us-east-1"
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
API_GATEWAY_ID="cbtr8iqu56"

echo "Account ID: $ACCOUNT_ID"
echo "Target Region: $REGION"
echo ""

# Step 1: Check and create secrets in us-east-1
echo "Step 1: Setting up secrets in Secrets Manager..."

# Function to create or update a secret
create_or_update_secret() {
    local secret_name=$1
    local secret_value=$2
    local description=$3

    if aws secretsmanager describe-secret --secret-id "$secret_name" --region "$REGION" 2>/dev/null; then
        echo "  Updating secret: $secret_name"
        aws secretsmanager put-secret-value \
            --secret-id "$secret_name" \
            --secret-string "$secret_value" \
            --region "$REGION" > /dev/null
    else
        echo "  Creating secret: $secret_name"
        aws secretsmanager create-secret \
            --name "$secret_name" \
            --description "$description" \
            --secret-string "$secret_value" \
            --region "$REGION" > /dev/null
    fi
}

# Check if we need to migrate secrets from us-east-2
echo "Checking for existing secrets in us-east-2..."
if aws secretsmanager get-secret-value --secret-id "SalesForceCredentialsEast2" --region us-east-2 2>/dev/null; then
    echo "  Found secrets in us-east-2, migrating to us-east-1..."

    # Get the secret value from us-east-2
    SECRET_VALUE=$(aws secretsmanager get-secret-value --secret-id "SalesForceCredentialsEast2" --region us-east-2 --query SecretString --output text)

    # Create the secret in us-east-1
    create_or_update_secret "SalesForceCredentials" "$SECRET_VALUE" "Salesforce API credentials for Riley chatbot"
else
    echo "  No existing secrets found in us-east-2"
    echo "  Creating placeholder secret - PLEASE UPDATE WITH ACTUAL CREDENTIALS"

    # Create placeholder secret
    PLACEHOLDER_SECRET='{"username":"UPDATE_ME","password":"UPDATE_ME","securityToken":"UPDATE_ME","loginUrl":"https://login.salesforce.com"}'
    create_or_update_secret "SalesForceCredentials" "$PLACEHOLDER_SECRET" "Salesforce API credentials for Riley chatbot - UPDATE REQUIRED"
fi

# Step 2: Create IAM role for Lambda
echo ""
echo "Step 2: Setting up IAM role..."

ROLE_NAME="riley-lambda-role"
ROLE_ARN="arn:aws:iam::${ACCOUNT_ID}:role/${ROLE_NAME}"

# Check if role exists
if ! aws iam get-role --role-name "$ROLE_NAME" 2>/dev/null; then
    echo "  Creating IAM role: $ROLE_NAME"

    # Create the role
    aws iam create-role \
        --role-name "$ROLE_NAME" \
        --assume-role-policy-document '{
            "Version": "2012-10-17",
            "Statement": [{
                "Effect": "Allow",
                "Principal": {"Service": "lambda.amazonaws.com"},
                "Action": "sts:AssumeRole"
            }]
        }' > /dev/null

    # Attach policies
    aws iam attach-role-policy \
        --role-name "$ROLE_NAME" \
        --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole

    # Create custom policy for secrets and DynamoDB access
    aws iam put-role-policy \
        --role-name "$ROLE_NAME" \
        --policy-name riley-lambda-policy \
        --policy-document '{
            "Version": "2012-10-17",
            "Statement": [
                {
                    "Effect": "Allow",
                    "Action": [
                        "secretsmanager:GetSecretValue",
                        "secretsmanager:DescribeSecret"
                    ],
                    "Resource": "arn:aws:secretsmanager:'$REGION':'$ACCOUNT_ID':secret:*"
                },
                {
                    "Effect": "Allow",
                    "Action": [
                        "dynamodb:*"
                    ],
                    "Resource": "arn:aws:dynamodb:'$REGION':'$ACCOUNT_ID':table/*"
                },
                {
                    "Effect": "Allow",
                    "Action": [
                        "logs:CreateLogGroup",
                        "logs:CreateLogStream",
                        "logs:PutLogEvents"
                    ],
                    "Resource": "arn:aws:logs:'$REGION':'$ACCOUNT_ID':*"
                }
            ]
        }'

    echo "  Waiting for IAM role to propagate..."
    sleep 15
else
    echo "  IAM role already exists: $ROLE_NAME"
fi

# Step 3: Prepare deployment packages
echo ""
echo "Step 3: Preparing deployment packages..."

cd "/Users/Brian 1/Documents/GitHub/riley-chat/backend/riley-consolidated"

# Use the improved version if it exists
if [ -f "riley-consolidated-improved.js" ]; then
    echo "  Using improved riley-consolidated.js"
    cp riley-consolidated-improved.js riley-consolidated.js
fi

echo "  Creating riley-consolidated.zip"
zip -r riley-consolidated.zip riley-consolidated.js node_modules -q

cd "/Users/Brian 1/Documents/GitHub/riley-chat/backend/riley-lsa-new"
echo "  Creating riley-lsa-new.zip"
zip -r riley-lsa-new.zip lsa-simple.js -q

# Step 4: Deploy Lambda functions
echo ""
echo "Step 4: Deploying Lambda functions to $REGION..."

# Deploy riley-consolidated
echo "  Deploying riley-consolidated..."
aws lambda create-function \
    --function-name riley-consolidated \
    --runtime nodejs18.x \
    --role "$ROLE_ARN" \
    --handler riley-consolidated.handler \
    --zip-file "fileb:///Users/Brian 1/Documents/GitHub/riley-chat/backend/riley-consolidated/riley-consolidated.zip" \
    --timeout 30 \
    --memory-size 256 \
    --environment "Variables={NODE_ENV=production}" \
    --region "$REGION" 2>/dev/null || \
aws lambda update-function-code \
    --function-name riley-consolidated \
    --zip-file "fileb:///Users/Brian 1/Documents/GitHub/riley-chat/backend/riley-consolidated/riley-consolidated.zip" \
    --region "$REGION" > /dev/null

# Deploy riley-lsa-new
echo "  Deploying riley-lsa-new..."
aws lambda create-function \
    --function-name riley-lsa-new \
    --runtime nodejs18.x \
    --role "$ROLE_ARN" \
    --handler lsa-simple.handler \
    --zip-file "fileb:///Users/Brian 1/Documents/GitHub/riley-chat/backend/riley-lsa-new/riley-lsa-new.zip" \
    --timeout 30 \
    --memory-size 128 \
    --environment "Variables={NODE_ENV=production}" \
    --region "$REGION" 2>/dev/null || \
aws lambda update-function-code \
    --function-name riley-lsa-new \
    --zip-file "fileb:///Users/Brian 1/Documents/GitHub/riley-chat/backend/riley-lsa-new/riley-lsa-new.zip" \
    --region "$REGION" > /dev/null

# Step 5: Configure API Gateway
echo ""
echo "Step 5: Configuring API Gateway..."

# Get root resource
ROOT_ID=$(aws apigateway get-resources --rest-api-id "$API_GATEWAY_ID" --region "$REGION" --query 'items[?path==`/`].id' --output text)

# Create /riley resource
RILEY_ID=$(aws apigateway get-resources --rest-api-id "$API_GATEWAY_ID" --region "$REGION" --query 'items[?pathPart==`riley`].id' --output text)
if [ -z "$RILEY_ID" ]; then
    echo "  Creating /riley resource"
    RILEY_ID=$(aws apigateway create-resource \
        --rest-api-id "$API_GATEWAY_ID" \
        --parent-id "$ROOT_ID" \
        --path-part riley \
        --region "$REGION" \
        --query 'id' \
        --output text)
fi

# Create /lsa resource
LSA_ID=$(aws apigateway get-resources --rest-api-id "$API_GATEWAY_ID" --region "$REGION" --query 'items[?pathPart==`lsa`].id' --output text)
if [ -z "$LSA_ID" ]; then
    echo "  Creating /lsa resource"
    LSA_ID=$(aws apigateway create-resource \
        --rest-api-id "$API_GATEWAY_ID" \
        --parent-id "$ROOT_ID" \
        --path-part lsa \
        --region "$REGION" \
        --query 'id' \
        --output text)
fi

# Configure methods
echo "  Setting up API methods..."

# Setup /riley POST method
aws apigateway put-method \
    --rest-api-id "$API_GATEWAY_ID" \
    --resource-id "$RILEY_ID" \
    --http-method POST \
    --authorization-type NONE \
    --region "$REGION" 2>/dev/null || true

aws apigateway put-integration \
    --rest-api-id "$API_GATEWAY_ID" \
    --resource-id "$RILEY_ID" \
    --http-method POST \
    --type AWS_PROXY \
    --integration-http-method POST \
    --uri "arn:aws:apigateway:${REGION}:lambda:path/2015-03-31/functions/arn:aws:lambda:${REGION}:${ACCOUNT_ID}:function:riley-consolidated/invocations" \
    --region "$REGION" > /dev/null

# Setup /lsa GET method
aws apigateway put-method \
    --rest-api-id "$API_GATEWAY_ID" \
    --resource-id "$LSA_ID" \
    --http-method GET \
    --authorization-type NONE \
    --region "$REGION" 2>/dev/null || true

aws apigateway put-integration \
    --rest-api-id "$API_GATEWAY_ID" \
    --resource-id "$LSA_ID" \
    --http-method GET \
    --type AWS_PROXY \
    --integration-http-method POST \
    --uri "arn:aws:apigateway:${REGION}:lambda:path/2015-03-31/functions/arn:aws:lambda:${REGION}:${ACCOUNT_ID}:function:riley-lsa-new/invocations" \
    --region "$REGION" > /dev/null

# Step 6: Grant API Gateway permissions
echo ""
echo "Step 6: Granting API Gateway permissions..."

aws lambda add-permission \
    --function-name riley-consolidated \
    --statement-id apigateway-invoke \
    --action lambda:InvokeFunction \
    --principal apigateway.amazonaws.com \
    --source-arn "arn:aws:execute-api:${REGION}:${ACCOUNT_ID}:${API_GATEWAY_ID}/*/*" \
    --region "$REGION" 2>/dev/null || true

aws lambda add-permission \
    --function-name riley-lsa-new \
    --statement-id apigateway-invoke \
    --action lambda:InvokeFunction \
    --principal apigateway.amazonaws.com \
    --source-arn "arn:aws:execute-api:${REGION}:${ACCOUNT_ID}:${API_GATEWAY_ID}/*/*" \
    --region "$REGION" 2>/dev/null || true

# Step 7: Deploy API Gateway
echo ""
echo "Step 7: Deploying API Gateway..."
aws apigateway create-deployment \
    --rest-api-id "$API_GATEWAY_ID" \
    --stage-name prod \
    --region "$REGION" > /dev/null

echo ""
echo "================================================"
echo "Deployment Complete!"
echo "================================================"
echo ""
echo "API Endpoints:"
echo "  Riley: https://${API_GATEWAY_ID}.execute-api.${REGION}.amazonaws.com/prod/riley"
echo "  LSA: https://${API_GATEWAY_ID}.execute-api.${REGION}.amazonaws.com/prod/lsa"
echo ""
echo "Important Notes:"
echo "1. If you migrated from us-east-2, secrets were copied automatically"
echo "2. If this is a fresh deployment, UPDATE the SalesForceCredentials secret in Secrets Manager"
echo "3. Test the endpoints using:"
echo "   curl -X POST https://${API_GATEWAY_ID}.execute-api.${REGION}.amazonaws.com/prod/riley"
echo "   curl https://${API_GATEWAY_ID}.execute-api.${REGION}.amazonaws.com/prod/lsa"
echo ""
echo "To update secrets:"
echo "  aws secretsmanager put-secret-value --secret-id SalesForceCredentials --secret-string '{\"username\":\"YOUR_USERNAME\",\"password\":\"YOUR_PASSWORD\"}' --region ${REGION}"