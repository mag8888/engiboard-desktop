## Что меняется

Одной-двумя строками — зачем PR и что под капотом.

## Связанные issue

- Closes #
- Refs #

## Чек-лист автора

- [ ] Версия в `src-tauri/Cargo.toml` и `tauri.conf.json` поднята (если релиз)
- [ ] Нет console errors при загрузке `dist/index.html`
- [ ] Нет TODO/FIXME без issue-ссылки в добавленном коде
- [ ] Если меняется UI — приложен скрин до/после
- [ ] Если меняется БД — добавлена миграция в `supabase/migrations/`

## Зона риска

Что может сломаться. На что обратить внимание QA в первую очередь:

-

## Как ревьюверу проверить

```bash
# Шаги для локального запуска
cd engiboard-desktop
python3 -m http.server 7788 --directory dist
# открыть http://localhost:7788
```

или DMG из артефактов GitHub Actions.

## QA gate

- [ ] Smoke-чеклист пройден (docs/PRODUCT_REQUIREMENTS.md §19.1)
- [ ] Регресс — если PR трогает: задачи / редактор / Present / sync — обязательно

---

Co-authored-by: (если применимо)
