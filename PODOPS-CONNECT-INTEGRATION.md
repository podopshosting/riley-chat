# PandaAdmin ↔️ PodOps Connect Integration Guide

## 🔐 API Authentication

### Secret Configuration
```
Secret ID: podops-connect-api-key
Secret ARN: arn:aws:secretsmanager:us-east-2:899383035514:secret:podops-connect-api-key-729W3Z
API Key: e2a7aa895e77fcc85fc1b7334264da6fb21f849c499bcf6c2639c5cb905c584a
Region: us-east-2
```

### Base URL
```
https://jtpw1iado5.execute-api.us-east-2.amazonaws.com/prod
```

---

## 🔗 API Endpoints

### 1. Authentication Endpoints

**Login:**
```
POST /auth/login
URL: https://jtpw1iado5.execute-api.us-east-2.amazonaws.com/prod/auth/login
```

**Verify Token:**
```
POST /auth/verify
URL: https://jtpw1iado5.execute-api.us-east-2.amazonaws.com/prod/auth/verify
```

### 2. Email Campaign Endpoints

**Send Email Campaign:**
```
POST /email/campaign
URL: https://jtpw1iado5.execute-api.us-east-2.amazonaws.com/prod/email/campaign
```

**Email Health Check:**
```
GET /email/health
URL: https://jtpw1iado5.execute-api.us-east-2.amazonaws.com/prod/email/health
```

### 3. SMS Campaign Endpoints

**Send SMS Campaign:**
```
POST /sms/campaign
URL: https://jtpw1iado5.execute-api.us-east-2.amazonaws.com/prod/sms/campaign
```

**SMS Health Check:**
```
GET /sms/health
URL: https://jtpw1iado5.execute-api.us-east-2.amazonaws.com/prod/sms/health
```

---

## 📝 Request/Response Formats

### Authentication Method

All API requests must include the API key in the header:

```javascript
headers: {
  'x-api-key': 'e2a7aa895e77fcc85fc1b7334264da6fb21f849c499bcf6c2639c5cb905c584a',
  'Content-Type': 'application/json'
}
```

### Email Campaign Request

**Endpoint:** `POST /email/campaign`

**Request Format:**
```json
{
  "campaignId": "camp_12345",
  "campaignName": "September Collection Campaign",
  "stage": "0-30",
  "source": "pandaadmin",
  "templateId": "template_email_001",
  "recipients": [
    {
      "name": "John Doe",
      "email": "john.doe@example.com",
      "amount": 1250.50,
      "accountNumber": "ACC-001",
      "customFields": {
        "lastContact": "2025-09-15",
        "preferredContact": "email"
      }
    }
  ],
  "scheduleTime": "2025-09-30T10:00:00Z",
  "priority": "normal"
}
```

**Response Format:**
```json
{
  "success": true,
  "campaignId": "camp_12345",
  "messageId": "msg_abc123def456",
  "status": "sent",
  "recipientCount": 1,
  "queuedCount": 1,
  "failedCount": 0,
  "timestamp": "2025-09-30T09:45:23Z",
  "details": {
    "sent": ["john.doe@example.com"],
    "failed": []
  }
}
```

**Error Response:**
```json
{
  "success": false,
  "error": "Invalid template ID",
  "errorCode": "TEMPLATE_NOT_FOUND",
  "timestamp": "2025-09-30T09:45:23Z"
}
```

### SMS Campaign Request

**Endpoint:** `POST /sms/campaign`

**Request Format:**
```json
{
  "campaignId": "camp_sms_12345",
  "campaignName": "Payment Reminder",
  "stage": "31-60",
  "source": "pandaadmin",
  "message": "Hi {{name}}, this is a reminder about your account balance of ${{amount}}. Please contact us at (555) 123-4567.",
  "recipients": [
    {
      "name": "Jane Smith",
      "phone": "+15551234567",
      "amount": 850.00,
      "accountNumber": "ACC-002",
      "customFields": {
        "timezone": "America/New_York"
      }
    }
  ],
  "scheduleTime": "2025-09-30T14:00:00Z",
  "priority": "high"
}
```

