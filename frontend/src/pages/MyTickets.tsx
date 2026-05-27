import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import TicketQRCode from "../components/TicketQRCode"
import { apiClient } from "../api/client"

import { useAuth } from "../auth/AuthContext"

type SavedTicket = {
  id: string
  eventTitle: string
  generalQuantity: number
  vipQuantity: number
  total: number
  purchasedAt: string
}

export default function MyTickets() {
  const { user } = useAuth()
  const [tickets, setTickets] = useState<SavedTicket[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    apiClient
      .get<SavedTicket[]>("/orders/me")
      .then((res) => {
        setTickets(res.data)
        setLoading(false)
      })
      .catch((err) => {
        console.error(err)
        setLoading(false)
      })
  }, [])

  async function handleDownload(orderId: string) {
    try {
      const res = await apiClient.get(`/tickets/${orderId}`, { responseType: "blob" })
      const url = window.URL.createObjectURL(new Blob([res.data], { type: "application/pdf" }))
      const a = document.createElement("a")
      a.href = url
      a.download = `ticket-${orderId.slice(0, 8)}.pdf`
      a.click()
      window.URL.revokeObjectURL(url)
    } catch (err) {
      console.error(err)
      alert("Failed to download PDF ticket. Please try again in a few seconds.")
    }
  }

  if (user && (user.role === "organizer" || user.role === "admin" || user.email === "organizer@example.com")) {
    return (
      <main className="mx-auto max-w-4xl px-6 py-10">
        <h1 className="text-3xl font-bold text-slate-900">Access Denied</h1>
        <p className="mt-3 text-slate-600">
          Organizers and admins do not have ticket purchase profiles.
        </p>
      </main>
    )
  }

  if (loading) {
    return (
      <main className="mx-auto max-w-4xl px-6 py-10">
        <p className="text-slate-600">Loading tickets...</p>
      </main>
    )
  }

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <h1 className="text-3xl font-bold text-slate-900">My Tickets</h1>
      <p className="mt-3 text-slate-600">
        Your purchased tickets appear here.
      </p>

      {tickets.length === 0 ? (
        <div className="mt-8 rounded-2xl bg-white p-8 text-center shadow-sm">
          <h2 className="text-xl font-semibold text-slate-900">
            No tickets yet
          </h2>
          <p className="mt-2 text-slate-600">
            Browse events and complete checkout to create your first ticket.
          </p>

          <Link
            to="/"
            className="mt-6 inline-block rounded-xl bg-slate-900 px-5 py-3 font-semibold text-white hover:bg-slate-700"
          >
            Browse events
          </Link>
        </div>
      ) : (
        <section className="mt-8 space-y-4">
          {tickets.map((ticket) => (
            <article
              key={ticket.id}
              className="rounded-2xl bg-white p-6 shadow-sm"
            >
              <div className="flex flex-col justify-between gap-6 sm:flex-row">
                <div>
                  <p className="text-sm font-semibold text-slate-500">
                    {ticket.id}
                  </p>

                  <h2 className="mt-2 text-2xl font-bold text-slate-900">
                    {ticket.eventTitle}
                  </h2>

                  <p className="mt-2 text-slate-600">
                    General: {ticket.generalQuantity} • VIP: {ticket.vipQuantity}
                  </p>

                  <p className="mt-2 text-sm text-slate-500">
                    Purchased at: {new Date(ticket.purchasedAt).toLocaleString()}
                  </p>

                  <p className="mt-4 text-2xl font-bold text-slate-900">
                    ₺{ticket.total}
                  </p>
                </div>

                <div className="rounded-2xl bg-slate-100 p-5 text-center">
                  <TicketQRCode value={ticket.id} />

                  <p className="mt-3 text-xs font-semibold text-slate-500">
                    Ticket QR Code
                  </p>

                  <button
                    onClick={() => handleDownload(ticket.id)}
                    className="mt-4 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700"
                  >
                    Download ticket
                  </button>
                </div>
              </div>
            </article>
          ))}
        </section>
      )}
    </main>
  )
}
