import { Alert, Box, Button, Checkbox, FormControlLabel, MenuItem, Paper, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TablePagination, TableRow, TextField, Typography } from '@mui/material'
import { useEffect, useState, type ReactNode } from 'react'
import { errorMessage } from './repository'

export function PageHeading({ title, subtitle }: { title: string; subtitle: string }) {
  return <Box sx={{ mb: 3 }}><Typography variant="h4">{title}</Typography><Typography color="text.secondary" variant="body2" sx={{ mt: 0.75 }}>{subtitle}</Typography></Box>
}

// The cancellation guard prevents a late response from replacing another route's data.
export function useLoad<T>(load: () => Promise<T>) {
  const [data, setData] = useState<T>()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    let active = true
    setLoading(true)
    setError('')
    setData(undefined)
    void load().then(value => { if (active) setData(value) }, cause => { if (active) setError(errorMessage(cause)) }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [load, revision])
  return { data, loading, error, reload: () => setRevision(value => value + 1) }
}

export function ErrorNotice({ error, retry }: { error: string; retry?: () => void }) {
  return error ? <Alert severity="error" sx={{ whiteSpace: 'pre-line' }} action={retry && <Button color="inherit" onClick={retry}>Повторить</Button>}>{error}</Alert> : null
}

export function DataTable<T>({ rows, columns, rowKey, count, page, onPage }: {
  rows: T[]; columns: { label: string; render: (row: T) => ReactNode }[]; rowKey: (row: T) => string
  count?: number; page?: number; onPage?: (page: number) => void
}) {
  return <Paper><TableContainer><Table size="small"><TableHead><TableRow>{columns.map(c => <TableCell key={c.label}>{c.label}</TableCell>)}</TableRow></TableHead>
    <TableBody>{rows.map(row => <TableRow hover key={rowKey(row)}>{columns.map(c => <TableCell key={c.label} sx={{ height: 58 }}>{c.render(row)}</TableCell>)}</TableRow>)}
      {!rows.length && <TableRow><TableCell colSpan={columns.length} sx={{ py: 4, textAlign: 'center', color: 'text.secondary' }}>Записи не найдены</TableCell></TableRow>}
    </TableBody></Table></TableContainer>{onPage && <TablePagination component="div" count={count ?? 0} page={page ?? 0} rowsPerPage={20} rowsPerPageOptions={[20]} onPageChange={(_, value) => onPage(value)} labelRowsPerPage="На странице" labelDisplayedRows={({ from, to, count: total }) => `${from}–${to} из ${total}`} getItemAriaLabel={type => type === 'next' ? 'Следующая страница' : 'Предыдущая страница'} />}</Paper>
}

export type Option = { value: string | number; label: string }
export type Field = { name: string; label: string; type?: 'text' | 'number' | 'email' | 'date' | 'datetime-local' | 'time' | 'boolean' | 'select' | 'multiple'; required?: boolean; min?: number; max?: number; step?: number; options?: Option[]; hint?: string }
export type FormValues = Record<string, unknown>

export function FormFields({ fields, values, onChange, errors = {}, disabled = false }: {
  fields: Field[]; values: FormValues; onChange: (name: string, value: unknown) => void; errors?: Record<string, string>; disabled?: boolean
}) {
  return <Stack gap={2.5}>{fields.map(field => field.type === 'boolean'
    ? <FormControlLabel key={field.name} control={<Checkbox checked={Boolean(values[field.name])} disabled={disabled} onChange={e => onChange(field.name, e.target.checked)} />} label={field.label} />
    : <TextField key={field.name} fullWidth label={field.label} required={field.required} disabled={disabled} type={field.type === 'select' || field.type === 'multiple' ? undefined : field.type ?? 'text'}
      select={field.type === 'select' || field.type === 'multiple'} value={values[field.name] ?? (field.type === 'multiple' ? [] : '')}
      error={Boolean(errors[field.name])} helperText={errors[field.name] || field.hint}
      slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: field.min, max: field.max, step: field.step }, select: { multiple: field.type === 'multiple' } }}
      onChange={e => onChange(field.name, field.type === 'number' ? e.target.value === '' ? '' : Number(e.target.value) : e.target.value)}>
      {(field.options ?? []).map(option => <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>)}
    </TextField>)}</Stack>
}

export function validateFields(fields: Field[], values: FormValues): Record<string, string> {
  const errors: Record<string, string> = {}
  for (const f of fields) {
    const value = values[f.name]
    if (f.required && (value == null || String(value).trim() === '' || Array.isArray(value) && !value.length)) errors[f.name] = 'Заполните поле'
    else if (f.type === 'number' && value !== '' && value != null && (!Number.isSafeInteger(value) || f.min != null && Number(value) < f.min || f.max != null && Number(value) > f.max || f.step && Number(value) % f.step !== 0)) errors[f.name] = `Введите целое число${f.min != null ? ` от ${f.min}` : ''}${f.max != null ? ` до ${f.max}` : ''}${f.step ? ` с шагом ${f.step}` : ''}`
    else if (f.type === 'email' && typeof value === 'string' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) errors[f.name] = 'Введите корректный email'
  }
  return errors
}
