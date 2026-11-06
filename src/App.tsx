import { CircularProgress, Stack, Typography } from '@mui/material'
import { observer } from 'mobx-react-lite'
import { useEffect } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { authStore } from './auth/authStore'
import { AppShell } from './layout/AppShell'
import { LoginPage } from './auth/LoginPage'

function Home() {
  const role = authStore.user?.role
  return <Navigate to={role === 'ADMIN' ? '/admin/university' : role === 'ORGANIZER' ? '/organizer/sessions' : '/availability'} replace />
}

function Protected({ children }: { children: React.ReactNode }) {
  return authStore.isAuthenticated ? children : <Navigate to="/login" replace />
}

function ScreenPlaceholder({ title }: { title: string }) {
  return <><Typography variant="h4">{title}</Typography><Typography color="text.secondary">Экран будет добавлен в F3.</Typography></>
}

export const App = observer(function App() {
  useEffect(() => { void authStore.restore() }, [])
  if (authStore.loading) return <Stack alignItems="center" justifyContent="center" minHeight="100vh" gap={2}><CircularProgress /><Typography>Загрузка SlotWise…</Typography></Stack>
  return <Routes>
    <Route element={<AppShell />}>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={<Protected><Home /></Protected>} />
      <Route path="/availability" element={<Protected><ScreenPlaceholder title="Моя занятость" /></Protected>} />
      <Route path="/schedule" element={<Protected><ScreenPlaceholder title="Моё расписание" /></Protected>} />
      <Route path="/requests" element={<Protected><ScreenPlaceholder title="Мои запросы" /></Protected>} />
      <Route path="/organizer/:section" element={<Protected><ScreenPlaceholder title="Сессии планирования" /></Protected>} />
      <Route path="/admin/:section" element={<Protected><ScreenPlaceholder title="Данные вуза" /></Protected>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Route>
  </Routes>
})
