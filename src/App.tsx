import { Alert, CircularProgress, Stack, Typography } from '@mui/material'
import { observer } from 'mobx-react-lite'
import { useEffect } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { authStore } from './auth/authStore'
import { AppShell } from './layout/AppShell'
import { LoginPage } from './auth/LoginPage'
import { MockupPage, ScreenIndex } from './screens/MockupPage'
import { AvailabilityPage } from './availability/AvailabilityPage'
import { RoleGate } from './management/RoleGate'
import { UniversityPage } from './management/UniversityPage'
import { ImportPage } from './management/ImportPage'
import { EventTypesPage } from './management/EventTypesPage'
import { NewSessionPage, SessionDetailPage, SessionsPage } from './management/SessionsPage'
import { SessionResources } from './management/SessionResources'
import { SessionEvents } from './management/SessionEvents'
import { SessionRules } from './management/SessionRules'
import { isMockMode } from './api/mode'
import { OrganizerSchedulePage } from './schedule/OrganizerSchedulePage'
import { PersonalSchedulePage } from './schedule/PersonalSchedulePage'

const Home = observer(function Home() {
  const role = authStore.user?.role
  return <Navigate to={role === 'ADMIN' ? '/admin/university' : role === 'ORGANIZER' ? '/organizer/sessions' : '/availability'} replace />
})

const Protected = observer(function Protected({ children }: { children: React.ReactNode }) {
  return authStore.isAuthenticated ? children : <Navigate to="/login" replace />
})

function DemoScreen({ children }: { children: React.ReactNode }) {
  return isMockMode() ? children : <Alert severity="info">Этот экран доступен в демо-режиме.</Alert>
}

export const App = observer(function App() {
  useEffect(() => { void authStore.restore() }, [])
  if (authStore.loading) return <Stack alignItems="center" justifyContent="center" minHeight="100vh" gap={2}><CircularProgress /><Typography>Загрузка SlotWise…</Typography></Stack>
  return <Routes>
    <Route element={<AppShell />}>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={<Protected><Home /></Protected>} />
      <Route path="/availability" element={<Protected><AvailabilityPage /></Protected>} />
      <Route path="/schedule" element={<Protected><PersonalSchedulePage /></Protected>} />
      <Route path="/requests" element={<Protected><DemoScreen><MockupPage screenId="3:559" /></DemoScreen></Protected>} />
      <Route path="/organizer/sessions" element={<Protected><RoleGate role="ORGANIZER"><SessionsPage /></RoleGate></Protected>} />
      <Route path="/organizer/sessions/new" element={<Protected><RoleGate role="ORGANIZER"><NewSessionPage /></RoleGate></Protected>} />
      <Route path="/organizer/sessions/:id" element={<Protected><RoleGate role="ORGANIZER"><SessionDetailPage tab="parameters" /></RoleGate></Protected>} />
      <Route path="/organizer/sessions/:id/resources" element={<Protected><RoleGate role="ORGANIZER"><SessionDetailPage tab="resources">{session => <SessionResources session={session} />}</SessionDetailPage></RoleGate></Protected>} />
      <Route path="/organizer/sessions/:id/events" element={<Protected><RoleGate role="ORGANIZER"><SessionDetailPage tab="events">{session => <SessionEvents session={session} />}</SessionDetailPage></RoleGate></Protected>} />
      <Route path="/organizer/sessions/:id/rules" element={<Protected><RoleGate role="ORGANIZER"><SessionDetailPage tab="rules">{session => <SessionRules session={session} />}</SessionDetailPage></RoleGate></Protected>} />
      <Route path="/organizer/schedule/:id?" element={<Protected><RoleGate role="ORGANIZER"><OrganizerSchedulePage /></RoleGate></Protected>} />
      <Route path="/organizer/requests" element={<Protected><DemoScreen><MockupPage screenId="4:1107" /></DemoScreen></Protected>} />
      <Route path="/organizer/scenarios" element={<Protected><DemoScreen><MockupPage screenId="4:1288" /></DemoScreen></Protected>} />
      <Route path="/admin/university" element={<Protected><RoleGate role="ADMIN"><UniversityPage /></RoleGate></Protected>} />
      <Route path="/admin/university/import" element={<Protected><RoleGate role="ADMIN"><ImportPage /></RoleGate></Protected>} />
      <Route path="/admin/users" element={<Protected><RoleGate role="ADMIN"><UniversityPage users /></RoleGate></Protected>} />
      <Route path="/admin/event-types" element={<Protected><RoleGate role="ADMIN"><EventTypesPage /></RoleGate></Protected>} />
      <Route path="/admin/experiments" element={<Protected><DemoScreen><MockupPage screenId="5:544" /></DemoScreen></Protected>} />
      <Route path="/screens" element={<Protected><DemoScreen><ScreenIndex /></DemoScreen></Protected>} />
      <Route path="/screens/:id" element={<Protected><DemoScreen><MockupPage /></DemoScreen></Protected>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Route>
  </Routes>
})
