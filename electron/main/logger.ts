import log from 'electron-log'
import path from 'path'
import { app } from 'electron'

log.transports.file.resolvePathFn = () =>
  path.join(app.getPath('userData'), 'logs', 'brickforge.log')
log.transports.file.level = 'info'
log.transports.console.level = process.env.NODE_ENV === 'development' ? 'debug' : 'warn'

export default log
