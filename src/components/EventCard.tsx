import { Link } from "react-router-dom"
import type { EventItem } from "../data/events"

type Props = {
  event: EventItem
}

export default function EventCard({ event }: Props) {
  return (
    <Link
      to={`/events/${event.id}`}
      className="block overflow-hidden rounded-2xl bg-white shadow-sm transition hover:shadow-md"
    >
      <img
        src={event.imageUrl}
        alt={event.title}
        className="h-48 w-full object-cover"
      />

      <div className="p-5">
        <p className="text-sm text-slate-500">
          {event.city} • {event.category}
        </p>

        <h2 className="mt-2 text-xl font-semibold text-slate-900">
          {event.title}
        </h2>

        <p className="mt-2 text-sm text-slate-600">
          {event.date}
        </p>

        <p className="mt-4 font-semibold text-slate-900">
          From ₺{event.price}
        </p>
      </div>
    </Link>
  )
}
