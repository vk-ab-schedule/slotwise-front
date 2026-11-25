import { Box, Button, IconButton, Paper, Stack, ToggleButton, ToggleButtonGroup, Tooltip, Typography } from '@mui/material'
import ChevronLeft from '@mui/icons-material/ChevronLeft'
import ChevronRight from '@mui/icons-material/ChevronRight'
import { useState } from 'react'
import { localDate, localTime } from '../availability/time'
import { colors } from '../theme'
import { isScheduled, layoutDay, minutes } from './calendarLayout'
import { addDays, dayLabel, timeRange, weekStart } from './dates'
import type { Assignment, Session } from './model'

const hourHeight = 56

export function ScheduleCalendar({ session, events, bounds, onOpen }: {
  session: Session; events: Assignment[]; bounds: { firstDay: string; lastDay: string }; onOpen: (event: Assignment) => void
}) {
  const zone = session.timeZone
  const { firstDay, lastDay } = bounds
  const [focus, setFocus] = useState(firstDay)
  const [mode, setMode] = useState<'week' | 'day'>('week')
  const first = mode === 'week' ? weekStart(focus) : focus
  const last = mode === 'week' ? addDays(first, 6) : first
  const dayCount = mode === 'week' ? 7 : 1
  const scheduled = events.filter(isScheduled)
  const columns = Array.from({ length: dayCount }, (_, offset) => {
    const day = addDays(first, offset)
    return { day, points: layoutDay(scheduled, day, zone) }
  })
  const points = columns.flatMap(column => column.points)
  const workingStart = minutes(session.workingDayStart)
  const workingEnd = minutes(session.workingDayEnd)
  const hourStart = Math.floor(points.reduce((start, point) => Math.min(start, point.start), workingStart) / 60)
  const hourEnd = Math.ceil(points.reduce((end, point) => Math.max(end, point.end), workingEnd) / 60)
  const hours = Array.from({ length: hourEnd - hourStart }, (_, offset) => hourStart + offset)
  const height = hours.length * hourHeight
  const fullDay = { day: 'numeric', month: 'long', year: 'numeric' } as const
  const move = (direction: number) => {
    const next = addDays(first, direction * dayCount)
    setFocus(next < firstDay ? firstDay : next)
  }

  return <Paper sx={{ minWidth: 0, overflow: 'hidden' }}>
    <Stack direction="row" flexWrap="wrap" alignItems="center" gap={1} sx={{ p: 1.5 }}>
      <IconButton aria-label={mode === 'week' ? 'Предыдущая неделя' : 'Предыдущий день'} disabled={first <= firstDay} onClick={() => move(-1)}><ChevronLeft /></IconButton>
      <Typography variant="body2" sx={{ fontWeight: 500 }}>{first === last ? dayLabel(first, fullDay) : `${dayLabel(first, { day: 'numeric', month: 'short' })} – ${dayLabel(last, fullDay)}`}</Typography>
      <IconButton aria-label={mode === 'week' ? 'Следующая неделя' : 'Следующий день'} disabled={last >= lastDay} onClick={() => move(1)}><ChevronRight /></IconButton>
      <ToggleButtonGroup exclusive size="small" value={mode} onChange={(_, next: typeof mode | null) => { if (next) setMode(next) }} aria-label="Вид календаря" sx={{ ml: 'auto', '& .MuiToggleButton-root': { textTransform: 'none' } }}>
        <ToggleButton value="week">Неделя</ToggleButton>
        <ToggleButton value="day">День</ToggleButton>
      </ToggleButtonGroup>
    </Stack>
    {points.length === 0 && <Typography variant="body2" color="text.secondary" sx={{ px: 2, pb: 1.5 }}>В этом периоде нет назначений по выбранным фильтрам.</Typography>}
    <Box sx={{ overflowX: 'auto' }}>
      <Box sx={{ display: 'grid', gridTemplateColumns: `48px repeat(${dayCount}, minmax(${dayCount === 1 ? 0 : 84}px, 1fr))` }}>
        <Box />
        {columns.map(({ day }) => <Button key={day} disabled={day < firstDay || day > lastDay} onClick={() => { setFocus(day); setMode('day') }} sx={{ borderRadius: 0, borderLeft: 1, borderColor: 'divider', justifyContent: 'flex-start', px: 1 }} aria-label={dayLabel(day, { ...fullDay, weekday: 'long' })}>{dayLabel(day, { day: 'numeric', weekday: 'short' })}</Button>)}
        <Box sx={{ borderTop: 1, borderColor: 'divider' }}>
          {hours.map(hour => <Typography key={hour} variant="caption" color="text.secondary" component="div" sx={{ height: hourHeight, pl: 0.75 }}>{String(hour).padStart(2, '0')}:00</Typography>)}
        </Box>
        {columns.map(({ day, points }) => <Box key={day} sx={{
          height, position: 'relative', borderLeft: 1, borderTop: 1, borderColor: 'divider',
          backgroundColor: day < firstDay || day > lastDay ? 'background.default' : 'background.paper',
          backgroundImage: `repeating-linear-gradient(to bottom, transparent 0, transparent ${hourHeight - 1}px, ${colors.border} ${hourHeight - 1}px, ${colors.border} ${hourHeight}px)`,
        }}>
          {points.map(({ event, start, end, lane, lanes }) => {
            const label = `${timeRange(event.startsAt, event.endsAt, zone)} · ${event.title}`
            return <Tooltip key={event.eventId} title={label} describeChild>
              <Box component="button" type="button" aria-label={label} onClick={() => onOpen(event)} sx={{
                position: 'absolute', top: (start / 60 - hourStart) * hourHeight,
                left: `calc(${lane * 100 / lanes}% + 2px)`, width: `calc(${100 / lanes}% - 4px)`,
                height: (end - start) / 60 * hourHeight, px: 0.5, border: 0, borderRadius: 0.75, cursor: 'pointer',
                bgcolor: event.format === 'ONLINE' ? colors.greenBg : colors.light,
                color: event.format === 'ONLINE' ? colors.green : colors.blue,
                font: 'inherit', fontSize: 11, textAlign: 'left', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', zIndex: 1 },
              }}>{localDate(event.startsAt, zone) === day ? localTime(event.startsAt, zone) : '00:00'} · {event.title}</Box>
            </Tooltip>
          })}
        </Box>)}
      </Box>
    </Box>
  </Paper>
}
