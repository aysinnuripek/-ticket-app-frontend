import { useEffect, useState } from "react"
import { Link, useSearchParams } from "react-router-dom"
import TicketTypeRow from "../components/TicketTypeRow"
import { getEvent } from "../api/events"
import type { EventItem } from "../data/events"
import { createOrder } from "../api/orders"
import type { OrderItem } from "../api/orders"

export default function Checkout() {
  const [searchParams] = useSearchParams()

  const eventId = searchParams.get("eventId")
  const [selectedEvent, setSelectedEvent] = useState<EventItem | null>(null)
  const [loading, setLoading] = useState(true)

  const [generalQuantity, setGeneralQuantity] = useState(1)
  const [vipQuantity, setVipQuantity] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    if (!eventId) {
      setLoading(false)
      return
    }
    getEvent(eventId)
      .then((data: any) => {
        setSelectedEvent({
          id: data.id,
          title: data.title,
          city: data.city,
          category: data.category,
          date: data.starts_at,
          price: data.price,
          imageUrl: data.image_url,
          description: data.description,
        })
        setLoading(false)
      })
      .catch((err) => {
        console.error(err)
        setLoading(false)
      })
  }, [eventId])

  if (loading) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-10">
        <p className="text-slate-600">Loading checkout details...</p>
      </main>
    )
  }

  if (!selectedEvent) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-10">
        <h1 className="text-3xl font-bold text-slate-900">
          Select an event first
        </h1>

        <p className="mt-3 text-slate-600">
          Please choose an event before continuing to checkout.
        </p>

        <Link
          to="/"
          className="mt-6 inline-block rounded-xl bg-slate-900 px-5 py-3 font-semibold text-white hover:bg-slate-700"
        >
          Browse events
        </Link>
      </main>
    )
  }

  const event = selectedEvent
  const generalPrice = event.price
  const vipPrice = event.price * 2
  const total = generalQuantity * generalPrice + vipQuantity * vipPrice

  async function handlePay() {
    if (total === 0 || submitting) {
      return
    }

    setSubmitting(true)
    setError("")

    const items: OrderItem[] = []
    if (generalQuantity > 0) {
      items.push({
        name: `${event.title} — General Admission`,
        unit_price_cents: generalPrice * 100,
        quantity: generalQuantity,
      })
    }
    if (vipQuantity > 0) {
      items.push({
        name: `${event.title} — VIP`,
        unit_price_cents: vipPrice * 100,
        quantity: vipQuantity,
      })
    }

    try {
      const { checkout_url } = await createOrder({ items })
      window.location.href = checkout_url
    } catch (err: any) {
      console.error(err)
      const msg = err.response?.data?.detail || "Could not start payment. Is the backend running on :8000?"
      setError(msg)
      setSubmitting(false)
    }
  }

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <Link to={`/events/${event.id}`} className="text-sm text-blue-600">
        ← Back to event
      </Link>

      <h1 className="mt-5 text-3xl font-bold text-slate-900">
        Checkout
      </h1>

      <p className="mt-3 text-slate-600">
        You are buying tickets for{" "}
        <span className="font-semibold text-slate-900">{event.title}</span>.
      </p>

      {error && (
        <div className="mt-5 rounded-xl bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      <section className="mt-8 space-y-4">
        <TicketTypeRow
          name="General Admission"
          price={generalPrice}
          quantity={generalQuantity}
          onDecrease={() => setGeneralQuantity(Math.max(0, generalQuantity - 1))}
          onIncrease={() => setGeneralQuantity(generalQuantity + 1)}
        />

        <TicketTypeRow
          name="VIP Ticket"
          price={vipPrice}
          quantity={vipQuantity}
          onDecrease={() => setVipQuantity(Math.max(0, vipQuantity - 1))}
          onIncrease={() => setVipQuantity(vipQuantity + 1)}
        />
      </section>

      <section className="mt-8 rounded-2xl bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <span className="text-lg text-slate-600">Total</span>
          <span className="text-2xl font-bold text-slate-900">₺{total}</span>
        </div>

        <button
          onClick={handlePay}
          disabled={total === 0 || submitting}
          className="mt-6 w-full rounded-xl bg-slate-900 px-5 py-3 font-semibold text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          {submitting ? "Redirecting to Stripe..." : "Continue to payment"}
        </button>
      </section>
    </main>
  )
}
