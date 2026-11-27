import { Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Paper, Stack, TextField, Typography } from '@mui/material'
import { useCallback, useState } from 'react'
import { isMockMode } from '../api/mode'
import { DataTable, ErrorNotice, FormFields, PageHeading, useLoad, validateFields, type Field } from './components'
import { allRecords, errorMessage, listRecords, saveRecord } from './repository'
import { deleteEventType, emptyEventType, validateEventType } from './eventTypes'
import { formatLabels, granularityLabels, participantLabels, recordKey, type Schema } from './types'

export function EventTypesPage() {
  const [page, setPage] = useState(0), [search, setSearch] = useState(''), [editing, setEditing] = useState<Schema['EventTypeResponse'] | null | undefined>()
  const [deleting, setDeleting] = useState<Schema['EventTypeResponse']>(), [pending, setPending] = useState(false), [error, setError] = useState(''), [success, setSuccess] = useState('')
  const load = useCallback(async () => ({ page: await listRecords('event-types', page, search), types: await allRecords('event-types'), equipment: await allRecords('equipment') }), [page, search])
  const state = useLoad(load)
  const canWrite = isMockMode()
  return <Box><PageHeading title="Типы событий" subtitle="Шаблоны событий для сессий планирования" /><Stack gap={2.5}>
    <Stack direction="row" gap={2}><TextField label="Поиск по названию" value={search} onChange={e => { setSearch(e.target.value); setPage(0) }} sx={{ flex: 1 }} />{canWrite && <Button variant="contained" disabled={!state.data} onClick={() => setEditing(null)}>Создать тип</Button>}<Button onClick={state.reload}>Обновить</Button></Stack>
    <ErrorNotice error={state.error || error} retry={state.reload} />{success && <Alert severity="success" onClose={() => setSuccess('')}>{success}</Alert>}
    {state.loading && <CircularProgress aria-label="Загрузка типов событий" />}
    {state.data && <DataTable rows={state.data.page.items} rowKey={recordKey} page={page} count={state.data.page.totalElements} onPage={setPage} columns={[
      { label: 'Тип', render: t => t.name }, { label: 'Длительность', render: t => `${t.defaultDurationMinutes} мин` },
      { label: 'Гранулярность', render: t => granularityLabels[t.granularity] }, { label: 'Комиссия', render: t => t.commissionSize ? `${t.commissionSize} чел.${t.requiresChair ? ', включая председателя' : ''}` : 'Не нужна' },
      { label: 'Состояние', render: t => t.active ? 'Активен' : 'Скрыт' }, { label: 'Действия', render: t => <Stack direction="row"><Button onClick={() => setEditing(t)}>{canWrite ? 'Редактировать' : 'Открыть'}</Button>{canWrite && <Button color="error" onClick={() => { setError(''); setDeleting(t) }}>Удалить</Button>}</Stack> },
    ]} />}
    {!canWrite && editing && state.data && <EventTypeDetails type={editing} types={state.data.types} equipment={state.data.equipment} onClose={() => setEditing(undefined)} />}
    {canWrite && editing !== undefined && state.data && <EventTypeEditor type={editing ?? undefined} types={state.data.types} equipment={state.data.equipment} onClose={() => setEditing(undefined)} onSaved={() => { setEditing(undefined); setSuccess('Шаблон сохранён. Созданные ранее события не изменены.'); state.reload() }} />}
    <Dialog open={Boolean(deleting)} onClose={() => { if (!pending) setDeleting(undefined) }}><DialogTitle>Удалить тип «{deleting?.name}»?</DialogTitle><DialogContent><ErrorNotice error={error} />Использованный тип нельзя удалить. Его можно скрыть из выбора при редактировании.</DialogContent><DialogActions><Button disabled={pending} onClick={() => setDeleting(undefined)}>Отмена</Button><Button color="error" disabled={pending} onClick={async () => { if (!deleting) return; setPending(true); setError(''); try { await deleteEventType(deleting); setDeleting(undefined); state.reload(); setSuccess('Тип удалён.') } catch (e) { setError(errorMessage(e)) } finally { setPending(false) } }}>Удалить</Button></DialogActions></Dialog>
  </Stack></Box>
}

function EventTypeDetails({ type, types, equipment, onClose }: {
  type: Schema['EventTypeResponse']; types: Schema['EventTypeResponse'][]
  equipment: Schema['UniversityEquipmentResponse'][]; onClose: () => void
}) {
  const resources = equipment.filter(item => type.equipmentIds.includes(item.id)).map(item => item.name)
  return <Dialog open fullWidth maxWidth="sm" onClose={onClose}>
    <DialogTitle>{type.name}</DialogTitle>
    <DialogContent dividers>
      <Stack gap={1.5}>
        <Typography>{formatLabels[type.defaultFormat]} · {type.defaultDurationMinutes} мин · {granularityLabels[type.granularity]}</Typography>
        <Typography variant="body2">Участники: {type.participantRoles.map(role => participantLabels[role]).join(', ') || '—'}</Typography>
        <Typography variant="body2">Комиссия: {type.commissionSize || 'не требуется'}{type.requiresChair && ' · с председателем'}</Typography>
        <Typography variant="body2">Оборудование: {resources.join(', ') || 'не требуется'}</Typography>
        <Typography variant="body2">Дни подготовки: {type.preparationDays}</Typography>
        {type.dependencies.map(dependency => <Typography key={dependency.predecessorTypeId} variant="body2">
          После «{types.find(item => item.id === dependency.predecessorTypeId)?.name ?? 'типа №' + dependency.predecessorTypeId}»
          · минимум {dependency.minGapDays} дн.{dependency.maxGapDays != null && ` · максимум ${dependency.maxGapDays} дн.`}
        </Typography>)}
      </Stack>
    </DialogContent>
    <DialogActions><Button onClick={onClose}>Закрыть</Button></DialogActions>
  </Dialog>
}

