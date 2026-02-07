import type { Command } from '@commander-js/extra-typings';
import { runCommand } from '../client.js';
import { assertConfigFileOptions } from '../type-guards.js';

export function registerDefinitionCommand(program: Command) {
  program
    .command('definition')
    .description('Get definition location for a symbol in specific file')
    .argument('<file>', 'file path')
    .argument('<symbol>', 'symbol name')
    .action(async (file: string, symbol: string, _options, command) => {
      const opts = command.optsWithGlobals();
      assertConfigFileOptions(opts);
      await runCommand('definition', [file, symbol], opts.configFile);
    });
}
