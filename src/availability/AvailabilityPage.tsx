import { Alert, Box, Button, CircularProgress, FormControl, InputLabel, MenuItem, Paper, Select, Stack, TextField, Typography } from '@mui/material'
import { observer } from 'mobx-react-lite'
import { useEffect, useState, type FormEvent } from 'react'
import { isMockMode } from '../api/http'
import { colors } from '../theme'
import { availabilityStore } from './availabilityStore'
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

function WeeklyCalendar({ items, week, dayMode, selectedDay, onSelectDay, onEdit }: { items: CalendarItem[]; week: string; dayMode: boolean; selectedDay: string; onSelectDay: (day: string) => void; onEdit: (interval: BusyInterval) => void }) {
  const days = dayMode ? [selectedDay] : Array.from({ length: 5 }, (_, index) => shiftDate(week, index))
  return <Box sx={{ minWidth: dayMode ? 360 : 560 }}>
    <Box sx={{ display: 'grid', gridTemplateColumns: `42px repeat(${days.length}, minmax(0, 1fr))`, mb: 0.5 }}><span />{days.map(day => <Button key={day} size="small" onClick={() => onSelectDay(day)} sx={{ color: colors.ink, justifyContent: 'flex-start', px: 0.5 }}>{formatInZone(`${day}T12:00:00Z`, 'UTC', { day: 'numeric', weekday: 'short' })}</Button>)}</Box>
    <Box sx={{ display: 'flex', height: 450 }}>
      <Box sx={{ width: 42, flexShrink: 0, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>{Array.from({ length: 10 }, (_, index) => <Typography key={index} sx={{ fontSize: 10, color: colors.muted }}>{9 + index}:00</Typography>)}</Box>
      <Box sx={{ flex: 1, display: 'grid', gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))`, backgroundImage: `linear-gradient(to bottom, ${colors.border} 1px, transparent 1px)`, backgroundSize: '100% 50px' }}>
        {days.map(day => <Box key={day} sx={{ position: 'relative', borderLeft: `1px solid ${colors.border}` }}>
          {items.filter(item => item.date === day).map(item => {
            const top = Math.max(0, (minutes(item.start) - 540) / 540 * 450)
            const height = Math.max(20, (minutes(item.end) - minutes(item.start)) / 540 * 450)
            const [background, ink] = item.known ? ['#e4e9f1', '#526176'] : importanceColors[item.importance]
            return <Box key={item.key} component={item.known ? 'div' : 'button'} type={item.known ? undefined : 'button'} onClick={item.interval ? () => onEdit(item.interval!) : undefined} title={item.known ? 'Учебная занятость не редактируется' : `Изменить: ${item.label}`} sx={{ position: 'absolute', top, height, left: 3, right: 3, zIndex: item.known ? 1 : 2, p: 0.75, border: 0, borderRadius: 0.5, bgcolor: background, color: ink, textAlign: 'left', fontSize: 11, overflow: 'hidden', cursor: item.known ? 'default' : 'pointer', '&:focus-visible': { outline: `2px solid ${colors.blue}` } }}><strong>{item.label}</strong><br />{item.known ? 'Из учебного расписания' : importanceLabels[item.importance]}<br />{item.start}–{item.end}</Box>
          })}
        </Box>)}
      </Box>
    </Box>
  </Box>
}

export const AvailabilityPage = observer(function AvailabilityPage() {
  const store = availabilityStore
  const calendar = store.calendar
  const [week, setWeek] = useState(() => mondayOf(isMockMode() ? '2026-06-15' : new Date().toISOString().slice(0, 10)))
  const [dayMode, setDayMode] = useState(false)
  const [selectedDay, setSelectedDay] = useState(isMockMode() ? '2026-06-15' : new Date().toISOString().slice(0, 10))
  const [editing, setEditing] = useState<BusyInterval | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [date, setDate] = useState('2026-06-16')
  const [start, setStart] = useState('12:00')
  const [end, setEnd] = useState('14:00')
  const [importance, setImportance] = useState<Importance>('CRITICAL')
  const [formError, setFormError] = useState('')

  useEffect(() => { void store.load() }, [store])

  function openForm(interval?: BusyInterval) {
    store.clearMessages()
    setFormError('')
    setEditing(interval ?? null)
    setDate(interval ? localDate(interval.startsAt, calendar!.timeZone) : selectedDay)
    setStart(interval ? localTime(interval.startsAt, calendar!.timeZone) : '12:00')
    setEnd(interval ? localTime(interval.endsAt, calendar!.timeZone) : '14:00')
    setImportance(interval?.importance ?? 'CRITICAL')
    setFormOpen(true)
  }

  async function save(event: FormEvent) {
    event.preventDefault()
    if (!calendar) return
    if (minutes(end) <= minutes(start)) { setFormError('Конец интервала должен быть позже начала.'); return }
    if (isMockMode() && (date < '2026-06-15' || date > '2026-06-26')) { setFormError('Выберите дату в периоде с 15 по 26 июня 2026.'); return }
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

  if (store.loading && !calendar) return <Stack direction="row" gap={2} alignItems="center"><CircularProgress size={22} />Загружаем занятость…</Stack>
  if (!calendar) return <Alert severity="error" action={<Button onClick={() => void store.load()}>Повторить</Button>}>{store.error || 'Не удалось загрузить календарь.'}</Alert>

  const items: CalendarItem[] = [
    ...calendar.knownBusy.map((interval, index) => ({ key: `known-${index}`, date: localDate(interval.startsAt, calendar.timeZone), start: localTime(interval.startsAt, calendar.timeZone), end: localTime(interval.endsAt, calendar.timeZone), label: interval.description ?? 'Учебная занятость', importance: 'CRITICAL' as const, known: true })),
    ...calendar.intervals.map(interval => ({ key: `personal-${interval.id}`, date: localDate(interval.startsAt, calendar.timeZone), start: localTime(interval.startsAt, calendar.timeZone), end: localTime(interval.endsAt, calendar.timeZone), label: 'Личная занятость', importance: interval.importance, known: false, interval })),
  ]
  const noFreeTime = calendar.intervals.filter(interval => interval.importance === 'CRITICAL').reduce((total, interval) => total + (new Date(interval.endsAt).getTime() - new Date(interval.startsAt).getTime()), 0) >= 10 * 9 * 60 * 60 * 1000
  return <Box>
    <Typography variant="h4">Моя занятость</Typography>
    <Typography color="text.secondary" variant="body2" sx={{ mb: 2.5 }}>Защиты ВКР · P3410 / 15–26 июня 2026 / {calendar.timeZone}</Typography>
    <Alert severity={calendar.editable ? 'info' : 'warning'} icon={false} sx={{ mb: 2, bgcolor: calendar.editable ? colors.light : colors.amberBg }}><strong>{calendar.editable ? 'Сбор открыт до 10 июня, 18:00' : 'Сбор занятости закрыт'}</strong><br />Отметьте занятое время. Все остальные интервалы внутри рабочих часов считаются доступными.</Alert>
    {!calendar.timetableAvailable && <Alert severity="warning" sx={{ mb: 2 }}>Учебное расписание не загружено. Добавьте пары вручную как критические интервалы.</Alert>}
    {noFreeTime && <Alert severity="warning" sx={{ mb: 2 }}>Все рабочие интервалы критически заняты. Назначить события может быть невозможно.</Alert>}
    {store.error && <Alert severity="error" action={<Button onClick={() => void store.load()}>Обновить</Button>} sx={{ mb: 2 }}>{store.error}</Alert>}
    {store.success && <Alert severity="success" sx={{ mb: 2 }}>{store.success}</Alert>}
    <Stack direction={{ xs: 'column', lg: 'row' }} gap={2}>
      <Paper sx={{ p: 2, flex: 1, minWidth: 0, overflowX: 'auto' }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={1} sx={{ mb: 2 }}><Stack direction="row" alignItems="center"><Button onClick={() => { const value = shiftDate(week, -7); setWeek(value); setSelectedDay(value) }} aria-label="Предыдущая неделя">‹</Button><Typography fontWeight={500}>{formatInZone(`${week}T12:00:00Z`, 'UTC', { day: 'numeric', month: 'long' })} – {formatInZone(`${shiftDate(week, 4)}T12:00:00Z`, 'UTC', { day: 'numeric', month: 'long', year: 'numeric' })}</Typography><Button onClick={() => { const value = shiftDate(week, 7); setWeek(value); setSelectedDay(value) }} aria-label="Следующая неделя">›</Button></Stack><Stack direction="row"><Button onClick={() => setDayMode(false)} disabled={!dayMode}>Неделя</Button><Button onClick={() => setDayMode(true)} disabled={dayMode}>День</Button></Stack></Stack>
        <WeeklyCalendar items={items} week={week} dayMode={dayMode} selectedDay={selectedDay} onSelectDay={day => { setSelectedDay(day); setDayMode(true) }} onEdit={openForm} />
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
