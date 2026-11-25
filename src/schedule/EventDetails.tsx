import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, Typography } from '@mui/material'
import { formatInZone } from '../availability/time'
import { timeRange } from './dates'
import { personName } from '../management/types'
import { formatLabels, place, roleLabels, type Assignment, type ScheduleEvent } from './model'

export function EventDetails({ event, zone, onClose }: { event: Assignment | ScheduleEvent | null; zone: string; onClose: () => void }) {
  return <Dialog open={event !== null} onClose={onClose} fullWidth maxWidth="sm" aria-labelledby="schedule-event-title">
    {event && <>
      <DialogTitle id="schedule-event-title">{event.title}</DialogTitle>
      <DialogContent dividers>
        <Stack gap={2}>
          {'sessionName' in event && <Typography color="text.secondary">{event.sessionName}</Typography>}
          {event.startsAt && event.endsAt && <Typography>
            {formatInZone(event.startsAt, zone, { day: 'numeric', month: 'long', year: 'numeric' })}
            {' · '}{timeRange(event.startsAt, event.endsAt, zone)} ({zone})
          </Typography>}
          <Typography>{formatLabels[event.format]}{event.room && ` · ${place(event.room, event.format)}`}</Typography>
          {'changed' in event && event.changed && <Alert severity="info">Назначение изменилось относительно предыдущей публикации.</Alert>}
          {'locked' in event && event.locked && <Alert severity="info">Назначение зафиксировано.</Alert>}
          {'issues' in event && event.status === 'UNASSIGNED' && <Alert severity="warning">
            {event.issues.length ? event.issues.map((issue, index) => <Typography key={index} variant="body2">{issue.message}</Typography>) : 'Событие не назначено. Доступные данные не указывают конкретную причину.'}
          </Alert>}
          {!!event.participants.length && <Stack gap={0.5}>
            <Typography component="h3" variant="subtitle2">Участники</Typography>
            {event.participants.map(person => <Typography key={`${person.accountId}-${person.role}`} variant="body2">{personName(person)} · {roleLabels[person.role]}</Typography>)}
          </Stack>}
          {!!event.commissionMembers.length && <Stack gap={0.5}>
            <Typography component="h3" variant="subtitle2">Комиссия</Typography>
            {event.commissionMembers.map(person => <Typography key={person.accountId} variant="body2">{personName(person)}{person.chair && ' · Председатель'}</Typography>)}
          </Stack>}
        </Stack>
      </DialogContent>
      <DialogActions><Button onClick={onClose}>Закрыть</Button></DialogActions>
    </>}
  </Dialog>
}
