import { Alert, Button, Chip, CircularProgress, Stack, Typography } from '@mui/material'
import ChevronLeft from '@mui/icons-material/ChevronLeft'
import ChevronRight from '@mui/icons-material/ChevronRight'
import { useCallback, useState } from 'react'
import { authStore } from '../auth/authStore'
import { localDate } from '../availability/time'
import { DataTable, ErrorNotice, PageHeading, useLoad } from '../management/components'
import { addDays, dateRange, dayLabel, timeRange, weekStart } from './dates'
import { demoWeek } from './demoFixtures'
import { scheduleDemo } from './demoRepository'
import { EventDetails } from './EventDetails'
import { formatLabels, place, type ScheduleEvent } from './model'

export function PersonalSchedulePage() {
  const user = authStore.user
  if (!user || (user.role !== 'STUDENT' && user.role !== 'TEACHER')) return <Alert severity="error">У вас нет доступа к этому разделу.</Alert>
  return <PersonalSchedule key={user.id} timeZone={user.timeZone} />
}

function PersonalSchedule({ timeZone }: { timeZone: string }) {
  const [week, setWeek] = useState(weekStart(demoWeek))
  const [selected, setSelected] = useState<ScheduleEvent | null>(null)
  const load = useCallback(() => {
    const range = dateRange(week, 7, timeZone)
    return scheduleDemo.personalSchedule(range.from, range.to)
  }, [week, timeZone])
  const state = useLoad(load)
  const zone = state.data?.timeZone ?? timeZone
  const events = [...(state.data?.events ?? [])].sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt))
  return <>
    <PageHeading title="Моё расписание" subtitle={`Опубликованные назначения · ${zone}`} />
    <Stack gap={2}>
      <Stack direction="row" alignItems="center" flexWrap="wrap" gap={1}>
        <Button startIcon={<ChevronLeft />} onClick={() => setWeek(day => addDays(day, -7))}>Предыдущая неделя</Button>
        <Typography variant="subtitle2" aria-live="polite">{dayLabel(week, { day: 'numeric', month: 'short' })} – {dayLabel(addDays(week, 6), { day: 'numeric', month: 'long', year: 'numeric' })}</Typography>
        <Button endIcon={<ChevronRight />} onClick={() => setWeek(day => addDays(day, 7))}>Следующая неделя</Button>
        <Button onClick={state.reload}>Обновить</Button>
      </Stack>
      <ErrorNotice error={state.error} retry={state.reload} />
      {state.loading && <CircularProgress aria-label="Загрузка расписания" />}
      {state.data && <>
        {events.some(event => event.changed) && <Alert severity="info">В расписании есть изменения. Проверьте новые время и место отмеченных событий.</Alert>}
        {events.length === 0 ? <Alert severity="info">На эту неделю нет опубликованных событий.</Alert> : <DataTable rows={events} rowKey={event => `${event.sessionId}-${event.eventId}`} columns={[
          { label: 'Дата и время', render: event => `${dayLabel(localDate(event.startsAt, zone), { day: 'numeric', month: 'long' })} · ${timeRange(event.startsAt, event.endsAt, zone)}` },
          { label: 'Событие', render: event => <Button onClick={() => setSelected(event)} sx={{ textAlign: 'left' }}>{event.title}</Button> },
          { label: 'Место', render: event => <Stack><Typography variant="body2">{place(event.room, event.format)}</Typography><Typography variant="caption" color="text.secondary">{formatLabels[event.format]}</Typography></Stack> },
          { label: 'Статус', render: event => <Chip size="small" variant="outlined" color={event.changed ? 'primary' : 'default'} label={event.changed ? 'Изменено' : 'Подтверждено'} /> },
        ]} />}
      </>}
    </Stack>
    <EventDetails event={selected} zone={zone} onClose={() => setSelected(null)} />
  </>
}
