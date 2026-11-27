import { Alert, Box, Button, Checkbox, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, Stack, Typography } from '@mui/material'
import { useCallback, useState } from 'react'
import { errorMessage, hasStatus } from '../api/errors'
import { localDateTime, parseLocalDateTime } from '../availability/time'
import { ErrorNotice, FormFields, useLoad, type Field } from '../management/components'
import { allRecords } from '../management/repository'
import { getSelections } from '../management/sessions'
import { personName, type Schema } from '../management/types'
import { publicPeople } from '../management/university'
import type { Assignment, Session, Variant } from './model'
import { updateAssignment } from './repository'

async function loadResources(sessionId: number) {
  const [selection, rooms, people] = await Promise.all([getSelections(sessionId), allRecords('rooms'), publicPeople()])
  return {
    rooms: rooms.filter(room => selection.rooms.roomIds.includes(room.id)),
    candidates: selection.commission.candidates,
    people,
  }
}

export function AssignmentDialog({ variant, assignment, session, onClose, onSaved, onReload }: {
  variant: Variant; assignment: Assignment; session: Session
  onClose: () => void; onSaved: () => void; onReload: () => void
}) {
  const load = useCallback(() => loadResources(session.id), [session.id])
  const resources = useLoad(load)
  const [start, setStart] = useState(assignment.startsAt ? localDateTime(assignment.startsAt, session.timeZone) : '')
  const [room, setRoom] = useState<number | ''>(assignment.room?.id ?? '')
  const [members, setMembers] = useState(() => assignment.commissionMembers.map(member => member.accountId))
  const [chair, setChair] = useState<number | ''>(assignment.commissionMembers.find(member => member.chair)?.accountId ?? '')
  const [assigned, setAssigned] = useState(true)
  const [locked, setLocked] = useState(assignment.locked)
  const [preview, setPreview] = useState<Schema['AssignmentUpdateResponse']>()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const [stale, setStale] = useState(false)

  const personLabel = (id: number) => {
    const person = resources.data?.people.find(item => item.id === id)
    return person ? personName(person) : `Участник №${id}`
  }
  const fields: Field[] = [
    { name: 'start', label: 'Начало', type: 'datetime-local', required: true },
    { name: 'room', label: 'Ресурс', type: 'select', required: true, options: (resources.data?.rooms ?? [])
      .map(item => ({ value: item.id, label: [item.building, item.name].filter(Boolean).join(' · ') })) },
    { name: 'members', label: 'Комиссия', type: 'multiple', options: (resources.data?.candidates ?? [])
      .map(item => ({ value: item.accountId, label: personLabel(item.accountId) })) },
    { name: 'chair', label: 'Председатель', type: 'select', options: [
      { value: '', label: 'Без председателя' },
      ...(resources.data?.candidates ?? []).filter(item => item.canChair && members.includes(item.accountId))
        .map(item => ({ value: item.accountId, label: personLabel(item.accountId) })),
    ] },
  ]

  function invalidatePreview() {
    setPreview(undefined)
    setError('')
  }

  async function submit(dryRun: boolean) {
    if (pending || stale || (!dryRun && !preview)) return
    const startsAt = assigned ? parseLocalDateTime(start, session.timeZone) : null
    if (assigned && (!startsAt || room === '')) {
      setError('Укажите корректное время начала и ресурс.')
      return
    }
    const endsAt = startsAt && new Date(Date.parse(startsAt) + assignment.durationMinutes * 60_000).toISOString()
    const body: Schema['AssignmentUpdateRequest'] = {
      expectedVariantVersion: variant.version, expectedAssignmentVersion: assignment.version,
      status: assigned ? 'ASSIGNED' : 'UNASSIGNED', startsAt, endsAt, roomId: assigned && room !== '' ? room : null,
      locked: assigned && locked,
      commissionMembers: assigned ? members.map(accountId => ({ accountId, chair: chair === accountId })) : [],
    }
    setPending(true)
    invalidatePreview()
    try {
      const result = await updateAssignment(variant.id, assignment.eventId, body, dryRun)
      if (dryRun) setPreview(result)
      else onSaved()
    } catch (cause) {
      setError(errorMessage(cause))
      setStale(hasStatus(cause, 409))
    } finally {
      setPending(false)
    }
  }

  return <Dialog open fullWidth maxWidth="sm" onClose={pending ? undefined : onClose}>
    <Box component="form" onSubmit={event => { event.preventDefault(); void submit(true) }}>
      <DialogTitle>Изменить назначение</DialogTitle>
      <DialogContent dividers>
        <Stack gap={2.5}>
          <Box>
            <Typography>{assignment.title}</Typography>
            <Typography variant="body2" color="text.secondary">{assignment.durationMinutes} мин · {session.timeZone}</Typography>
          </Box>
          <ErrorNotice error={resources.error} retry={resources.reload} />
          {resources.loading && <CircularProgress size={22} aria-label="Загрузка ресурсов" />}
          {resources.data && <>
            <FormControlLabel label="Назначено" control={<Checkbox checked={assigned} disabled={pending || stale}
              onChange={(_, checked) => { setAssigned(checked); invalidatePreview() }} />} />
            {assigned && <>
              <FormFields fields={fields} values={{ start, room, members, chair }} disabled={pending || stale} onChange={(name, value) => {
                invalidatePreview()
                if (name === 'start') setStart(String(value))
                if (name === 'room') setRoom(value === '' ? '' : Number(value))
                if (name === 'chair') setChair(value === '' ? '' : Number(value))
                if (name === 'members') {
                  const ids = value as number[]
                  setMembers(ids)
                  if (chair !== '' && !ids.includes(chair)) setChair('')
                }
              }} />
              <FormControlLabel label="Зафиксировать назначение" control={<Checkbox checked={locked} disabled={pending || stale}
                onChange={(_, checked) => { setLocked(checked); invalidatePreview() }} />} />
            </>}
          </>}
          <ErrorNotice error={error} />
          {preview && <Stack gap={1}>
            <Alert severity={preview.issues.length ? 'warning' : 'success'}>
              {preview.issues.length ? 'Правка допустима. В других назначениях есть нарушения.' : 'Правка прошла проверку.'}
            </Alert>
            <Typography variant="body2">Неназначенные события: {preview.metrics.unassignedEvents}. Штраф: {preview.metrics.penalty ?? '—'}.</Typography>
            {!!preview.affectedAccountIds.length && <Typography variant="body2">Затронуты {preview.affectedAccountIds.map(personLabel).join(', ')}.</Typography>}
            {preview.issues.map((issue, index) => <Typography key={index} variant="body2">{issue.message}</Typography>)}
          </Stack>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={pending}>Отмена</Button>
        {stale && <Button onClick={onReload}>Обновить вариант</Button>}
        <Button type="submit" disabled={!resources.data || pending || stale}>Проверить правку</Button>
        <Button variant="contained" disabled={!preview || pending || stale} onClick={() => void submit(false)}>Сохранить назначение</Button>
      </DialogActions>
    </Box>
  </Dialog>
}
