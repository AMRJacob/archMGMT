import { createContext, useContext } from 'react'
import type { Session } from '@supabase/supabase-js'

export interface AuthState {
  session: Session | null
  loading: boolean
  /** True after an invite or password-reset link: the user must choose a password first. */
  needsPassword: boolean
  linkError: string | null
  passwordSet: () => void
  signOut: () => Promise<void>
}

export const AuthContext = createContext<AuthState>({
  session: null, loading: true, needsPassword: false, linkError: null,
  passwordSet: () => {}, signOut: async () => {},
})

export const useAuth = () => useContext(AuthContext)
