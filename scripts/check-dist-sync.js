#!/usr/bin/env node
// scripts/check-dist-sync.js
//
// dist/ — это то, что реально собирается в десктоп-приложение:
// tauri.conf.json указывает frontendDist: "../dist", а CI (.github/workflows/
// build.yml) запускает `cargo tauri build` напрямую, БЕЗ `npm run sync-dist`.
// Корневые *.html — рабочие копии, которые синхронизируются вручную.
//
// Из-за этого файлы разъезжаются молча и в обе стороны:
//  • правка корневого файла не попадает в релиз, пока кто-то не синкнет;
//  • `npm run build` (prebuild → sync-dist) копирует корень поверх dist и
//    откатывает всё, что правилось только в dist.
// Ровно так и случилось: sniper.html в dist жил на v0.1.174 (2026-06-29),
// а корневой — на v0.1.81 (2026-05-19), и любой локальный `npm run build`
// отбрасывал оверлей захвата на шесть недель назад.
//
// Этот скрипт валит сборку при расхождении. Чинится одной командой:
//   npm run sync-dist     — если свежий корень
//   cp dist/<f> <f>       — если свежий dist

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const FILES = ['index.html', 'editor.html', 'sniper.html', 'task.html'];

let bad = 0;
for (const f of FILES) {
  const a = path.join(ROOT, f);
  const b = path.join(ROOT, 'dist', f);
  if (!fs.existsSync(a) || !fs.existsSync(b)) {
    console.error(`✗ ${f}: отсутствует (root=${fs.existsSync(a)}, dist=${fs.existsSync(b)})`);
    bad++;
    continue;
  }
  if (fs.readFileSync(a).equals(fs.readFileSync(b))) {
    console.log(`✓ ${f}`);
  } else {
    const ma = fs.statSync(a).mtime, mb = fs.statSync(b).mtime;
    console.error(`✗ ${f}: root и dist разошлись (свежее: ${ma > mb ? 'root' : 'dist'})`);
    bad++;
  }
}

if (bad) {
  console.error(`\n${bad} файл(ов) разошлись. dist/ — источник правды для релиза.`);
  console.error('Свежий корень → `npm run sync-dist`; свежий dist → `cp dist/<файл> <файл>`.');
  process.exit(1);
}
console.log('\ndist синхронизирован с корнем.');
