import { Alert, Button, CircularProgress, Paper, Stack, Typography } from '@mui/material'
import { useCallback, useState } from 'react'
import { Link } from 'react-router-dom'
import { allRecords, errorMessage } from './repository'
import { ErrorNotice, FormFields, useLoad } from './components'
import { acceptSelectionSave, getSelections, publicPeople, saveSelection, type Selection, type SelectionKind } from './sessions'
import { peopleOptions } from './university'
import type { Schema } from './types'

export function SessionResources({ session }: { session: Schema['PlanningSessionResponse'] }) {
  const load = useCallback(async () => {
    const [selection, people, groups, rooms] = await Promise.all([getSelections(session.id), publicPeople(), allRecords('groups'), allRecords('rooms')])
    return { selection, people, groups, rooms }
  }, [session.id])
  const state = useLoad(load)
  return <Stack gap={2.5}><ErrorNotice error={state.error} retry={state.reload} />{state.loading && <CircularProgress aria-label="Загрузка участников и ресурсов" />}{state.data && <ResourceEditor key={session.id} data={state.data} reload={state.reload} />}</Stack>
}
type ResourceData = { selection: Selection; people: Schema['PersonSummary'][]; groups: Schema['UniversityGroupResponse'][]; rooms: Schema['UniversityRoomResponse'][] }
function ResourceEditor({ data, reload }: { data: ResourceData; reload: () => void }) {
  const [selection, setSelection] = useState(() => structuredClone(data.selection))
  const [pending, setPending] = useState(false), [error, setError] = useState(''), [success, setSuccess] = useState('')
  const id = selection.participants.sessionId
  const save = async (kind: SelectionKind) => {
    setPending(true); setError(''); setSuccess('')
    const draft = selection[kind]
    try {
      const saved = await saveSelection(id, kind, draft)
      setSelection(current => acceptSelectionSave(current, kind, saved, draft.sessionVersion))
      setSuccess('Выбранный раздел сохранён.')
    } catch (e) { setError(errorMessage(e)) } finally { setPending(false) }
  }
  const teachers = data.people.filter(p => p.role === 'TEACHER')
  const candidates = selection.commission.candidates
  return <Stack gap={2.5}><ErrorNotice error={error} retry={reload} />{success && <Alert severity="success" onClose={() => setSuccess('')}>{success}</Alert>}
    <Alert severity="info">Пользователей и аудитории добавляет администратор в данных вуза. Каждый раздел сохраняется отдельно.</Alert>
    <Paper sx={{ p: 3 }}><Stack gap={2.5}><Typography variant="h5">Участники</Typography><FormFields fields={[
      { name: 'studyGroupIds', label: 'Группы', type: 'multiple', options: data.groups.filter(g => g.active || selection.participants.studyGroupIds.includes(g.id)).map(g => ({ value: g.id, label: g.name })) },
      { name: 'accountIds', label: 'Отдельные участники', type: 'multiple', options: peopleOptions(data.people) },
    ]} values={selection.participants} disabled={pending} onChange={(name, value) => setSelection(s => ({ ...s, participants: { ...s.participants, [name]: value } }))} />
      <Button variant="contained" disabled={pending} sx={{ alignSelf: 'flex-start' }} onClick={() => void save('participants')}>Сохранить участников</Button></Stack></Paper>
    <Paper sx={{ p: 3 }}><Stack gap={2.5}><Typography variant="h5">Пул комиссии</Typography><FormFields fields={[
      { name: 'teacherIds', label: 'Преподаватели в пуле', type: 'multiple', options: peopleOptions(teachers) },
      { name: 'chairIds', label: 'Возможные председатели', type: 'multiple', options: peopleOptions(teachers.filter(p => candidates.some(c => c.accountId === p.id))) },
    ]} values={{ teacherIds: candidates.map(c => c.accountId), chairIds: candidates.filter(c => c.canChair).map(c => c.accountId) }} disabled={pending} onChange={(name, value) => {
      const ids = value as number[]
      setSelection(s => ({ ...s, commission: { ...s.commission, candidates: name === 'teacherIds' ? ids.map(accountId => ({ accountId, canChair: s.commission.candidates.find(c => c.accountId === accountId)?.canChair ?? false })) : s.commission.candidates.map(c => ({ ...c, canChair: ids.includes(c.accountId) })) } }))
    }} /><Button variant="contained" disabled={pending} sx={{ alignSelf: 'flex-start' }} onClick={() => void save('commission')}>Сохранить пул комиссии</Button></Stack></Paper>
    <Paper sx={{ p: 3 }}><Stack gap={2.5}><Typography variant="h5">Аудитории и онлайн-площадки</Typography><FormFields fields={[{ name: 'roomIds', label: 'Ресурсы', type: 'multiple', options: data.rooms.filter(r => r.active || selection.rooms.roomIds.includes(r.id)).map(r => ({ value: r.id, label: `${r.name} · ${r.online ? 'Онлайн' : `${r.capacity} мест`}` })) }]} values={selection.rooms} disabled={pending} onChange={(_, value) => setSelection(s => ({ ...s, rooms: { ...s.rooms, roomIds: value as number[] } }))} />
      <Button variant="contained" disabled={pending} sx={{ alignSelf: 'flex-start' }} onClick={() => void save('rooms')}>Сохранить аудитории</Button></Stack></Paper>
    <Button component={Link} to={`/organizer/sessions/${id}/events`} sx={{ alignSelf: 'flex-start' }}>К событиям сессии</Button>
  </Stack>
}
