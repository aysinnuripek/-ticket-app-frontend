"""Lambda-equivalent handler for processing paid orders.

In production this runs as an AWS Lambda triggered by SQS event-source mapping.
For local development it's invoked by `run_local.py`, which polls LocalStack SQS
and calls `handler(event, context)` with the same shape AWS would.
"""

import io
import json
import os
import uuid

import boto3
import qrcode
from reportlab.lib.pagesizes import A5
from reportlab.lib.units import cm
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas

from app import email_templates

ENDPOINT_URL = os.environ.get("AWS_ENDPOINT_URL") or None  # None = real AWS
REGION = os.environ.get("AWS_DEFAULT_REGION", "eu-central-1")
BUCKET = os.environ["TICKETS_BUCKET"]
SES_FROM = os.environ["SES_FROM_ADDRESS"]
SES_DEMO_TO = os.environ.get("SES_DEMO_TO_ADDRESS", SES_FROM)

s3 = boto3.client("s3", endpoint_url=ENDPOINT_URL, region_name=REGION)
ses = boto3.client("ses", endpoint_url=ENDPOINT_URL, region_name=REGION)


def _build_pdf(ticket_id: str, order: dict) -> bytes:
    qr_img = qrcode.make(ticket_id)
    qr_buf = io.BytesIO()
    qr_img.save(qr_buf, format="PNG")
    qr_buf.seek(0)

    pdf_buf = io.BytesIO()
    c = canvas.Canvas(pdf_buf, pagesize=A5)
    width, height = A5

    c.setFont("Helvetica-Bold", 22)
    c.drawString(2 * cm, height - 3 * cm, "TicketApp")

    c.setFont("Helvetica", 11)
    c.drawString(2 * cm, height - 4 * cm, f"Ticket {ticket_id}")
    c.drawString(2 * cm, height - 5 * cm, f"Order {order['id']}")
    c.drawString(2 * cm, height - 6 * cm,
                 f"Total: {order['total_cents'] / 100:.2f} TRY")

    y = height - 8 * cm
    c.setFont("Helvetica-Bold", 13)
    c.drawString(2 * cm, y, "Items:")
    c.setFont("Helvetica", 11)
    for item in order.get("items", []):
        y -= 0.7 * cm
        line = f"  {item['quantity']} × {item['name']} — {item['unit_price_cents']/100:.2f} TRY"
        c.drawString(2 * cm, y, line)

    c.drawImage(
        ImageReader(qr_buf), width - 7 * cm, 2 * cm,
        width=5 * cm, height=5 * cm, preserveAspectRatio=True,
    )

    c.showPage()
    c.save()
    return pdf_buf.getvalue()


def _upload_pdf(ticket_id: str, pdf_bytes: bytes) -> str:
    key = f"tickets/{ticket_id}.pdf"
    s3.put_object(
        Bucket=BUCKET, Key=key, Body=pdf_bytes,
        ContentType="application/pdf",
    )
    return key


def _signed_url(key: str) -> str:
    return s3.generate_presigned_url(
        "get_object",
        Params={"Bucket": BUCKET, "Key": key},
        ExpiresIn=900,
    )


def _send_email(to_address: str, order: dict, download_url: str) -> None:
    subject, html, text = email_templates.ticket_delivery(order, download_url)
    email_templates.send_via_ses(ses, SES_FROM, to_address, subject, html, text)


def process_message(body: dict) -> None:
    order = body["order"]
    tickets = order.get("tickets")
    if tickets:
        # Use pre-generated tickets from the database
        for ticket in tickets:
            ticket_id = ticket["id"]
            pdf_bytes = _build_pdf(ticket_id, order)
            key = _upload_pdf(ticket_id, pdf_bytes)
            url = _signed_url(key)
            _send_email(SES_DEMO_TO, order, url)
            print(f"  → ticket {ticket_id} → s3://{BUCKET}/{key}")
    else:
        # Fallback: one ticket per quantity-1 unit if not pre-generated
        for item in order["items"]:
            for _ in range(item["quantity"]):
                ticket_id = str(uuid.uuid4())
                pdf_bytes = _build_pdf(ticket_id, order)
                key = _upload_pdf(ticket_id, pdf_bytes)
                url = _signed_url(key)
                _send_email(SES_DEMO_TO, order, url)
                print(f"  → ticket {ticket_id} → s3://{BUCKET}/{key}")


def handler(event, _context=None):
    for record in event.get("Records", []):
        body = json.loads(record["body"])
        print(f"[worker] processing order {body['order']['id']}")
        process_message(body)
    return {"processed": len(event.get("Records", []))}
