import { Alert, Box, Button, Card, CardContent, Checkbox, FormControlLabel, Grid, Paper, Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography } from '@mui/material'
import { Link, useParams } from 'react-router-dom'
import { useEffect } from 'react'
import { colors } from '../theme'
import { screenById, screens, type ScreenSpec } from './catalog'
import { authStore } from '../auth/authStore'
import { isMockMode } from '../api/http'

const roleLabel = { STUDENT: 'Участник', TEACHER: 'Преподаватель', ORGANIZER: 'Организатор', ADMIN: 'Администратор' }

function ScreenActions({ actions }: { actions?: [string, string][] }) {
  if (!actions?.length) return null
  return <Stack direction="row" gap={1} flexWrap="wrap" sx={{ mt: 2 }}>
    {actions.map(([label, target], index) => <Button key={`${label}-${target}`} component={Link} to={`/screens/${target}`} variant={index === 0 ? 'contained' : 'outlined'} sx={{ minWidth: 135 }}>{label}</Button>)}
  </Stack>
}

function DataTable({ spec }: { spec: ScreenSpec }) {
  return <Paper sx={{ overflow: 'auto' }}><Table size="small"><TableHead><TableRow>{spec.columns?.map(column => <TableCell key={column}>{column}</TableCell>)}</TableRow></TableHead><TableBody>{spec.rows?.map((row, index) => <TableRow key={index} hover>{row.map((cell, cellIndex) => <TableCell key={cellIndex} sx={{ height: 57 }}>{cell}</TableCell>)}</TableRow>)}</TableBody></Table></Paper>
}

function FieldList({ spec }: { spec: ScreenSpec }) {
  return <Stack gap={2.5} sx={{ maxWidth: 600 }}>
    {spec.fields?.map(([label, value]) => label === 'Подтверждение'
      ? <FormControlLabel key={label} control={<Checkbox />} label={value} />
      : <TextField key={label} label={label} defaultValue={value} fullWidth InputProps={{ readOnly: true }} />)}
  </Stack>
}

function Metrics({ spec }: { spec: ScreenSpec }) {
  if (!spec.stats?.length) return null
  return <Grid container spacing={1.5} sx={{ mb: 2 }}>
    {spec.stats.map(([label, value]) => <Grid key={label} size={{ xs: 6, sm: 3 }}><Paper sx={{ p: 2 }}><Typography color="text.secondary" variant="body2">{label}</Typography><Typography variant="h5" sx={{ mt: 0.5 }}>{value}</Typography></Paper></Grid>)}
  </Grid>
}

const calendarBlocks = [
  { day: 0, start: 60, length: 120, title: 'Учебная пара', note: 'Критическая', color: '#e4e9f1', ink: '#526176' },
  { day: 1, start: 180, length: 120, title: 'Личные дела', note: 'Критическая', color: colors.redBg, ink: colors.red },
  { day: 2, start: 60, length: 120, title: 'Нежелательно', note: 'Средний', color: colors.amberBg, ink: colors.amber },
  { day: 3, start: 300, length: 60, title: 'Предпочтение', note: 'Низкий', color: colors.light, ink: colors.blue },
  { day: 4, start: 120, length: 120, title: 'Пара · из вуза', note: 'Не редактируется', color: '#e4e9f1', ink: '#526176' },
]