**Response Format:**
```json
{
  "success": true,
  "campaignId": "camp_sms_12345",
  "messageId": "sms_xyz789abc123",
  "status": "queued",
  "recipientCount": 1,
  "queuedCount": 1,
  "failedCount": 0,
  "timestamp": "2025-09-30T09:45:23Z",
  "estimatedDelivery": "2025-09-30T14:00:00Z",
  "details": {
    "queued": ["+15551234567"],
    "failed": []
  }
}
```

### Health Check Response

**Endpoint:** `GET /email/health` or `GET /sms/health`

**Response Format:**
```json
{
  "status": "healthy",
  "service": "email",
  "timestamp": "2025-09-30T09:45:23Z",
  "metrics": {
    "uptime": "99.98%",
    "lastHourSent": 1247,
    "queueSize": 15,
    "avgResponseTime": "245ms"
  },
  "dependencies": {
    "database": "connected",
    "smtp": "connected",
    "queue": "operational"
  }
}
```

---

## 💻 Integration Code Examples

### JavaScript/Node.js Example

```javascript
const PODOPS_CONFIG = {
  baseUrl: 'https://jtpw1iado5.execute-api.us-east-2.amazonaws.com/prod',
  apiKey: 'e2a7aa895e77fcc85fc1b7334264da6fb21f849c499bcf6c2639c5cb905c584a',
  region: 'us-east-2'
};

// Send Email Campaign
async function sendEmailCampaign(campaignData) {
  try {
    const response = await fetch(`${PODOPS_CONFIG.baseUrl}/email/campaign`, {
      method: 'POST',
      headers: {
        'x-api-key': PODOPS_CONFIG.apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(campaignData)
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const result = await response.json();
    console.log('Campaign sent:', result);
    return result;
  } catch (error) {
    console.error('Failed to send campaign:', error);
    throw error;
  }
}

// Send SMS Campaign
async function sendSMSCampaign(campaignData) {
  try {
    const response = await fetch(`${PODOPS_CONFIG.baseUrl}/sms/campaign`, {
      method: 'POST',
      headers: {
        'x-api-key': PODOPS_CONFIG.apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(campaignData)
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const result = await response.json();
    console.log('SMS sent:', result);
    return result;
  } catch (error) {
    console.error('Failed to send SMS:', error);
    throw error;
  }
}

// Check Service Health
async function checkHealth(service = 'email') {
  try {
    const response = await fetch(`${PODOPS_CONFIG.baseUrl}/${service}/health`, {
      method: 'GET',
      headers: {
        'x-api-key': PODOPS_CONFIG.apiKey
      }
    });

    if (!response.ok) {
      throw new Error(`Health check failed: ${response.status}`);
    }

    const health = await response.json();
    console.log(`${service} health:`, health);
    return health;
  } catch (error) {
    console.error(`${service} health check failed:`, error);
    throw error;
  }
}

// Usage Example
async function runCampaign() {
  // Check health first
  const emailHealth = await checkHealth('email');

  if (emailHealth.status === 'healthy') {
    // Send email campaign
    const campaign = {
      campaignId: 'camp_12345',
      campaignName: 'Payment Reminder',
      stage: '0-30',
      source: 'pandaadmin',
      templateId: 'template_001',
      recipients: [
        {
          name: 'John Doe',
          email: 'john@example.com',
          amount: 1500.00
        }
      ]
    };

    const result = await sendEmailCampaign(campaign);
    console.log('Campaign result:', result);
  }
}
```

### PHP Example (For PandaAdmin Laravel)

