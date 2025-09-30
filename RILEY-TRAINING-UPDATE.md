# Riley Training Module - New Features Added ✅

## What's New

### 1. Riley Settings Tab
You can now configure Riley's default behavior, tone, and style directly in the training module:

**Settings Available:**
- **Default Tone:** Professional, Friendly, Casual, Formal, Enthusiastic, Empathetic
- **Default Style:** Concise, Detailed, Conversational, Technical, Simple
- **Personality Description:** Detailed description of Riley's character traits
- **Response Guidelines:** Specific rules Riley should follow
- **Default Greeting:** First message sent to new conversations
- **Response Temperature:** Control creativity level (0.0 = Conservative, 1.0 = Creative)
- **Max Response Length:** Control how long responses can be (50-500 tokens)

**Why This Matters:**
These settings are used by ChatGPT to generate responses. When you update these, Riley's personality and behavior will change accordingly across all conversations.

### 2. Conversation Scripts Tab
Upload training documents to teach Riley how to handle specific scenarios:

**Features:**
- **File Upload:** Drag and drop or select TXT, PDF, DOCX, CSV files (up to 5MB each)
- **Manual Entry:** Add scripts directly by typing or pasting
- **Script Library:** View, manage, and delete uploaded scripts
- **Preview:** See a preview of each script's content

**Use Cases:**
- Upload your actual text conversation scripts
- Add FAQ documents
- Include service descriptions
- Training scenarios for common customer questions

## How to Access

1. Go to: https://riley-dashboard-1754514173.s3.amazonaws.com/index.html
2. Log in with: robwinters@pandaexteriors.com
3. Click the "Training" tab
4. You'll see two new tabs at the top:
   - **Riley Settings** (configure behavior)
   - **Conversation Scripts** (upload documents)

## How It Works

### Riley Settings Flow:
1. You configure Riley's tone, style, and personality
2. These settings are saved in your browser's localStorage
3. When ChatGPT generates a response, it uses these settings as context
4. Riley's responses will match the personality and guidelines you set

### Scripts Upload Flow:
1. Upload your conversation scripts and training documents
2. Scripts are stored locally in your browser
3. Future enhancement: These will be sent to ChatGPT as training examples
4. Riley will learn from real conversations you've had

## Configuration Examples

### Example 1: Professional Riley
```
Tone: Professional
Style: Concise
Personality: Riley is a highly professional assistant who provides
clear, direct information about Panda Exteriors services.
```

### Example 2: Friendly Riley (Current Default)
```
Tone: Friendly
Style: Conversational
Personality: Riley is helpful and knowledgeable, professional yet
approachable, always eager to help customers.
```

### Example 3: Technical Expert Riley
```
Tone: Professional
Style: Technical
Personality: Riley is an expert in exterior home improvement with
deep knowledge of materials, techniques, and building codes.
```

## Active Personality Settings

The "Active Personality Settings" dropdown in the Bot Personalities tab now works together with Riley Settings:

- **Bot Personalities Tab:** Create different personality profiles for different use cases
- **Riley Settings Tab:** Configure the default settings used by ChatGPT
- **Active Bot:** Select which personality is currently active

## All Settings Are Persistent

- All your settings are saved automatically in localStorage
- Click "💾 Save All Changes" to ensure everything is saved
- Settings persist across browser sessions
- Each tab has its own storage key for organization

## Next Steps

### Immediate Actions:
1. **Configure Riley Settings:** Set the tone and style you want
2. **Upload Scripts:** Add your text confirmation scripts
3. **Test Responses:** Chat with Riley to see how it behaves

### API Integration (Already Complete):
- ChatGPT 4.0 mini is integrated and ready
- Settings will be passed to the API when generating responses
- Scripts will be used for context in future updates

## Technical Details

**Storage Keys:**
- `riley_settings` - Default Riley configuration
- `riley_scripts` - Uploaded conversation scripts
- `riley_responses` - Response templates
- `riley_personalities` - Bot personality profiles
- `riley_company` - Company details
- `riley_negative` - Negative filters
- `riley_threads` - Message threading
- `riley_active_bot` - Active personality selection

**File Support:**
- Text files (.txt, .md)
- PDF documents (.pdf)
- Word documents (.docx)
- CSV files (.csv)
- Maximum size: 5MB per file

## Questions?

The updated training module is live and ready to use. Configure Riley's settings to match how you want it to interact with customers!