#!/bin/bash

# Update secrets in AWS Secrets Manager

echo "Updating AWS Secrets Manager with new API keys..."

# Create OpenAI secret (placeholder - needs actual API key)
aws secretsmanager create-secret \
    --name OpenAICredentials \
    --description "OpenAI API credentials for Riley Chat" \
    --secret-string '{"apiKey":"YOUR_OPENAI_API_KEY"}' \
    --region us-east-1 \
    2>/dev/null || \
echo "OpenAI secret already exists. Skipping creation."

echo "✓ OpenAI credentials placeholder created (update with actual key)"

# Create PodOps credentials (placeholder - needs actual credentials)
aws secretsmanager create-secret \
    --name PodOpsCredentials \
    --description "PodOps Connect API credentials" \
    --secret-string '{"apiKey":"YOUR_PODOPS_API_KEY","apiUrl":"api.podopsconnect.com"}' \
    --region us-east-1 \
    2>/dev/null || \
aws secretsmanager update-secret \
    --secret-id PodOpsCredentials \
    --secret-string '{"apiKey":"YOUR_PODOPS_API_KEY","apiUrl":"api.podopsconnect.com"}' \
    --region us-east-1

echo "✓ PodOps credentials placeholder created (update with actual key)"

# Create PandaAdmin credentials (placeholder - needs actual credentials)
aws secretsmanager create-secret \
    --name PandaAdminCredentials \
    --description "PandaAdmin API credentials" \
    --secret-string '{"apiKey":"YOUR_PANDAADMIN_API_KEY","apiUrl":"pandaadmin.com"}' \
    --region us-east-1 \
    2>/dev/null || \
aws secretsmanager update-secret \
    --secret-id PandaAdminCredentials \
    --secret-string '{"apiKey":"YOUR_PANDAADMIN_API_KEY","apiUrl":"pandaadmin.com"}' \
    --region us-east-1

echo "✓ PandaAdmin credentials placeholder created (update with actual key)"

echo ""
echo "Secrets updated successfully!"
echo "Note: Please update PodOps and PandaAdmin placeholders with actual API keys"