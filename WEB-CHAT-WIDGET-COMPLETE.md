# Riley Web Chat Widget - Complete Guide ✅

## What's Been Built

A complete, embeddable web chat widget that you can add to your WordPress website. The widget captures leads, handles conversations with ChatGPT, and automatically creates contacts in your CRM.

## 🎯 Features

### 1. **Beautiful Chat Widget**
- Modern, professional design
- Floating chat button in bottom corner
- Smooth animations and transitions
- Mobile-responsive
- Customizable colors and positioning

### 2. **Contact Form (Pre-Chat)**
Before chatting, visitors provide:
- ✅ **Name** (Required)
- ✅ **Phone Number** (Required)
- ✅ **Email** (Optional)

### 3. **Smart Conversation**
- Powered by ChatGPT 4.0 mini
- Uses your Riley settings (tone, style, personality)
- Context-aware responses
- Intent detection

### 4. **Appointment Detection**
When someone wants to book an appointment:
- 📅 Green banner appears: "Appointment Requested!"
- Status: "Awaiting internal confirmation"
- Automatically updates CRM lead status to "Engaged"
- Works across all channels (Web, SMS, Email)

### 5. **Automatic CRM Integration**
Every visitor who starts a chat:
- Automatically created as contact in CRM
- Appears in Kanban board as "New" lead
- All messages saved to activity history
- Tagged with "web-chat" and "roofing-inquiry"

### 6. **Embed Code Generator**
Easy-to-use admin interface to:
- Customize widget appearance
- Choose position (bottom-right or bottom-left)
- Set primary color
- Configure welcome message
- Generate embed code
- Copy with one click

## 📍 Access Points

### For You (Admin):
**Embed Code Generator:**
```
https://riley-dashboard-1754514173.s3.amazonaws.com/web-chat-embed.html
```

**Or through dashboard:**
1. Log in: https://riley-dashboard-1754514173.s3.amazonaws.com/index.html
2. Click **"Web Chat"** tab
3. Configure and copy embed code

### For Website Visitors:
**Direct Widget (for testing):**
```
https://riley-dashboard-1754514173.s3.amazonaws.com/riley-chat-widget.html
```

## 🚀 Installation on WordPress

### Step 1: Get Your Embed Code
1. Go to dashboard → Web Chat tab
2. Customize the widget:
   - Position: Bottom Right (recommended)
   - Primary Color: #4F46E5 (or your brand color)
   - Company Name: Panda Exteriors
   - Welcome Message: Customize as needed
3. Click **"📋 Copy Code"**

### Step 2: Add to WordPress

**Method A: Using Theme Editor (Recommended)**
1. WordPress Admin → **Appearance** → **Theme Editor**
2. Find **footer.php** file
3. Scroll to bottom, find `</body>` tag
4. Paste code just BEFORE `</body>`
5. Click **Update File**

**Method B: Using Header/Footer Plugin**
1. Install plugin: "Insert Headers and Footers"
2. Go to **Settings** → **Insert Headers and Footers**
3. Paste code in **"Scripts in Footer"** section
4. Click **Save**

**Method C: Using Page Builder**
1. If using Elementor, Divi, etc.
2. Add HTML/Code widget to footer
3. Paste embed code
4. Publish

### Step 3: Test It!
1. Visit your website
2. Look for chat button in bottom-right corner
3. Click it and test the flow:
   - Enter name and phone
   - Start chatting
   - Try saying "I need to schedule an appointment"
   - Watch appointment banner appear!

## 📋 Default Embed Code

```html
<!-- Riley Chat Widget -->
<script>
  (function() {
    var script = document.createElement('script');
    script.src = 'https://riley-dashboard-1754514173.s3.amazonaws.com/riley-widget-loader.js';
    script.async = true;
    script.setAttribute('data-riley-config', JSON.stringify({
      apiUrl: 'https://cbtr8iqu56.execute-api.us-east-1.amazonaws.com/prod',
      companyName: 'Panda Exteriors',
      primaryColor: '#4F46E5',
      position: 'bottom-right',
      welcomeMessage: 'How can I help you with your roofing needs today?'
    }));
    document.body.appendChild(script);
  })();
</script>
```

