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

program.parse()
