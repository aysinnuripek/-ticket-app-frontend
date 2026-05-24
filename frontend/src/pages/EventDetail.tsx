import { useEffect, useState } from "react"
import { Link, useParams } from "react-router-dom"
import { getEvent } from "../api/events"

type TicketType = {
  id: string
  name: string
  price_cents: number
  total_quantity: number
  sold_quantity: number
}

type DetailedEvent = {
  id: string
  title: string
  city: string
  category: string
  date: string
  price: number
  imageUrl: string
  description: string
  ticketTypes: TicketType[]
}

export default function EventDetail() {
  const { id } = useParams()
  const [event, setEvent] = useState<DetailedEvent | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) return
    getEvent(id)
      .then((data: any) => {
        setEvent({
          id: data.id,
          title: data.title,
          city: data.city,
          category: data.category,
          date: data.starts_at,
          price: data.price,
          imageUrl: data.image_url,
          description: data.description,
          ticketTypes: data.ticket_types || [],
        })
        setLoading(false)
      })
      .catch((err) => {
        console.error(err)
        setLoading(false)
      })
  }, [id])

  if (loading) {
    return (
      <main className="mx-auto max-w-4xl px-6 py-10">
        <p className="text-slate-600">Loading event details...</p>
      </main>
    )
  }

  if (!event) {
    return (
      <main className="mx-auto max-w-4xl px-6 py-10">
        <h1 className="text-2xl font-bold">Event not found</h1>
        <Link to="/" className="mt-4 inline-block text-blue-600">
          Back to homepage
        </Link>
      </main>
    )
  }

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <Link to="/" className="text-sm text-blue-600">
        ← Back to events
      </Link>

      <div className="mt-6 overflow-hidden rounded-2xl bg-white shadow-sm">
        <img
          src={event.imageUrl}
          alt={event.title}
          className="h-80 w-full object-cover"
        />

        <div className="p-6">
          <p className="text-slate-500 text-sm">
            {event.city} • {event.category} • {event.date}
          </p>

          <h1 className="mt-3 text-4xl font-bold text-slate-900">
            {event.title}
          </h1>

          <p className="mt-4 text-slate-700">
            {event.description}
          </p>

          <div className="mt-8 space-y-4">
            <h3 className="text-xl font-bold text-slate-900">Tickets</h3>
            {event.ticketTypes.map((tt) => {
              const available = tt.total_quantity - tt.sold_quantity
              const isSoldOut = available <= 0

              return (
                <div key={tt.id} className="rounded-xl border border-slate-200 p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-slate-50/50">
                  <div>
                    <h4 className="text-lg font-semibold text-slate-800">{tt.name}</h4>
                    <p className={`mt-1 text-sm ${isSoldOut ? "text-red-600 font-semibold" : "text-slate-500"}`}>
                      {isSoldOut ? "Sold Out" : `Available tickets: ${available}`}
                    </p>
                    <p className="mt-1 text-lg font-bold text-slate-900">₺{tt.price_cents / 100}</p>
                  </div>

                  {!isSoldOut && (
                    <Link
                      to={`/checkout?eventId=${event.id}`}
                      className="rounded-xl bg-slate-900 px-5 py-3 text-white hover:bg-slate-700 font-semibold text-center"
                    >
                      Select ticket
                    </Link>
                  )}
                  {isSoldOut && (
                    <span className="rounded-xl bg-red-50 border border-red-200 px-5 py-3 text-red-700 font-semibold cursor-not-allowed text-center">
                      Sold Out
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </main>
  )
}
