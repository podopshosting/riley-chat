#!/bin/bash

# Deploy Riley Portal Frontend to S3
# Updates the S3-hosted dashboard with latest changes

S3_BUCKET="s3://riley-dashboard-1754514173"
FRONTEND_DIR="frontend"

echo "🚀 Deploying Riley Portal Frontend to S3..."
echo "Bucket: $S3_BUCKET"
echo ""

# Check if frontend directory exists
if [ ! -d "$FRONTEND_DIR" ]; then
    echo "❌ Error: frontend directory not found!"
    exit 1
fi

cd "$FRONTEND_DIR"

# Upload main files
echo "📦 Uploading main HTML files..."
aws s3 cp index.html "$S3_BUCKET/index.html" --content-type "text/html" --cache-control "no-cache"
aws s3 cp kanban-dashboard.html "$S3_BUCKET/kanban-dashboard.html" --content-type "text/html" --cache-control "no-cache"
aws s3 cp admin-dashboard.html "$S3_BUCKET/admin-dashboard.html" --content-type "text/html" --cache-control "no-cache"
aws s3 cp training-module-enhanced.html "$S3_BUCKET/training-module-enhanced.html" --content-type "text/html" --cache-control "no-cache"
aws s3 cp crm-contacts.html "$S3_BUCKET/crm-contacts.html" --content-type "text/html" --cache-control "no-cache"
aws s3 cp web-chat-embed.html "$S3_BUCKET/web-chat-embed.html" --content-type "text/html" --cache-control "no-cache"
aws s3 cp business-hours-config.html "$S3_BUCKET/business-hours-config.html" --content-type "text/html" --cache-control "no-cache"

# Upload JavaScript files
echo "📦 Uploading JavaScript files..."
if [ -f "riley-api-client.js" ]; then
    aws s3 cp riley-api-client.js "$S3_BUCKET/riley-api-client.js" --content-type "application/javascript" --cache-control "no-cache"
fi

# Upload assets (logo, etc.)
echo "📦 Uploading assets..."
if [ -d "assets" ]; then
    aws s3 sync assets/ "$S3_BUCKET/assets/" --cache-control "max-age=86400"
fi

echo ""
echo "✅ Deployment complete!"
echo ""
echo "🌐 Your Riley Portal is live at:"
echo "   https://riley-dashboard-1754514173.s3.amazonaws.com/index.html"
echo ""
echo "🔄 Note: You may need to hard refresh (Ctrl+Shift+R or Cmd+Shift+R) to see changes"
