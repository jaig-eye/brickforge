/**
 * Where BrickForge keeps its data. The main entry imports this module FIRST,
 * so the override is in place before anything resolves the userData folder.
 *
 *  - BRICKFORGE_USER_DATA: an explicit folder (tests, screenshots, portable use)
 *  - --demo: the sample collection lives in its own folder, never in yours
 */
import { app } from 'electron'
import path from 'path'

export const isDemo = process.argv.includes('--demo') || process.env.BRICKFORGE_DEMO === '1'

const override = process.env.BRICKFORGE_USER_DATA
if (override) app.setPath('userData', path.resolve(override))
else if (isDemo) app.setPath('userData', path.join(app.getPath('appData'), 'brickforge-demo'))
