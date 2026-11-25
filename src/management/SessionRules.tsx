import { Alert, Button, CircularProgress, Paper, Stack, Typography } from '@mui/material'
import { useCallback, useState } from 'react'
import { DataTable, ErrorNotice, FormFields, useLoad } from './components'
import { errorMessage } from './repository'
import { getRules, saveRules, validateRules, weightLabels } from './rules'
import type { Schema } from './types'

const hardRules = [
  ['H1', 'Каждое событие назначено не более одного раза; неназначенные события допускаются'], ['H2', 'Участник не бывает в двух событиях одновременно; между очными событиями в разных аудиториях нужен буфер'],
  ['H3', 'Нет двойного бронирования физических аудиторий и пересечений с их учебными парами'], ['H4', 'Нет пересечений с учебными парами участников и критической занятостью (с исключением для студентов в групповых событиях)'],
  ['H5', 'Аудитория подходит по вместимости, оборудованию и формату'], ['H6', 'Комиссия — нужное число людей из пула, с возможным председателем, без обязательных и исключённых участников'],
  ['H7', 'Соблюдаются зависимости событий и минимальные / максимальные разрывы между датами'], ['H8', 'Событие целиком внутри периода, рабочих дней и рабочих часов'], ['H9', 'Зафиксированные назначения сохраняются'], ['H10', 'Соблюдаются дни на подготовку между событиями студентов'],
]
export function SessionRules({ session }: { session: Schema['PlanningSessionResponse'] }) {
  const load = useCallback(() => getRules(session.id), [session.id])
  const state = useLoad(load)
  return <Stack gap={2.5}><ErrorNotice error={state.error} retry={state.reload} />{state.loading && <CircularProgress aria-label="Загрузка правил" />}{state.data && <RulesEditor key={`${session.id}-${state.data.sessionVersion}`} id={session.id} initial={state.data} reload={state.reload} />}</Stack>
}
function RulesEditor({ id, initial, reload }: { id: number; initial: Schema['SessionRulesResponse']; reload: () => void }) {
  const [value, setValue] = useState(initial), [errors, setErrors] = useState<Record<string, string>>({}), [pending, setPending] = useState(false), [error, setError] = useState(''), [success, setSuccess] = useState('')
  return <Stack gap={2.5}><Typography variant="h5">Жёсткие ограничения</Typography>
    <DataTable rows={hardRules} rowKey={r => r[0]} columns={[{ label: 'Код', render: r => r[0] }, { label: 'Ограничение (всегда включено)', render: r => r[1] }]} />
    <Alert severity="info">Сначала минимизируется число неназначенных событий, затем — штраф мягких ограничений. Нулевой вес отключает мягкое предпочтение. Критическая личная занятость студента в групповом событии — мягкое ограничение с высоким коэффициентом; учебные пары остаются жёсткими.</Alert>
    <Paper component="form" sx={{ p: 3 }} onSubmit={async e => {
      e.preventDefault(); const issues = validateRules(value); setErrors(issues); if (Object.keys(issues).length) return
      setPending(true); setError(''); setSuccess(''); try { setValue(await saveRules(id, value)); setSuccess('Правила сохранены. Для нового результата запустите расчёт с обновлёнными правилами.') } catch (cause) { setError(errorMessage(cause)) } finally { setPending(false) }
    }}><Stack gap={2.5}><Typography variant="h5">Мягкие ограничения и параметры расчёта</Typography><ErrorNotice error={error} />{success && <Alert severity="success">{success}</Alert>}
      <FormFields fields={Object.entries(weightLabels).map(([name, label]) => ({ name, label, type: 'number', required: true, min: 0, max: 2147483647, hint: name === 'movedEvents' ? 'Применяется при перестроении относительно исходного варианта; после MVP.' : 'Чем больше вес, тем сильнее предпочтение.' }))} values={value.weights} errors={errors} disabled={pending} onChange={(name, v) => { setValue(old => ({ ...old, weights: { ...old.weights, [name]: v } })); setSuccess('') }} />
      <FormFields fields={[
        { name: 'roomChangeBufferMinutes', label: 'Буфер перехода между аудиториями, минут', type: 'number', required: true, min: 0, step: 5 },
        { name: 'defaultAlgorithm', label: 'Алгоритм по умолчанию', type: 'select', options: [{ value: 'GREEDY', label: 'Greedy — базовый' }, { value: 'CP_SAT', label: 'CP-SAT' }, ...(value.defaultAlgorithm === 'TIMEFOLD' ? [{ value: 'TIMEFOLD', label: 'Timefold (после MVP)' }] : [])] },
        { name: 'timeLimitSeconds', label: 'Лимит времени, секунд', type: 'number', min: 1, max: 300, required: true }, { name: 'seed', label: 'Seed для воспроизводимости', type: 'number', required: true },
      ]} values={value} errors={errors} disabled={pending} onChange={(name, v) => { setValue(old => ({ ...old, [name]: v })); setSuccess('') }} />
      <Typography variant="body2" color="text.secondary">Шаг сетки: {value.slotMinutes} минут, задаётся сервером.</Typography>
      <Stack direction="row" gap={2}><Button type="submit" variant="contained" disabled={pending}>{pending ? 'Сохранение…' : 'Сохранить правила'}</Button><Button disabled={pending} onClick={reload}>Перезагрузить правила</Button></Stack>
    </Stack></Paper>
  </Stack>
}
