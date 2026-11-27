import { Alert, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Paper, Stack, TextField, Typography } from '@mui/material'
import { useCallback, useState } from 'react'
import { api } from '../api/client'
import { errorMessage } from '../api/errors'
import { formatInZone, localDateTime, parseLocalDateTime } from '../availability/time'
import { DataTable, ErrorNotice, useLoad } from './components'
import { personName, type Schema } from './types'

const statusLabel = { PENDING: 'Сбор ещё не открыт', OPEN: 'Сбор открыт', CLOSED: 'Сбор закрыт' }

export function SessionCollection({ session, onChanged }: {
  session: Schema['PlanningSessionResponse']; onChanged: () => void
}) {
  const load = useCallback(() => api('get', '/api/sessions/{id}/collection', { path: { id: session.id } }), [session.id])
  const state = useLoad(load, true)
  const [deadline, setDeadline] = useState<string | null>(null)
  const [confirm, setConfirm] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const collection = state.data
  const path = { id: session.id }
  const zone = session.timeZone
  const format = (value: string) => formatInZone(value, zone, { dateStyle: 'medium', timeStyle: 'short' })

  async function save(close: boolean) {
    if (!collection || pending) return
    const endsAt = deadline ? parseLocalDateTime(deadline, zone) : null
    if (!close && !endsAt) {
      setError('Укажите корректные дату и время окончания сбора.')
      return
    }
    setPending(true)
    setError('')
    setMessage('')
    try {
      const expectedVersion = collection.sessionVersion
      const updated = close
        ? await api('post', '/api/sessions/{id}/collection/close', { path, body: { expectedVersion } })
        : await api('patch', '/api/sessions/{id}/collection', { path, body: { expectedVersion, endsAt: endsAt! } })
      state.setData(updated)
      setDeadline(null)
      setConfirm(false)
      setMessage(close ? 'Сбор закрыт. Ответы сохранены.' : 'Срок сбора обновлён.')
      onChanged()
    } catch (cause) {
      setConfirm(false)
      setError(errorMessage(cause))
    } finally {
      setPending(false)
    }
  }

  function reload() {
    setDeadline(null)
    setError('')
    state.reload()
  }

  return <Stack gap={2}>
    <ErrorNotice error={state.error || error} retry={reload} />
    {state.loading && <CircularProgress size={24} aria-label="Загрузка ответов" />}
    {message && <Alert severity="success" onClose={() => setMessage('')}>{message}</Alert>}
    {collection && <>
      <Paper sx={{ p: 2.5 }}>
        <Stack gap={2}>
          <Stack gap={0.5}>
            <Typography variant="h6">{statusLabel[collection.status]}</Typography>
            <Typography variant="body2" color="text.secondary">{format(collection.startsAt)} — {format(collection.endsAt)} · {zone}</Typography>
            <Typography variant="body2">Ответили {collection.participants.filter(item => item.responseStatus === 'SUBMITTED').length} из {collection.participants.length}</Typography>
          </Stack>
          <Stack direction={{ xs: 'column', sm: 'row' }} gap={1.5} alignItems={{ sm: 'center' }}>
            {collection.status !== 'CLOSED' && <>
              <TextField label="Окончание сбора" type="datetime-local" value={deadline ?? localDateTime(collection.endsAt, zone)}
                onChange={event => setDeadline(event.target.value)} slotProps={{ inputLabel: { shrink: true } }} disabled={pending} />
              <Button variant="contained" disabled={!deadline || pending || state.loading} onClick={() => void save(false)}>Сохранить срок</Button>
            </>}
            {collection.status === 'OPEN' && <Button color="warning" disabled={pending || state.loading} onClick={() => setConfirm(true)}>Закрыть сбор</Button>}
            <Button onClick={reload} disabled={pending || state.loading}>Обновить</Button>
          </Stack>
        </Stack>
      </Paper>
      <DataTable rows={collection.participants} rowKey={item => String(item.person.id)} columns={[
        { label: 'Участник', render: item => personName(item.person) },
        { label: 'Ответ', render: item => <Chip size="small" color={item.responseStatus === 'SUBMITTED' ? 'success' : 'default'}
          label={item.responseStatus === 'SUBMITTED' ? 'Отправлен' : 'Ожидается'} /> },
        { label: 'Время отправки', render: item => item.submittedAt ? format(item.submittedAt) : '—' },
        { label: 'Доступность', render: item => item.noFreeWindow ? <Chip size="small" color="warning" label="Нет свободного времени" /> : '—' },
      ]} />
    </>}
    <Dialog open={confirm} onClose={pending ? undefined : () => setConfirm(false)}>
      <DialogTitle>Закрыть сбор занятости?</DialogTitle>
      <DialogContent>Участники больше не смогут изменять ответы. Все отправленные ответы сохранятся.</DialogContent>
      <DialogActions>
        <Button disabled={pending} onClick={() => setConfirm(false)}>Отмена</Button>
        <Button disabled={pending} variant="contained" color="warning" onClick={() => void save(true)}>Подтвердить закрытие</Button>
      </DialogActions>
    </Dialog>
  </Stack>
}
