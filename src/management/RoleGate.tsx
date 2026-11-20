import { Alert } from '@mui/material'
import { observer } from 'mobx-react-lite'
import type { ReactNode } from 'react'
import { authStore, type Role } from '../auth/authStore'

export const RoleGate = observer(function RoleGate({ role, children }: { role: Role; children: ReactNode }) {
  return authStore.user?.role === role ? children : <Alert severity="error">У вас нет доступа к этому разделу.</Alert>
})
