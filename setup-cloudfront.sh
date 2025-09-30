#!/bin/bash

# Setup CloudFront distribution for Riley Portal with custom domain
# riley.pandaadmin.com

CERT_ARN="arn:aws:acm:us-east-1:899383035514:certificate/6e6611c1-9c34-4be4-aa94-f7dc3787a2ac"
S3_BUCKET="riley-dashboard-1754514173.s3.amazonaws.com"
DOMAIN="riley.pandaadmin.com"

echo "🔐 Waiting for SSL certificate validation..."
echo "Certificate ARN: $CERT_ARN"
echo ""

# Wait for certificate validation (max 20 minutes)
MAX_ATTEMPTS=40
ATTEMPT=0

while [ $ATTEMPT -lt $MAX_ATTEMPTS ]; do
    STATUS=$(aws acm describe-certificate \
        --certificate-arn "$CERT_ARN" \
        --region us-east-1 \
        --query 'Certificate.Status' \
        --output text)

    echo "Attempt $((ATTEMPT+1))/$MAX_ATTEMPTS - Status: $STATUS"

    if [ "$STATUS" = "ISSUED" ]; then
        echo "✅ Certificate validated successfully!"
        break
    fi

    if [ $ATTEMPT -eq $((MAX_ATTEMPTS-1)) ]; then
        echo "❌ Certificate validation timed out after 20 minutes"
        echo "Please check your DNS record and try again later"
        exit 1
    fi

    ATTEMPT=$((ATTEMPT+1))
    sleep 30
done

echo ""
echo "☁️ Creating CloudFront distribution..."

# Create CloudFront distribution
DISTRIBUTION_ID=$(aws cloudfront create-distribution \
    --origin-domain-name "$S3_BUCKET" \
    --default-root-object "index.html" \
    --query 'Distribution.Id' \
    --output text \
    --distribution-config "{
        \"CallerReference\": \"riley-portal-$(date +%s)\",
        \"Comment\": \"Riley Portal - Panda Exteriors\",
        \"DefaultRootObject\": \"index.html\",
        \"Origins\": {
            \"Quantity\": 1,
            \"Items\": [{
                \"Id\": \"S3-riley-dashboard\",
                \"DomainName\": \"$S3_BUCKET\",
                \"S3OriginConfig\": {
                    \"OriginAccessIdentity\": \"\"
                },
                \"CustomHeaders\": {
                    \"Quantity\": 0
                }
            }]
        },
        \"DefaultCacheBehavior\": {
            \"TargetOriginId\": \"S3-riley-dashboard\",
            \"ViewerProtocolPolicy\": \"redirect-to-https\",
            \"AllowedMethods\": {
                \"Quantity\": 2,
                \"Items\": [\"GET\", \"HEAD\"],
                \"CachedMethods\": {
                    \"Quantity\": 2,
                    \"Items\": [\"GET\", \"HEAD\"]
                }
            },
            \"Compress\": true,
            \"ForwardedValues\": {
                \"QueryString\": true,
                \"Cookies\": {
                    \"Forward\": \"none\"
                }
            },
            \"MinTTL\": 0,
            \"DefaultTTL\": 86400,
            \"MaxTTL\": 31536000,
            \"TrustedSigners\": {
                \"Enabled\": false,
                \"Quantity\": 0
            }
        },
        \"Enabled\": true,
        \"Aliases\": {
            \"Quantity\": 1,
            \"Items\": [\"$DOMAIN\"]
        },
        \"ViewerCertificate\": {
            \"ACMCertificateArn\": \"$CERT_ARN\",
            \"SSLSupportMethod\": \"sni-only\",
            \"MinimumProtocolVersion\": \"TLSv1.2_2021\"
        },
        \"PriceClass\": \"PriceClass_100\"
    }" 2>&1)

if [ $? -ne 0 ]; then
    echo "❌ Error creating CloudFront distribution:"
    echo "$DISTRIBUTION_ID"
    exit 1
fi

echo "✅ CloudFront distribution created!"
echo "Distribution ID: $DISTRIBUTION_ID"
echo ""

# Get CloudFront domain name
echo "📡 Getting CloudFront domain name..."
sleep 5

CLOUDFRONT_DOMAIN=$(aws cloudfront get-distribution \
    --id "$DISTRIBUTION_ID" \
    --query 'Distribution.DomainName' \
    --output text)

echo "CloudFront Domain: $CLOUDFRONT_DOMAIN"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📋 FINAL STEP: Add DNS Record in Route 53"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "In your OTHER AWS account (where pandaadmin.com is):"
echo ""
echo "Add this CNAME record to Route 53:"
echo "  Type:  CNAME"
echo "  Name:  $DOMAIN"
echo "  Value: $CLOUDFRONT_DOMAIN"
echo "  TTL:   300"
echo ""
echo "Or use this CLI command:"
echo ""
echo "aws route53 change-resource-record-sets \\"
echo "  --hosted-zone-id YOUR_ZONE_ID \\"
echo "  --change-batch '{
    \"Changes\": [{
        \"Action\": \"CREATE\",
        \"ResourceRecordSet\": {
            \"Name\": \"'$DOMAIN'\",
            \"Type\": \"CNAME\",
            \"TTL\": 300,
            \"ResourceRecords\": [{\"Value\": \"'$CLOUDFRONT_DOMAIN'\"}]
        }
    }]
}'"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "⏱️  CloudFront deployment takes 15-20 minutes"
echo "🌐 Once DNS propagates, your site will be live at:"
echo "   https://$DOMAIN"
echo ""
