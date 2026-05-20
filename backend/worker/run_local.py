"""Local SQS poller that mimics Lambda's event-source mapping.

Long-polls the LocalStack SQS queue, hands each message to handler.handler(),
and deletes on success (or leaves it for redelivery / DLQ on failure).

Run with:  python -m worker.run_local
"""

import json
import os
import time

import boto3
from dotenv import load_dotenv

load_dotenv()

from worker import handler  # noqa: E402

ENDPOINT_URL = os.environ.get("AWS_ENDPOINT_URL") or None
REGION = os.environ.get("AWS_DEFAULT_REGION", "eu-central-1")
QUEUE_URL = os.environ["SQS_QUEUE_URL"]

sqs = boto3.client("sqs", endpoint_url=ENDPOINT_URL, region_name=REGION)


def main():
    print(f"[worker] polling {QUEUE_URL}")
    while True:
        resp = sqs.receive_message(
            QueueUrl=QUEUE_URL,
            MaxNumberOfMessages=5,
            WaitTimeSeconds=20,
            VisibilityTimeout=60,
        )
        messages = resp.get("Messages", [])
        if not messages:
            continue

        event = {"Records": [{"body": m["Body"]} for m in messages]}
        try:
            handler.handler(event, None)
        except Exception as e:
            print(f"[worker] FAILED: {e}")
            time.sleep(2)
            continue

        for m in messages:
            sqs.delete_message(QueueUrl=QUEUE_URL, ReceiptHandle=m["ReceiptHandle"])


if __name__ == "__main__":
    main()
