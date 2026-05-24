import { useEffect, useState } from "react"
import { Link, useParams } from "react-router-dom"
import { getEvent } from "../api/events"
import type { EventItem } from "../data/events"

export default function EventDetail() {
  const { id } = useParams()
  const [event, setEvent] = useState<EventItem | null>(null)
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
          <p className="text-sm text-slate-500">
            {event.city} • {event.category} • {event.date}
          </p>

          <h1 className="mt-3 text-4xl font-bold text-slate-900">
            {event.title}
          </h1>

          <p className="mt-4 text-slate-700">
            {event.description}
          </p>

          <div className="mt-8 rounded-xl border border-slate-200 p-5">
            <h2 className="text-xl font-semibold">General Admission</h2>
            <p className="mt-2 text-slate-600">Available tickets: 100</p>
            <p className="mt-2 text-lg font-bold">₺{event.price}</p>

            <Link
              to={`/checkout?eventId=${event.id}`}
              className="mt-5 inline-block rounded-xl bg-slate-900 px-5 py-3 text-white hover:bg-slate-700"
            >
              Select ticket
            </Link>
          </div>
        </div>
      </div>
    </main>
  )
}
