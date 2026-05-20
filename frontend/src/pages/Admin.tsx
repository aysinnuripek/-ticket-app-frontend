import { useMemo, useState } from "react"
import type { FormEvent } from "react"
import { useNavigate } from "react-router-dom"
import { getStoredEvents, resetEvents, saveEvent } from "../data/eventStore"
import type { EventItem } from "../data/events"

type SavedTicket = {
  id: string
  eventTitle: string
  generalQuantity: number
  vipQuantity: number
  total: number
  purchasedAt: string
}

export default function Admin() {
  const navigate = useNavigate()

  const [title, setTitle] = useState("")
  const [city, setCity] = useState("")
  const [category, setCategory] = useState("Concert")
  const [date, setDate] = useState("")
  const [price, setPrice] = useState("")
  const [imageUrl, setImageUrl] = useState("")
  const [description, setDescription] = useState("")
  const [error, setError] = useState("")

  const events = getStoredEvents()
  const tickets: SavedTicket[] = JSON.parse(localStorage.getItem("tickets") || "[]")

  const salesSummary = useMemo(() => {
    const totalOrders = tickets.length

    const ticketsSold = tickets.reduce((sum, ticket) => {
      return sum + ticket.generalQuantity + ticket.vipQuantity
    }, 0)

    const totalRevenue = tickets.reduce((sum, ticket) => {
      return sum + ticket.total
    }, 0)

    return {
      totalOrders,
      ticketsSold,
      totalRevenue,
    }
  }, [tickets])

  function getEventRevenue(eventTitle: string) {
    return tickets
      .filter((ticket) => ticket.eventTitle === eventTitle)
      .reduce((sum, ticket) => sum + ticket.total, 0)
  }

  function getEventTicketsSold(eventTitle: string) {
    return tickets
      .filter((ticket) => ticket.eventTitle === eventTitle)
      .reduce((sum, ticket) => {
        return sum + ticket.generalQuantity + ticket.vipQuantity
      }, 0)
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError("")

    if (!title || !city || !category || !date || !price || !description) {
      setError("Please fill in all required fields.")
      return
    }

    const newEvent: EventItem = {
      id: `event-${Math.random().toString(36).slice(2, 10)}`,
      title,
      city,
      category,
      date,
      price: Number(price),
      imageUrl:
        imageUrl ||
        "https://images.unsplash.com/photo-1492684223066-81342ee5ff30",
      description,
    }

    saveEvent(newEvent)
    navigate(`/events/${newEvent.id}`)
  }

  function handleReset() {
    resetEvents()
    navigate("/")
  }

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Admin Panel</h1>
          <p className="mt-3 text-slate-600">
            Create demo events and view sales summary.
          </p>
        </div>

        <button
          onClick={handleReset}
          className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          Reset demo events
        </button>
      </div>

      <section className="mt-8 grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl bg-white p-6 shadow-sm">
          <p className="text-sm font-semibold text-slate-500">Total orders</p>
          <p className="mt-2 text-3xl font-bold text-slate-900">
            {salesSummary.totalOrders}
          </p>
        </div>

        <div className="rounded-2xl bg-white p-6 shadow-sm">
          <p className="text-sm font-semibold text-slate-500">Tickets sold</p>
          <p className="mt-2 text-3xl font-bold text-slate-900">
            {salesSummary.ticketsSold}
          </p>
        </div>

        <div className="rounded-2xl bg-white p-6 shadow-sm">
          <p className="text-sm font-semibold text-slate-500">Total revenue</p>
          <p className="mt-2 text-3xl font-bold text-slate-900">
            ₺{salesSummary.totalRevenue}
          </p>
        </div>
      </section>

      <section className="mt-8 rounded-2xl bg-white p-6 shadow-sm">
        <h2 className="text-2xl font-bold text-slate-900">Event sales</h2>

        <div className="mt-5 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b text-slate-500">
                <th className="py-3 pr-4">Event</th>
                <th className="py-3 pr-4">City</th>
                <th className="py-3 pr-4">Category</th>
                <th className="py-3 pr-4">Tickets sold</th>
                <th className="py-3 pr-4">Revenue</th>
              </tr>
            </thead>

            <tbody>
              {events.map((event) => (
                <tr key={event.id} className="border-b last:border-b-0">
                  <td className="py-3 pr-4 font-semibold text-slate-900">
                    {event.title}
                  </td>
                  <td className="py-3 pr-4 text-slate-600">{event.city}</td>
                  <td className="py-3 pr-4 text-slate-600">{event.category}</td>
                  <td className="py-3 pr-4 text-slate-600">
                    {getEventTicketsSold(event.title)}
                  </td>
                  <td className="py-3 pr-4 font-semibold text-slate-900">
                    ₺{getEventRevenue(event.title)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {error && (
        <div className="mt-6 rounded-xl bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="mt-8 rounded-2xl bg-white p-6 shadow-sm">
        <h2 className="text-2xl font-bold text-slate-900">Create event</h2>

        <div className="mt-6 grid gap-5 sm:grid-cols-2">
          <label className="block">
            <span className="text-sm font-semibold text-slate-700">Event title</span>
            <input
              className="mt-2 w-full rounded-xl border border-slate-300 p-3"
              placeholder="Example: Rock Night"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </label>

          <label className="block">
            <span className="text-sm font-semibold text-slate-700">City</span>
            <input
              className="mt-2 w-full rounded-xl border border-slate-300 p-3"
              placeholder="Istanbul"
              value={city}
              onChange={(event) => setCity(event.target.value)}
            />
          </label>

          <label className="block">
            <span className="text-sm font-semibold text-slate-700">Category</span>
            <select
              className="mt-2 w-full rounded-xl border border-slate-300 p-3"
              value={category}
              onChange={(event) => setCategory(event.target.value)}
            >
              <option>Concert</option>
              <option>Theatre</option>
              <option>Festival</option>
              <option>Sports</option>
            </select>
          </label>

          <label className="block">
            <span className="text-sm font-semibold text-slate-700">Date</span>
            <input
              className="mt-2 w-full rounded-xl border border-slate-300 p-3"
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
            />
          </label>

          <label className="block">
            <span className="text-sm font-semibold text-slate-700">Price</span>
            <input
              className="mt-2 w-full rounded-xl border border-slate-300 p-3"
              type="number"
              min="0"
              placeholder="750"
              value={price}
              onChange={(event) => setPrice(event.target.value)}
            />
          </label>

          <label className="block">
            <span className="text-sm font-semibold text-slate-700">Image URL optional</span>
            <input
              className="mt-2 w-full rounded-xl border border-slate-300 p-3"
              placeholder="https://..."
              value={imageUrl}
              onChange={(event) => setImageUrl(event.target.value)}
            />
          </label>
        </div>

        <label className="mt-5 block">
          <span className="text-sm font-semibold text-slate-700">Description</span>
          <textarea
            className="mt-2 min-h-32 w-full rounded-xl border border-slate-300 p-3"
            placeholder="Write a short event description..."
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        </label>

        <button className="mt-6 rounded-xl bg-slate-900 px-5 py-3 font-semibold text-white hover:bg-slate-700">
          Create event
        </button>
      </form>
    </main>
  )
}
