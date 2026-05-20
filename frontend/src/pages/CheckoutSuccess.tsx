import { useEffect, useState } from "react"
import { Link, useSearchParams } from "react-router-dom"
import { getOrder } from "../api/orders"
import type { OrderStatus } from "../api/orders"

export default function CheckoutSuccess() {
  const [searchParams] = useSearchParams()
  const orderId = searchParams.get("order_id")

  const [status, setStatus] = useState<OrderStatus | "unknown">("unknown")
  const [error, setError] = useState("")

  useEffect(() => {
    if (!orderId) {
      setError("Missing order ID in URL.")
      return
    }

    let cancelled = false

    async function poll() {
      try {
        const order = await getOrder(orderId!)
        if (cancelled) return
        setStatus(order.status)
      } catch (err) {
        console.error(err)
      }
    }

    poll()
    const interval = setInterval(() => {
      if (status === "paid") return
      poll()
    }, 2000)

    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [orderId, status])

  const paid = status === "paid"

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <div className="rounded-2xl bg-white p-8 text-center shadow-sm">
        <div
          className={`mx-auto flex h-16 w-16 items-center justify-center rounded-full text-3xl ${
            paid ? "bg-green-100" : "bg-slate-100"
          }`}
        >
          {paid ? "✓" : "…"}
        </div>

        <h1 className="mt-6 text-3xl font-bold text-slate-900">
          {paid ? "Payment successful" : "Confirming your payment..."}
        </h1>

        <p className="mt-3 text-slate-600">
          {paid
            ? "Your ticket is on the way. The QR code PDF will be emailed to you shortly."
            : "We're waiting for Stripe to confirm your payment. This usually takes a few seconds."}
        </p>

        {error && (
          <p className="mt-3 text-sm text-red-700">{error}</p>
        )}

        {orderId && (
          <p className="mt-4 text-xs text-slate-400">Order #{orderId}</p>
        )}

        <div className="mt-8 flex justify-center gap-4">
          <Link
            to="/my-tickets"
            className="rounded-xl bg-slate-900 px-5 py-3 font-semibold text-white hover:bg-slate-700"
          >
            View my tickets
          </Link>

          <Link
            to="/"
            className="rounded-xl border border-slate-300 px-5 py-3 font-semibold text-slate-700 hover:bg-slate-50"
          >
            Back to events
          </Link>
        </div>
      </div>
    </main>
  )
}
