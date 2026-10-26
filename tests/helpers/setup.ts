// electron-log writes into userData; keep test output quiet and files in the temp folder.
// The app's logger module sets its own levels when first imported, so load it
// here first and silence it afterwards (later imports reuse this instance).
import log from 'electron-log'
import '../../electron/main/logger'
import './offline'

log.transports.console.level = false
log.transports.file.level = false
