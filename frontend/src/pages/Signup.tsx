import { useState } from "react"
import type { FormEvent } from "react"
import { Link, useNavigate } from "react-router-dom"
import { useAuth } from "../auth/AuthContext"

export default function Signup() {
  const { signUp } = useAuth()
  const navigate = useNavigate()

  const [fullName, setFullName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError("")

    try {
      signUp(fullName, email, password)
      navigate("/my-tickets")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Signup failed.")
    }
  }

  return (
    <main className="mx-auto max-w-md px-6 py-10">
      <h1 className="text-3xl font-bold text-slate-900">Sign up</h1>
      <p className="mt-3 text-slate-600">
        Create an account to buy and manage your tickets.
      </p>

      {error && (
        <div className="mt-5 rounded-xl bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <input
          className="w-full rounded-xl border border-slate-300 p-3"
          placeholder="Full name"
          value={fullName}
          onChange={(event) => setFullName(event.target.value)}
        />

        <input
          className="w-full rounded-xl border border-slate-300 p-3"
          placeholder="Email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />

        <input
          className="w-full rounded-xl border border-slate-300 p-3"
          placeholder="Password"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />

        <button className="w-full rounded-xl bg-slate-900 px-5 py-3 font-semibold text-white hover:bg-slate-700">
          Create account
        </button>
      </form>

      <p className="mt-5 text-sm text-slate-600">
        Already have an account?{" "}
        <Link to="/login" className="font-semibold text-blue-600">
          Login
        </Link>
      </p>
    </main>
  )
}
