"""Render an email template locally and open the result in a browser.

Usage:
    python -m scripts.preview_email order_confirmation
    python -m scripts.preview_email ticket_delivery
"""

import sys
import webbrowser
from pathlib import Path

from app import email_templates as tpl

SAMPLE_ORDER = {
    "id": "bb73a7e0-7485-46d5-94c7-573251b0d2f7",
    "total_cents": 300000,
    "items": [
        {"name": "Istanbul Jazz Night — General Admission",
         "unit_price_cents": 75000, "quantity": 2},
        {"name": "Istanbul Jazz Night — VIP",
         "unit_price_cents": 150000, "quantity": 1},
    ],
}
SAMPLE_URL = "https://example.com/tickets/preview.pdf"


def main():
    if len(sys.argv) < 2:
        print("usage: python -m scripts.preview_email <order_confirmation|ticket_delivery>")
        sys.exit(1)
    name = sys.argv[1]

    if name == "order_confirmation":
        subject, html, _ = tpl.order_confirmation(SAMPLE_ORDER)
    elif name == "ticket_delivery":
        subject, html, _ = tpl.ticket_delivery(SAMPLE_ORDER, SAMPLE_URL)
    else:
        print(f"unknown template: {name}")
        sys.exit(1)

    out = Path(f"/tmp/preview_{name}.html")
    out.write_text(html)
    print(f"subject: {subject}")
    print(f"wrote:   {out}")
    webbrowser.open(f"file://{out}")


if __name__ == "__main__":
    main()
