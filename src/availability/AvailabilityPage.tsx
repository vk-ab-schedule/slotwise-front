import { Alert, Box, Button, CircularProgress, FormControl, InputLabel, MenuItem, Paper, Select, Stack, TextField, Typography } from '@mui/material'
import { observer } from 'mobx-react-lite'
import { useEffect, useState, type FormEvent } from 'react'
import { isMockMode } from '../api/mode'
import type { components } from '../api/schema'
import { authStore } from '../auth/authStore'
import { ErrorNotice, useLoad } from '../management/components'
import { colors } from '../theme'
import { AvailabilityStore } from './availabilityStore'
import { listParticipantSessions } from './repository'
import { formatInZone, localDate, localTime, zonedDateTimeToIso } from './time'
import type { BusyInterval, Importance, IntervalInput } from './types'

const importanceLabels: Record<Importance, string> = { CRITICAL: 'Критический', MEDIUM: 'Средний', LOW: 'Низкий' }
const importanceColors: Record<Importance, [string, string]> = { CRITICAL: [colors.redBg, colors.red], MEDIUM: [colors.amberBg, colors.amber], LOW: [colors.light, colors.blue] }

function mondayOf(date: string) {
  const value = new Date(`${date}T00:00:00Z`)
  value.setUTCDate(value.getUTCDate() - (value.getUTCDay() + 6) % 7)
  return value.toISOString().slice(0, 10)
}
function shiftDate(date: string, days: number) {
  const value = new Date(`${date}T00:00:00Z`)
  value.setUTCDate(value.getUTCDate() + days)
  return value.toISOString().slice(0, 10)
}
function minutes(time: string) { const [hours, mins] = time.split(':').map(Number); return hours * 60 + mins }

interface CalendarItem { key: string; date: string; start: string; end: string; label: string; importance: Importance; known: boolean; interval?: BusyInterval }
type CalendarSession = Pick<components['schemas']['PlanningSessionResponse'],
  'id' | 'name' | 'startsAt' | 'endsAt' | 'timeZone' | 'workingDays' | 'workingDayStart' | 'workingDayEnd' | 'collectionEndsAt'>

const weekDays = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'] as const

