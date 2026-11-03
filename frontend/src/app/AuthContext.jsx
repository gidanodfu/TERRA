import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { api } from '../services/api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [permissions, setPermissions] = useState([])
  const [mustRotate, setMustRotate] = useState(false)
  const [pendingProfile, setPendingProfile] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const clear = useCallback(() => {
    setUser(null)
    setPermissions([])
    setMustRotate(false)
    setPendingProfile(false)
  }, [])

  const apply = useCallback((data) => {
    setUser(data.user)
    setPermissions(data.permissions || [])
    setMustRotate(Boolean(data.must_rotate_password))
    setPendingProfile(Boolean(data.pending_profile))
  }, [])

  const refresh = useCallback(async () => {
    try {
      const data = await api.get('/auth/me')
      apply(data)
      setError(null)
      return data
    } catch (err) {
      if (err.status === 401 || err.status === 403) {
        clear()
      } else {
        setError(err)
      }
      return null
    } finally {
      setLoading(false)
    }
  }, [apply, clear])

  useEffect(() => {
    refresh()
  }, [refresh])

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout')
    } catch {
      // Session may already be gone; local state is cleared regardless.
    } finally {
      clear()
    }
  }, [clear])

  const value = useMemo(
    () => ({
      user,
      permissions,
      mustRotate,
      pendingProfile,
      loading,
      error,
      refresh,
      apply,
      logout,
      clear,
      isAdmin: Boolean(user?.roles?.includes('admin')),
      can: (permission) => permissions.includes(permission),
    }),
    [user, permissions, mustRotate, pendingProfile, loading, error, refresh, apply, logout, clear],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside AuthProvider')
  return context
}
