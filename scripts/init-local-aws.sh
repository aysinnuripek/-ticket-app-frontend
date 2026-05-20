#!/usr/bin/env bash
# Bootstrap LocalStack: SQS queue, S3 bucket, SES verified identity.
# Re-runnable: each step is idempotent.

set -euo pipefail

ENDPOINT="http://localhost:4566"
REGION="eu-central-1"
QUEUE_NAME="payment-success"
DLQ_NAME="payment-success-dlq"
BUCKET="ticket-app-tickets"
FROM_ADDRESS="tickets@ticketapp.local"

export AWS_ACCESS_KEY_ID=test
export AWS_SECRET_ACCESS_KEY=test
export AWS_DEFAULT_REGION="$REGION"

aws_local() { aws --endpoint-url="$ENDPOINT" "$@"; }

echo "[1/4] Waiting for LocalStack..."
until curl -sf "$ENDPOINT/_localstack/health" >/dev/null; do sleep 1; done

echo "[2/4] Creating SQS queues..."
aws_local sqs create-queue --queue-name "$DLQ_NAME" >/dev/null
DLQ_ARN=$(aws_local sqs get-queue-attributes \
  --queue-url "$ENDPOINT/000000000000/$DLQ_NAME" \
  --attribute-names QueueArn --query 'Attributes.QueueArn' --output text)

aws_local sqs create-queue \
  --queue-name "$QUEUE_NAME" \
  --attributes "{\"RedrivePolicy\":\"{\\\"deadLetterTargetArn\\\":\\\"$DLQ_ARN\\\",\\\"maxReceiveCount\\\":\\\"3\\\"}\"}" \
  >/dev/null

QUEUE_URL="$ENDPOINT/000000000000/$QUEUE_NAME"
echo "      queue: $QUEUE_URL"

echo "[3/4] Creating S3 bucket..."
aws_local s3api create-bucket \
  --bucket "$BUCKET" \
  --create-bucket-configuration LocationConstraint="$REGION" \
  2>/dev/null || true
echo "      bucket: s3://$BUCKET"

echo "[4/4] Verifying SES sender..."
aws_local ses verify-email-identity --email-address "$FROM_ADDRESS" >/dev/null
echo "      from:   $FROM_ADDRESS"

echo
echo "Done. Add these to backend/.env:"
echo "  AWS_ENDPOINT_URL=$ENDPOINT"
echo "  AWS_ACCESS_KEY_ID=test"
echo "  AWS_SECRET_ACCESS_KEY=test"
echo "  AWS_DEFAULT_REGION=$REGION"
echo "  SQS_QUEUE_URL=$QUEUE_URL"
echo "  TICKETS_BUCKET=$BUCKET"
echo "  SES_FROM_ADDRESS=$FROM_ADDRESS"
echo "  SES_DEMO_TO_ADDRESS=<your-email@example.com>"