function EventTypeEditor({ type, types, equipment, onClose, onSaved }: { type?: Schema['EventTypeResponse']; types: Schema['EventTypeResponse'][]; equipment: Schema['UniversityEquipmentResponse'][]; onClose: () => void; onSaved: () => void }) {
  const [value, setValue] = useState<Schema['CreateEventTypeRequest']>(() => structuredClone(type ?? emptyEventType))
  const [errors, setErrors] = useState<Record<string, string>>({}), [error, setError] = useState(''), [pending, setPending] = useState(false)
  const fields: Field[] = [
    { name: 'name', label: 'Название', required: true }, { name: 'defaultDurationMinutes', label: 'Длительность, минут (шаг 5)', type: 'number', min: 5, step: 5, required: true },
    { name: 'granularity', label: 'Гранулярность', type: 'select', options: Object.entries(granularityLabels).map(([value, label]) => ({ value, label })) },
    { name: 'participantRoles', label: 'Обязательные роли', required: true, type: 'multiple', options: Object.entries(participantLabels).map(([value, label]) => ({ value, label })) },
    { name: 'defaultFormat', label: 'Формат', type: 'select', options: Object.entries(formatLabels).map(([value, label]) => ({ value, label })) },
    { name: 'commissionSize', label: 'Размер комиссии, включая председателя (0 — без комиссии)', required: true, type: 'number', min: 0 }, { name: 'requiresChair', label: 'Нужен председатель', type: 'boolean' },
    { name: 'equipmentIds', label: 'Оборудование', type: 'multiple', options: equipment.map(e => ({ value: e.id, label: e.name })) },
    { name: 'preparationDays', label: 'Дни на подготовку между событиями с подготовкой', type: 'number', min: 0, required: true }, { name: 'active', label: 'Доступен для новых событий', type: 'boolean' },
  ]
  return <Dialog open fullWidth maxWidth="md" onClose={() => { if (!pending) onClose() }}><Box component="form" onSubmit={async e => {
    e.preventDefault(); const issues = { ...validateFields(fields, value), ...validateEventType(value, types, type?.id) }; setErrors(issues); if (Object.keys(issues).length) return
    setPending(true); setError(''); try { await saveRecord('event-types', { ...value, name: value.name.trim() }, type); onSaved() } catch (cause) { setError(errorMessage(cause)) } finally { setPending(false) }
  }}><DialogTitle>{type ? `Тип события · ${type.name}` : 'Новый тип события'}</DialogTitle><DialogContent><Stack gap={2.5} sx={{ pt: 1 }}><ErrorNotice error={error} /><Alert severity="info">Шаг длительности — 5 минут. Изменения шаблона действуют только на новые события.</Alert>
    <FormFields fields={fields} values={value} errors={errors} disabled={pending} onChange={(name, v) => setValue(old => ({ ...old, [name]: v }))} />
    <Typography variant="h5">Зависимости от других типов</Typography><Typography variant="body2" color="text.secondary">Сначала проходит выбранный тип, затем этот. Разрыв считается в календарных днях часового пояса сессии.</Typography>
    {errors.dependencies && <Alert severity="error">{errors.dependencies}</Alert>}
    {value.dependencies.map((d, index) => <Paper key={index} sx={{ p: 2 }}><Stack gap={2}><FormFields fields={[
      { name: 'predecessorTypeId', label: 'Предшествующий тип', type: 'select', required: true, options: types.filter(t => t.id !== type?.id).map(t => ({ value: t.id, label: t.name })) },
      { name: 'minGapDays', label: 'Минимум дней', type: 'number', min: 0, required: true }, { name: 'maxGapDays', label: 'Максимум дней (пусто — без ограничения)', type: 'number', min: 0 },
    ]} values={d} disabled={pending} onChange={(name, v) => setValue(old => ({ ...old, dependencies: old.dependencies.map((dep, i) => i === index ? { ...dep, [name]: name === 'maxGapDays' && v === '' ? null : v } : dep) }))} />
      <Button disabled={pending} color="error" onClick={() => setValue(old => ({ ...old, dependencies: old.dependencies.filter((_, i) => i !== index) }))}>Убрать зависимость</Button></Stack></Paper>)}
    <Button disabled={pending || !types.some(t => t.id !== type?.id)} sx={{ alignSelf: 'flex-start' }} onClick={() => setValue(old => ({ ...old, dependencies: [...old.dependencies, { predecessorTypeId: types.find(t => t.id !== type?.id)!.id, minGapDays: 0, maxGapDays: null }] }))}>Добавить зависимость</Button>
  </Stack></DialogContent><DialogActions><Button disabled={pending} onClick={onClose}>Отмена</Button><Button type="submit" variant="contained" disabled={pending}>{pending ? 'Сохранение…' : 'Сохранить шаблон'}</Button></DialogActions></Box></Dialog>
}
