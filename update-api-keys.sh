#!/bin/bash

# Secure script to update API keys in AWS Secrets Manager
# This script prompts for API keys instead of hardcoding them

echo "==================================="
echo "Riley Chat API Key Update Tool"
echo "==================================="
echo ""

# Function to update a secret
update_secret() {
    local secret_name=$1
    local secret_description=$2
    local api_key=$3
    local additional_fields=$4

    if [ -z "$api_key" ]; then
        echo "❌ No API key provided for $secret_name. Skipping."
        return
    fi

    local secret_string
    if [ -z "$additional_fields" ]; then
        secret_string="{\"apiKey\":\"$api_key\"}"
    else
        secret_string="{\"apiKey\":\"$api_key\",$additional_fields}"
    fi

    echo "Updating $secret_name..."
    aws secretsmanager update-secret \
        --secret-id "$secret_name" \
        --secret-string "$secret_string" \
        --region us-east-1 \
        2>/dev/null

    if [ $? -eq 0 ]; then
        echo "✅ $secret_name updated successfully!"
    else
        echo "❌ Failed to update $secret_name. It may not exist yet."
        echo "Creating new secret..."
        aws secretsmanager create-secret \
            --name "$secret_name" \
            --description "$secret_description" \
            --secret-string "$secret_string" \
            --region us-east-1

        if [ $? -eq 0 ]; then
            echo "✅ $secret_name created successfully!"
        else
            echo "❌ Failed to create $secret_name"
        fi
    fi
}

# Update OpenAI API Key
echo "1. OpenAI ChatGPT API Key"
echo "   Get a new key from: https://platform.openai.com/api-keys"
echo -n "   Enter your OpenAI API key (or press Enter to skip): "
read -s openai_key
echo ""

if [ ! -z "$openai_key" ]; then
    update_secret "OpenAICredentials" "OpenAI API credentials for Riley Chat" "$openai_key"
else
    echo "   Skipping OpenAI key update."
fi

echo ""

# Update PodOps API Key
echo "2. PodOps Connect API Key"
echo "   Get your key from your PodOps Connect dashboard"
echo -n "   Enter your PodOps API key (or press Enter to skip): "
read -s podops_key
echo ""

if [ ! -z "$podops_key" ]; then
    echo -n "   Enter PodOps API URL (default: api.podopsconnect.com): "
    read podops_url
    podops_url=${podops_url:-api.podopsconnect.com}
    update_secret "PodOpsCredentials" "PodOps Connect API credentials" "$podops_key" "\"apiUrl\":\"$podops_url\""
else
    echo "   Skipping PodOps key update."
fi

echo ""

# Update PandaAdmin API Key
echo "3. PandaAdmin API Key"
echo "   Get your key from PandaAdmin.com settings"
echo -n "   Enter your PandaAdmin API key (or press Enter to skip): "
read -s pandaadmin_key
echo ""

if [ ! -z "$pandaadmin_key" ]; then
    echo -n "   Enter PandaAdmin API URL (default: pandaadmin.com): "
    read pandaadmin_url
    pandaadmin_url=${pandaadmin_url:-pandaadmin.com}
    update_secret "PandaAdminCredentials" "PandaAdmin API credentials" "$pandaadmin_key" "\"apiUrl\":\"$pandaadmin_url\""
else
    echo "   Skipping PandaAdmin key update."
fi

echo ""
echo "==================================="
echo "API Key Update Complete!"
echo "==================================="
echo ""

# Restart Lambda functions to use new keys
echo "Would you like to restart Lambda functions to use the new keys? (y/n): "
read restart_choice

if [ "$restart_choice" = "y" ] || [ "$restart_choice" = "Y" ]; then
    echo "Updating Lambda function configurations to trigger restart..."

    # Update environment variable to force restart
    TIMESTAMP=$(date +%s)

    for func in riley-chat riley-twilio riley-conversations riley-lsa riley-podops-webhook; do
        echo "Restarting $func..."
        aws lambda update-function-configuration \
            --function-name $func \
            --environment "Variables={RILEY_REGION=us-east-1,LAST_UPDATE=$TIMESTAMP}" \
            --region us-east-1 \
            >/dev/null 2>&1

        if [ $? -eq 0 ]; then
            echo "✅ $func restarted"
        else
            echo "❌ Failed to restart $func"
        fi
    done

    echo ""
    echo "✅ All Lambda functions restarted!"
fi

echo ""
echo "Next steps:"
echo "1. Test the chat functionality at: https://riley-dashboard-1754514173.s3.amazonaws.com/index.html"
echo "2. Configure PodOps webhook to: https://cbtr8iqu56.execute-api.us-east-1.amazonaws.com/prod/webhook/podops"
echo "3. Monitor logs: aws logs tail /aws/lambda/riley-chat --follow"