## 💬 How It Works

### Visitor Experience:
```
1. Visitor lands on website
   ↓
2. Sees chat button with notification badge
   ↓
3. Clicks chat button
   ↓
4. Fills out contact form (Name, Phone, Email)
   ↓
5. Clicks "Start Chat"
   ↓
6. Riley greets them: "Hi [Name]! I'm Riley from Panda Exteriors..."
   ↓
7. Conversation begins (powered by ChatGPT)
   ↓
8. If they want appointment → Banner appears
   ↓
9. Chat continues until they're satisfied
```

### Behind the Scenes:
```
1. Contact form submitted
   ↓
2. Contact created in DynamoDB (riley-contacts)
   ↓
3. Contact appears in CRM Kanban as "New" lead
   ↓
4. Each message sent to ChatGPT for response
   ↓
5. Intent analyzed (booking, question, complaint, etc.)
   ↓
6. If intent = "booking":
   - Appointment flag set
   - Banner shown
   - Lead status → "Engaged"
   - Synced to PandaAdmin
   ↓
7. All messages saved to conversation history
   ↓
8. Admin can view full chat in CRM
```

## 📅 Appointment Booking Flow

### When Appointment is Detected:
**Triggers:**
- Customer says "book appointment", "schedule", "set up meeting"
- Customer asks about availability
- Customer confirms a time

**What Happens:**
1. ChatGPT detects booking intent
2. Green banner appears on chat widget
3. Banner text: "📅 Appointment Requested! We'll confirm shortly"
4. Conversation marked with `appointmentRequested: true`
5. Appointment status: `pending_confirmation`
6. Lead status automatically updated to "Engaged"
7. Contact moved to "Engaged" column in Kanban
8. Admin sees appointment flag in CRM

### Applies to All Channels:
- ✅ Web Chat (widget)
- ✅ SMS (Twilio)
- ✅ Email (PodOps)

## 🎨 Customization Options

### Available Settings:
| Setting | Options | Default |
|---------|---------|---------|
| Position | bottom-right, bottom-left | bottom-right |
| Primary Color | Any hex color | #4F46E5 |
| Company Name | Your company name | Panda Exteriors |
| Welcome Message | Custom greeting | "How can I help you..." |
| Show Avatar | true/false | true |
| Sound Notifications | true/false | false |

### Change Configuration:
1. Go to Web Chat tab in dashboard
2. Update settings
3. Copy new embed code
4. Replace old code on website

## 🔧 Technical Details

### Files Created:
1. **riley-chat-widget.html** - The actual widget
2. **riley-widget-loader.js** - Loader script (what you embed)
3. **web-chat-embed.html** - Admin configuration interface

### API Endpoints Used:
- `POST /riley` - Send messages, get responses
- `POST /contacts` - Create new contact
- `GET /contacts` - Fetch contact data

### Data Flow:
```
Website → Widget → API Gateway → Lambda → ChatGPT
                                  ↓
                                DynamoDB
                                  ↓
                            CRM Kanban Board
```

### Storage:
- Contacts: `riley-contacts` table
- Conversations: `riley-conversations` table
- Messages: Stored in conversation object
- Settings: `riley-settings` table

## 📊 CRM Integration

### What Gets Created:
```json
{
  "contactId": "contact-xxxxx",
  "firstName": "John",
  "lastName": "Doe",
  "phoneNumber": "+15551234567",
  "email": "john@example.com",
  "leadStatus": "new",
  "source": "website-widget",
  "tags": ["web-chat", "roofing-inquiry"],
  "conversationCount": 1,
  "appointmentRequested": false
}
```

