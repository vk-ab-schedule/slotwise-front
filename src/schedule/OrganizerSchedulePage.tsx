import { Alert, Button, CircularProgress, MenuItem, Stack, TextField } from '@mui/material'
import { useCallback, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ErrorNotice, PageHeading, useLoad } from '../management/components'
import { CalculationPanel } from './CalculationPanel'
import { dayLabel } from './dates'
import { scheduleRepository } from './repository'
import { algorithmLabels, variantLabels, type Session } from './model'
import { VariantView } from './VariantView'
import { localDate } from '../availability/time'

const path = '/organizer/schedule'

export function OrganizerSchedulePage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const load = useCallback(() => scheduleRepository.listSessions(), [])
  const sessions = useLoad(load)
  const session = id === undefined ? sessions.data?.[0] : sessions.data?.find(session => String(session.id) === id)
  return <>
    <PageHeading title="Расписание" subtitle="Расчёт и проверка вариантов по сессиям планирования" />
    <Stack gap={2}>
      <ErrorNotice error={sessions.error} retry={sessions.reload} />
      {sessions.loading && <CircularProgress aria-label="Загрузка сессий" />}
      {sessions.data && (
        sessions.data.length === 0 ? <Alert severity="info" action={<Button component={Link} to="/organizer/sessions/new">Создать сессию</Button>}>У вас пока нет сессий планирования.</Alert> :
          <Stack direction={{ xs: 'column', sm: 'row' }} gap={1.5} alignItems={{ sm: 'center' }}>
            <TextField select label="Сессия" value={session?.id ?? ''} sx={{ minWidth: 240 }} onChange={event => navigate(`${path}/${event.target.value}`)}>
              {sessions.data.map(session => <MenuItem key={session.id} value={session.id}>{session.name}</MenuItem>)}
            </TextField>
            {session && <Button component={Link} to={`/organizer/sessions/${session.id}/rules`}>Правила сессии</Button>}
          </Stack>
      )}
      {!session && sessions.data && id !== undefined && <Alert severity="error">Сессия не найдена или недоступна.</Alert>}
      {session && <ScheduleWorkspace key={session.id} session={session} />}
    </Stack>
  </>
}

function ScheduleWorkspace({ session }: { session: Session }) {
  const loadConfig = useCallback(() => loadWorkspaceConfig(session.id), [session.id])
  const configuration = useLoad(loadConfig)
  const [selected, setSelected] = useState<number>()
  const load = useCallback(() => scheduleRepository.listVariants(session.id), [session.id])
  const variants = useLoad(load)
  const refreshVariants = variants.reload
  const selectResult = useCallback((id: number) => {
    setSelected(id)
    refreshVariants()
  }, [refreshVariants])
  const variantId = variants.data?.find(variant => variant.id === selected)?.id ?? variants.data?.[0]?.id
  const reload = () => {
    configuration.reload()
    refreshVariants()
  }
  const config = configuration.data
  const currentSession = config?.session ?? session
  return <>
    <ErrorNotice error={configuration.error && `Расчёт: ${configuration.error}`} retry={configuration.reload} />
    {configuration.loading && <CircularProgress aria-label="Загрузка параметров расчёта" />}
    {config && <CalculationPanel session={config.session} rules={config.rules} solvers={config.solvers} initialJob={config.job} onResult={selectResult} />}
    <ErrorNotice error={variants.error && `Варианты расписания: ${variants.error}`} retry={variants.reload} />
    {variants.loading && <CircularProgress aria-label="Загрузка вариантов расписания" />}
    {variants.data && (variants.data.length ? <Stack direction={{ xs: 'column', sm: 'row' }} gap={1.5}>
      <TextField select label="Вариант" value={variantId ?? ''} onChange={event => setSelected(Number(event.target.value))} sx={{ minWidth: 260 }}>
        {variants.data.map(variant => <MenuItem key={variant.id} value={variant.id}>
          №{variant.id} · {variantLabels[variant.status]} · {algorithmLabels[variant.algorithm]} · {dayLabel(localDate(variant.createdAt, currentSession.timeZone), { day: 'numeric', month: 'short' })}
        </MenuItem>)}
      </TextField>
      <Button onClick={reload}>Обновить данные</Button>
    </Stack> : <Alert severity="info" action={<Button onClick={reload}>Обновить</Button>}>У сессии ещё нет вариантов. Проверьте данные и запустите расчёт.</Alert>)}
    {variantId !== undefined && <LoadedVariant key={variantId} id={variantId} session={currentSession} />}
  </>
}

async function loadWorkspaceConfig(id: number) {
  const [config, solvers, job] = await Promise.all([scheduleRepository.getSession(id), scheduleRepository.listSolvers(), scheduleRepository.latestJob(id)])
  return { ...config, solvers, job }
}

function LoadedVariant({ id, session }: { id: number; session: Session }) {
  const load = useCallback(() => scheduleRepository.getVariant(id), [id])
  const state = useLoad(load)
  return <>
    <ErrorNotice error={state.error} retry={state.reload} />
    {state.loading && <CircularProgress aria-label="Загрузка назначений" />}
    {state.data && <VariantView variant={state.data} session={session} />}
  </>
}
