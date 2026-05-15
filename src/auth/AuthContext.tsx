import { createContext, useContext, useEffect, useState } from "react"

type User = {
  email: string
  fullName?: string
}

type AuthContextType = {
  user: User | null
  idToken: string | null
  signIn: (email: string, password: string) => void
  signUp: (fullName: string, email: string, password: string) => void
  signOut: () => void
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [idToken, setIdToken] = useState<string | null>(null)

  useEffect(() => {
    const storedUser = localStorage.getItem("user")
    const storedToken = localStorage.getItem("idToken")

    if (storedUser && storedToken) {
      setUser(JSON.parse(storedUser))
      setIdToken(storedToken)
    }
  }, [])

  function saveSession(newUser: User) {
    const fakeToken = "temporary-demo-token"

    localStorage.setItem("user", JSON.stringify(newUser))
    localStorage.setItem("idToken", fakeToken)

    setUser(newUser)
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
