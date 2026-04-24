console.log('process.type:', process.type)
const e = require('electron')
console.log('e type:', typeof e)
console.log('e.app type:', typeof e?.app)
console.log('process.versions.electron:', process.versions.electron)
// Try the app module directly
try {
  const { app } = require('electron')
  console.log('app type:', typeof app)
  console.log('app.whenReady type:', typeof app?.whenReady)
} catch(err) {
  console.error('error:', err.message)
}
process.exit(0)
