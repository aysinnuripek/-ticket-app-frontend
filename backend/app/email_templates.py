"""Email templates rendered locally (no SES-side templating).

Each template is a function that takes a data dict and returns a
(subject, html_body, text_body) tuple. The webhook handler and the worker
both call `send_via_ses(client, source, to, subject, html, text)`.

Rationale: LocalStack's SES Mustache parser is unreliable; rendering in
Python keeps templates version-controlled and avoids cross-environment
inconsistency.
"""

from typing import Iterable

BRAND = "TicketApp"
BRAND_COLOR = "#0f172a"

_BASE_CSS = (
    "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,"
    "Arial,sans-serif;color:#0f172a;"
)


def _wrap(inner_html: str, preheader: str) -> str:
    return f"""<!doctype html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f1f5f9;{_BASE_CSS}">
<div style="display:none;max-height:0;overflow:hidden">{preheader}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
       style="background:#f1f5f9;padding:32px 0">
  <tr><td align="center">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"
           style="background:#ffffff;border-radius:16px;overflow:hidden;
                  box-shadow:0 1px 3px rgba(0,0,0,0.05)">
      <tr><td style="padding:28px 32px;background:{BRAND_COLOR};color:#ffffff">
        <div style="font-size:22px;font-weight:700">{BRAND}</div>
      </td></tr>
      <tr><td style="padding:32px;{_BASE_CSS}">{inner_html}</td></tr>
      <tr><td style="padding:18px 32px;background:#f8fafc;color:#64748b;
                     font-size:12px;{_BASE_CSS}">
        You received this email because you completed a purchase on {BRAND}.
      </td></tr>
    </table>
  </td></tr>
</table></body></html>"""


def _items_rows(items: Iterable[dict]) -> str:
    rows = []
    for item in items:
        rows.append(
            f"""<tr><td style="padding:14px 20px;border-bottom:1px solid #e2e8f0">
            <table width="100%"><tr>
              <td style="font-size:14px">
                <strong>{item['quantity']} ×</strong> {item['name']}
              </td>
              <td align="right" style="font-size:14px;color:#475569">
                {item['unit_price_cents'] / 100:.2f} TRY
              </td>
            </tr></table></td></tr>"""
        )
    return "\n".join(rows)


def order_confirmation(order: dict) -> tuple[str, str, str]:
    short_id = order["id"][:8]
    total_try = f"{order['total_cents'] / 100:.2f}"
    items_html = _items_rows(order["items"])

    subject = f"Order received — #{short_id}"
    inner = f"""
        <h1 style="margin:0 0 12px;font-size:24px">Thanks for your order</h1>
        <p style="margin:0 0 20px;color:#475569;line-height:1.5">
          We received your payment. Your QR-code tickets are being generated and
          will arrive in a follow-up email within a minute.
        </p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
               style="border:1px solid #e2e8f0;border-radius:12px;margin:20px 0">
          <tr><td style="padding:16px 20px;border-bottom:1px solid #e2e8f0">
            <div style="color:#64748b;font-size:12px;text-transform:uppercase;
                        letter-spacing:0.05em">Order</div>
            <div style="font-family:ui-monospace,Menlo,monospace;font-size:13px">
              {order['id']}
            </div>
          </td></tr>
          {items_html}
          <tr><td style="padding:16px 20px;background:#f8fafc">
            <table width="100%"><tr>
              <td style="font-size:14px;color:#475569">Total</td>
              <td align="right" style="font-size:20px;font-weight:700">
                {total_try} TRY
              </td>
            </tr></table>
          </td></tr>
        </table>
    """
    html = _wrap(inner, preheader="Your order is confirmed — tickets coming next.")
    text = (
        f"Thanks for your order!\n\n"
        f"Order: {order['id']}\n"
        f"Total: {total_try} TRY\n\n"
        f"Your tickets are being generated and will arrive in a separate email."
    )
    return subject, html, text


def ticket_delivery(order: dict, download_url: str) -> tuple[str, str, str]:
    short_id = order["id"][:8]
    subject = f"Your tickets are ready — #{short_id}"
    inner = f"""
        <h1 style="margin:0 0 12px;font-size:24px">Your tickets are ready</h1>
        <p style="margin:0 0 24px;color:#475569;line-height:1.5">
          Show the QR code on your phone at the entrance. You can also print the PDF.
        </p>
        <p style="margin:0 0 28px">
          <a href="{download_url}"
             style="display:inline-block;padding:14px 28px;background:{BRAND_COLOR};
                    color:#ffffff;border-radius:10px;text-decoration:none;
                    font-weight:600">
            Download ticket (PDF)
          </a>
        </p>
        <p style="margin:0;color:#94a3b8;font-size:12px;line-height:1.5">
          Download link expires in 15 minutes. Open this email again any time to
          generate a fresh link — or visit "My tickets" on the website.
        </p>
    """
    html = _wrap(inner, preheader="Open this email at the entrance to scan your QR code.")
    text = (
        f"Your tickets for order {order['id']} are ready.\n\n"
        f"Download (link expires in 15 minutes):\n{download_url}\n"
    )
    return subject, html, text


def send_via_ses(ses_client, source: str, to: str, subject: str, html: str, text: str):
    ses_client.send_email(
        Source=source,
        Destination={"ToAddresses": [to]},
        Message={
            "Subject": {"Data": subject, "Charset": "UTF-8"},
            "Body": {
                "Html": {"Data": html, "Charset": "UTF-8"},
                "Text": {"Data": text, "Charset": "UTF-8"},
            },
        },
    )
