# PandaAdmin.com - Quick API Reference

## 🔑 Your API Credentials

### PodOps Connect API
```
Secret ID: podops-connect-api-key
API Key: e2a7aa895e77fcc85fc1b7334264da6fb21f849c499bcf6c2639c5cb905c584a
Base URL: https://jtpw1iado5.execute-api.us-east-2.amazonaws.com/prod
Region: us-east-2
```

### Riley Platform API
```
Secret ID: panda-riley-api-prod
API Key: 46752f4f366f8faffe2dac8fb74b14591a2994a7bd06fadcca012ec0b79d789b
Base URL: https://cbtr8iqu56.execute-api.us-east-1.amazonaws.com/prod
Region: us-east-1
```

---

## 📋 Quick Integration Checklist

### For PodOps Connect Integration:

- [ ] Store API key in your secure config: `e2a7aa895e77fcc85fc1b7334264da6fb21f849c499bcf6c2639c5cb905c584a`
- [ ] Set base URL: `https://jtpw1iado5.execute-api.us-east-2.amazonaws.com/prod`
- [ ] Add header to all requests: `x-api-key: [your-api-key]`
- [ ] Test email endpoint: `/email/campaign`
- [ ] Test SMS endpoint: `/sms/campaign`
- [ ] Implement health checks: `/email/health` and `/sms/health`

### For Riley Platform Integration:

- [ ] Store Riley API key: `46752f4f366f8faffe2dac8fb74b14591a2994a7bd06fadcca012ec0b79d789b`
- [ ] Set Riley base URL: `https://cbtr8iqu56.execute-api.us-east-1.amazonaws.com/prod`
- [ ] Add header: `x-api-key: [riley-api-key]`
- [ ] Test auth endpoint: `/riley/auth`
- [ ] Test chat endpoint: `/riley/chat`
- [ ] Test contacts endpoint: `/riley/contacts`

---

## 🚀 Quick Start Code (Copy & Paste)

### PodOps Connect - Send Email Campaign

```javascript
// Add to your PandaAdmin JavaScript
const PODOPS_API_KEY = 'e2a7aa895e77fcc85fc1b7334264da6fb21f849c499bcf6c2639c5cb905c584a';
const PODOPS_BASE_URL = 'https://jtpw1iado5.execute-api.us-east-2.amazonaws.com/prod';

async function sendEmailCampaign(recipients, templateId, stage) {
  const response = await fetch(`${PODOPS_BASE_URL}/email/campaign`, {
    method: 'POST',
    headers: {
      'x-api-key': PODOPS_API_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      campaignId: `camp_${Date.now()}`,
      campaignName: 'PandaAdmin Campaign',
      stage: stage, // '0-30', '31-60', '61-90', '91-plus', 'judgment'
      source: 'pandaadmin',
      templateId: templateId,
      recipients: recipients
    })
  });

  return await response.json();
}

// Usage:
const recipients = [
  { name: 'John Doe', email: 'john@example.com', amount: 1500.00 }
];
sendEmailCampaign(recipients, 'template_001', '0-30');
```

### PodOps Connect - Send SMS Campaign

```javascript
async function sendSMSCampaign(recipients, message, stage) {
  const response = await fetch(`${PODOPS_BASE_URL}/sms/campaign`, {
    method: 'POST',
    headers: {
      'x-api-key': PODOPS_API_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      campaignId: `sms_${Date.now()}`,
      campaignName: 'PandaAdmin SMS',
      stage: stage,
      source: 'pandaadmin',
      message: message,
      recipients: recipients
    })
  });

  return await response.json();
}

// Usage:
const recipients = [
  { name: 'Jane Smith', phone: '+15551234567', amount: 850.00 }
];
sendSMSCampaign(recipients, 'Hi {{name}}, reminder about ${{amount}}', '31-60');
```

### Riley Platform - Send Chat Message

```javascript
const RILEY_API_KEY = '46752f4f366f8faffe2dac8fb74b14591a2994a7bd06fadcca012ec0b79d789b';
const RILEY_BASE_URL = 'https://cbtr8iqu56.execute-api.us-east-1.amazonaws.com/prod';

async function sendRileyChat(phoneNumber, message) {
  const response = await fetch(`${RILEY_BASE_URL}/riley/chat`, {
    method: 'POST',
    headers: {
      'x-api-key': RILEY_API_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      phoneNumber: phoneNumber,
      message: message,
      source: 'pandaadmin'
    })
  });

  return await response.json();
}

// Usage:
sendRileyChat('+13019736753', 'I need a roofing estimate');
```

