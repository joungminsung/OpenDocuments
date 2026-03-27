#!/usr/bin/env node
import { Command } from 'commander'
import { startCommand } from './commands/start.js'
import { askCommand } from './commands/ask.js'
import { indexCommand } from './commands/index-cmd.js'
import { doctorCommand } from './commands/doctor.js'
import { configCommand } from './commands/config-cmd.js'
import { initCommand } from './commands/init.js'
import { connectorCommand } from './commands/connector.js'
import { authCommand } from './commands/auth.js'
import { pluginCommand } from './commands/plugin.js'
import { exportCommand } from './commands/export-cmd.js'
import { importCommand } from './commands/import-cmd.js'
import { documentCommand } from './commands/document.js'
import { workspaceCommand } from './commands/workspace.js'

const program = new Command()
program
  .name('opendocs')
  .description('OpenDocs - Self-hosted RAG platform for organizational documents')
  .version('0.1.0')

program.addCommand(startCommand())
program.addCommand(askCommand())
program.addCommand(indexCommand())
program.addCommand(doctorCommand())
program.addCommand(configCommand())
program.addCommand(initCommand())
program.addCommand(connectorCommand())
program.addCommand(authCommand())
program.addCommand(pluginCommand())
program.addCommand(exportCommand())
program.addCommand(importCommand())
program.addCommand(documentCommand())
program.addCommand(workspaceCommand())

program.parse()
