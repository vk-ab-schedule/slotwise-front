import { Alert, Box, Button, Chip, MenuItem, Paper, Stack, TextField, Typography } from '@mui/material'
import { useState } from 'react'
import { localDate } from '../availability/time'
import { personName } from '../management/types'
import { isScheduled } from './calendarLayout'
import { EventDetails } from './EventDetails'
import { ScheduleCalendar } from './ScheduleCalendar'
import { ScheduleMetrics } from './ScheduleMetrics'
import { algorithmLabels, variantLabels, type Assignment, type Session, type Variant } from './model'

const teachers = (assignment: Assignment) => [
  ...assignment.participants.filter(person => person.role !== 'STUDENT'),
  ...assignment.commissionMembers,
]

export function VariantView({ variant, session }: { variant: Variant; session: Session }) {
  const [room, setRoom] = useState('all')
  const [teacher, setTeacher] = useState('all')
  const [selected, setSelected] = useState<Assignment | null>(null)
  const rooms = new Map(variant.assignments.flatMap(event => event.room ? [[event.room.id, event.room.name] as const] : []))
  const people = new Map(variant.assignments.flatMap(event => teachers(event).map(person => [person.accountId, personName(person)] as const)))
  const visible = variant.assignments.filter(event =>
    (room === 'all' || event.room?.id === Number(room)) && (teacher === 'all' || teachers(event).some(person => person.accountId === Number(teacher))))
  const unassigned = variant.assignments.filter(event => event.status === 'UNASSIGNED')
  const zone = session.timeZone
  const bounds = { firstDay: localDate(session.startsAt, zone), lastDay: localDate(session.endsAt, zone) }
  for (const event of variant.assignments.filter(isScheduled)) {
    const first = localDate(event.startsAt, zone)
    const last = localDate(new Date(Date.parse(event.endsAt) - 1).toISOString(), zone)
    if (first < bounds.firstDay) bounds.firstDay = first
    if (last > bounds.lastDay) bounds.lastDay = last
  }
  return <Stack gap={2}>
    <Box>
      <Typography variant="h5" component="h2">{variant.status === 'DRAFT' ? 'Черновик расписания' : 'Вариант расписания'}</Typography>
      <Typography variant="body2" color="text.secondary">Вариант {variant.id} · входные данные v{variant.inputVersion} · {algorithmLabels[variant.algorithm]} · {session.timeZone}</Typography>
    </Box>
    {variant.staleData && <Alert severity="warning">Входные данные изменились с версии {variant.inputVersion} до {variant.currentInputVersion}. Запустите новый расчёт для актуального результата.</Alert>}
    {variant.incompleteData && <Alert severity="warning">Вариант рассчитан на неполных данных.{variant.nonRespondentIds.length > 0 && ` Без ответа: ${variant.nonRespondentIds.length}.`}</Alert>}
    <ScheduleMetrics variant={variant} />
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'minmax(0, 1fr) 255px' }, gap: 2, alignItems: 'start' }}>
      <ScheduleCalendar session={session} events={visible} bounds={bounds} onOpen={setSelected} />
      <Paper component="aside" sx={{ p: 2 }}>
        <Stack gap={1.5}>
          <Typography variant="h6" component="h3">Проверка результата</Typography>
          <Chip size="small" color={variant.status === 'PUBLISHED' ? 'success' : 'primary'} variant="outlined" label={variantLabels[variant.status]} sx={{ alignSelf: 'flex-start' }} />
          <TextField select label="Аудитория" value={room} onChange={event => setRoom(event.target.value)}>
            <MenuItem value="all">Все аудитории</MenuItem>
            {[...rooms].map(([id, name]) => <MenuItem key={id} value={String(id)}>{name}</MenuItem>)}
          </TextField>
          <TextField select label="Преподаватель" value={teacher} onChange={event => setTeacher(event.target.value)}>
            <MenuItem value="all">Все преподаватели</MenuItem>
            {[...people].map(([id, name]) => <MenuItem key={id} value={String(id)}>{name}</MenuItem>)}
          </TextField>
          <Typography variant="subtitle2" color={unassigned.length ? 'warning.main' : 'text.secondary'}>Неназначенные события: {unassigned.length}</Typography>
          {!!unassigned.length && <Stack sx={{ maxHeight: 260, overflowY: 'auto' }}>
            {unassigned.map(event => <Button key={event.eventId} onClick={() => setSelected(event)} sx={{ justifyContent: 'flex-start', textAlign: 'left' }}>{event.title}</Button>)}
          </Stack>}
        </Stack>
      </Paper>
    </Box>
    <EventDetails event={selected} zone={session.timeZone} onClose={() => setSelected(null)} />
  </Stack>
}
