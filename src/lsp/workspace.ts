import path from 'path';
import type { WorkspaceEdit, TextEdit, Range, Location } from './types.js';
import { log } from '../logger.js';
import { urlToFilePath } from '../utils.js';

/**
 * Applies a WorkspaceEdit to the filesystem
 * Handles both 'changes' (legacy) and 'documentChanges' (new format)
 */
export async function applyWorkspaceEdit(
  edit: WorkspaceEdit,
  dryRun: boolean = false
): Promise<{ file: string; changes: number }[]> {
  const results: { file: string; changes: number }[] = [];

  // Handle documentChanges (new format - preferred)
  if (edit.documentChanges) {
    for (const change of edit.documentChanges) {
      if ('kind' in change) {
        // File operation: create, rename, delete
        await applyFileOperation(change, dryRun);
      } else {
        // TextDocumentEdit
        const filePath = urlToFilePath(change.textDocument.uri);
        const applied = await applyTextEdits(filePath, change.edits as TextEdit[], dryRun);
        results.push({ file: path.relative(process.cwd(), filePath), changes: applied });
      }
    }
  }
  // Handle legacy 'changes' format
  else if (edit.changes) {
    for (const [uri, edits] of Object.entries(edit.changes)) {
      const filePath = urlToFilePath(uri);
      const applied = await applyTextEdits(filePath, edits as TextEdit[], dryRun);
      results.push({ file: path.relative(process.cwd(), filePath), changes: applied });
    }
  }

  return results;
}

/**
 * Applies file operations (create, rename, delete)
 */
async function applyFileOperation(
  operation: { kind: 'create' | 'rename' | 'delete'; uri?: string; oldUri?: string; newUri?: string },
  dryRun: boolean
): Promise<void> {
  // LSP file operations use different property names:
  // CreateFile: { kind: 'create', uri: string }
  // RenameFile: { kind: 'rename', oldUri: string, newUri: string }
  // DeleteFile: { kind: 'delete', uri: string }

  switch (operation.kind) {
    case 'create': {
      if (!operation.uri) throw new Error('CreateFile missing uri');
      const filePath = urlToFilePath(operation.uri);
      log(`${dryRun ? '[DRY RUN] ' : ''}Create file: ${filePath}`);
      if (!dryRun) {
        await Bun.write(filePath, '');
      }
      break;
    }
    case 'delete': {
      if (!operation.uri) throw new Error('DeleteFile missing uri');
      const filePath = urlToFilePath(operation.uri);
      log(`${dryRun ? '[DRY RUN] ' : ''}Delete file: ${filePath}`);
      if (!dryRun) {
        await Bun.file(filePath).delete();
      }
      break;
    }
    case 'rename': {
      if (!operation.oldUri || !operation.newUri) {
        throw new Error('RenameFile missing oldUri or newUri');
      }
      const oldPath = urlToFilePath(operation.oldUri);
      const newPath = urlToFilePath(operation.newUri);
      log(`${dryRun ? '[DRY RUN] ' : ''}Rename file: ${oldPath} -> ${newPath}`);
      if (!dryRun) {
        // Bun doesn't have rename, use Node API
        const { rename } = await import('node:fs/promises');
        await rename(oldPath, newPath);
      }
      break;
    }
  }
}

/**
 * Applies TextEdits to a file
 * IMPORTANT: Edits must be applied in reverse order (bottom to top)
 * to preserve line positions
 */
async function applyTextEdits(
  filePath: string,
  edits: TextEdit[],
  dryRun: boolean
): Promise<number> {
  if (edits.length === 0) return 0;

  log(`${dryRun ? '[DRY RUN] ' : ''}Applying ${edits.length} edits to ${filePath}`);

  // Sort edits in reverse order (by line, then character)
  // This ensures we apply from bottom to top so positions remain valid
  const sortedEdits = [...edits].sort((a, b) => {
    const lineDiff = b.range.start.line - a.range.start.line;
    if (lineDiff !== 0) return lineDiff;
    return b.range.start.character - a.range.start.character;
  });

  if (dryRun) {
    // In dry run, just print what would change
    for (const edit of sortedEdits.reverse()) {
      const startLine = edit.range.start.line + 1;
      const startChar = edit.range.start.character;
      const endLine = edit.range.end.line + 1;
      const endChar = edit.range.end.character;
      log(`  [DRY RUN] ${startLine}:${startChar}-${endLine}:${endChar}: "${edit.newText}"`);
    }
    return edits.length;
  }

  // Read file content
  const file = Bun.file(filePath);
  const content = await file.text();
  const lines = content.split('\n');

  // Apply each edit
  for (const edit of sortedEdits) {
    const { start, end } = edit.range;

    if (start.line === end.line) {
      // Single line edit
      const line = lines[start.line];
      const before = line.substring(0, start.character);
      const after = line.substring(end.character);
      lines[start.line] = before + edit.newText + after;
    } else {
      // Multi-line edit
      const startLine = lines[start.line];
      const endLine = lines[end.line];
      const beforeStart = startLine.substring(0, start.character);
      const afterEnd = endLine.substring(end.character);

      // Replace with new text
      const newLines = (beforeStart + edit.newText + afterEnd).split('\n');

      // Remove old lines and insert new ones
      lines.splice(start.line, end.line - start.line + 1, ...newLines);
    }
  }

  // Write back
  await Bun.write(filePath, lines.join('\n'));

  return edits.length;
}

/**
 * Formats a WorkspaceEdit for display (dry run output)
 */
export function formatWorkspaceEdit(edit: WorkspaceEdit): string {
  const lines: string[] = [];

  if (edit.documentChanges) {
    for (const change of edit.documentChanges) {
      if ('kind' in change) {
        // File operations: create, rename, delete
        if (change.kind === 'create' && 'uri' in change) {
          lines.push(`Create: ${urlToFilePath(change.uri as string)}`);
        } else if (change.kind === 'delete' && 'uri' in change) {
          lines.push(`Delete: ${urlToFilePath(change.uri as string)}`);
        } else if (change.kind === 'rename' && 'oldUri' in change && 'newUri' in change) {
          lines.push(`Rename: ${urlToFilePath(change.oldUri as string)} -> ${urlToFilePath(change.newUri as string)}`);
        }
      } else {
        const filePath = urlToFilePath(change.textDocument.uri);
        lines.push(`Edit ${filePath}:`);
        for (const textEdit of change.edits as TextEdit[]) {
          const start = textEdit.range.start;
          const end = textEdit.range.end;
          lines.push(`  ${start.line + 1}:${start.character}-${end.line + 1}:${end.character}: "${textEdit.newText}"`);
        }
      }
    }
  } else if (edit.changes) {
    for (const [uri, edits] of Object.entries(edit.changes)) {
      const filePath = urlToFilePath(uri);
      lines.push(`Edit ${filePath}:`);
      for (const textEdit of edits as TextEdit[]) {
        const start = textEdit.range.start;
        const end = textEdit.range.end;
        lines.push(`  ${start.line + 1}:${start.character}-${end.line + 1}:${end.character}: "${textEdit.newText}"`);
      }
    }
  }

  return lines.join('\n');
}