```php
<?php

class PodOpsConnectClient {
    private $baseUrl = 'https://jtpw1iado5.execute-api.us-east-2.amazonaws.com/prod';
    private $apiKey = 'e2a7aa895e77fcc85fc1b7334264da6fb21f849c499bcf6c2639c5cb905c584a';

    public function sendEmailCampaign($campaignData) {
        $url = $this->baseUrl . '/email/campaign';

        $ch = curl_init($url);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($campaignData));
        curl_setopt($ch, CURLOPT_HTTPHEADER, [
            'x-api-key: ' . $this->apiKey,
            'Content-Type: application/json'
        ]);

        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($httpCode !== 200) {
            throw new Exception("Failed to send campaign: HTTP $httpCode");
        }

        return json_decode($response, true);
    }

    public function sendSMSCampaign($campaignData) {
        $url = $this->baseUrl . '/sms/campaign';

        $ch = curl_init($url);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($campaignData));
        curl_setopt($ch, CURLOPT_HTTPHEADER, [
            'x-api-key: ' . $this->apiKey,
            'Content-Type: application/json'
        ]);

        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($httpCode !== 200) {
            throw new Exception("Failed to send SMS: HTTP $httpCode");
        }

        return json_decode($response, true);
    }

    public function checkHealth($service = 'email') {
        $url = $this->baseUrl . '/' . $service . '/health';

        $ch = curl_init($url);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_HTTPHEADER, [
            'x-api-key: ' . $this->apiKey
        ]);

        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($httpCode !== 200) {
            throw new Exception("Health check failed: HTTP $httpCode");
        }

        return json_decode($response, true);
    }
}

// Usage
$client = new PodOpsConnectClient();

// Send email campaign
$campaign = [
    'campaignId' => 'camp_12345',
    'campaignName' => 'Payment Reminder',
    'stage' => '0-30',
    'source' => 'pandaadmin',
    'templateId' => 'template_001',
    'recipients' => [
        [
            'name' => 'John Doe',
            'email' => 'john@example.com',
            'amount' => 1500.00
        ]
    ]
];

$result = $client->sendEmailCampaign($campaign);
echo "Campaign sent: " . $result['messageId'] . "\n";
```

---

## 📊 Campaign Stage Types

The `stage` field categorizes contacts by their account age or status:

| Stage | Description |
|-------|-------------|
| `0-30` | Accounts 0-30 days old |
| `31-60` | Accounts 31-60 days old |
| `61-90` | Accounts 61-90 days old |
| `91-plus` | Accounts 91+ days old |
| `judgment` | Accounts in judgment status |
| `active` | Active accounts |
| `follow-up` | Follow-up required |

---

## 🔄 Template Variable Substitution

Both email and SMS support dynamic variable substitution:

| Variable | Description | Example |
|----------|-------------|---------|
| `{{name}}` | Recipient's name | John Doe |
| `{{amount}}` | Account amount | $1,250.50 |
| `{{accountNumber}}` | Account number | ACC-001 |
| `{{companyName}}` | Your company name | Panda Exteriors |
| `{{dueDate}}` | Due date | 2025-10-15 |
| `{{phone}}` | Support phone | (555) 123-4567 |

**Example Message:**
```
Hi {{name}}, your account {{accountNumber}} has a balance of ${{amount}}.
Please contact {{companyName}} at {{phone}}.
```

**Rendered:**
```
Hi John Doe, your account ACC-001 has a balance of $1,250.50.
Please contact Panda Exteriors at (555) 123-4567.
```

---

## ⚙️ AWS Secrets Manager Integration

### Retrieve API Key from Secrets Manager

**AWS CLI:**
```bash
aws secretsmanager get-secret-value \
  --secret-id podops-connect-api-key \
  --region us-east-2 \
  --query SecretString \
  --output text | jq .
```

**Node.js:**
```javascript
const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');

async function getPodOpsApiKey() {
  const client = new SecretsManagerClient({ region: 'us-east-2' });
  const command = new GetSecretValueCommand({ SecretId: 'podops-connect-api-key' });
  const response = await client.send(command);
  return JSON.parse(response.SecretString);
}
```

