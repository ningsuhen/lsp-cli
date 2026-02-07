import type { Command } from '@commander-js/extra-typings';
import { runCommand } from '../client.js';
import { assertConfigFileOptions } from '../type-guards.js';

export function registerRenameCommand(program: Command) {
  program
    .command('rename')
    .description('Rename a symbol across the workspace')
    .argument('<file>', 'file path')
    .argument('<line>', 'line number (1-based)')
    .argument('<column>', 'column number (1-based)')
    .argument('<newName>', 'new symbol name')
    .option('--dry-run', 'Preview changes without applying')
    .action(async (file: string, line: string, column: string, newName: string, options, command) => {
      const opts = command.optsWithGlobals();
      assertConfigFileOptions(opts);
      const args = [file, line, column, newName];
      if (options.dryRun) args.push('--dry-run');
      await runCommand('rename', args, opts.configFile);
    });
}
