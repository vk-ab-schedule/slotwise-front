import { Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Stack, TextField } from '@mui/material'
import { useCallback, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { DataTable, ErrorNotice, FormFields, PageHeading, useLoad, validateFields, type FormValues } from './components'
import { errorMessage, listRecords, saveRecord } from './repository'
import { accountAction, accountPasswordLength, deleteUniversityRecord, loadCatalogs, passwordError, universityDefaults, universityFields, universityPayload, universitySections, validateUniversity, type Catalogs, type UniversitySection } from './university'
import { personName, recordKey, roleLabels, type ResourceMap, type Schema, type WriteMap } from './types'

export function UniversityPage({ users = false }: { users?: boolean }) {
  const [params, setParams] = useSearchParams()
  const section = params.get('section') as UniversitySection | null
  const selected = users ? 'accounts' : section && section in universitySections ? section : null
  const load = useCallback(async () => {
    const entries = await Promise.all(Object.keys(universitySections).map(async resource => [resource, (await listRecords(resource as UniversitySection)).totalElements] as const))
    return Object.fromEntries(entries)
  }, [])
  const overview = useLoad(load)
  return <Box><PageHeading title={users ? 'Пользователи' : 'Данные вуза'} subtitle={users ? 'Поиск, роли и доступ к SlotWise' : 'Импорт и ручное редактирование · синтетический набор данных'} />
    {!users && <Stack direction="row" flexWrap="wrap" gap={1.5} sx={{ mb: 2.5 }}><Button variant="contained" component={Link} to="/admin/university/import">Загрузить JSON</Button>{selected && <Button variant="outlined" onClick={() => setParams({})}>Все разделы</Button>}</Stack>}
    {!selected ? <>
      {overview.loading && <CircularProgress aria-label="Загрузка разделов" />}
      <ErrorNotice error={overview.error} retry={overview.reload} />
      {overview.data && <DataTable rows={Object.entries(universitySections)} rowKey={([key]) => key} columns={[
        { label: 'Раздел', render: ([key, label]) => <Button onClick={() => setParams({ section: key })}>{label}</Button> },
        { label: 'Записей', render: ([key]) => overview.data?.[key] ?? '—' },
        { label: 'Действия', render: ([key]) => <Button onClick={() => setParams({ section: key })}>Просмотр и редактирование</Button> },
      ]} />}
      <Alert severity="info" icon={false} sx={{ mt: 2.5 }}>Для MVP JSON имитирует данные вуза. Оболочка my.itmo показывает целевое размещение сервиса.</Alert>
    </> : <UniversityTable key={selected} section={selected} />}
  </Box>
}

function UniversityTable<R extends UniversitySection>({ section }: { section: R }) {
  const [page, setPage] = useState(0), [search, setSearch] = useState('')
  const [editing, setEditing] = useState<ResourceMap[R] | null | undefined>()
  const [access, setAccess] = useState<Schema['AccountResponse']>()
  const [deleting, setDeleting] = useState<ResourceMap[R]>()
  const [pending, setPending] = useState(false), [error, setError] = useState(''), [success, setSuccess] = useState('')
  const load = useCallback(async () => ({ page: await listRecords(section, page, search), catalog: await loadCatalogs() }), [section, page, search])
  const state = useLoad(load, section === 'accounts')
  const links = section === 'teachings' || section === 'supervisions'
  const refreshingAccounts = section === 'accounts' && (state.loading || Boolean(state.error))
  const saved = () => { setEditing(undefined); setSuccess('Изменения сохранены.'); state.reload() }
  const accessSaved = (account: Schema['AccountResponse']) => {
    setAccess(undefined)
    state.setData(current => current && {
      ...current,
      page: { ...current.page, items: current.page.items.map(row =>
        'hasPassword' in row && row.id === account.id ? { ...row, ...account } : row) },
    })
    state.reload()
    setSuccess('Настройки доступа сохранены.')
  }
  const display = (row: ResourceMap[R]) => {
    if ('firstName' in row) return personName(row)
    if ('name' in row) return row.name
    if ('startsAt' in row) return `${new Date(row.startsAt).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' })} — ${new Date(row.endsAt).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' })}`
    const catalog = state.data!.catalog
    const person = (id: number) => { const p = catalog.accounts.find(a => a.id === id); return p ? personName(p) : `Пользователь #${id}` }
    if ('teacherId' in row) return `${person(row.teacherId)} · ${catalog.disciplines.find(d => d.id === row.disciplineId)?.name ?? '—'} · ${catalog.groups.find(g => g.id === row.groupId)?.name ?? '—'}`
    return `${person(row.studentId)} → ${person(row.supervisorId)}`
  }
  return <Stack gap={2.5}>
    <Stack direction={{ xs: 'column', sm: 'row' }} gap={2}><TextField label={`Поиск: ${universitySections[section].toLocaleLowerCase()}`} value={search} onChange={e => { setSearch(e.target.value); setPage(0) }} sx={{ flex: 1 }} /><Button variant="contained" disabled={!state.data} onClick={() => { setError(''); setEditing(null) }}>Создать запись</Button><Button onClick={state.reload}>Обновить</Button></Stack>
    <ErrorNotice error={state.error || error} retry={state.reload} />{success && <Alert severity="success" onClose={() => setSuccess('')}>{success}</Alert>}
    {state.loading && <CircularProgress aria-label="Загрузка записей" />}
    {state.data && <DataTable rows={state.data.page.items} rowKey={recordKey} count={state.data.page.totalElements} page={page} onPage={setPage} columns={[
      { label: universitySections[section], render: display },
      { label: 'Сведения', render: row => 'email' in row ? `${row.email} · ${roleLabels[row.role]}` : 'studentIds' in row ? `${row.studentIds.length} студентов` : 'online' in row ? row.online ? 'Онлайн' : `${row.capacity} мест · ${row.building ?? ''}` : 'description' in row ? row.description ?? '—' : 'externalId' in row ? row.externalId ?? '—' : '—' },
      { label: 'Состояние', render: row => 'enabled' in row ? row.enabled ? row.hasPassword ? 'Активен' : 'Не задан пароль' : 'Отключён' : 'active' in row ? row.active ? 'Активна' : 'Скрыта' : '—' },
      { label: 'Действия', render: row => <Stack direction="row" gap={1}>{!links && <Button disabled={refreshingAccounts} onClick={() => setEditing(row)}>Редактировать</Button>}{section === 'accounts' ? <Button disabled={refreshingAccounts} onClick={() => setAccess(row as Schema['AccountResponse'])}>Доступ</Button> : <Button color="error" onClick={() => { setError(''); setDeleting(row) }}>Удалить</Button>}</Stack> },
    ]} />}
    {editing !== undefined && state.data && <UniversityEditor section={section} row={editing ?? undefined} catalog={state.data.catalog} onClose={() => setEditing(undefined)} onSaved={saved} />}
    {access && <AccountAccess account={access} onClose={() => setAccess(undefined)} onSaved={accessSaved} />}
    <Dialog open={Boolean(deleting)} onClose={() => { if (!pending) setDeleting(undefined) }}><DialogTitle>Удалить запись?</DialogTitle><DialogContent><ErrorNotice error={error} />Удаление используемой записи будет запрещено. Активную группу, аудиторию или дисциплину можно скрыть через редактирование.</DialogContent><DialogActions><Button disabled={pending} onClick={() => setDeleting(undefined)}>Отмена</Button><Button color="error" disabled={pending} onClick={async () => { if (!deleting) return; setPending(true); setError(''); try { await deleteUniversityRecord(section, deleting); setDeleting(undefined); state.reload(); setSuccess('Запись удалена.') } catch (e) { setError(errorMessage(e)) } finally { setPending(false) } }}>Удалить</Button></DialogActions></Dialog>
  </Stack>
}

function UniversityEditor<R extends UniversitySection>({ section, row, catalog, onClose, onSaved }: { section: R; row?: ResourceMap[R]; catalog: Catalogs; onClose: () => void; onSaved: () => void }) {
  const [values, setValues] = useState(() => universityDefaults(row)), [errors, setErrors] = useState<Record<string, string>>({})
  const [pending, setPending] = useState(false), [error, setError] = useState('')
  const fields = universityFields(section, catalog, Boolean(row))
  return <Dialog open fullWidth maxWidth="sm" onClose={() => { if (!pending) onClose() }}><Box component="form" onSubmit={async e => {
    e.preventDefault(); const issues = { ...validateFields(fields, values), ...validateUniversity(section, values) }; setErrors(issues); if (Object.keys(issues).length) return
    setPending(true); setError('')
    try { await saveRecord(section, universityPayload(section, fields, values) as WriteMap[R], row); onSaved() } catch (cause) { setError(errorMessage(cause)) } finally { setPending(false) }
  }}><DialogTitle>{row ? 'Редактировать' : 'Создать запись'} · {universitySections[section]}</DialogTitle><DialogContent><Stack gap={2.5} sx={{ pt: 1 }}><ErrorNotice error={error} /><FormFields fields={fields} values={values} errors={errors} disabled={pending} onChange={(name, value) => setValues(v => ({ ...v, [name]: value }))} /></Stack></DialogContent><DialogActions><Button disabled={pending} onClick={onClose}>Отмена</Button><Button type="submit" variant="contained" disabled={pending}>{pending ? 'Сохранение…' : 'Сохранить'}</Button></DialogActions></Box></Dialog>
}

function AccountAccess({ account, onClose, onSaved }: { account: Schema['AccountResponse']; onClose: () => void; onSaved: (updated: Schema['AccountResponse']) => void }) {
  const [action, setAction] = useState('role'), [value, setValue] = useState<FormValues>({ role: account.role, enabled: account.enabled, password: '' })
  const [pending, setPending] = useState(false), [error, setError] = useState('')
  const { min, max } = accountPasswordLength
  return <Dialog open fullWidth maxWidth="sm" onClose={() => { if (!pending) onClose() }}><DialogTitle>Доступ · {personName(account)}</DialogTitle><DialogContent><Stack gap={2} sx={{ pt: 1 }}><Alert severity="info">Изменение роли или отключение завершит действующие сессии пользователя. Каждое действие сохраняется отдельно.</Alert><ErrorNotice error={error} />
    <FormFields fields={[{ name: 'action', label: 'Действие', type: 'select', options: [{ value: 'role', label: 'Изменить роль' }, { value: 'enabled', label: 'Включить / отключить' }, { value: 'password', label: 'Задать / сбросить пароль' }] }]} values={{ action }} disabled={pending} onChange={(_, v) => { setAction(String(v)); setError('') }} />
    {action === 'password' ? <TextField type="password" label="Новый пароль" helperText={`От ${min} до ${max} символов`} autoComplete="new-password" slotProps={{ htmlInput: { minLength: min, maxLength: max } }} value={value.password} disabled={pending} onChange={e => { setValue(v => ({ ...v, password: e.target.value })); setError('') }} /> : <FormFields fields={action === 'role' ? [{ name: 'role', label: 'Роль', type: 'select', options: Object.entries(roleLabels).map(([key, label]) => ({ value: key, label })) }] : [{ name: 'enabled', label: 'Доступ включён', type: 'boolean' }]} values={value} disabled={pending} onChange={(name, v) => setValue(old => ({ ...old, [name]: v }))} />}
  </Stack></DialogContent><DialogActions><Button disabled={pending} onClick={onClose}>Отмена</Button><Button variant="contained" disabled={pending} onClick={async () => {
    const validationError = action === 'password' ? passwordError(value.password) : ''
    if (validationError) { setError(validationError); return }
    setPending(true); setError(''); try { onSaved(await accountAction(account, action as 'role' | 'enabled' | 'password', value[action] as string | boolean)) } catch (e) { setError(errorMessage(e)) } finally { setPending(false) }
  }}>Применить</Button></DialogActions></Dialog>
}
