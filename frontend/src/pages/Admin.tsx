import { useEffect, useMemo, useState } from "react"
import type { FormEvent } from "react"
import { useNavigate } from "react-router-dom"
import { getEvents } from "../api/events"
import { apiClient } from "../api/client"
import type { EventItem } from "../data/events"

type TicketTypeBreakdown = {
  name: string
  total: number
  sold: number
  price: number
}

type SalesInfo = {
  tickets_sold: number
  revenue: number
  breakdown?: TicketTypeBreakdown[]
}

export default function Admin() {
  const navigate = useNavigate()

  const [title, setTitle] = useState("")
  const [city, setCity] = useState("")
  const [category, setCategory] = useState("Concert")
  const [date, setDate] = useState("")
  const [price, setPrice] = useState("")
  const [capacity, setCapacity] = useState("100")
  const [vipPrice, setVipPrice] = useState("")
  const [imageUrl, setImageUrl] = useState("")
  const [description, setDescription] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(true)

  const [eventList, setEventList] = useState<EventItem[]>([])
  const [salesMap, setSalesMap] = useState<Record<string, SalesInfo>>({})

  useEffect(() => {
    async function loadAdminData() {
      try {
        const data = await getEvents()
        const mapped: EventItem[] = data.map((item: any) => ({
          id: item.id,
          title: item.title,
          city: item.city,
          category: item.category,
          date: item.starts_at,
          price: item.price,
          imageUrl: item.image_url,
          description: item.description,
        }))
        setEventList(mapped)

        // Fetch sales for each event
        const salesData: Record<string, SalesInfo> = {}
        for (const ev of mapped) {
          try {
            const res = await apiClient.get<SalesInfo>(`/admin/events/${ev.id}/sales`)
            salesData[ev.id] = res.data
          } catch (err) {
            console.error(`Failed to load sales for ${ev.id}`, err)
            salesData[ev.id] = { tickets_sold: 0, revenue: 0 }
          }
        }
        setSalesMap(salesData)
        setLoading(false)
      } catch (err) {
        console.error("Failed to load admin data", err)
        setError("Failed to load events. Make sure you are logged in as organizer/admin.")
        setLoading(false)
      }
    }
    loadAdminData()
  }, [])

  const salesSummary = useMemo(() => {
    let totalOrders = 0
    let ticketsSold = 0
    let totalRevenue = 0

    Object.values(salesMap).forEach((info) => {
      ticketsSold += info.tickets_sold
      totalRevenue += info.revenue
      if (info.tickets_sold > 0) {
        totalOrders += 1 // Proxy for total orders
      }
    })

    return {
      totalOrders,
      ticketsSold,
      totalRevenue,
    }
  }, [salesMap])

  function getEventRevenue(eventId: string) {
    return salesMap[eventId]?.revenue || 0
  }

  function getEventTicketsSold(eventId: string) {
    return salesMap[eventId]?.tickets_sold || 0
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError("")

    if (!title || !city || !category || !date || !price || !capacity || !description) {
      setError("Please fill in all required fields.")
      return
    }

    try {
      const payload = {
        title,
        description,
        category,
        city,
        imageUrl: imageUrl || "https://images.unsplash.com/photo-1492684223066-81342ee5ff30",
        date,
        price: Number(price),
        capacity: Number(capacity),
        vipPrice: vipPrice ? Number(vipPrice) : undefined,
      }

      // Add a test organizer token if none is present (for ease of local testing)
      let headers = {}
      const token = localStorage.getItem("idToken")
      if (!token) {
        headers = { Authorization: "Bearer test-token-organizer@example.com-organizer" }
      }

      const res = await apiClient.post<{ event_id: string }>("/admin/events", payload, { headers })
      navigate(`/events/${res.data.event_id}`)
    } catch (err: any) {
      console.error(err)
      setError("Failed to create event. Make sure the backend is running and you are logged in.")
    }
  }

  function handleReset() {
    // Navigate home
    navigate("/")
  }

  if (loading) {
    return (
      <main className="mx-auto max-w-6xl px-6 py-10">
        <p className="text-slate-600">Loading admin panel...</p>
      </main>
    )
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
              {eventList.map((event) => (
                <tr key={event.id} className="border-b last:border-b-0">
                  <td className="py-3 pr-4 font-semibold text-slate-900">
                    <div>{event.title}</div>
                    {salesMap[event.id]?.breakdown && (
                      <div className="mt-1.5 space-y-0.5 text-xs font-normal text-slate-500">
                        {salesMap[event.id].breakdown?.map((bt, idx) => (
                          <div key={idx} className="flex items-center gap-1.5">
                            <span className="h-1 w-1 rounded-full bg-slate-400"></span>
                            <span>
                              {bt.name}: <strong className="font-semibold text-slate-700">{bt.sold}</strong> / {bt.total} sold (₺{bt.price})
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="py-3 pr-4 text-slate-600">{event.city}</td>
                  <td className="py-3 pr-4 text-slate-600">{event.category}</td>
                  <td className="py-3 pr-4 text-slate-600">
                    {getEventTicketsSold(event.id)}
                  </td>
                  <td className="py-3 pr-4 font-semibold text-slate-900">
                    ₺{getEventRevenue(event.id)}
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
            <span className="text-sm font-semibold text-slate-700">General Ticket Price (₺)</span>
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
            <span className="text-sm font-semibold text-slate-700">VIP Ticket Price (₺) optional</span>
            <input
              className="mt-2 w-full rounded-xl border border-slate-300 p-3"
              type="number"
              min="0"
              placeholder="Leave empty to auto-double"
              value={vipPrice}
              onChange={(event) => setVipPrice(event.target.value)}
            />
          </label>

          <label className="block">
            <span className="text-sm font-semibold text-slate-700">Capacity (Ticket Quantity)</span>
            <input
              className="mt-2 w-full rounded-xl border border-slate-300 p-3"
              type="number"
              min="1"
              placeholder="100"
              value={capacity}
              onChange={(event) => setCapacity(event.target.value)}
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
