# PandaAdmin ↔️ Riley Platform Integration

## 🔐 For PandaAdmin Platform (pandaadmin.com)

### Secret Configuration
```
Secret ID: panda-riley-api-prod
Secret ARN: arn:aws:secretsmanager:us-east-1:899383035514:secret:panda-riley-api-prod-GFZQx8
API Key: 46752f4f366f8faffe2dac8fb74b14591a2994a7bd06fadcca012ec0b79d789b
```

### Integration Endpoints
```
Base URL: https://cbtr8iqu56.execute-api.us-east-1.amazonaws.com/prod

Auth Endpoint: /riley/auth
Chat Endpoint: /riley/chat
Contacts Endpoint: /riley/contacts
Conversations Endpoint: /riley/conversations
```

### Full Endpoint URLs
```
Auth: https://cbtr8iqu56.execute-api.us-east-1.amazonaws.com/prod/riley/auth
Chat: https://cbtr8iqu56.execute-api.us-east-1.amazonaws.com/prod/riley/chat
Contacts: https://cbtr8iqu56.execute-api.us-east-1.amazonaws.com/prod/riley/contacts
Conversations: https://cbtr8iqu56.execute-api.us-east-1.amazonaws.com/prod/riley/conversations
```

---

## 📋 For Riley Platform

### What to Store in Your System

**Secret ID:**
```
panda-riley-api-prod
```

**Secret String:** (The generated API key)
```
46752f4f366f8faffe2dac8fb74b14591a2994a7bd06fadcca012ec0b79d789b
```

**API Endpoints to Integrate:**

**Authentication:**
```
POST https://cbtr8iqu56.execute-api.us-east-1.amazonaws.com/prod/riley/auth
```

**Chat/Messaging:**
```
POST https://cbtr8iqu56.execute-api.us-east-1.amazonaws.com/prod/riley/chat
```

**Contacts Management:**
```
GET/POST/PUT/DELETE https://cbtr8iqu56.execute-api.us-east-1.amazonaws.com/prod/riley/contacts
```

**Conversations:**
```
GET https://cbtr8iqu56.execute-api.us-east-1.amazonaws.com/prod/riley/conversations
```

---

## 🔧 How to Use

### For PandaAdmin to Call Riley:

**Headers Required:**
```javascript
{
  "x-api-key": "46752f4f366f8faffe2dac8fb74b14591a2994a7bd06fadcca012ec0b79d789b",
  "Content-Type": "application/json"
}
```

**Example Auth Request:**
```bash
curl -X POST https://cbtr8iqu56.execute-api.us-east-1.amazonaws.com/prod/riley/auth \
  -H "x-api-key: 46752f4f366f8faffe2dac8fb74b14591a2994a7bd06fadcca012ec0b79d789b" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@pandaexteriors.com",
    "action": "validate"
  }'
```

**Example Chat Request:**
```bash
curl -X POST https://cbtr8iqu56.execute-api.us-east-1.amazonaws.com/prod/riley/chat \
  -H "x-api-key: 46752f4f366f8faffe2dac8fb74b14591a2994a7bd06fadcca012ec0b79d789b" \
  -H "Content-Type: application/json" \
  -d '{
    "phoneNumber": "+13019736753",
    "message": "I need a roofing estimate",
    "source": "pandaadmin"
  }'
```

---

## 📦 AWS Secrets Manager Access

### View Secret in AWS Console:
```
Region: us-east-1
Service: Secrets Manager
Secret Name: panda-riley-api-prod
ARN: arn:aws:secretsmanager:us-east-1:899383035514:secret:panda-riley-api-prod-GFZQx8
```

### Retrieve Secret via AWS CLI:
```bash
aws secretsmanager get-secret-value \
  --secret-id panda-riley-api-prod \
  --region us-east-1 \
  --query SecretString \
  --output text | jq .
```

---

## 🔄 Integration Flow

### PandaAdmin → Riley (Outbound)
1. PandaAdmin sends customer inquiry/message
2. Uses API key in `x-api-key` header
3. Calls `/riley/chat` endpoint
4. Riley processes with ChatGPT and responds
5. Response stored in riley-conversations table

### Riley → PandaAdmin (Inbound)
1. Riley receives message (SMS/Web/Email)
2. Processes through ChatGPT
3. Syncs lead status to PandaAdmin
4. Updates CRM with appointment status
5. Triggers PandaAdmin workflows if appointment detected

---

## 📊 Available Riley Endpoints

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/riley/auth` | Authenticate users |
| POST | `/riley/chat` | Send/receive messages |
| POST | `/riley/twilio` | Twilio SMS webhook |
| GET | `/riley/contacts` | List all contacts |
| POST | `/riley/contacts` | Create new contact |
| GET | `/riley/contacts/{id}` | Get contact details |
| PUT | `/riley/contacts/{id}` | Update contact |
| DELETE | `/riley/contacts/{id}` | Delete contact |
| GET | `/riley/conversations` | List conversations |
| GET | `/riley/conversations/{id}` | Get conversation |
| GET | `/riley/settings` | Get system settings |
| PUT | `/riley/settings` | Update settings |

---

## 🔐 Security Notes

- **API Key**: Store securely in AWS Secrets Manager
- **Never commit** API key to version control
- **Rotate keys** periodically (recommended: every 90 days)
- **Use HTTPS** for all API calls
- **Validate** API key on every request
- **Monitor** API usage in CloudWatch

---

## 📞 Support

**Riley Platform Contact:**
- Email: robwinters@pandaexteriors.com
- System: Riley Portal (riley-dashboard-1754514173)

**PandaAdmin Integration:**
- Site: https://pandaadmin.com
- Integration Date: September 30, 2025
