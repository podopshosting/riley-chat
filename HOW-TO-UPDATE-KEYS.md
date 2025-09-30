# How to Update API Keys Securely

## ⚠️ Important: Your OpenAI API Key Was Disabled

The OpenAI API key was exposed in the code and has been disabled by OpenAI for security. You need to:

1. **Get a new OpenAI API key**
2. **Update it securely in AWS Secrets Manager**

## 🔑 Step 1: Get New API Keys

### OpenAI ChatGPT API Key
1. Go to https://platform.openai.com/api-keys
2. Click "Create new secret key"
3. Name it "Riley Chat Production"
4. Copy the key (you won't see it again!)

### PodOps API Key
- Get from your PodOps Connect dashboard

### PandaAdmin API Key
- Get from PandaAdmin.com settings

## 🔐 Step 2: Update Keys Securely

### Option A: Use the Interactive Script (Recommended)
```bash
cd "/Users/Brian 1/Documents/GitHub/riley-chat"
./update-api-keys.sh
```

This script will:
- Prompt you for each API key (hidden input)
- Update AWS Secrets Manager securely
- Optionally restart Lambda functions

### Option B: Update Manually via AWS CLI

**Update OpenAI Key:**
```bash
aws secretsmanager update-secret \
  --secret-id OpenAICredentials \
  --secret-string '{"apiKey":"YOUR_NEW_OPENAI_KEY"}' \
  --region us-east-1
```

**Update PodOps Key:**
```bash
aws secretsmanager update-secret \
  --secret-id PodOpsCredentials \
  --secret-string '{"apiKey":"YOUR_PODOPS_KEY","apiUrl":"api.podopsconnect.com"}' \
  --region us-east-1
```

**Update PandaAdmin Key:**
```bash
aws secretsmanager update-secret \
  --secret-id PandaAdminCredentials \
  --secret-string '{"apiKey":"YOUR_PANDAADMIN_KEY","apiUrl":"pandaadmin.com"}' \
  --region us-east-1
```

## 🔄 Step 3: Restart Lambda Functions

After updating keys, restart the functions to use new credentials:

```bash
# Quick restart all functions
for func in riley-chat riley-twilio riley-conversations riley-lsa riley-podops-webhook; do
  aws lambda update-function-configuration \
    --function-name $func \
    --environment "Variables={RILEY_REGION=us-east-1,LAST_UPDATE=$(date +%s)}" \
    --region us-east-1
done
```

## ✅ Step 4: Verify

1. Test the chat at: https://riley-dashboard-1754514173.s3.amazonaws.com/index.html
2. Check Lambda logs for any errors:
   ```bash
   aws logs tail /aws/lambda/riley-chat --follow
   ```

## 🔒 Security Best Practices

- **NEVER** put API keys in code or scripts
- **NEVER** commit API keys to Git
- **ALWAYS** use AWS Secrets Manager
- **ROTATE** keys regularly
- **DELETE** old/exposed keys immediately

## 📝 Notes

- The exposed key has been removed from all code
- All Lambda functions now fetch keys from AWS Secrets Manager
- Keys are never logged or exposed in responses
- GitHub will no longer detect secrets in this repository

## 🆘 Troubleshooting

If you get permission errors:
```bash
# Make sure you're logged into AWS CLI
aws sts get-caller-identity

# Check if secrets exist
aws secretsmanager list-secrets --region us-east-1 | grep -A2 "OpenAI\|PodOps\|PandaAdmin"
```

If Lambda functions aren't using new keys:
- Wait 1-2 minutes for cache to clear
- Or force update by changing any environment variable