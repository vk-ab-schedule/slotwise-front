import { Alert, Box, Button, Checkbox, FormControlLabel, Paper, Stack, TextField, Typography } from '@mui/material'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { DataTable, ErrorNotice, PageHeading } from './components'
import { importUniversity, parseImport } from './importRepository'
import { errorMessage } from './repository'
import type { Schema } from './types'

export function ImportPage() {
  const [text, setText] = useState(''), [fileName, setFileName] = useState('')
  const [preview, setPreview] = useState<Schema['UniversityImportResponse']>()
  const [pending, setPending] = useState(false), [partial, setPartial] = useState(false), [error, setError] = useState('')
  const invalidate = () => { setPreview(undefined); setPartial(false); setError('') }
  const run = async (dryRun: boolean) => {
    setPending(true); setError('')
    try { setPreview(await importUniversity(parseImport(text), dryRun, !dryRun && partial)) }
    catch (e) { setError(errorMessage(e)); if (dryRun) setPreview(undefined) }
    finally { setPending(false) }
  }
  return <Box><PageHeading title="Проверка импорта" subtitle="Предварительная проверка JSON перед сохранением" />
    <Stack gap={2.5}>
      <Stack direction="row" gap={2} alignItems="center"><Button component="label" variant="outlined" disabled={pending}>Выбрать JSON<input type="file" accept=".json,application/json" hidden onChange={async e => {
        const file = e.target.files?.[0]; e.target.value = ''; if (!file) return
        invalidate(); setFileName(file.name)
        if (file.size > 10 * 1024 * 1024) { setError('Выберите файл размером до 10 МБ.'); setText(''); return }
        setPending(true)
        try { setText(await file.text()) } catch { setText(''); setError('Не удалось прочитать файл.') } finally { setPending(false) }
      }} /></Button><Typography variant="body2" color="text.secondary">{fileName || 'Файл не выбран · до 10 МБ'}</Typography></Stack>
      <TextField label="JSON данных вуза" multiline minRows={7} maxRows={14} value={text} disabled={pending} onChange={e => { invalidate(); setText(e.target.value) }} slotProps={{ htmlInput: { spellCheck: false } }} helperText="Разделы: accounts, groups, rooms, disciplines, teaching, supervision, timetable. Ссылки используют externalId." />
      <ErrorNotice error={error} />
      <Stack direction="row" gap={1.5}><Button variant="contained" disabled={pending || !text.trim()} onClick={() => void run(true)}>{pending ? 'Проверка…' : 'Проверить файл'}</Button><Button component={Link} to="/admin/university" disabled={pending}>К данным вуза</Button></Stack>
      {preview && <>
        <Stack direction={{ xs: 'column', sm: 'row' }} gap={2}>{[['Корректных записей', preview.summary.total - preview.summary.rejected], ['Ошибок', preview.summary.rejected], ['Создано / к созданию', preview.summary.created], ['Обновлено / к обновлению', preview.summary.updated]].map(([label, value]) => <Paper key={label} sx={{ p: 2, flex: 1 }}><Typography color="text.secondary" variant="body2">{label}</Typography><Typography variant="h5">{value}</Typography></Paper>)}</Stack>
        {!!preview.diagnostics.length && <DataTable rows={preview.diagnostics.map((r, index) => ({ ...r, index }))} rowKey={r => String(r.index)} columns={[{ label: 'Место в файле', render: r => r.path }, { label: 'Проблема', render: r => r.issue.message }]} />}
        {preview.applied ? <Alert severity="success">Импорт завершён. Сохранены корректные записи; повторная загрузка обновляет записи по внешнему идентификатору.</Alert> : <>
          {!!preview.summary.rejected && <FormControlLabel control={<Checkbox checked={partial} disabled={pending} onChange={e => setPartial(e.target.checked)} />} label="Импортировать только корректные записи, пропустив ошибки" />}
          <Alert severity="info">Предпросмотр не изменяет данные. Применение повторно проверит файл; ошибки останутся в отчёте.</Alert>
          <Button variant="contained" sx={{ alignSelf: 'flex-start' }} disabled={pending || preview.summary.total === preview.summary.rejected || preview.summary.rejected > 0 && !partial} onClick={() => void run(false)}>{pending ? 'Импорт…' : partial ? 'Импортировать корректные' : 'Применить импорт'}</Button>
        </>}
      </>}
    </Stack>
  </Box>
}
