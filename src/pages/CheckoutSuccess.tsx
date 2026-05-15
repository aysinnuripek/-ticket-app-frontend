import { Link } from "react-router-dom"

export default function CheckoutSuccess() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <div className="rounded-2xl bg-white p-8 text-center shadow-sm">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100 text-3xl">
          ✓
        </div>

        <h1 className="mt-6 text-3xl font-bold text-slate-900">
          Payment successful
        </h1>

        <p className="mt-3 text-slate-600">
          Your demo ticket has been created. In the real system, a QR code PDF ticket will be generated and sent by email.
        </p>

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
