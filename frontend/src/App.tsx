import { Link, Route, Routes } from "react-router-dom"
import Home from "./pages/Home"
import EventDetail from "./pages/EventDetail"
import Checkout from "./pages/Checkout"
import CheckoutSuccess from "./pages/CheckoutSuccess"
import Login from "./pages/Login"
import Signup from "./pages/Signup"
import MyTickets from "./pages/MyTickets"
import Admin from "./pages/Admin"
import RequireAuth from "./auth/RequireAuth"
import { useAuth } from "./auth/AuthContext"

export default function App() {
  const { user, signOut } = useAuth()

  return (
    <>
      <nav className="border-b bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link to="/" className="text-xl font-bold text-slate-900">
            TicketApp
          </Link>

          <div className="flex items-center gap-4 text-sm">
            {(!user || (user.role !== "organizer" && user.role !== "admin" && user.email !== "organizer@example.com")) && (
              <Link to="/my-tickets" className="text-slate-700 hover:text-slate-900">
                My Tickets
              </Link>
            )}

            {user && (user.role === "organizer" || user.role === "admin" || user.email === "organizer@example.com") && (
              <Link to="/admin" className="text-slate-700 hover:text-slate-900">
                Admin
              </Link>
            )}

            {user ? (
              <>
                <span className="hidden text-slate-600 sm:inline">
                  {user.fullName || user.email}
                </span>

                <button
                  onClick={signOut}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-slate-700 hover:bg-slate-50"
                >
                  Logout
                </button>
              </>
            ) : (
              <>
                <Link to="/login" className="text-slate-700 hover:text-slate-900">
                  Login
                </Link>

                <Link to="/signup" className="rounded-lg bg-slate-900 px-3 py-2 text-white">
                  Sign up
                </Link>
              </>
            )}
          </div>
        </div>
      </nav>

      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/events/:id" element={<EventDetail />} />

        <Route
          path="/checkout"
          element={
            <RequireAuth>
              <Checkout />
            </RequireAuth>
          }
        />

        <Route
          path="/checkout/success"
          element={
            <RequireAuth>
              <CheckoutSuccess />
            </RequireAuth>
          }
        />

        <Route
          path="/my-tickets"
          element={
            <RequireAuth>
              <MyTickets />
            </RequireAuth>
          }
        />

        <Route
          path="/admin"
          element={
            <RequireAuth>
              <Admin />
            </RequireAuth>
          }
        />

        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
      </Routes>
    </>
  )
}
