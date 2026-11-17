import { Box, Button, Chip, Stack, Typography } from '@mui/material'
import { observer } from 'mobx-react-lite'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { authStore, type Role } from '../auth/authStore'
import { isMockMode } from '../api/http'
import mark from '../assets/my-itmo-mark.svg'
import home from '../assets/home.svg'
import calendar from '../assets/calendar.svg'
import gradebook from '../assets/gradebook.svg'
import studyPlan from '../assets/study-plan.svg'
import sport from '../assets/sport.svg'
import practice from '../assets/practice.svg'
import finance from '../assets/finance.svg'
import people from '../assets/people.svg'
import services from '../assets/services.svg'
import freeTime from '../assets/free-time.svg'
import { colors } from '../theme'

const navigation = [
  ['Главная', home], ['Расписание', calendar], ['Зачётка', gradebook],
  ['Учебный план', studyPlan], ['Запись по выбору', calendar], ['Спорт', sport],
  ['Практики', practice], ['Финансы', finance], ['Персоналии', people],
  ['Заявки и очереди', calendar], ['Сервисы', services],
] as const

const roleNames: Record<Role, string> = { STUDENT: 'Студент', TEACHER: 'Преподаватель', ORGANIZER: 'Организатор', ADMIN: 'Администратор' }

export const AppShell = observer(function AppShell() {
  const location = useLocation()
  const user = authStore.user
  const tabs = user?.role === 'ADMIN' ? [
    ['Данные вуза', '/admin/university'], ['Пользователи', '/admin/users'], ['Типы событий', '/admin/event-types'], ['Эксперименты', '/admin/experiments'],
  ] : user?.role === 'ORGANIZER' ? [
    ['Сессии', '/organizer/sessions'], ['Расписание', '/organizer/schedule'], ['Запросы', '/organizer/requests'], ['Что если', '/organizer/scenarios'],
  ] : [
    ['Моя занятость', '/availability'], ['Моё расписание', '/schedule'], ['Мои запросы', '/requests'],
  ]

  return <Box sx={{ display: 'flex', minHeight: '100vh', bgcolor: 'background.default' }}>
    <Box component="aside" sx={{ width: 224, flexShrink: 0, bgcolor: '#fff', borderRight: `1px solid ${colors.border}`, p: 2.5, display: { xs: 'none', md: 'flex' }, flexDirection: 'column', gap: 1.5 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', height: 42, fontWeight: 700, fontSize: 27, letterSpacing: '-1px', color: '#2d2d2d' }}>
        my<img src={mark} width="44" height="40" alt="." />itmo
      </Box>
      <Typography variant="caption" color="text.secondary">Личный кабинет</Typography>
      {navigation.map(([label, icon]) => <Box key={label} sx={{ height: 38, display: 'flex', alignItems: 'center', gap: 1, color: colors.muted, fontSize: 15, px: 0.75 }}><img src={icon} width="18" height="18" alt="" />{label}</Box>)}
      <Box component={NavLink} to={user?.role === 'ADMIN' ? '/admin/university' : user?.role === 'ORGANIZER' ? '/organizer/sessions' : '/availability'} sx={{ height: 38, display: 'flex', alignItems: 'center', gap: 1, color: colors.blue, bgcolor: colors.light, borderRadius: 1, fontSize: 15, fontWeight: 500, px: 0.75 }}><img src={freeTime} width="18" height="18" alt="" />Свободное время</Box>
      <Typography variant="caption" color="text.secondary">SlotWise<br />Планирование событий</Typography>
    </Box>
    <Box sx={{ flexGrow: 1, minWidth: 0 }}>
      <Box component="header" sx={{ height: 89, bgcolor: '#fff', borderBottom: `1px solid ${colors.border}`, px: { xs: 2, md: 4 }, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Typography sx={{ fontSize: 28, fontWeight: 500 }}>Свободное время</Typography>
        {user && <Stack direction="row" alignItems="center" spacing={2}>
          <Box><Typography variant="body2">{user.firstName} {user.lastName}</Typography><Typography variant="caption" color="text.secondary">{roleNames[user.role]}</Typography></Box>
          {isMockMode() && <Box component="select" aria-label="Демо-роль" value={user.role} onChange={event => { authStore.selectDemoRole(event.target.value as Role); if (location.pathname !== '/login') window.location.assign('/') }} style={{ border: `1px solid ${colors.border}`, borderRadius: 6, padding: 6, background: 'white', color: colors.ink }}>
            {Object.entries(roleNames).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </Box>}
          {isMockMode() && <Button component={Link} to="/screens" size="small">42 экрана</Button>}
          <Button size="small" onClick={() => void authStore.logout()}>Выйти</Button>
        </Stack>}
      </Box>
      <Box component="main" sx={{ p: { xs: 2, md: 4.5 }, maxWidth: 1300, mx: 'auto' }}>
        {user && <Stack direction="row" gap={1} flexWrap="wrap" sx={{ mb: 2.5 }}>
          {tabs.map(([label, path]) => <Chip key={path} component={NavLink} to={path} clickable label={label} sx={{ borderRadius: 1, fontSize: 12, bgcolor: location.pathname.startsWith(path) ? colors.light : '#fff', color: location.pathname.startsWith(path) ? colors.blue : colors.muted, fontWeight: 500 }} />)}
        </Stack>}
        <Outlet />
      </Box>
    </Box>
  </Box>
})