export function CalendarPreview({ organizer = false }: { organizer?: boolean }) {
  const blocks = organizer ? [
    { day: 0, start: 0, length: 90, title: '09:00 · Защита', note: 'А. Смирнов · ауд. 2426', color: colors.light, ink: colors.blue },
    { day: 1, start: 120, length: 90, title: '11:00 · Защита', note: 'М. Иванова · ауд. 2426', color: colors.light, ink: colors.blue },
    { day: 2, start: 240, length: 90, title: '13:00 · Предзащита', note: 'Группа P3410 · ауд. 2407', color: colors.greenBg, ink: colors.green },
    { day: 4, start: 60, length: 90, title: '10:00 · Защита', note: 'Зафиксировано', color: colors.amberBg, ink: colors.amber },
  ] : calendarBlocks
  return <Paper sx={{ p: 2, minWidth: 560 }}>
    <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1.5 }}><Typography fontWeight={500}>‹ 15–19 июня 2026 ›</Typography><Typography variant="body2" color="primary">Неделя / День</Typography></Stack>
    <Box sx={{ display: 'grid', gridTemplateColumns: '42px repeat(5, 1fr)', mb: 0.5 }}><span />{['15, Пн', '16, Вт', '17, Ср', '18, Чт', '19, Пт'].map(day => <Typography key={day} variant="body2" sx={{ px: 0.5 }}>{day}</Typography>)}</Box>
    <Box sx={{ display: 'flex', height: 360 }}>
      <Box sx={{ width: 42, flexShrink: 0, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>{['9:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00'].map(time => <Typography key={time} sx={{ fontSize: 10, color: colors.muted }}>{time}</Typography>)}</Box>
      <Box sx={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', position: 'relative', backgroundImage: `linear-gradient(to bottom, ${colors.border} 1px, transparent 1px)`, backgroundSize: '100% 45px' }}>
        {Array.from({ length: 5 }, (_, day) => <Box key={day} sx={{ borderLeft: `1px solid ${colors.border}`, position: 'relative' }}>
          {blocks.filter(block => block.day === day).map(block => <Box key={block.title} sx={{ position: 'absolute', top: block.start / 2, height: block.length / 2, left: 3, right: 3, p: 0.75, bgcolor: block.color, color: block.ink, borderRadius: 0.5, fontSize: 11, overflow: 'hidden' }}><strong>{block.title}</strong><br />{block.note}</Box>)}
        </Box>)}
      </Box>
    </Box>
  </Paper>
}

function CalendarScreen({ spec }: { spec: ScreenSpec }) {
  return <Box sx={{ display: 'flex', gap: 2, flexDirection: { xs: 'column', lg: 'row' } }}><Box sx={{ flex: 1, minWidth: 0, overflowX: 'auto' }}><CalendarPreview organizer={spec.role === 'ORGANIZER'} /></Box><Paper sx={{ width: { lg: 290 }, p: 2, flexShrink: 0 }}><Typography fontWeight={500} sx={{ mb: 2 }}>{spec.id === '3:105' ? 'Новый интервал' : spec.role === 'ORGANIZER' ? 'Детали варианта' : 'Ваш ответ'}</Typography>{spec.fields ? <FieldList spec={spec} /> : <><Typography variant="body2" sx={{ mb: 2 }}>Критический — время нельзя использовать.</Typography><Typography variant="body2" sx={{ mb: 2 }}>Средний — использовать нежелательно.</Typography><Typography variant="body2">Низкий — пожелание к расписанию.</Typography></>}<ScreenActions actions={spec.actions} /></Paper></Box>
}

function StatusScreen({ spec }: { spec: ScreenSpec }) {
  return <Paper sx={{ p: 3, maxWidth: 800 }}><Typography variant="h5" sx={{ mb: 1 }}>{spec.title}</Typography><Typography color="text.secondary">{spec.notice}</Typography>{spec.fields && <Box sx={{ mt: 2 }}><FieldList spec={spec} /></Box>}<ScreenActions actions={spec.actions} /></Paper>
}

export function MockupPage({ screenId }: { screenId?: string }) {
  const params = useParams()
  const id = screenId ?? params.id ?? ''
  const spec = screenById[id]
  useEffect(() => {
    if (spec && isMockMode() && authStore.user?.role !== spec.role) authStore.selectDemoRole(spec.role)
  }, [spec])
  if (!spec) return <StatusScreen spec={{ id, title: 'Экран не найден', role: 'STUDENT', kind: 'status', subtitle: '', actions: [['К списку экранов', '3:3']] }} />
  return <Box>
    <Typography variant="h4">{spec.title}</Typography>
    <Typography color="text.secondary" variant="body2" sx={{ mb: 2.5 }}>{spec.subtitle}</Typography>
    {spec.notice && spec.kind !== 'status' && <Alert severity={spec.tone ?? 'info'} icon={false} sx={{ mb: 2, bgcolor: spec.tone === 'warning' ? colors.amberBg : spec.tone === 'error' ? colors.redBg : spec.tone === 'success' ? colors.greenBg : colors.light }}><Typography fontWeight={500} variant="body2">{spec.notice}</Typography></Alert>}
    <Metrics spec={spec} />
    {spec.kind === 'calendar' ? <CalendarScreen spec={spec} /> : spec.kind === 'status' ? <StatusScreen spec={spec} /> : spec.kind === 'table' || spec.kind === 'detail' ? <><DataTable spec={spec} />{spec.fields && <Box sx={{ mt: 2 }}><FieldList spec={spec} /></Box>}<ScreenActions actions={spec.actions} /></> : spec.kind === 'form' ? <><FieldList spec={spec} /><ScreenActions actions={spec.actions} /></> : <><Stack direction={{ xs: 'column', sm: 'row' }} gap={2}><Card sx={{ flex: 1 }}><CardContent><Typography variant="h5">Сравнение вариантов</Typography><Typography color="text.secondary" sx={{ mt: 2 }}>Метрики и назначения в рабочем варианте</Typography></CardContent></Card><Card sx={{ flex: 1 }}><CardContent><Typography variant="h5">Сценарий</Typography><Typography color="text.secondary" sx={{ mt: 2 }}>Изменения на копии данных</Typography></CardContent></Card></Stack><ScreenActions actions={spec.actions} /></>}
    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 4 }}>Макет Figma {spec.id} · демонстрационные данные</Typography>
  </Box>
}

export function ScreenIndex() {
  return <Box><Typography variant="h4">Экраны SlotWise</Typography><Typography color="text.secondary" variant="body2" sx={{ mb: 3 }}>Все 42 экранных состояния из макета. Переходы доступны по карточкам и действиям.</Typography>
    {(['STUDENT', 'ORGANIZER', 'ADMIN'] as const).map(role => <Box key={role} sx={{ mb: 4 }}><Typography variant="h5" sx={{ mb: 1.5 }}>{roleLabel[role]}</Typography><Grid container spacing={1.5}>{screens.filter(screen => role === 'STUDENT' ? screen.role === 'STUDENT' || screen.role === 'TEACHER' : screen.role === role).map(screen => <Grid key={screen.id} size={{ xs: 12, sm: 6, lg: 4 }}><Paper component={Link} to={`/screens/${screen.id}`} sx={{ display: 'block', p: 2, height: '100%', '&:hover': { borderColor: colors.blue } }}><Typography fontWeight={500}>{screen.title}</Typography><Typography variant="caption" color="text.secondary">{screen.id} · {screen.kind}</Typography></Paper></Grid>)}</Grid></Box>)}
  </Box>
}
