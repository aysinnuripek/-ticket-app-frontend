import { createContext, useContext, useState } from "react"

type User = {
  email: string
  fullName?: string
  role?: string
}

type AuthContextType = {
  user: User | null
  idToken: string | null
  signIn: (email: string, password: string) => void
  signUp: (fullName: string, email: string, password: string) => void
  signOut: () => void
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

function readStoredUser(): User | null {
  try {
    const storedUser = localStorage.getItem("user")
    const storedToken = localStorage.getItem("idToken")
    if (!storedUser || !storedToken) return null
    return JSON.parse(storedUser) as User
  } catch {
    return null
  }
}

function readStoredToken(): string | null {
  const storedUser = localStorage.getItem("user")
  const storedToken = localStorage.getItem("idToken")
  return storedUser && storedToken ? storedToken : null
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(() => readStoredUser())
  const [idToken, setIdToken] = useState<string | null>(() => readStoredToken())

  function saveSession(newUser: User) {
    const role = newUser.email === "organizer@example.com" ? "organizer" : "customer"
    const fakeToken = `test-token-${newUser.email}-${role}`
    const userWithRole = { ...newUser, role }

    localStorage.setItem("user", JSON.stringify(userWithRole))
    localStorage.setItem("idToken", fakeToken)

    setUser(userWithRole)
    setIdToken(fakeToken)
  }

  function signIn(email: string, password: string) {
    if (!email || !password) {
      throw new Error("Email and password are required.")
    }

    saveSession({ email })
  }

  function signUp(fullName: string, email: string, password: string) {
    if (!fullName || !email || !password) {
      throw new Error("Full name, email, and password are required.")
    }

    saveSession({ fullName, email })
  }

  function signOut() {
    localStorage.removeItem("user")
    localStorage.removeItem("idToken")

    setUser(null)
    setIdToken(null)
  }

  return (
    <AuthContext.Provider value={{ user, idToken, signIn, signUp, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)

  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider")
  }

  return context
}
