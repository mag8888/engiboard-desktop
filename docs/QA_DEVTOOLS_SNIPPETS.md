# EngiBoard — Snippets для DevTools

Готовые консольные команды для QA, чтобы быстро воспроизводить ситуации, проверять состояние и сбрасывать данные. Открыть DevTools → Console → вставить.

> macOS WKWebView: DevTools работают только в dev-сборке (`tauri dev`). В прод-сборке DevTools отключены — пользуйтесь web-превью на `localhost:7788`.

---

## 1. Состояние

### 1.1 Что сейчас выбрано / открыто

```js
({
  project: currentProjectId,
  task: presentTask?.id || null,
  tasksTotal: TASKS.length,
  hiddenCount: TASKS.filter(t => t.hidden).length,
  pinnedCount: TASKS.filter(t => t.pinned).length,
  cloud: db?.ready ? 'online' : 'offline',
  user: db?.user?.email || 'guest'
})
```

### 1.2 Список задач текущего проекта по статусам

```js
TASKS.reduce((acc, t) => {
  const k = STATUSES[t.s]?.l || '?';
  acc[k] = (acc[k] || 0) + 1;
  return acc;
}, {})
```

### 1.3 Realtime каналы

```js
db?.supabase?.getChannels().map(c => ({topic: c.topic, state: c.state}))
```

---

## 2. Сидинг тестовых данных

### 2.1 Создать задачу с дедлайном и ссылками

```js
(() => {
  const id = 'qa_' + Math.floor(performance.now());
  TASKS.push({
    id, n: 'QA-1', title: 'QA test task',
    s: 5, w: weekKey(new Date()),
    deadline: '2026-06-20',
    links: [
      {id:'l1', url:'https://docs.google.com/spreadsheets/d/x/edit', title:'Test sheet'},
      {id:'l2', url:'https://drive.google.com/file/d/y/view', title:'Test file'}
    ],
    chat: [{id:'c1', uid:'sys', text:'Seeded', at: Date.now()}]
  });
  render();
  return id;
})()
```

### 2.2 Залить N задач для стресс-теста

```js
(() => {
  const N = 500;
  const wk = weekKey(new Date());
  for (let i = 0; i < N; i++) {
    TASKS.push({id: 'stress_'+i, n: 'S-'+i, title: 'Stress task '+i, s: i % 8, w: wk});
  }
  render();
  return N;
})()
```

### 2.3 Сбросить локальный стейт (LocalStorage + памяти)

```js
(() => {
  Object.keys(localStorage)
    .filter(k => k.startsWith('eb_'))
    .forEach(k => localStorage.removeItem(k));
  location.reload();
})()
```

---

## 3. Симуляция

### 3.1 Принудительный offline (без выключения wifi)

```js
db._forceOffline = true;
db.ready = false;
console.log('Forced offline');
```

Вернуть онлайн — `location.reload()`.

### 3.2 Тёмная тема — переключить программно

```js
document.body.classList.toggle('dark-mode');
```

### 3.3 Подменить роль текущего юзера (для UI-проверок RBAC)

```js
db.role = 'viewer'; // или 'editor', 'admin', 'owner'
render();
```

Будут скрыты Capture / Archive / Delete в зависимости от роли.

### 3.4 Эмуляция чужого presence в Present

```js
(() => {
  const fake = {
    presence_ref: 'fake_1',
    user: {id:'u_fake', name:'Test User', color:'#a855f7'}
  };
  // присоединяем фейкового юзера в Presence UI
  if (typeof updatePresenceUi === 'function') {
    updatePresenceUi([fake]);
  }
})()
```

---

## 4. Проверка фиксов v0.1.158

### 4.1 P0-1: D в редакторе не активирует Dimension

```js
// в редакторе аннотаций:
'KMAP has d?' + ('d' in KMAP)  // должно быть 'KMAP has d?false'
```

### 4.2 P0-2: deadline chip в Present

```js
TASKS[0].deadline = '2026-06-20'; openPresent(TASKS[0].id);
document.querySelector('#presCard .pres-head .card-deadline')?.textContent.trim()
// должно вернуть "20 Jun"
```

### 4.3 P0-3: _applyDeadline патчит Present

```js
_applyDeadline(presentTask, '2026-07-01');
document.querySelector('#presCard .pres-head .card-deadline')?.textContent.trim()
// должно стать "1 Jul" без перерисовки модалки
```

### 4.4 archive aria-pressed

```js
[...document.querySelectorAll('.card-archive')].map(b => b.getAttribute('aria-pressed'))
// все должны быть "true" или "false", не null
```

### 4.5 row.archived opacity = 1

```js
const r = document.querySelector('.row.archived');
r && getComputedStyle(r).opacity
// должно быть "1"
```

---

## 5. Сбор diagnostic для багрепорта

Запустить, скопировать вывод в issue:

```js
(() => ({
  version: document.querySelector('meta[name="version"]')?.content || 'unknown',
  url: location.href,
  userAgent: navigator.userAgent,
  online: navigator.onLine,
  localStorageBytes: JSON.stringify(localStorage).length,
  tasks: TASKS.length,
  errors: '(см. вкладку Console красным цветом и приложить скрин)'
}))()
```

---

## 6. Когда DevTools нет (прод-сборка)

В прод-сборке Tauri DevTools выключены. Альтернативы:

1. Открыть тот же `dist/index.html` через `python3 -m http.server 7788 --directory dist` и тестировать в Chrome — поведение в Web и в WKWebView/WebView2 различается только по нативным фичам (tray, capture).
2. Включить feature-флаг через query-string: `?debug=1` (если реализовано — TBD).
3. Логи Tauri-стороны: `~/Library/Logs/com.engiboard.desktop/` (macOS) или `%APPDATA%/com.engiboard.desktop/logs/` (Windows).
