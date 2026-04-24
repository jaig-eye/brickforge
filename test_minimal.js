// Minimal test - does require("electron") work at app entry point?
const e = require('electron')
console.log('typeof e:', typeof e)
console.log('has app?', 'app' in Object(e))
const { app } = e || {}
if (app) {
  app.on('ready', () => {
    console.log('app is ready!')
    app.quit()
  })
} else {
  console.log('app is undefined, e is:', typeof e === 'string' ? e.substring(0, 60) : e)
}
