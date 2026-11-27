import { Accordion, AccordionDetails, AccordionSummary, Alert, Button, LinearProgress, MenuItem, Paper, Stack, TextField, Typography } from '@mui/material'
import ExpandMore from '@mui/icons-material/ExpandMore'
import { useEffect, useState } from 'react'
import { isMockMode } from '../api/mode'
import { ErrorNotice } from '../management/components'
import { errorMessage } from '../management/repository'
import type { Schema } from '../management/types'
import { scheduleRepository } from './repository'
import { algorithmLabels, isActiveJob, qualityLabels, type Session, type SolverJob } from './model'
import { pollJob } from './pollJob'

type Props = {
  session: Session
  rules: Schema['SessionRulesResponse']
  solvers: Schema['SolverDescriptorResponse'][]
  initialJob: SolverJob | null
  onResult: (id: number) => void
}

const statusLabels = {
  QUEUED: 'Расчёт в очереди',
  RUNNING: 'Расчёт выполняется',
  COMPLETED: 'Расчёт завершён',
  FAILED: 'Ошибка расчёта',
  CANCELLED: 'Расчёт отменён',
}

export function CalculationPanel({ session, rules, solvers, initialJob, onResult }: Props) {
  const [job, setJob] = useState(initialJob)
  const [pollError, setPollError] = useState('')
  const [actionError, setActionError] = useState('')
  const [pending, setPending] = useState<'check' | 'start' | null>(null)
  const [check, setCheck] = useState<Schema['PrecheckResponse'] | null>(null)
  const [algorithm, setAlgorithm] = useState<Schema['SolverAlgorithm'] | ''>(
    solvers.find(solver => solver.available && solver.algorithm === rules.defaultAlgorithm)?.algorithm ??
      solvers.find(solver => solver.available)?.algorithm ?? '',
  )
  const [limit, setLimit] = useState(String(rules.timeLimitSeconds))
  const [seed, setSeed] = useState(String(rules.seed))
  const [expanded, setExpanded] = useState(false)
  const activeId = job && isActiveJob(job) ? job.id : null

  useEffect(() => {
    if (activeId === null || pollError) return
    return pollJob(
      () => scheduleRepository.getJob(activeId),
      next => {
        setJob(next)
        if (next.resultId !== null && next.status === 'COMPLETED') onResult(next.resultId)
      },
      error => setPollError(errorMessage(error)),
    )
  }, [activeId, pollError, onResult])

  const limitNumber = Number(limit)
  const seedNumber = Number(seed)
  const validLimit = limit.trim() !== '' && Number.isInteger(limitNumber) && limitNumber >= 1 && limitNumber <= 300
  const validSeed = seed.trim() !== '' && Number.isSafeInteger(seedNumber)
  const busy = pending !== null || activeId !== null
  const checkedInputVersion = check && !check.issues.some(issue => issue.code === 'NO_EVENTS') ? check.inputVersion : null

  async function runCheck() {
    setPending('check')
    setActionError('')
    setCheck(null)
    try {
      setCheck(await scheduleRepository.precheck(session.id, session.inputVersion))
    } catch (error) {
      setActionError(errorMessage(error))
    } finally {
      setPending(null)
    }
  }

  async function launch() {
    if (busy || !algorithm || !validLimit || !validSeed || checkedInputVersion === null) return
    setPending('start')
    setActionError('')
    try {
      const next = await scheduleRepository.startJob(session.id, {
        algorithm, timeLimitSeconds: limitNumber, seed: seedNumber, expectedInputVersion: checkedInputVersion,
      })
      setJob(next)
      setPollError('')
      setCheck(null)
      setExpanded(false)
      if (next.status === 'COMPLETED' && next.resultId !== null) onResult(next.resultId)
    } catch (error) {
      setActionError(errorMessage(error))
    } finally {
      setPending(null)
    }
  }

  return <Stack gap={1.5}>
    {job && <JobStatus job={job} pollError={pollError} retry={() => setPollError('')} openResult={onResult} />}
    <Accordion expanded={expanded} onChange={(_, next) => setExpanded(next)} disableGutters elevation={0} sx={{ '&::before': { display: 'none' } }}>
      <AccordionSummary expandIcon={<ExpandMore />} id="schedule-calculate-heading" aria-controls="schedule-calculate-form">
        <Typography component="span" variant="subtitle1">Запуск расчёта</Typography>
      </AccordionSummary>
      <AccordionDetails>
        <Stack gap={2} component="form" onSubmit={event => { event.preventDefault(); void launch() }}>
          {isMockMode() && <Typography variant="body2" color="text.secondary">Демо-расчёт имитирует очередь, прогресс и создание черновика. Правила и список событий берутся из текущей сессии.</Typography>}
          <Stack direction={{ xs: 'column', sm: 'row' }} gap={2}>
            <TextField select label="Алгоритм" value={algorithm} onChange={event => setAlgorithm(event.target.value as typeof algorithm)} disabled={busy} sx={{ minWidth: 140 }}>
              {solvers.map(solver => <MenuItem key={solver.algorithm} value={solver.algorithm} disabled={!solver.available}>{solver.name}</MenuItem>)}
            </TextField>
            <TextField label="Лимит, секунд" type="number" value={limit} onChange={event => setLimit(event.target.value)} error={!validLimit} helperText={!validLimit ? 'Целое число от 1 до 300' : undefined} disabled={busy} slotProps={{ htmlInput: { min: 1, max: 300, step: 1 } }} />
            <TextField label="Seed" type="number" value={seed} onChange={event => setSeed(event.target.value)} error={!validSeed} helperText={!validSeed ? 'Введите целое число' : undefined} disabled={busy} />
          </Stack>
          <ErrorNotice error={actionError} />
          {check && <Alert severity={check.issues.length || check.incompleteData ? 'warning' : 'success'}>
            <Typography variant="subtitle2">{check.issues.length ? `Замечаний предпроверки: ${check.issues.length}` : 'Предпроверка завершена без замечаний'}</Typography>
            {check.incompleteData && <Typography variant="body2">Сбор занятости ещё не закрыт. Черновик будет помечен как рассчитанный на неполных данных.</Typography>}
            {check.issues.map((issue, index) => <Typography variant="body2" key={index}>{issue.message}</Typography>)}
          </Alert>}
          <Stack direction="row" gap={1} flexWrap="wrap">
            <Button variant="outlined" disabled={busy} onClick={() => void runCheck()}>{pending === 'check' ? 'Проверяем…' : 'Проверить данные'}</Button>
            <Button type="submit" variant="contained" disabled={busy || checkedInputVersion === null || !algorithm || !validLimit || !validSeed}>
              {pending === 'start' ? 'Запускаем…' : check && (check.issues.length || check.incompleteData) ? 'Запустить с предупреждениями' : 'Запустить расчёт'}
            </Button>
          </Stack>
        </Stack>
      </AccordionDetails>
    </Accordion>
  </Stack>
}

