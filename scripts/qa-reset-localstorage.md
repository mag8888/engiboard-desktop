# qa-reset-localstorage — стирание локальных настроек EngiBoard

LocalStorage хранит:
- `eb_collapsed_weeks_<projectId>` — какие недели свёрнуты
- `eb_done_weeks_<projectId>` — какие отмечены завершёнными
- `eb_sort_<projectId>` — режим сортировки
- `eb_client_groups_collapsed` — свёрнутость клиент-групп в сайдбаре
- `eb_dark_mode` — тёмная тема
- `eb_user_settings` — прочие пользовательские настройки

Между тест-прогонами иногда нужно начисто. Способы:

## Через DevTools (быстро, 5 сек)

Открыть Console, вставить:

```js
Object.keys(localStorage).filter(k => k.startsWith('eb_')).forEach(k => localStorage.removeItem(k));
location.reload();
```

## Через настройки браузера

Chrome / Edge: DevTools → Application → Local Storage → `localhost:7788` или `engiboard.com` → правый клик → Clear.

## В desktop-сборке Tauri

`~/Library/Application Support/com.engiboard.desktop/EBWebView/` (macOS) — удалить директорию, перезапустить.
`%APPDATA%/com.engiboard.desktop/EBWebView/` (Windows) — то же.

После этого: следующий запуск = чистый профиль, авто-логин слетит.

## Sanity-проверка после reset

- [ ] Все недели развёрнуты
- [ ] Тема light (по умолчанию)
- [ ] Sort = By week (default)
- [ ] Client-groups развёрнуты
