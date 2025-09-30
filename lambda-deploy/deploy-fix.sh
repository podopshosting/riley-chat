#!/bin/bash

# Fix PodOps Connect Lambda Function Deployment
# This script updates the Lambda function with the correct environment variables

echo "🔧 Fixing PodOps Connect Lambda deployment..."

# Update Lambda function configuration with environment variables
echo "📝 Updating environment variables..."
aws lambda update-function-configuration \
    --function-name PodOpsConnect \
    --environment file://env.json \
    --region us-east-2

if [ $? -eq 0 ]; then
    echo "✅ Environment variables updated successfully"
else
    echo "❌ Failed to update environment variables"
    exit 1
fi

# Update function code
echo "📦 Updating function code..."
zip -q function.zip index.js
aws lambda update-function-code \
    --function-name PodOpsConnect \
    --zip-file fileb://function.zip \
    --region us-east-2

if [ $? -eq 0 ]; then
    echo "✅ Function code updated successfully"
else
    echo "❌ Failed to update function code"
    exit 1
fi

echo "🎉 Lambda deployment fix completed!"
echo "Testing the API..."

# Test the API
sleep 5
response=$(curl -s -o /dev/null -w "%{http_code}" "https://jtpw1iado5.execute-api.us-east-2.amazonaws.com/prod/health")

if [ "$response" = "200" ]; then
    echo "✅ API is now responding correctly (HTTP $response)"
else
    echo "⚠️  API returned HTTP $response - may need additional troubleshooting"
fi

echo "🔐 Testing login functionality..."
# Note: Replace TEST_EMAIL and TEST_PASSWORD with actual test credentials
login_response=$(curl -s -X POST \
    -H "Content-Type: application/json" \
    -d '{"email":"TEST_EMAIL","password":"TEST_PASSWORD"}' \
    "https://jtpw1iado5.execute-api.us-east-2.amazonaws.com/prod/auth/login")

if [[ $login_response == *"token"* ]]; then
    echo "✅ Login API is working correctly"
else
    echo "❌ Login API is still not working"
    echo "Response: $login_response"
fi