---

## 📞 API Endpoints Summary

### PodOps Connect (us-east-2)

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/email/campaign` | POST | Send email campaign |
| `/email/health` | GET | Check email service status |
| `/sms/campaign` | POST | Send SMS campaign |
| `/sms/health` | GET | Check SMS service status |
| `/auth/login` | POST | Authenticate user |

### Riley Platform (us-east-1)

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/riley/auth` | POST | Authenticate with Riley |
| `/riley/chat` | POST | Send chat message |
| `/riley/contacts` | GET/POST/PUT/DELETE | Manage contacts |
| `/riley/conversations` | GET | Get conversation history |
| `/riley/settings` | GET/PUT | Manage settings |

---

## 🔧 Configuration for PandaAdmin Laravel

### Add to `.env` file:

```env
# PodOps Connect
PODOPS_API_KEY=e2a7aa895e77fcc85fc1b7334264da6fb21f849c499bcf6c2639c5cb905c584a
PODOPS_BASE_URL=https://jtpw1iado5.execute-api.us-east-2.amazonaws.com/prod

# Riley Platform
RILEY_API_KEY=46752f4f366f8faffe2dac8fb74b14591a2994a7bd06fadcca012ec0b79d789b
RILEY_BASE_URL=https://cbtr8iqu56.execute-api.us-east-1.amazonaws.com/prod
```

### Add to `config/services.php`:

```php
'podops' => [
    'api_key' => env('PODOPS_API_KEY'),
    'base_url' => env('PODOPS_BASE_URL'),
],

'riley' => [
    'api_key' => env('RILEY_API_KEY'),
    'base_url' => env('RILEY_BASE_URL'),
],
```

---

## 📊 Example Request/Response

### Send Email Campaign

**Request:**
```json
POST /email/campaign
{
  "campaignId": "camp_12345",
  "stage": "0-30",
  "source": "pandaadmin",
  "templateId": "template_001",
  "recipients": [
    {
      "name": "John Doe",
      "email": "john@example.com",
      "amount": 1500.00
    }
  ]
}
```

**Response:**
```json
{
  "success": true,
  "campaignId": "camp_12345",
  "messageId": "msg_abc123",
  "status": "sent",
  "recipientCount": 1
}
```

---

## 🔍 Testing Your Integration

### Test PodOps Email
```bash
curl -X POST https://jtpw1iado5.execute-api.us-east-2.amazonaws.com/prod/email/health \
  -H "x-api-key: e2a7aa895e77fcc85fc1b7334264da6fb21f849c499bcf6c2639c5cb905c584a"
```

### Test Riley Chat
```bash
curl -X POST https://cbtr8iqu56.execute-api.us-east-1.amazonaws.com/prod/riley/chat \
  -H "x-api-key: 46752f4f366f8faffe2dac8fb74b14591a2994a7bd06fadcca012ec0b79d789b" \
  -H "Content-Type: application/json" \
  -d '{"phoneNumber":"+13019736753","message":"Test","source":"pandaadmin"}'
```

---

## 💾 AWS Secrets Manager (Optional - More Secure)

Instead of hardcoding, retrieve from AWS Secrets Manager:

```bash
# Get PodOps API Key
aws secretsmanager get-secret-value \
  --secret-id podops-connect-api-key \
  --region us-east-2 \
  --query SecretString --output text

# Get Riley API Key
aws secretsmanager get-secret-value \
  --secret-id panda-riley-api-prod \
  --region us-east-1 \
  --query SecretString --output text
```

---

## 📁 Full Documentation

For complete documentation, see:
- **PodOps Connect:** [PODOPS-CONNECT-INTEGRATION.md](./PODOPS-CONNECT-INTEGRATION.md)
- **Riley Platform:** [PANDAADMIN-INTEGRATION.md](./PANDAADMIN-INTEGRATION.md)

---

## ✅ Integration Status

- [x] PodOps Connect API configured
- [x] Riley Platform API configured
- [x] API keys generated and stored in Secrets Manager
- [x] Documentation created
- [ ] **Your Turn:** Implement in PandaAdmin Laravel application
- [ ] **Your Turn:** Test email campaign integration
- [ ] **Your Turn:** Test SMS campaign integration
- [ ] **Your Turn:** Test Riley chat integration

---

## 📞 Support

**Questions?**
- Email: robwinters@pandaexteriors.com
- API Issues: Check CloudWatch logs in respective regions
- Integration Help: See full documentation files
