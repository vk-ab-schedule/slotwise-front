# SlotWise — фронтенд

Веб-интерфейс SlotWise — сервиса планирования экзаменов, консультаций, предзащит и защит.

## Технологии

React, TypeScript, Vite, Material UI, MobX, React Router и Axios.

## Запуск

Требуются Node.js 22 или новее и npm. В каталоге проекта выполните:

```sh
npm ci
npm run dev
```

Откройте адрес из терминала, обычно `http://localhost:5173`.

По умолчанию приложение работает на демо-данных без бэкенда. Для входа используйте `admin@example.test`, `organizer@example.test`, `teacher@example.test` или `student@example.test` с любым непустым паролем.

## Подключение бэкенда

Запустите `slotwise-back` на порту `8080`. Создайте в корне фронтенда файл `.env.local`:

```env
VITE_MOCK_API=false
```

Перезапустите фронтенд. Запросы `/api` будут проксироваться на `http://localhost:8080`. Для входа используйте учётную запись бэкенда.

## Сборка

```sh
npm run build
npm run preview
```

Готовые файлы сборки находятся в каталоге `dist`.
