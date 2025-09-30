#!/bin/bash

# Riley Chatbot Fix Script
# This script migrates Lambda functions from us-east-2 to us-east-1
# to fix the region mismatch issue

set -e

echo "========================================="
echo "Riley Chatbot Region Fix Script"
echo "========================================="

# Check AWS CLI is configured
if ! command -v aws &> /dev/null; then
    echo "Error: AWS CLI is not installed"
    exit 1
fi

# Configuration
REGION_NEW="us-east-1"
REGION_OLD="us-east-2"
API_GATEWAY_ID="cbtr8iqu56"

echo "Step 1: Creating deployment packages..."

# Create deployment package for riley-consolidated
cd "/Users/Brian 1/Documents/GitHub/riley-chat/backend/riley-consolidated"
echo "Creating riley-consolidated.zip..."
zip -r riley-consolidated.zip riley-consolidated.js node_modules -q

# Create deployment package for riley-lsa-new
cd "/Users/Brian 1/Documents/GitHub/riley-chat/backend/riley-lsa-new"
echo "Creating riley-lsa-new.zip..."
zip -r riley-lsa-new.zip lsa-simple.js -q

echo "Step 2: Creating Lambda functions in us-east-1..."

# Check if IAM role exists in us-east-1
ROLE_ARN=$(aws iam get-role --role-name riley-lambda-role 2>/dev/null | jq -r '.Role.Arn' || echo "")

if [ -z "$ROLE_ARN" ]; then
    echo "Creating IAM role for Lambda functions..."
    ROLE_ARN=$(aws iam create-role \
        --role-name riley-lambda-role \
        --assume-role-policy-document '{
            "Version": "2012-10-17",
            "Statement": [{
                "Effect": "Allow",
                "Principal": {"Service": "lambda.amazonaws.com"},
                "Action": "sts:AssumeRole"
            }]
        }' \
        --output text \
        --query 'Role.Arn')

    # Attach basic Lambda execution policy
    aws iam attach-role-policy \
        --role-name riley-lambda-role \
        --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole

    # Attach policy for Secrets Manager access
    aws iam attach-role-policy \
        --role-name riley-lambda-role \
        --policy-arn arn:aws:iam::aws:policy/SecretsManagerReadWrite

    echo "Waiting for IAM role to propagate..."
    sleep 10
fi

echo "Using IAM role: $ROLE_ARN"

# Create riley-consolidated function in us-east-1
echo "Creating riley-consolidated in us-east-1..."
aws lambda create-function \
    --function-name riley-consolidated \
    --runtime nodejs18.x \
    --role "$ROLE_ARN" \
    --handler riley-consolidated.handler \
    --zip-file "fileb:///Users/Brian 1/Documents/GitHub/riley-chat/backend/riley-consolidated/riley-consolidated.zip" \
    --timeout 30 \
    --memory-size 256 \
    --region "$REGION_NEW" 2>/dev/null || \
aws lambda update-function-code \
    --function-name riley-consolidated \
    --zip-file "fileb:///Users/Brian 1/Documents/GitHub/riley-chat/backend/riley-consolidated/riley-consolidated.zip" \
    --region "$REGION_NEW"

# Create riley-lsa-new function in us-east-1
echo "Creating riley-lsa-new in us-east-1..."
aws lambda create-function \
    --function-name riley-lsa-new \
    --runtime nodejs18.x \
    --role "$ROLE_ARN" \
    --handler lsa-simple.handler \
    --zip-file "fileb:///Users/Brian 1/Documents/GitHub/riley-chat/backend/riley-lsa-new/riley-lsa-new.zip" \
    --timeout 30 \
    --memory-size 128 \
    --region "$REGION_NEW" 2>/dev/null || \
aws lambda update-function-code \
    --function-name riley-lsa-new \
    --zip-file "fileb:///Users/Brian 1/Documents/GitHub/riley-chat/backend/riley-lsa-new/riley-lsa-new.zip" \
    --region "$REGION_NEW"

echo "Step 3: Updating API Gateway integrations..."

# Get Lambda ARNs in the new region
RILEY_CONSOLIDATED_ARN="arn:aws:lambda:${REGION_NEW}:899383035514:function:riley-consolidated"
RILEY_LSA_ARN="arn:aws:lambda:${REGION_NEW}:899383035514:function:riley-lsa-new"

# Create resources and methods in API Gateway
echo "Setting up API Gateway resources..."

# Get root resource ID
ROOT_ID=$(aws apigateway get-resources --rest-api-id "$API_GATEWAY_ID" --region "$REGION_NEW" --query 'items[?path==`/`].id' --output text)

# Create /riley resource if it doesn't exist
RILEY_ID=$(aws apigateway get-resources --rest-api-id "$API_GATEWAY_ID" --region "$REGION_NEW" --query 'items[?pathPart==`riley`].id' --output text)
if [ -z "$RILEY_ID" ]; then
    RILEY_ID=$(aws apigateway create-resource \
        --rest-api-id "$API_GATEWAY_ID" \
        --parent-id "$ROOT_ID" \
        --path-part riley \
        --region "$REGION_NEW" \
        --query 'id' \
        --output text)
fi

# Create /lsa resource if it doesn't exist
LSA_ID=$(aws apigateway get-resources --rest-api-id "$API_GATEWAY_ID" --region "$REGION_NEW" --query 'items[?pathPart==`lsa`].id' --output text)
if [ -z "$LSA_ID" ]; then
    LSA_ID=$(aws apigateway create-resource \
        --rest-api-id "$API_GATEWAY_ID" \
        --parent-id "$ROOT_ID" \
        --path-part lsa \
        --region "$REGION_NEW" \
        --query 'id' \
        --output text)
