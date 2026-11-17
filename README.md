# Контракт API SlotWise

Бэкенд публикует контракт OpenAPI в [`/v3/api-docs`](http://localhost:8080/v3/api-docs).
Сгенерированные типы запросов и ответов лежат в `src/api/schema.d.ts`. Импортируйте из него `paths` для маршрутов и `components['schemas']` для моделей данных.

После изменения контракта запустите бэкенд и выполните в корне фронтенда:

```sh
npm ci
npm run api:generate
npm run api:check
```

При ошибке `fetch failed` проверьте, что бэкенд доступен на `localhost:8080`. Чтобы обойтись без запуска сервера, выполните в `slotwise-back` команду `./gradlew :app:exportOpenApi`, затем выполните в корне фронтенда:

```sh
npm run api:generate -- ../slotwise-back/app/build/openapi/slotwise.json
npm run api:check -- ../slotwise-back/app/build/openapi/slotwise.json
```
