import { createTheme } from '@mui/material/styles'

export const colors = {
  blue: '#1946d8', light: '#eff4ff', ink: '#242c3b', muted: '#68758a',
  border: '#e5e9f0', canvas: '#f8fafd', red: '#bf2940', redBg: '#fff0f2',
  amber: '#9d6500', amberBg: '#fff5dc', green: '#21764b', greenBg: '#eaf8ef',
}

export const theme = createTheme({
  palette: {
    primary: { main: colors.blue }, error: { main: colors.red }, warning: { main: colors.amber },
    success: { main: colors.green }, background: { default: colors.canvas, paper: '#fff' },
    text: { primary: colors.ink, secondary: colors.muted }, divider: colors.border,
  },
  typography: { fontFamily: 'Roboto, Arial, sans-serif', fontSize: 14,
    h4: { fontSize: 25, fontWeight: 500, lineHeight: 1.5 },
    h5: { fontSize: 20, fontWeight: 500 },
    body2: { fontSize: 13 },
  },
  shape: { borderRadius: 6 },
  components: {
    MuiCssBaseline: { styleOverrides: { body: { margin: 0 }, '*': { boxSizing: 'border-box' } } },
    MuiButton: { styleOverrides: { root: { boxShadow: 'none', textTransform: 'none', minHeight: 40, fontWeight: 500, '&:hover': { boxShadow: 'none' } } } },
    MuiPaper: { defaultProps: { variant: 'outlined' }, styleOverrides: { root: { borderColor: colors.border } } },
    MuiTextField: { defaultProps: { size: 'small' } },
    MuiTableCell: { styleOverrides: { root: { borderColor: colors.border, fontSize: 13 }, head: { backgroundColor: colors.canvas, color: colors.muted, fontSize: 12, fontWeight: 400 } } },
  },
})