**PHP:**
```php
use Aws\SecretsManager\SecretsManagerClient;

function getPodOpsApiKey() {
    $client = new SecretsManagerClient([
        'region' => 'us-east-2',
        'version' => 'latest'
    ]);

    $result = $client->getSecretValue([
        'SecretId' => 'podops-connect-api-key'
    ]);

    return json_decode($result['SecretString'], true);
}
```

---

## 🔒 Security Best Practices

1. **Never hardcode API keys** - Always retrieve from AWS Secrets Manager
2. **Use HTTPS only** - All endpoints use SSL/TLS encryption
3. **Validate responses** - Check HTTP status codes and response structure
4. **Rate limiting** - Implement exponential backoff for retries
5. **API key rotation** - Rotate keys every 90 days
6. **Monitor usage** - Track API calls in CloudWatch
7. **Error handling** - Log errors but don't expose API keys in logs

---

## 📈 Rate Limits

| Endpoint | Rate Limit | Burst |
|----------|-----------|-------|
| Email Campaign | 100 req/min | 150 |
| SMS Campaign | 50 req/min | 75 |
| Health Check | 300 req/min | 500 |
| Auth | 10 req/min | 20 |

**429 Too Many Requests Response:**
```json
{
  "success": false,
  "error": "Rate limit exceeded",
  "errorCode": "RATE_LIMIT_EXCEEDED",
  "retryAfter": 60,
  "timestamp": "2025-09-30T09:45:23Z"
}
```

---

## 🐛 Common Error Codes

| Code | Description | Resolution |
|------|-------------|------------|
| `AUTH_FAILED` | Invalid API key | Check API key in Secrets Manager |
| `INVALID_REQUEST` | Malformed request | Validate JSON structure |
| `TEMPLATE_NOT_FOUND` | Email template missing | Check template ID |
| `RECIPIENT_INVALID` | Invalid email/phone | Validate recipient data |
| `RATE_LIMIT_EXCEEDED` | Too many requests | Implement backoff |
| `SERVICE_UNAVAILABLE` | Service down | Check health endpoint |
| `INTERNAL_ERROR` | Server error | Contact support |

---

## 🧪 Testing

### Test Email Campaign
```bash
curl -X POST https://jtpw1iado5.execute-api.us-east-2.amazonaws.com/prod/email/campaign \
  -H "x-api-key: e2a7aa895e77fcc85fc1b7334264da6fb21f849c499bcf6c2639c5cb905c584a" \
  -H "Content-Type: application/json" \
  -d '{
    "campaignId": "test_001",
    "campaignName": "Test Campaign",
    "stage": "0-30",
    "source": "pandaadmin",
    "templateId": "template_001",
    "recipients": [{
      "name": "Test User",
      "email": "test@example.com",
      "amount": 100.00
    }]
  }'
```

### Test SMS Campaign
```bash
curl -X POST https://jtpw1iado5.execute-api.us-east-2.amazonaws.com/prod/sms/campaign \
  -H "x-api-key: e2a7aa895e77fcc85fc1b7334264da6fb21f849c499bcf6c2639c5cb905c584a" \
  -H "Content-Type: application/json" \
  -d '{
    "campaignId": "test_sms_001",
    "campaignName": "Test SMS",
    "stage": "0-30",
    "source": "pandaadmin",
    "message": "Test message to {{name}}",
    "recipients": [{
      "name": "Test User",
      "phone": "+15551234567",
      "amount": 100.00
    }]
  }'
```

### Test Health Check
```bash
curl -X GET https://jtpw1iado5.execute-api.us-east-2.amazonaws.com/prod/email/health \
  -H "x-api-key: e2a7aa895e77fcc85fc1b7334264da6fb21f849c499bcf6c2639c5cb905c584a"
```

---

## 📞 Support

**PodOps Connect:**
- Region: us-east-2
- API Gateway ID: jtpw1iado5
- Stage: prod

**PandaAdmin Integration:**
- Site: https://pandaadmin.com
- Integration Date: September 30, 2025
- API Key Secret: podops-connect-api-key

**Technical Support:**
- Email: support@pandaexteriors.com
- API Documentation: https://docs.mypodops.com/connect
