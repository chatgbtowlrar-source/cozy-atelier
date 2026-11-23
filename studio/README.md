# Cozy Studio — защищённая онлайн-админка

**Публичная админка:** https://chatgbtowlrar-source.github.io/cozy-atelier/admin/

Интерфейс доступен всем для просмотра, но **сохранение требует подтверждённых прав GitHub**. Секреты и OAuth-токены **не хранятся в GitHub Pages**. Данные (портфолио, цены, приём заказов) публикуются коммитами в `main` через GitHub API.

## Быстрый способ — без Cloudflare

Можно начать использовать админку сразу после размещения в GitHub Pages.

1. В GitHub откройте https://github.com/settings/personal-access-tokens/new.
2. Создайте **fine-grained Personal Access Token**: Repository access → Only select repositories → `chatgbtowlrar-source/cozy-atelier`.
3. Repository permissions → **Contents: Read and write**, остальные — No access.
4. Установите срок действия, например 7 дней. Никогда не публикуйте токен, не вставляйте его в чат, не добавляйте в репозиторий.
5. Откройте `/cozy-atelier/admin/`, раскройте «Быстрый вход без сервера», вставьте токен только в свой браузер и нажмите «Проверить».
6. Добавьте работы, измените цены и нажмите «Сохранить на GitHub». После успешной публикации GitHub Pages изменения появятся на сайте.

Токен не сохраняется даже в `localStorage`: он существует только в памяти вкладки до её обновления/закрытия. Это временный вариант; для постоянной работы рекомендуется защищённый вход через GitHub App и Worker.

## Полноценный вход «Войти через GitHub» — Cloudflare Worker

GitHub Pages **не может безопасно хранить OAuth client secret**, поэтому нужен отдельный бесплатный Cloudflare Worker. Он принимает OAuth-код, хранит GitHub-токен в **зашифрованном трёхчасовом сеансе**, проверяет аккаунт `chatgbtowlrar-source` и вызывает GitHub API. Шифрование — AES-GCM; ключ лежит только в Cloudflare Secrets.

### 1. Создайте Worker

Зарегистрируйтесь на https://dash.cloudflare.com/ , зайдите в **Workers & Pages → Create → Worker**. Можно развернуть этот каталог из репозитория через Cloudflare Workers Builds, указав корневую папку `studio` и команду `npx wrangler deploy` (или через локальный Wrangler: `cd studio && npm install && npx wrangler login && npx wrangler deploy`).

После первого развёртывания получите адрес вида:

`https://cozy-atelier-studio.<ваш-subdomain>.workers.dev`

Проверка: откройте `/health` по этому адресу. До добавления секретов там будет `configured:false`.

### 2. Создайте отдельное GitHub App (рекомендуется)

Откройте https://github.com/settings/apps/new и создайте приложение `Cozy Atelier Studio`:

- Homepage URL: `https://chatgbtowlrar-source.github.io/cozy-atelier/admin/`
- Callback URL: **`https://<worker-host>.workers.dev/callback`** (укажите свой реальный Worker URL)
- Webhooks: отключить, если не нужны
- Repository permissions: **Contents: Read and write**, **Metadata: Read-only** (обязательно)
- Account permissions: не нужны
- Installation: Only on this account / только ваш аккаунт

Нажмите Create GitHub App, затем установите это приложение **только на репозиторий `cozy-atelier`**. В настройках GitHub App получите **Client ID** и создайте **Client secret**.

Не путайте новый GitHub App с уже установленным `ChatGPT Codex Connector`: это разные приложения.

### 3. Добавьте секреты в Cloudflare

Workers & Pages → `cozy-atelier-studio` → Settings → Variables and Secrets → Add → **Secret**:

- `GH_CLIENT_ID` — Client ID нового GitHub App
- `GH_CLIENT_SECRET` — Client secret нового GitHub App
- `SESSION_SECRET` — случайный криптографический секрет длиной от **32 символов**. Пример генерации на своём компьютере: `python -c "import secrets; print(secrets.token_urlsafe(48))"`

**Никогда** не вставляйте секреты в `wrangler.toml`, GitHub, публичные файлы или ChatGPT. Если меняете секреты в Cloudflare, опубликуйте новую версию Worker, если этого требует интерфейс.

### 4. Войдите

Откройте https://chatgbtowlrar-source.github.io/cozy-atelier/admin/.

В поле «Адрес защищённого сервера» вставьте ваш URL `https://cozy-atelier-studio.<ваш-subdomain>.workers.dev`, нажмите **Запомнить**, затем **Войти через GitHub**. Авторизуйтесь через GitHub. После проверки прав и входа панель откроется.

### Как устроена безопасность

- Только аккаунт `chatgbtowlrar-source` может получить сеанс (проверка логина GitHub и прав записи).
- GitHub App имеет разрешение Contents read/write **только к выбранному репозиторию**.
- OAuth `client_secret` остаётся внутри Cloudflare Secrets. GitHub access token помещён только в зашифрованную сессию (AES-GCM, 3 часа), а не в публичный JavaScript.
- GitHub API на стороне Worker жёстко ограничен путями `data/site.json` и `assets/portfolio/`.
- CORS разрешён только с origin `https://chatgbtowlrar-source.github.io`.
- `state` OAuth сверяется с короткоживущей HttpOnly cookie.
- История изменений и откат доступны через историю коммитов GitHub.

### Возможные проблемы

- **«Неверный Origin»** — админка открыта не через указанный GitHub Pages домен. Откройте опубликованную страницу.
- **Popup блокируется** — разрешите всплывающие окна для GitHub Pages.
- **403 от GitHub** — GitHub App не установлено на нужный репозиторий или не выданы права Contents read/write.
- **401** — сеанс истёк; повторите авторизацию.
- **Страница обновляется не сразу** — дождитесь GitHub Pages Deployment (обычно несколько минут), сделайте Ctrl+F5.

## Ограничения

Изображения грузятся отдельным коммитом, а запись в `data/site.json` — вторым. При ошибке второго коммита рисунок останется в `assets/portfolio/`, пока не будет использован или удалён вручную. Админка не принимает заказы автоматически и не отправляет клиентам сообщения.
