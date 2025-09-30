# Twilio SMS Not Working - Fix Instructions

## Issue
SMS messages sent to 301-973-6753 are not triggering Riley's responses.

## Root Cause
Twilio needs to be configured with the correct webhook URL to forward incoming SMS to Riley.

## Solution

### Step 1: Get Your Twilio Webhook URL
**Your Riley Twilio Webhook URL:**
```
https://cbtr8iqu56.execute-api.us-east-1.amazonaws.com/prod/riley/twilio
```

### Step 2: Configure Twilio
1. Go to https://console.twilio.com/
2. Navigate to **Phone Numbers** → **Manage** → **Active Numbers**
3. Click on your number: **(301) 973-6753**
4. Scroll down to **Messaging Configuration**
5. Under **A MESSAGE COMES IN**:
   - Set to: **Webhook**
   - URL: `https://cbtr8iqu56.execute-api.us-east-1.amazonaws.com/prod/riley/twilio`
   - HTTP Method: **POST**
6. Click **Save**

### Step 3: Test
Send a text message to (301) 973-6753 and you should receive an automated response from Riley.

## Troubleshooting

### If you still don't get a response:

**Check Lambda Logs:**
```bash
aws logs tail /aws/lambda/riley-twilio --follow --region us-east-1
```

**Test the endpoint directly:**
```bash
curl -X POST https://cbtr8iqu56.execute-api.us-east-1.amazonaws.com/prod/riley/twilio \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "From=%2B15551234567&Body=Hello&MessageSid=test123"
```

**Check Twilio Debugger:**
1. Go to https://console.twilio.com/us1/monitor/logs/debugger
2. Look for recent webhook failures
3. Check the error messages

### Common Issues:

1. **Webhook URL not configured**
   - Solution: Follow Step 2 above

2. **Lambda function not responding**
   - Check CloudWatch logs
   - Verify Lambda has correct permissions

3. **API Gateway not routing**
   - Verify endpoint exists (it does: `/riley/twilio`)
   - Check deployment stage is `prod`

4. **Twilio credentials missing**
   - Verify TwilioCredentials secret exists in AWS Secrets Manager:
   ```bash
   aws secretsmanager get-secret-value --secret-id TwilioCredentials --region us-east-1
   ```

## Expected Flow

1. Customer sends SMS to (301) 973-6753
2. Twilio receives the message
3. Twilio POSTs to webhook URL
4. API Gateway routes to riley-twilio Lambda
5. Lambda processes message and generates response
6. Lambda saves conversation to DynamoDB
7. Lambda returns TwiML response
8. Twilio sends response back to customer

## Webhook Configuration Screenshot

Your Twilio configuration should look like this:

```
Messaging Configuration
─────────────────────────
CONFIGURE WITH
● Webhooks, TwiML Bins, Functions, Studio, or Proxy

A MESSAGE COMES IN
Webhook ▼  https://cbtr8iqu56.execute-api.us-east-1.amazonaws.com/prod/riley/twilio
HTTP POST ▼

PRIMARY HANDLER FAILS
(optional - leave blank)
```

## Next Steps

1. Configure the webhook URL in Twilio (Step 2 above)
2. Send a test message
3. If it works, Riley will respond immediately
4. If it doesn't work, check the troubleshooting section

The Lambda function and API Gateway are working correctly - you just need to point Twilio to the right URL.