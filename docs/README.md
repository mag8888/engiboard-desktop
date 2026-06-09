# EngiBoard — документация

| Файл | Кому | Зачем |
|---|---|---|
| [PRODUCT_REQUIREMENTS.md](PRODUCT_REQUIREMENTS.md) | продакт + QA + dev | единая правда о фичах, ролях, не-функц требованиях |
| [QA_SMOKE_5MIN.md](QA_SMOKE_5MIN.md) | QA | 5-минутный smoke на каждый билд |
| [QA_DEVTOOLS_SNIPPETS.md](QA_DEVTOOLS_SNIPPETS.md) | QA | готовые console-команды для воспроизведения и сидинга |

### Шаблоны GitHub

- [.github/ISSUE_TEMPLATE/bug_report.md](../.github/ISSUE_TEMPLATE/bug_report.md) — форма багрепорта
- [.github/ISSUE_TEMPLATE/qa_release_signoff.md](../.github/ISSUE_TEMPLATE/qa_release_signoff.md) — чек-лист релиз-приёмки (45 мин)
- [.github/PULL_REQUEST_TEMPLATE.md](../.github/PULL_REQUEST_TEMPLATE.md) — шаблон PR с QA-gate

### Скрипты

- [scripts/qa-preview.sh](../scripts/qa-preview.sh) — поднять локальный preview на :7788
- [scripts/qa-reset-localstorage.md](../scripts/qa-reset-localstorage.md) — как сбросить LocalStorage

### Процесс QA

1. **Каждый PR** — автор проходит `QA_SMOKE_5MIN.md` локально.
2. **Каждый релиз** (`v0.1.XXX`) — QA-тестировщик заводит issue по `qa_release_signoff.md`, проходит регресс ~45 мин, выносит вердикт.
3. **Найденный баг** — отдельный issue по `bug_report.md`. p0 баги блокируют релиз.
