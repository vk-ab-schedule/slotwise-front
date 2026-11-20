import { Alert, Box, Button, Chip, CircularProgress, Paper, Stack, Tab, Tabs, TextField, Typography } from '@mui/material'
import { useCallback, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { DataTable, ErrorNotice, FormFields, PageHeading, useLoad, validateFields } from './components'
import { allRecords, errorMessage, saveRecord } from './repository'
import { getSession, sessionDefaults, sessionFields, sessionPayload, validateSession } from './sessions'
import { recordKey, type Schema } from './types'

const collectionLabels = { PENDING: 'Сбор ещё не открыт', OPEN: 'Сбор открыт', CLOSED: 'Сбор закрыт' }
const period = (s: Schema['PlanningSessionResponse']) => `${new Date(s.startsAt).toLocaleDateString('ru', { timeZone: s.timeZone })} — ${new Date(s.endsAt).toLocaleDateString('ru', { timeZone: s.timeZone })}`
export function SessionsPage() {
  const [search, setSearch] = useState(''), [page, setPage] = useState(0)
  const load = useCallback(() => allRecords('sessions'), [])
  const state = useLoad(load)
  const filtered = state.data?.filter(s => s.name.toLocaleLowerCase().includes(search.toLocaleLowerCase())) ?? []
  return <Box><PageHeading title="Сессии планирования" subtitle="Ваши сессии · параметры, участники, ресурсы, события и правила" /><Stack gap={2.5}>
    <Stack direction="row" gap={2}><TextField label="Поиск сессий" value={search} onChange={e => { setSearch(e.target.value); setPage(0) }} sx={{ flex: 1 }} /><Button component={Link} to="/organizer/sessions/new" variant="contained">Новая сессия</Button><Button onClick={state.reload}>Обновить</Button></Stack>
    <ErrorNotice error={state.error} retry={state.reload} />{state.loading && <CircularProgress aria-label="Загрузка сессий" />}
    {state.data && <DataTable rows={filtered.slice(page * 20, (page + 1) * 20)} rowKey={recordKey} count={filtered.length} page={page} onPage={setPage} columns={[
      { label: 'Название', render: s => <Button component={Link} to={`/organizer/sessions/${s.id}`}>{s.name}</Button> }, { label: 'Период', render: period }, { label: 'Часовой пояс', render: s => s.timeZone }, { label: 'Сбор занятости', render: s => <Chip size="small" label={collectionLabels[s.collectionStatus]} color={s.collectionStatus === 'OPEN' ? 'primary' : 'default'} /> },
    ]} />}
  </Stack></Box>
}

export function SessionEditor({ session, onSaved }: { session?: Schema['PlanningSessionResponse']; onSaved?: () => void }) {
  const navigate = useNavigate()
  const [values, setValues] = useState(() => sessionDefaults(session)), [errors, setErrors] = useState<Record<string, string>>({})
  const [error, setError] = useState(''), [pending, setPending] = useState(false), [success, setSuccess] = useState('')
  return <Box component="form" sx={{ maxWidth: 900 }} onSubmit={async e => {
    e.preventDefault(); const issues = { ...validateFields(sessionFields, values), ...validateSession(values) }; setErrors(issues); if (Object.keys(issues).length) return
    setPending(true); setError(''); setSuccess('')
    try { const saved = await saveRecord('sessions', sessionPayload(values), session); if (session) { setSuccess('Параметры сохранены.'); onSaved?.() } else navigate(`/organizer/sessions/${saved.id}/resources`) } catch (cause) { setError(errorMessage(cause)) } finally { setPending(false) }
  }}><Stack gap={2.5}><ErrorNotice error={error} />{success && <Alert severity="success">{success}</Alert>}
    <FormFields fields={sessionFields} values={values} errors={errors} disabled={pending} onChange={(name, value) => { setValues(v => ({ ...v, [name]: value })); setSuccess('') }} />
    <Alert severity="info" icon={false}>Сбор должен закончиться до первого дня периода проведения. Укажите дни и часы в выбранном часовом поясе.</Alert>
    <Stack direction="row" gap={1.5}><Button type="submit" variant="contained" disabled={pending}>{pending ? 'Сохранение…' : session ? 'Сохранить параметры' : 'Создать и продолжить'}</Button><Button component={Link} to="/organizer/sessions" disabled={pending}>К списку сессий</Button></Stack>
  </Stack></Box>
}

export function NewSessionPage() { return <Box><PageHeading title="Новая сессия" subtitle="1. Параметры → 2. Участники и ресурсы → 3. События" /><SessionEditor /></Box> }

export function SessionDetailPage({ tab, children }: { tab: string; children?: (session: Schema['PlanningSessionResponse'], reload: () => void) => ReactNode }) {
  const { id } = useParams(), sessionId = Number(id)
  const load = useCallback(() => Number.isSafeInteger(sessionId) && sessionId > 0 ? getSession(sessionId) : Promise.reject(new Error('Некорректный идентификатор сессии.')), [sessionId])
  const state = useLoad(load)
  return <Box><PageHeading title={state.data?.name ?? 'Сессия планирования'} subtitle={state.data ? `${period(state.data)} · ${state.data.timeZone} · ${collectionLabels[state.data.collectionStatus]}` : 'Подготовка сессии'} />
    <Tabs value={tab} variant="scrollable" scrollButtons="auto" sx={{ mb: 3 }} aria-label="Разделы сессии">{[['parameters', 'Параметры', ''], ['resources', 'Участники и ресурсы', '/resources'], ['events', 'События', '/events'], ['rules', 'Правила', '/rules']].map(([key, label, path]) => <Tab key={key} value={key} label={label} component={Link} to={`/organizer/sessions/${id}${path}`} />)}</Tabs>
    <ErrorNotice error={state.error} retry={state.reload} />{state.loading && <CircularProgress aria-label="Загрузка сессии" />}
    {state.data && (children ? children(state.data, state.reload) : <SessionEditor key={`${state.data.id}-${state.data.version}`} session={state.data} onSaved={state.reload} />)}
    <Paper sx={{ p: 2, mt: 3 }}><Typography color="text.secondary" variant="body2">Каждое изменение входных данных обновляет версию сессии. Существующие результаты расчёта могут устареть.</Typography></Paper>
  </Box>
}
