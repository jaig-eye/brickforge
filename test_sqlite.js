try {
  const bs3 = require('./node_modules/better-sqlite3')
  console.log('better-sqlite3 load: OK')
} catch(e) {
  console.log('better-sqlite3 error:', e.message)
}
try {
  const e2 = require('electron')
  console.log('electron type:', typeof e2)
  if (e2 && e2.app) {
    e2.app.whenReady().then(() => { console.log('app ready'); e2.app.quit() })
  }
} catch(e) {
  console.log('electron error:', e.message)
}