function JobStatus({ job, pollError, retry, openResult }: { job: SolverJob; pollError: string; retry: () => void; openResult: (id: number) => void }) {
  const progress = job.progress === null ? null : Math.round(job.progress * 100)
  const started = job.startedAt ? Date.parse(job.startedAt) : null
  const elapsed = started === null ? null : Math.max(0, Math.floor((Date.parse(job.finishedAt ?? new Date().toISOString()) - started) / 1000))
  const resultId = job.status === 'COMPLETED' ? job.resultId : null

  return <Paper component="section" aria-label="Статус расчёта" sx={{ p: 2 }}>
    <Stack gap={1}>
      <Typography variant="h6" component="h2" role="status">{statusLabels[job.status]}</Typography>
      <Typography variant="body2" color="text.secondary">{algorithmLabels[job.algorithm]} · входные данные v{job.inputVersion} · лимит {job.parameters.timeLimitSeconds} с{elapsed !== null && ` · прошло ${elapsed} с`}</Typography>
      {job.status === 'QUEUED' && <Typography variant="body2">{job.queuePosition === null ? 'Ожидаем свободный исполнитель.' : `Позиция в очереди: ${job.queuePosition}`}</Typography>}
      {job.status === 'RUNNING' && <LinearProgress aria-label="Прогресс расчёта" variant={progress === null ? 'indeterminate' : 'determinate'} value={progress ?? undefined} />}
      {job.quality && <Typography variant="body2">Неназначено (U): {job.quality.unassignedEvents} · Мягкий штраф (P): {job.quality.penalty}{job.quality.bestBound !== null && ` · Нижняя граница P: ${job.quality.bestBound}`}</Typography>}
      <ErrorNotice error={pollError && `Не удалось обновить статус: ${pollError}`} retry={retry} />
      {job.status === 'FAILED' && <Alert severity="error">{job.error?.message ?? 'Расчёт завершился технической ошибкой.'} Проверьте данные и повторите запуск.</Alert>}
      {job.status === 'CANCELLED' && <Alert severity="warning">Можно запустить новый расчёт.</Alert>}
      {job.status === 'COMPLETED' && job.solveStatus === 'NO_SOLUTION' && <Alert severity="warning">За отведённое время решение не найдено. Попробуйте увеличить лимит или выбрать другой алгоритм.</Alert>}
      {resultId !== null && <Alert severity={job.solveStatus === 'OPTIMAL' ? 'success' : 'info'} action={<Button color="inherit" onClick={() => openResult(resultId)}>Открыть черновик</Button>}>
        Черновик №{resultId} готов. {job.solveStatus && qualityLabels[job.solveStatus]}.
      </Alert>}
    </Stack>
  </Paper>
}