fi

# Set up method for /riley
echo "Setting up /riley endpoint..."
aws apigateway put-method \
    --rest-api-id "$API_GATEWAY_ID" \
    --resource-id "$RILEY_ID" \
    --http-method POST \
    --authorization-type NONE \
    --region "$REGION_NEW" 2>/dev/null || true

aws apigateway put-integration \
    --rest-api-id "$API_GATEWAY_ID" \
    --resource-id "$RILEY_ID" \
    --http-method POST \
    --type AWS_PROXY \
    --integration-http-method POST \
    --uri "arn:aws:apigateway:${REGION_NEW}:lambda:path/2015-03-31/functions/${RILEY_CONSOLIDATED_ARN}/invocations" \
    --region "$REGION_NEW"

# Set up method for /lsa
echo "Setting up /lsa endpoint..."
aws apigateway put-method \
    --rest-api-id "$API_GATEWAY_ID" \
    --resource-id "$LSA_ID" \
    --http-method GET \
    --authorization-type NONE \
    --region "$REGION_NEW" 2>/dev/null || true

aws apigateway put-integration \
    --rest-api-id "$API_GATEWAY_ID" \
    --resource-id "$LSA_ID" \
    --http-method GET \
    --type AWS_PROXY \
    --integration-http-method POST \
    --uri "arn:aws:apigateway:${REGION_NEW}:lambda:path/2015-03-31/functions/${RILEY_LSA_ARN}/invocations" \
    --region "$REGION_NEW"

# Set up CORS
echo "Setting up CORS..."
for RESOURCE_ID in "$RILEY_ID" "$LSA_ID"; do
    aws apigateway put-method \
        --rest-api-id "$API_GATEWAY_ID" \
        --resource-id "$RESOURCE_ID" \
        --http-method OPTIONS \
        --authorization-type NONE \
        --region "$REGION_NEW" 2>/dev/null || true

    aws apigateway put-integration \
        --rest-api-id "$API_GATEWAY_ID" \
        --resource-id "$RESOURCE_ID" \
        --http-method OPTIONS \
        --type MOCK \
        --request-templates '{"application/json": "{\"statusCode\": 200}"}' \
        --region "$REGION_NEW"

    aws apigateway put-integration-response \
        --rest-api-id "$API_GATEWAY_ID" \
        --resource-id "$RESOURCE_ID" \
        --http-method OPTIONS \
        --status-code 200 \
        --response-parameters '{"method.response.header.Access-Control-Allow-Headers":"'"'"'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'"'"'","method.response.header.Access-Control-Allow-Methods":"'"'"'GET,POST,OPTIONS'"'"'","method.response.header.Access-Control-Allow-Origin":"'"'"'*'"'"'}' \
        --region "$REGION_NEW" 2>/dev/null || true

    aws apigateway put-method-response \
        --rest-api-id "$API_GATEWAY_ID" \
        --resource-id "$RESOURCE_ID" \
        --http-method OPTIONS \
        --status-code 200 \
        --response-parameters '{"method.response.header.Access-Control-Allow-Headers":false,"method.response.header.Access-Control-Allow-Methods":false,"method.response.header.Access-Control-Allow-Origin":false}' \
        --region "$REGION_NEW" 2>/dev/null || true
done

# Grant API Gateway permission to invoke Lambda functions
echo "Granting API Gateway permissions..."
aws lambda add-permission \
    --function-name riley-consolidated \
    --statement-id apigateway-invoke \
    --action lambda:InvokeFunction \
    --principal apigateway.amazonaws.com \
    --source-arn "arn:aws:execute-api:${REGION_NEW}:899383035514:${API_GATEWAY_ID}/*/*" \
    --region "$REGION_NEW" 2>/dev/null || true

aws lambda add-permission \
    --function-name riley-lsa-new \
    --statement-id apigateway-invoke \
    --action lambda:InvokeFunction \
    --principal apigateway.amazonaws.com \
    --source-arn "arn:aws:execute-api:${REGION_NEW}:899383035514:${API_GATEWAY_ID}/*/*" \
    --region "$REGION_NEW" 2>/dev/null || true

# Deploy API Gateway
echo "Deploying API Gateway..."
aws apigateway create-deployment \
    --rest-api-id "$API_GATEWAY_ID" \
    --stage-name prod \
    --region "$REGION_NEW"

echo "========================================="
echo "Migration Complete!"
echo "========================================="
echo ""
echo "API Endpoints:"
echo "  - Riley: https://${API_GATEWAY_ID}.execute-api.${REGION_NEW}.amazonaws.com/prod/riley"
echo "  - LSA: https://${API_GATEWAY_ID}.execute-api.${REGION_NEW}.amazonaws.com/prod/lsa"
echo ""
echo "Next Steps:"
echo "1. Update frontend JavaScript to use the new endpoints"
echo "2. Test the API endpoints"
echo "3. Once verified, delete Lambda functions from us-east-2"
echo ""
echo "To test Riley endpoint:"
echo "  curl -X POST https://${API_GATEWAY_ID}.execute-api.${REGION_NEW}.amazonaws.com/prod/riley"
echo ""
echo "To test LSA endpoint:"
echo "  curl https://${API_GATEWAY_ID}.execute-api.${REGION_NEW}.amazonaws.com/prod/lsa"