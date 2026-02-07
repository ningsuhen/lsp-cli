import type { Command } from '@commander-js/extra-typings';
import { runCommand } from '../client.js';
import { assertConfigFileOptions } from '../type-guards.js';

export function registerReferencesCommand(program: Command) {
  program
    .command('references')
    .description('Find all references to a symbol')
    .argument('<file>', 'file path')
    .argument('<line>', 'line number (1-based)')
    .argument('<column>', 'column number (1-based)')
    .option('--include-declaration', 'Include declaration in results')
    .action(async (file: string, line: string, column: string, options, command) => {
      const opts = command.optsWithGlobals();
      assertConfigFileOptions(opts);
      const args = [file, line, column];
      if (options.includeDeclaration) args.push('--include-declaration');
      await runCommand('references', args, opts.configFile);
    });
}
