#!/bin/bash

# Test Riley Twilio Integration
echo "================================================"
echo "Testing Riley Twilio Integration"
echo "================================================"

API_URL="https://cbtr8iqu56.execute-api.us-east-1.amazonaws.com/prod"

echo ""
echo "1. Testing API Health..."
curl -s "$API_URL/riley" | jq '.'

echo ""
echo "2. Testing Conversations Endpoint..."
curl -s "$API_URL/riley/conversations" | jq '.'

echo ""
echo "3. Testing Stats Endpoint..."
curl -s "$API_URL/riley/stats" | jq '.'

echo ""
echo "4. Simulating Twilio Webhook (Incoming SMS)..."
curl -X POST "$API_URL/riley/twilio" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "From=%2B15551234567" \
  -d "To=%2B15559876543" \
  -d "Body=Hi%2C%20I%20need%20a%20roofing%20quote" \
  -d "MessageSid=SM1234567890abcdef" \
  -d "FromCity=Tampa" \
  -d "FromState=FL" \
  -d "FromZip=33601" \
  --silent

echo ""
echo ""
echo "5. Testing Send Message (requires valid phone number)..."
echo "   To send a test message, run:"
echo "   curl -X POST '$API_URL/riley/send' \\"
echo "     -H 'Content-Type: application/json' \\"
echo "     -d '{\"to\":\"+1XXXXXXXXXX\",\"message\":\"Test from Riley\"}'"

echo ""
echo "================================================"
echo "✅ Tests Complete!"
echo "================================================"
echo ""
echo "Check the results above. You should see:"
echo "  - API returning success messages"
echo "  - Conversations being stored"
echo "  - TwiML response for Twilio webhook"
echo ""
echo "📱 Next Steps:"
echo "1. Configure your Twilio phone number webhook to:"
echo "   $API_URL/riley/twilio"
echo ""
echo "2. Send a test SMS to your Twilio number"
echo ""
echo "3. Monitor conversations at:"
echo "   https://riley-dashboard-1754514173.s3-website-us-east-1.amazonaws.com/admin-dashboard.html"