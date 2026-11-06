import { Alert, Box, Button, Stack, TextField, Typography } from '@mui/material'
import { observer } from 'mobx-react-lite'
import { useState, type FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { authStore } from './authStore'
import { isMockMode } from '../api/http'

export const LoginPage = observer(function LoginPage() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  if (authStore.isAuthenticated) return <Navigate to="/" replace />
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (await authStore.login(email, password)) navigate('/', { replace: true })
  }
  return <Box sx={{ maxWidth: 530 }}>
    <Typography variant="h4">Вход в SlotWise</Typography>
    <Typography color="text.secondary" variant="body2" sx={{ mb: 4 }}>Отдельный стенд MVP · для целевой интеграции используется сессия my.itmo</Typography>
    <Stack component="form" onSubmit={event => void submit(event)} gap={2.5}>
      <TextField label="Email" type="email" required autoComplete="username" value={email} onChange={event => setEmail(event.target.value)} />
      <TextField label="Пароль" type="password" required autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} />
      {authStore.error && <Alert severity="error">{authStore.error}</Alert>}
      <Button type="submit" variant="contained" disabled={authStore.loading} sx={{ width: 135 }}>Войти</Button>
    </Stack>
    <Typography variant="body2" color="text.secondary" sx={{ mt: 2.5 }}>Если не получается войти, обратитесь к администратору.</Typography>
    {isMockMode() && <Box sx={{ mt: 4 }}><Typography variant="body2" color="text.secondary">Демо-вход: student@example.test, teacher@example.test, organizer@example.test или admin@example.test. Любой непустой пароль.</Typography></Box>}
  </Box>
})
