console.log('1 process.type:', process.type)
// Check after a tick
setImmediate(() => {
  console.log('2 process.type (after setImmediate):', process.type)
  const e = require('electron')
  console.log('3 electron type:', typeof e)
  console.log('4 e.app type:', typeof e?.app)
  process.exit(0)
})
