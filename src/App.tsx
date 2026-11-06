import { CircularProgress, Stack, Typography } from '@mui/material'
import { observer } from 'mobx-react-lite'
import { useEffect } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { authStore } from './auth/authStore'
import { AppShell } from './layout/AppShell'
import { LoginPage } from './auth/LoginPage'
import { MockupPage, ScreenIndex } from './screens/MockupPage'
import { AvailabilityPage } from './availability/AvailabilityPage'

function Home() {
  const role = authStore.user?.role
  return <Navigate to={role === 'ADMIN' ? '/admin/university' : role === 'ORGANIZER' ? '/organizer/sessions' : '/availability'} replace />
}

function Protected({ children }: { children: React.ReactNode }) {
  return authStore.isAuthenticated ? children : <Navigate to="/login" replace />
}

export const App = observer(function App() {
  useEffect(() => { void authStore.restore() }, [])
  if (authStore.loading) return <Stack alignItems="center" justifyContent="center" minHeight="100vh" gap={2}><CircularProgress /><Typography>Загрузка SlotWise…</Typography></Stack>
  return <Routes>
    <Route element={<AppShell />}>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={<Protected><Home /></Protected>} />
      <Route path="/availability" element={<Protected><AvailabilityPage /></Protected>} />
      <Route path="/schedule" element={<Protected><MockupPage screenId="3:306" /></Protected>} />
      <Route path="/requests" element={<Protected><MockupPage screenId="3:559" /></Protected>} />
      <Route path="/organizer/sessions" element={<Protected><MockupPage screenId="4:18" /></Protected>} />
      <Route path="/organizer/schedule" element={<Protected><MockupPage screenId="4:754" /></Protected>} />
      <Route path="/organizer/requests" element={<Protected><MockupPage screenId="4:1107" /></Protected>} />
      <Route path="/organizer/scenarios" element={<Protected><MockupPage screenId="4:1288" /></Protected>} />
      <Route path="/admin/university" element={<Protected><MockupPage screenId="5:18" /></Protected>} />
      <Route path="/admin/users" element={<Protected><MockupPage screenId="5:211" /></Protected>} />
      <Route path="/admin/event-types" element={<Protected><MockupPage screenId="5:375" /></Protected>} />
      <Route path="/admin/experiments" element={<Protected><MockupPage screenId="5:544" /></Protected>} />
      <Route path="/screens" element={<Protected><ScreenIndex /></Protected>} />
      <Route path="/screens/:id" element={<Protected><MockupPage /></Protected>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Route>
  </Routes>
})
