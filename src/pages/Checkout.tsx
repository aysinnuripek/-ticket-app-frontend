import { useState } from "react"
import { Link, useNavigate, useSearchParams } from "react-router-dom"
import TicketTypeRow from "../components/TicketTypeRow"
import { events } from "../data/events"

type SavedTicket = {
  id: string
  eventTitle: string
  generalQuantity: number
  vipQuantity: number
  total: number
  purchasedAt: string
}

export default function Checkout() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const eventId = searchParams.get("eventId")
  const selectedEvent = events.find((item) => item.id === eventId)

  const [generalQuantity, setGeneralQuantity] = useState(1)
  const [vipQuantity, setVipQuantity] = useState(0)

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

  function handlePay() {
    if (total === 0) {
      return
    }

    const newTicket: SavedTicket = {
      id: `TICKET-${Math.random().toString(36).slice(2, 10).toUpperCase()}`,
      eventTitle: event.title,
      generalQuantity,
      vipQuantity,
      total,
      purchasedAt: new Date().toISOString(),
    }

    const existingTickets = JSON.parse(localStorage.getItem("tickets") || "[]")
    localStorage.setItem("tickets", JSON.stringify([newTicket, ...existingTickets]))

    navigate("/checkout/success")
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
          disabled={total === 0}
          className="mt-6 w-full rounded-xl bg-slate-900 px-5 py-3 font-semibold text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          Continue to payment
        </button>
      </section>
    </main>
  )
}
