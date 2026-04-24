/**
 * Launches Electron with ELECTRON_RUN_AS_NODE removed from the environment.
 * This is needed when running from tools that set ELECTRON_RUN_AS_NODE=1
 * (e.g. Claude Code, VS Code), which would otherwise cause require('electron')
 * to return a path string instead of the main-process API.
 */
const { spawn } = require('child_process')
const electronPath = require('electron')

const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE
if (!env.NODE_ENV) env.NODE_ENV = 'development'

const child = spawn(electronPath, ['.'], { stdio: 'inherit', env })
child.on('close', (code) => process.exit(code || 0))
