import { Accordion, AccordionDetails, AccordionSummary, Box, Paper, Stack, Typography } from '@mui/material'
import ExpandMore from '@mui/icons-material/ExpandMore'
import { DataTable } from '../management/components'
import { qualityLabels, type Variant } from './model'

const number = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 })
const percent = new Intl.NumberFormat('ru-RU', { style: 'percent', maximumFractionDigits: 2 })
const penalty = (value: number | null) => value === null ? 'Нет данных' : number.format(value)
const softConstraints = { S1: 'Окна преподавателей', S2: 'Разброс нагрузки комиссии', S3: 'Нежелательное время', S4: 'Переходы между аудиториями', S5: 'Переносы событий' }

export function ScheduleMetrics({ variant }: { variant: Variant }) {
  const metrics = variant.metrics
  const assigned = variant.assignments.filter(event => event.status === 'ASSIGNED').length
  const cards = [
    ['Назначено', `${assigned} / ${variant.assignments.length}`],
    ['Окна преподавателей', `${number.format(metrics.gapsHours * 60)} мин`],
    ['Разброс нагрузки комиссии', `${number.format(metrics.commissionLoadRangeHours * 60)} мин`],
    ['События в нежелательное время', number.format(metrics.undesirableEvents)],
  ]
  return <Stack gap={1.5} component="section" aria-label="Метрики расписания">
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', md: 'repeat(4, minmax(0, 1fr))' }, gap: 1.5 }}>
      {cards.map(([label, value]) => <Paper key={label} sx={{ p: 2 }}>
        <Typography variant="h5" color="primary.main">{value}</Typography>
        <Typography variant="body2" color="text.secondary">{label}</Typography>
      </Paper>)}
    </Box>
    <Accordion disableGutters elevation={0} sx={{ '&::before': { display: 'none' } }}>
      <AccordionSummary expandIcon={<ExpandMore />} aria-controls="schedule-metrics-details" id="schedule-metrics-heading">
        <Typography>Качество решения · {qualityLabels[metrics.solveStatus]}</Typography>
      </AccordionSummary>
      <AccordionDetails>
        <Stack gap={1.5}>
          <Typography variant="body2">Неназначено (U): {number.format(metrics.unassignedEvents)} · Мягкий штраф (P): {penalty(metrics.penalty)} · Жёсткие нарушения: {number.format(metrics.hardViolations)}</Typography>
          <Typography variant="body2">Нижняя граница P: {penalty(metrics.bestBound)} · Разрыв при текущем U: {metrics.gap === null ? 'Нет данных' : percent.format(metrics.gap)}</Typography>
          <Typography variant="body2">Переходы между аудиториями: {number.format(metrics.teacherRoomChanges)} · Отклонение нагрузки комиссии: {number.format(metrics.commissionLoadStandardDeviationHours * 60)} мин · Время расчёта: {number.format(metrics.runtimeMillis / 1000)} с</Typography>
          {!!metrics.scoreComponents.length && <DataTable rows={metrics.scoreComponents} rowKey={row => row.constraint} columns={[
            { label: 'Ограничение', render: row => `${row.constraint} · ${softConstraints[row.constraint]}` },
            { label: 'Значение', render: row => number.format(row.rawPenalty) },
            { label: 'Вес', render: row => number.format(row.weight) },
            { label: 'Вклад в P', render: row => number.format(row.weightedPenalty) },
          ]} />}
        </Stack>
      </AccordionDetails>
    </Accordion>
  </Stack>
}