function isWorkingDay(date: string, workingDays: CalendarSession['workingDays']) {
  const index = (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7
  return workingDays.includes(weekDays[index])
}

const demoSession: CalendarSession = {
  id: 1, name: 'Защиты ВКР · P3410', timeZone: 'Europe/Moscow',
  startsAt: '2026-06-14T21:00:00Z', endsAt: '2026-06-26T15:00:00Z',
  workingDays: [...weekDays.slice(0, 5)], workingDayStart: '09:00', workingDayEnd: '18:00',
  collectionEndsAt: '2026-06-10T15:00:00Z',
}

function WeeklyCalendar({ items, days, workingDayStart, workingDayEnd, onSelectDay, onEdit }: {
  items: CalendarItem[]; days: string[]; workingDayStart: string; workingDayEnd: string
  onSelectDay: (day: string) => void; onEdit: (interval: BusyInterval) => void
}) {
  const start = minutes(workingDayStart)
  const end = minutes(workingDayEnd)
  const hours = [start, ...Array.from({ length: Math.ceil(end / 60) - Math.floor(start / 60) - 1 },
    (_, index) => (Math.floor(start / 60) + index + 1) * 60), end]
  const position = (time: number) => (time - start) / (end - start) * 100
  return <Box sx={{ minWidth: days.length === 1 ? 360 : 560 }}>
    <Box sx={{ display: 'grid', gridTemplateColumns: `42px repeat(${days.length}, minmax(0, 1fr))`, mb: 0.5 }}><span />{days.map(day => <Button key={day} size="small" onClick={() => onSelectDay(day)} sx={{ color: colors.ink, justifyContent: 'flex-start', px: 0.5 }}>{formatInZone(`${day}T12:00:00Z`, 'UTC', { day: 'numeric', weekday: 'short' })}</Button>)}</Box>
    <Box sx={{ display: 'flex', height: 450 }}>
      <Box sx={{ width: 42, flexShrink: 0, position: 'relative' }}>{hours.map(time => <Typography key={time} sx={{ position: 'absolute', top: `${position(time)}%`, fontSize: 10, color: colors.muted }}>{Math.floor(time / 60)}:{String(time % 60).padStart(2, '0')}</Typography>)}</Box>
      <Box sx={{ flex: 1, display: 'grid', gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))`, position: 'relative' }}>
        {hours.map(time => <Box key={time} sx={{ position: 'absolute', top: `${position(time)}%`, width: '100%', borderTop: `1px solid ${colors.border}` }} />)}
        {days.map(day => <Box key={day} sx={{ position: 'relative', overflow: 'hidden', borderLeft: `1px solid ${colors.border}` }}>
          {items.filter(item => item.date === day).map(item => {
            const itemStart = Math.max(start, minutes(item.start))
            const itemEnd = Math.min(end, minutes(item.end))
            if (itemStart >= itemEnd) return null
            const top = `${position(itemStart)}%`
            const height = `${position(itemEnd) - position(itemStart)}%`
            const [background, ink] = item.known ? ['#e4e9f1', '#526176'] : importanceColors[item.importance]
            return <Box key={item.key} component={item.known ? 'div' : 'button'} type={item.known ? undefined : 'button'} onClick={item.interval ? () => onEdit(item.interval!) : undefined} title={item.known ? 'Учебная занятость не редактируется' : `Изменить: ${item.label}`} sx={{ position: 'absolute', top, height, left: 3, right: 3, zIndex: item.known ? 1 : 2, p: 0.75, border: 0, borderRadius: 0.5, bgcolor: background, color: ink, textAlign: 'left', fontSize: 11, overflow: 'hidden', cursor: item.known ? 'default' : 'pointer', '&:focus-visible': { outline: `2px solid ${colors.blue}` } }}><strong>{item.label}</strong><br />{item.known ? 'Из учебного расписания' : importanceLabels[item.importance]}<br />{item.start}–{item.end}</Box>
          })}
        </Box>)}
      </Box>
    </Box>
  </Box>
}

export const AvailabilityPage = observer(function AvailabilityPage() {
  const user = authStore.user
  if (!user || (user.role !== 'STUDENT' && user.role !== 'TEACHER')) {
    return <Alert severity="error">У вас нет доступа к этому разделу.</Alert>
  }
  return <Box>
    <Typography variant="h4">Моя занятость</Typography>
    {isMockMode() ? <AvailabilityCalendar session={demoSession} /> : <AvailabilitySessions key={user.id} />}
  </Box>
})

function AvailabilitySessions() {
  const sessions = useLoad(listParticipantSessions)
  const [selectedId, setSelectedId] = useState<number>()
  const session = sessions.data?.find(item => item.id === selectedId) ?? sessions.data?.[0]
  if (!session) return <Stack gap={2}>
    <ErrorNotice error={sessions.error} retry={sessions.reload} />
    {sessions.loading && <CircularProgress aria-label="Загрузка сессий" size={22} />}
    {sessions.data?.length === 0 && <Alert severity="info">У вас пока нет сессий планирования.</Alert>}
  </Stack>
  return <>
    <TextField select label="Сессия" value={session.id} onChange={event => setSelectedId(Number(event.target.value))} sx={{ my: 2, minWidth: 240 }}>
      {sessions.data?.map(item => <MenuItem key={item.id} value={item.id}>{item.name}</MenuItem>)}
    </TextField>
    <AvailabilityCalendar key={session.id} session={session} />
  </>
}

const AvailabilityCalendar = observer(function AvailabilityCalendar({ session }: { session: CalendarSession }) {
  const [store] = useState(() => new AvailabilityStore(session.id))
  const calendar = store.calendar
  const firstDay = localDate(session.startsAt, session.timeZone)
  const lastDay = localDate(session.endsAt, session.timeZone)
  const firstWorkingDay = Array.from({ length: 7 }, (_, index) => shiftDate(firstDay, index))
    .find(day => isWorkingDay(day, session.workingDays)) ?? firstDay
  const lastWorkingDay = Array.from({ length: 7 }, (_, index) => shiftDate(lastDay, -index))
    .find(day => isWorkingDay(day, session.workingDays)) ?? lastDay
  const [week, setWeek] = useState(() => mondayOf(firstWorkingDay))
  const [dayMode, setDayMode] = useState(false)
  const [selectedDay, setSelectedDay] = useState(firstWorkingDay)
  const [editing, setEditing] = useState<BusyInterval | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [date, setDate] = useState('2026-06-16')
  const [start, setStart] = useState('12:00')
  const [end, setEnd] = useState('14:00')
  const [importance, setImportance] = useState<Importance>('CRITICAL')
  const [formError, setFormError] = useState('')
  const days = weekDays.map((_, index) => shiftDate(week, index))
    .filter(day => day >= firstDay && day <= lastDay && isWorkingDay(day, session.workingDays))
  const activeDay = days.includes(selectedDay) ? selectedDay : days[0] ?? firstWorkingDay

  useEffect(() => { void store.load() }, [store])

  function openForm(interval?: BusyInterval) {
    if (!calendar?.editable || store.saving) return
    store.clearMessages()
    setFormError('')
    setEditing(interval ?? null)
    setDate(interval ? localDate(interval.startsAt, calendar.timeZone) : activeDay)
    setStart(interval ? localTime(interval.startsAt, calendar.timeZone) : session.workingDayStart.slice(0, 5))
    setEnd(interval ? localTime(interval.endsAt, calendar.timeZone) : session.workingDayEnd.slice(0, 5))
    setImportance(interval?.importance ?? 'CRITICAL')
    setFormOpen(true)
  }

  async function save(event: FormEvent) {
    event.preventDefault()
    if (!calendar) return
    if (minutes(end) <= minutes(start)) { setFormError('Конец интервала должен быть позже начала.'); return }
    if (date < firstDay || date > lastDay) { setFormError('Выберите дату в периоде сессии.'); return }
    if (!isWorkingDay(date, session.workingDays)) { setFormError('Выберите рабочий день сессии.'); return }
    const proposed: IntervalInput = { startsAt: zonedDateTimeToIso(date, start, calendar.timeZone), endsAt: zonedDateTimeToIso(date, end, calendar.timeZone), importance }
    const intervals = calendar.intervals.filter(interval => interval.id !== editing?.id).map(interval => ({ startsAt: interval.startsAt, endsAt: interval.endsAt, importance: interval.importance }))
    const didSave = await store.save([...intervals, proposed])
    if (didSave) { setFormOpen(false); setEditing(null); setSelectedDay(date); setWeek(mondayOf(date)) }
  }

  async function remove() {
    if (!calendar || !editing) return
    const didSave = await store.save(calendar.intervals.filter(interval => interval.id !== editing.id).map(interval => ({ startsAt: interval.startsAt, endsAt: interval.endsAt, importance: interval.importance })))
    if (didSave) { setFormOpen(false); setEditing(null) }
  }

  if (!calendar) return store.error
    ? <ErrorNotice error={store.error} retry={() => void store.load()} />
    : <Stack direction="row" gap={2} alignItems="center"><CircularProgress size={22} />Загружаем занятость…</Stack>

  const items: CalendarItem[] = [
    ...calendar.knownBusy.flatMap((interval, index) => {
      const first = localDate(interval.startsAt, calendar.timeZone)
      const last = localDate(interval.endsAt, calendar.timeZone)
      return days.filter(day => day >= first && day <= last).map(day => ({
        key: `known-${index}-${day}`, date: day,
        start: day === first ? localTime(interval.startsAt, calendar.timeZone) : '00:00',
        end: day === last ? localTime(interval.endsAt, calendar.timeZone) : '24:00',
        label: interval.description ?? 'Учебная занятость', importance: 'CRITICAL' as const, known: true,
      }))
    }),
    ...calendar.intervals.map(interval => ({ key: `personal-${interval.id}`, date: localDate(interval.startsAt, calendar.timeZone), start: localTime(interval.startsAt, calendar.timeZone), end: localTime(interval.endsAt, calendar.timeZone), label: 'Личная занятость', importance: interval.importance, known: false, interval })),
  ]
  const noFreeTime = isMockMode()
    ? calendar.intervals.filter(interval => interval.importance === 'CRITICAL').reduce((total, interval) => total + (Date.parse(interval.endsAt) - Date.parse(interval.startsAt)), 0) >= 10 * 9 * 60 * 60 * 1000
    : calendar.issues.some(issue => issue.code === 'NO_FREE_TIME')
  const dateLabel = (value: string) => formatInZone(value, calendar.timeZone, { day: 'numeric', month: 'long', year: 'numeric' })
  const deadline = formatInZone(session.collectionEndsAt, calendar.timeZone, { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })
  const firstVisibleDay = days[0] ?? week
  const lastVisibleDay = days.at(-1) ?? firstVisibleDay
  const weekEndLabel = formatInZone(`${lastVisibleDay}T12:00:00Z`, 'UTC', { day: 'numeric', month: 'long', year: 'numeric' })
  const visibleRange = firstVisibleDay === lastVisibleDay ? weekEndLabel
    : `${formatInZone(`${firstVisibleDay}T12:00:00Z`, 'UTC', { day: 'numeric', month: 'long' })} – ${weekEndLabel}`
  return <Box>
    <Typography color="text.secondary" variant="body2" sx={{ mb: 2.5 }}>{session.name} / {dateLabel(session.startsAt)} – {dateLabel(session.endsAt)} / {calendar.timeZone}</Typography>
    <Alert severity={calendar.editable ? 'info' : 'warning'} icon={false} sx={{ mb: 2, bgcolor: calendar.editable ? colors.light : colors.amberBg }}><strong>{calendar.editable ? `Сбор открыт до ${deadline}` : 'Редактирование занятости недоступно'}</strong><br />Отметьте занятое время. Все остальные интервалы внутри рабочих часов считаются доступными.</Alert>
    {!calendar.timetableAvailable && <Alert severity="warning" sx={{ mb: 2 }}>Учебное расписание не загружено. Добавьте пары вручную как критические интервалы.</Alert>}
    {noFreeTime && <Alert severity="warning" sx={{ mb: 2 }}>Все рабочие интервалы критически заняты. Назначить события может быть невозможно.</Alert>}
    {store.error && <Alert severity="error" action={<Button onClick={() => void store.load()}>Обновить</Button>} sx={{ mb: 2 }}>{store.error}</Alert>}
    {store.success && <Alert severity="success" sx={{ mb: 2 }}>{store.success}</Alert>}
    <Stack direction={{ xs: 'column', lg: 'row' }} gap={2}>
      <Paper sx={{ p: 2, flex: 1, minWidth: 0, overflowX: 'auto' }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={1} sx={{ mb: 2 }}>
          <Stack direction="row" alignItems="center">
            <Button disabled={week <= mondayOf(firstWorkingDay)} onClick={() => setWeek(shiftDate(week, -7))} aria-label="Предыдущая неделя">‹</Button>
            <Typography fontWeight={500}>{visibleRange}</Typography>
            <Button disabled={week >= mondayOf(lastWorkingDay)} onClick={() => setWeek(shiftDate(week, 7))} aria-label="Следующая неделя">›</Button>
          </Stack>
          <Stack direction="row"><Button onClick={() => setDayMode(false)} disabled={!dayMode}>Неделя</Button><Button onClick={() => setDayMode(true)} disabled={dayMode}>День</Button></Stack>
        </Stack>
        <WeeklyCalendar items={items} days={dayMode ? [activeDay] : days} workingDayStart={session.workingDayStart} workingDayEnd={session.workingDayEnd} onSelectDay={day => { setSelectedDay(day); setDayMode(true) }} onEdit={openForm} />
      </Paper>
      <Paper sx={{ p: 2, width: { lg: 290 }, flexShrink: 0 }}>
        <Typography fontWeight={500} sx={{ mb: 1.5 }}>{formOpen ? editing ? 'Изменить интервал' : 'Новый интервал' : 'Ваш ответ'}</Typography>
        {formOpen ? <Stack component="form" onSubmit={event => void save(event)} gap={2}>
          <TextField label="Дата" type="date" value={date} onChange={event => setDate(event.target.value)} slotProps={{ inputLabel: { shrink: true } }} required />
          <TextField label="Начало" type="time" value={start} onChange={event => setStart(event.target.value)} slotProps={{ inputLabel: { shrink: true } }} required />
          <TextField label="Конец" type="time" value={end} onChange={event => setEnd(event.target.value)} slotProps={{ inputLabel: { shrink: true } }} required />
          <FormControl size="small"><InputLabel id="importance-label">Важность</InputLabel><Select labelId="importance-label" label="Важность" value={importance} onChange={event => setImportance(event.target.value as Importance)}>{(Object.keys(importanceLabels) as Importance[]).map(value => <MenuItem key={value} value={value}>{importanceLabels[value]}</MenuItem>)}</Select></FormControl>
          {formError && <Alert severity="error">{formError}</Alert>}
          <Button variant="contained" type="submit" disabled={store.saving}>Сохранить</Button>
          {editing && <Button color="error" onClick={() => void remove()} disabled={store.saving}>Удалить интервал</Button>}
          <Button onClick={() => setFormOpen(false)}>Отмена</Button>
        </Stack> : <Stack gap={1.5}>
          <Typography variant="body2" sx={{ color: calendar.responseStatus === 'SUBMITTED' ? colors.green : colors.amber }}>{calendar.responseStatus === 'SUBMITTED' ? 'Отправлено' : 'Не отправлено'}</Typography>
          <Typography variant="body2">Критический — время нельзя использовать.</Typography>
          <Typography variant="body2">Средний — использовать нежелательно.</Typography>
          <Typography variant="body2">Низкий — пожелание к расписанию.</Typography>
          <Button onClick={() => openForm()} disabled={!calendar.editable || store.saving}>Добавить интервал</Button>
          <Button variant="contained" onClick={() => void store.submit()} disabled={!calendar.editable || store.saving}>{store.saving ? 'Сохраняем…' : calendar.responseStatus === 'SUBMITTED' ? 'Отправить повторно' : 'Отправить занятость'}</Button>
          <Typography variant="caption" color="text.secondary">Нет ограничений? Можно отправить пустой календарь.</Typography>
        </Stack>}
      </Paper>
    </Stack>
  </Box>
})
