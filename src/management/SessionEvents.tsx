import { Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Paper, Stack, Typography } from '@mui/material'
import { useCallback, useState } from 'react'
import { Link } from 'react-router-dom'
import { allRecords, errorMessage } from './repository'
import { createEvents, listEvents, uniqueEventParticipants, updateEvent, validateEvent } from './events'
import { DataTable, ErrorNotice, FormFields, useLoad, validateFields, type Field, type FormValues } from './components'
import { getSelections, getSession } from './sessions'
import { peopleOptions, publicPeople } from './university'
import { formatLabels, recordKey, type Schema } from './types'

export function SessionEvents({ session }: { session: Schema['PlanningSessionResponse'] }) {
  const load = useCallback(async () => {
    const [current, events, types, groups, people, equipment, selection, disciplines] = await Promise.all([getSession(session.id), listEvents(session.id), allRecords('event-types'), allRecords('groups'), publicPeople(true), allRecords('equipment'), getSelections(session.id), allRecords('disciplines')])
    return { current, events, types, groups, people, equipment, selection, disciplines }
  }, [session.id])
  const state = useLoad(load)
  return <Stack gap={2.5}><ErrorNotice error={state.error} retry={state.reload} />{state.loading && <CircularProgress aria-label="Загрузка событий" />}{state.data && <EventsEditor key={`${session.id}-${state.data.current.version}`} data={state.data} reload={state.reload} />}</Stack>
}
type EventData = { current: Schema['PlanningSessionResponse']; events: Schema['EventResponse'][]; types: Schema['EventTypeResponse'][]; groups: Schema['UniversityGroupResponse'][]; people: Schema['PersonSummary'][]; equipment: Schema['UniversityEquipmentResponse'][]; selection: Awaited<ReturnType<typeof getSelections>>; disciplines: Schema['UniversityDisciplineResponse'][] }
function EventsEditor({ data, reload }: { data: EventData; reload: () => void }) {
  const [values, setValues] = useState<FormValues>({ eventTypeId: '', studyGroupIds: [], studentIds: [], disciplineId: '' })
  const [events, setEvents] = useState(data.events), [version, setVersion] = useState(data.current.version)
  const [pending, setPending] = useState(false), [error, setError] = useState(''), [messages, setMessages] = useState<string[]>([]), [editing, setEditing] = useState<Schema['EventResponse']>()
  const selectedType = data.types.find(t => t.id === values.eventTypeId)
  const selected = data.selection.participants
  const fields: Field[] = [
    { name: 'eventTypeId', label: 'Тип события', type: 'select', required: true, options: data.types.filter(t => t.active).map(t => ({ value: t.id, label: t.name })) },
    { name: 'studyGroupIds', label: 'Группы сессии', type: 'multiple', options: data.groups.filter(g => selected.studyGroupIds.includes(g.id)).map(g => ({ value: g.id, label: g.name })) },
    ...(selectedType?.granularity !== 'PER_GROUP' ? [{ name: 'studentIds', label: 'Отдельные студенты сессии', type: 'multiple' as const, options: peopleOptions(selected.participants.filter(p => p.role === 'STUDENT')) }] : []),
    ...(selectedType?.participantRoles.includes('DISCIPLINE_TEACHER') ? [{ name: 'disciplineId', label: 'Дисциплина', type: 'select' as const, required: true, options: data.disciplines.filter(d => d.active).map(d => ({ value: d.id, label: d.name })) }] : []),
  ]
  return <Stack gap={2.5}><Paper component="form" sx={{ p: 3 }} onSubmit={async e => {
    e.preventDefault(); setError(''); const issues = validateFields(fields, values)
    if (Object.keys(issues).length || !(values.studyGroupIds as number[]).length && !(values.studentIds as number[]).length || selectedType?.granularity === 'PER_GROUP' && !(values.studyGroupIds as number[]).length) { setError('Выберите тип, группы или студентов и при необходимости дисциплину.'); return }
    setPending(true); setMessages([])
    try { const result = await createEvents(data.current.id, { eventTypeId: Number(values.eventTypeId), studyGroupIds: values.studyGroupIds as number[], studentIds: selectedType?.granularity === 'PER_GROUP' ? [] : values.studentIds as number[], ...(selectedType?.participantRoles.includes('DISCIPLINE_TEACHER') ? { disciplineId: Number(values.disciplineId) } : {}), expectedVersion: version }); setVersion(result.sessionVersion); setEvents(await listEvents(data.current.id)); setMessages([`Создано событий: ${result.events.length}`, ...result.issues.map(i => i.message)]) } catch (cause) { setError(errorMessage(cause)) } finally { setPending(false) }
  }}><Stack gap={2.5}><Typography variant="h5">Создать события по шаблону</Typography><Alert severity="info">Выберите участников и ресурсы до создания событий. Значения шаблона копируются в каждое событие; зависимости связывают события общих студентов.</Alert>
    <FormFields fields={fields} values={values} disabled={pending} onChange={(name, value) => setValues(v => ({ ...v, [name]: value }))} /><ErrorNotice error={error} />
    <Button type="submit" variant="contained" disabled={pending} sx={{ alignSelf: 'flex-start' }}>Создать события</Button>{messages.map((message, i) => <Alert key={i} severity={i ? 'warning' : 'success'}>{message}</Alert>)}
  </Stack></Paper>
    <DataTable rows={events} rowKey={recordKey} columns={[{ label: 'Событие', render: e => e.title }, { label: 'Длительность', render: e => `${e.durationMinutes} мин` }, { label: 'Формат', render: e => formatLabels[e.format] }, { label: 'Готовность', render: e => e.complete ? 'Готово' : 'Неполное — не участвует в расчёте' }, { label: 'Действия', render: e => <Button onClick={() => setEditing(e)}>Редактировать</Button> }]} />
    {editing && <EventEditor event={editing} data={{ ...data, events }} onClose={() => setEditing(undefined)} onSaved={reload} />}
    <Button component={Link} to={`/organizer/sessions/${data.current.id}/rules`} sx={{ alignSelf: 'flex-start' }}>К правилам сессии</Button>
  </Stack>
}
function EventEditor({ event, data, onClose, onSaved }: { event: Schema['EventResponse']; data: EventData; onClose: () => void; onSaved: () => void }) {
  const [value, setValue] = useState<Schema['UpdateEventRequest']>({ title: event.title, durationMinutes: event.durationMinutes, format: event.format, description: event.description, commissionSize: event.commissionSize, requiresChair: event.requiresChair, preparationDays: event.preparationDays, equipmentIds: event.equipmentIds, dependencies: structuredClone(event.dependencies), participants: uniqueEventParticipants(event.participants), expectedVersion: event.version })
  const [pending, setPending] = useState(false), [error, setError] = useState('')
  const fields: Field[] = [{ name: 'title', label: 'Название', required: true }, { name: 'durationMinutes', label: 'Длительность, минут', type: 'number', min: 5, step: 5, required: true }, { name: 'format', label: 'Формат', type: 'select', options: Object.entries(formatLabels).map(([value, label]) => ({ value, label })) }, { name: 'commissionSize', label: 'Размер комиссии', type: 'number', min: 0, required: true }, { name: 'requiresChair', label: 'Нужен председатель', type: 'boolean' }, { name: 'preparationDays', label: 'Дни подготовки', type: 'number', min: 0, required: true }, { name: 'equipmentIds', label: 'Оборудование', type: 'multiple', options: data.equipment.map(e => ({ value: e.id, label: e.name })) }, { name: 'description', label: 'Описание' }]
  return <Dialog open fullWidth maxWidth="md" onClose={() => { if (!pending) onClose() }}><Box component="form" onSubmit={async e => {
    e.preventDefault(); setError(''); const message = validateEvent(value, event, data.events)
    if (message || Object.keys(validateFields(fields, value)).length) { setError(message || 'Заполните обязательные поля.'); return }
    setPending(true); try { await updateEvent(event, value); onSaved() } catch (cause) { setError(errorMessage(cause)) } finally { setPending(false) }
  }}><DialogTitle>Редактировать событие</DialogTitle><DialogContent><Stack gap={2.5} sx={{ pt: 1 }}><ErrorNotice error={error} /><FormFields fields={fields} values={value} disabled={pending} onChange={(name, v) => setValue(old => ({ ...old, [name]: v }))} />
    {(['STUDENT', 'DISCIPLINE_TEACHER', 'SUPERVISOR'] as const).map(role => {
      const label = role === 'STUDENT' ? 'Студенты' : role === 'SUPERVISOR' ? 'Научные руководители' : 'Преподаватели дисциплины'
      const selected = value.participants.filter(p => p.role === role)
      const otherRoles = new Set(value.participants.filter(p => p.role !== role).map(p => p.accountId))
      const options = data.people.filter(person =>
        person.role === (role === 'STUDENT' ? 'STUDENT' : 'TEACHER') && !otherRoles.has(person.id),
      )
      return <FormFields key={role} fields={[{ name: role, label, type: 'multiple', options: peopleOptions(options) }]}
        values={{ [role]: selected.map(p => p.accountId) }} disabled={pending} onChange={(_, ids) => {
          setValue(old => ({
            ...old,
            participants: uniqueEventParticipants([
              ...old.participants.filter(p => p.role !== role),
              ...(ids as number[]).map(accountId => ({ accountId, role })),
            ]),
          }))
        }} />
    })}
    <Typography variant="body2" color="text.secondary">У каждого участника одна роль. Чтобы сменить её, сначала уберите участника из текущей роли.</Typography>
    <Typography variant="h5">Зависимости</Typography>{value.dependencies.map((d, index) => <Paper sx={{ p: 2 }} key={index}><Stack gap={1.5}><FormFields fields={[{ name: 'predecessorEventId', label: 'Предшествующее событие', type: 'select', options: data.events.filter(e => e.id !== event.id).map(e => ({ value: e.id, label: e.title })) }, { name: 'minGapDays', label: 'Минимум дней', type: 'number', min: 0, required: true }, { name: 'maxGapDays', label: 'Максимум дней (пусто — без ограничения)', type: 'number', min: 0 }]} values={d} disabled={pending} onChange={(name, v) => setValue(old => ({ ...old, dependencies: old.dependencies.map((dep, i) => i === index ? { ...dep, [name]: name === 'maxGapDays' && v === '' ? null : v } : dep) }))} /><Button disabled={pending} color="error" onClick={() => setValue(old => ({ ...old, dependencies: old.dependencies.filter((_, i) => i !== index) }))}>Убрать зависимость</Button></Stack></Paper>)}
    <Button disabled={pending || data.events.length < 2} onClick={() => setValue(old => ({ ...old, dependencies: [...old.dependencies, { predecessorEventId: data.events.find(e => e.id !== event.id)!.id, minGapDays: 0, maxGapDays: null }] }))}>Добавить зависимость</Button>
  </Stack></DialogContent><DialogActions><Button disabled={pending} onClick={onClose}>Отмена</Button><Button type="submit" variant="contained" disabled={pending}>Сохранить событие</Button></DialogActions></Box></Dialog>
}
