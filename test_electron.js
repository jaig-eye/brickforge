const e = require('electron')
console.log('type:', typeof e)
if (typeof e === 'object' && e !== null) {
  console.log('app type:', typeof e.app)
  console.log('BrowserWindow type:', typeof e.BrowserWindow)
  console.log('ipcMain type:', typeof e.ipcMain)
} else {
  console.log('NOT an object, value:', String(e).substring(0, 80))
}
process.exit(0)