### When Appointment Requested:
```json
{
  "appointmentRequested": true,
  "appointmentStatus": "pending_confirmation",
  "leadStatus": "engaged"
}
```

## ✅ Testing Checklist

### Test the Widget:
- [ ] Widget appears on website
- [ ] Chat button is visible
- [ ] Contact form works
- [ ] Required fields enforced (name, phone)
- [ ] Optional email field works
- [ ] Chat starts after form submission
- [ ] Messages send and receive
- [ ] Riley responds with ChatGPT
- [ ] Typing indicator shows
- [ ] Scroll works properly
- [ ] Mobile responsive
- [ ] Close button works

### Test Appointment Detection:
- [ ] Say "I want to schedule an appointment"
- [ ] Green banner appears
- [ ] Banner says "Appointment Requested!"
- [ ] Check CRM - contact should be "Engaged"
- [ ] Check conversation - appointmentRequested: true

### Test CRM Integration:
- [ ] Contact appears in CRM after chat starts
- [ ] Contact has correct information
- [ ] Tagged with "web-chat"
- [ ] Lead status is "New"
- [ ] Activity history shows messages
- [ ] Can view conversation in CRM
- [ ] After appointment request, status changes to "Engaged"

## 🎓 Training Riley for Appointments

In the Riley Settings tab, you can improve appointment booking:

**Personality Description:**
```
Riley is proactive about scheduling appointments. When customers show
interest, Riley offers to set up a consultation and asks for their
preferred date and time. Riley makes booking easy and convenient.
```

**Response Guidelines:**
```
1. Offer to schedule appointments for qualified leads
2. Ask for preferred dates and times
3. Confirm availability (even if checking internally)
4. Make the process simple - don't ask too many questions
5. Use phrases like "Would you like to schedule?" and "I can set that up for you"
```

## 🚨 Troubleshooting

### Widget Not Appearing:
- Check if code is before `</body>` tag
- Clear website cache
- Try incognito/private browsing
- Check browser console for errors

### Chat Not Responding:
- Check API Gateway is deployed
- Verify Lambda functions are running
- Check ChatGPT API key is valid
- View CloudWatch logs: `/aws/lambda/riley-chat`

### Appointments Not Detecting:
- ChatGPT analyzes intent - be patient
- Try clear phrases: "book appointment", "schedule"
- Check Lambda logs for intent analysis
- Verify `appointmentRequested` flag in DynamoDB

### Contact Not in CRM:
- Check `/contacts` API endpoint is working
- Verify DynamoDB table `riley-contacts` exists
- Check browser network tab for failed requests
- Try creating contact manually first

## 📈 Analytics & Reporting

### View Chat Performance:
1. Go to CRM tab
2. Filter by Source: "website-widget"
3. See all web chat leads

### Track Appointments:
1. Go to CRM tab
2. Filter by Status: "Engaged"
3. These are appointment requests

### View Conversations:
1. Click any contact in CRM
2. View Activity History
3. See full chat transcript

## 🎉 Success Indicators

You'll know it's working when:
- ✅ Chat widget appears on your website
- ✅ Visitors can start conversations
- ✅ Riley responds intelligently
- ✅ Contacts appear in CRM automatically
- ✅ Appointment requests trigger banner
- ✅ Lead status updates automatically
- ✅ All messages saved to history

## 📞 Support

**Issues? Questions?**
- Check CloudWatch Logs: `/aws/lambda/riley-chat`
- Review API Gateway logs
- Test endpoints directly
- Contact: robwinters@pandaexteriors.com

---

## 🎁 Bonus: JavaScript API

Control the widget programmatically:

```javascript
// Open chat widget
RileyChat.open();

// Close chat widget
RileyChat.close();

// Set appointment status manually
RileyChat.setAppointment();
```

Add this to your website after the widget loads to control it with custom buttons!

---

**The web chat widget is live and ready to capture leads on your website!** 🚀