import { Alert, Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, Stack, Typography } from '@mui/material'
import { useState } from 'react'
import { errorMessage, hasStatus } from '../api/errors'
import { publishVariant } from './repository'
import type { Variant } from './model'

export function PublishDialog({ variant, onClose, onPublished, onReload }: {
  variant: Variant
  onClose: () => void
  onPublished: (published: Variant) => void
  onReload: () => void
}) {
  const [confirmUnassigned, setUnassigned] = useState(false)
  const [confirmStaleData, setStale] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const [refreshRequired, setRefreshRequired] = useState(false)
  const unassigned = variant.metrics.unassignedEvents
  const violations = variant.metrics.hardViolations
  const canPublish = !pending && !refreshRequired && !violations &&
    (!unassigned || confirmUnassigned) && (!variant.staleData || confirmStaleData)

  async function submit() {
    if (!canPublish) return
    setPending(true)
    setError('')
    try {
      const result = await publishVariant(variant.id, { expectedVersion: variant.version, confirmUnassigned, confirmStaleData })
      onPublished(result)
    } catch (cause) {
      setError(errorMessage(cause))
      setRefreshRequired(hasStatus(cause, 409) || hasStatus(cause, 422))
    } finally {
      setPending(false)
    }
  }

  return <Dialog open fullWidth maxWidth="sm" onClose={pending ? undefined : onClose} aria-labelledby="publish-title">
    <DialogTitle id="publish-title">Опубликовать расписание</DialogTitle>
    <DialogContent dividers>
      <Stack gap={2}>
        <Typography>Участники увидят назначения из этого варианта. Предыдущая публикация сессии будет заменена.</Typography>
        <Typography variant="body2">Назначено {variant.assignments.length - unassigned} из {variant.assignments.length}</Typography>
        {!!violations && <Alert severity="error">Исправьте нарушения жёстких ограничений перед публикацией.</Alert>}
        {!!unassigned && <FormControlLabel
          control={<Checkbox checked={confirmUnassigned} disabled={pending} onChange={(_, checked) => setUnassigned(checked)} />}
          label={`Опубликовать с неназначенными событиями (${unassigned})`}
        />}
        {variant.staleData && <FormControlLabel
          control={<Checkbox checked={confirmStaleData} disabled={pending} onChange={(_, checked) => setStale(checked)} />}
          label="Опубликовать вариант на устаревших данных"
        />}
        {error && <Alert severity="error" sx={{ whiteSpace: 'pre-line' }}>{error}</Alert>}
      </Stack>
    </DialogContent>
    <DialogActions>
      <Button onClick={onClose} disabled={pending}>Отмена</Button>
      {refreshRequired && <Button onClick={onReload}>Обновить вариант</Button>}
      <Button variant="contained" disabled={!canPublish} onClick={() => void submit()}>{pending ? 'Публикуем…' : 'Подтвердить публикацию'}</Button>
    </DialogActions>
  </Dialog>
}
