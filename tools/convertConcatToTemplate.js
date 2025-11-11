#!/usr/bin/env node
import { mkdirSync, existsSync, copyFileSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { glob } from 'glob';

const APPLY = process.argv.includes('--apply');
const PROJECT_ROOT = process.cwd();
const LOG_DIR = path.join(PROJECT_ROOT, 'logs');
const LOG_FILE = path.join(LOG_DIR, 'concat_migration.log');

function ensureLogFile() {
  if (!existsSync(LOG_DIR)) {
    mkdirSync(LOG_DIR, { recursive: true });
  }
  if (!existsSync(LOG_FILE)) {
    writeFileSync(LOG_FILE, '', 'utf8');
  }
}

function appendLog(message) {
  writeFileSync(LOG_FILE, `${message}\n`, { encoding: 'utf8', flag: 'a' });
}

function escapeTemplateText(text) {
  return text.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${');
}

function parseStringLiteral(content, index) {
  const quote = content[index];
  if (quote !== '"' && quote !== '\'' && quote !== '`') {
    return null;
  }
  let i = index + 1;
  let text = '';
  let raw = quote;
  let escape = false;
  while (i < content.length) {
    const ch = content[i];
    raw += ch;
    if (escape) {
      switch (ch) {
        case 'n':
          text += '\n';
          break;
        case 'r':
          text += '\r';
          break;
        case 't':
          text += '\t';
          break;
        case '\\':
          text += '\\';
          break;
        case '\'':
          text += '\'';
          break;
        case '"':
          text += '"';
          break;
        case '`':
          text += '`';
          break;
        default:
          text += ch;
          break;
      }
      escape = false;
    } else if (ch === '\\') {
      escape = true;
    } else if (ch === quote) {
      return { text, raw, end: i + 1, quote };
    } else {
      text += ch;
    }
    i += 1;
  }
  return null;
}

function skipWhitespace(str, index) {
  let i = index;
  while (i < str.length && /\s/.test(str[i])) {
    i += 1;
  }
  return i;
}

function parseExpression(content, index) {
  let i = skipWhitespace(content, index);
  const start = i;
  let depthParen = 0;
  let depthBracket = 0;
  let depthBrace = 0;
  let inString = null;
  let escape = false;
  let inTemplate = false;
  let templateBraceDepth = 0;

  while (i < content.length) {
    const ch = content[i];
    if (inString) {
      if (escape) {
        escape = false;
      } else if (ch === '\\') {
        escape = true;
      } else if (ch === inString) {
        inString = null;
      }
      i += 1;
      continue;
    }

    if (inTemplate) {
      if (escape) {
        escape = false;
      } else if (ch === '\\') {
        escape = true;
      } else if (ch === '`' && templateBraceDepth === 0) {
        inTemplate = false;
      } else if (ch === '{') {
        templateBraceDepth += 1;
      } else if (ch === '}') {
        templateBraceDepth = Math.max(0, templateBraceDepth - 1);
      }
      i += 1;
      continue;
    }

    if (ch === '\'' || ch === '"') {
      inString = ch;
      i += 1;
      continue;
    }
    if (ch === '`') {
      inTemplate = true;
      templateBraceDepth = 0;
      i += 1;
      continue;
    }

    switch (ch) {
      case '(':
        depthParen += 1;
        break;
      case ')':
        if (depthParen > 0) {
          depthParen -= 1;
        } else {
          return { expression: content.slice(start, i).trim(), end: i };
        }
        break;
      case '[':
        depthBracket += 1;
        break;
      case ']':
        if (depthBracket > 0) {
          depthBracket -= 1;
        } else {
          return { expression: content.slice(start, i).trim(), end: i };
        }
        break;
      case '{':
        depthBrace += 1;
        break;
      case '}':
        if (depthBrace > 0) {
          depthBrace -= 1;
        } else {
          return { expression: content.slice(start, i).trim(), end: i };
        }
        break;
      case '+':
        if (depthParen === 0 && depthBracket === 0 && depthBrace === 0) {
          return { expression: content.slice(start, i).trim(), end: i };
        }
        break;
      case ';':
      case ',':
        if (depthParen === 0 && depthBracket === 0 && depthBrace === 0) {
          return { expression: content.slice(start, i).trim(), end: i };
        }
        break;
      default:
        break;
    }
    i += 1;
  }

  return { expression: content.slice(start).trim(), end: content.length };
}

function convertConcatenations(content) {
  let result = '';
  let index = 0;
  let mutated = false;

  while (index < content.length) {
    const ch = content[index];
    if (ch === '\'' || ch === '"') {
      const stringInfo = parseStringLiteral(content, index);
      if (!stringInfo) {
        result += ch;
        index += 1;
        continue;
      }
      let pointer = skipWhitespace(content, stringInfo.end);
      const tokens = [{ type: 'string', value: stringInfo.text }];
      let endIndex = stringInfo.end;
      let success = false;

      while (pointer < content.length && content[pointer] === '+') {
        pointer += 1;
        pointer = skipWhitespace(content, pointer);
        if (pointer >= content.length) {
          success = false;
          break;
        }

        if (content[pointer] === '\'' || content[pointer] === '"' || content[pointer] === '`') {
          const nextString = parseStringLiteral(content, pointer);
          if (!nextString) {
            success = false;
            break;
          }
          tokens.push({ type: 'string', value: nextString.text });
          pointer = skipWhitespace(content, nextString.end);
          endIndex = nextString.end;
          success = true;
          continue;
        }

        const exprInfo = parseExpression(content, pointer);
        if (!exprInfo || !exprInfo.expression) {
          success = false;
          break;
        }
        tokens.push({ type: 'expr', value: exprInfo.expression });
        pointer = skipWhitespace(content, exprInfo.end);
        endIndex = exprInfo.end;
        success = true;
      }

      const hasExpression = tokens.some((token) => token.type === 'expr');
      if (success && hasExpression) {
        let template = '`';
        for (const token of tokens) {
          if (token.type === 'string') {
            template += escapeTemplateText(token.value);
          } else {
            template += '${' + token.value.trim() + '}';
          }
        }
        template += '`';
        result += template;
        index = endIndex;
        mutated = true;
        continue;
      }

      result += stringInfo.raw;
      index = stringInfo.end;
      continue;
    }

    result += ch;
    index += 1;
  }

  return { text: result, mutated };
}

async function processFile(filePath) {
  const absolutePath = path.join(PROJECT_ROOT, filePath);
  const original = await readFile(absolutePath, 'utf8');
  const { text: transformed, mutated } = convertConcatenations(original);
  if (!mutated) {
    return { mutated: false };
  }
  if (APPLY) {
    copyFileSync(absolutePath, `${absolutePath}.bak`);
    writeFileSync(absolutePath, transformed, 'utf8');
  }
  appendLog(`UPDATED: ${filePath}`);
  return { mutated: true };
}

async function main() {
  ensureLogFile();
  const files = await glob('src/**/*.{js,ts,tsx}', { cwd: PROJECT_ROOT, nodir: true, dot: false });
  let scanned = 0;
  let replacements = 0;

  for (const file of files) {
    scanned += 1;
    const result = await processFile(file);
    if (result.mutated) {
      replacements += 1;
    }
  }

  console.log(`✅ Files scanned: ${scanned}`);
  console.log(`✅ Replacements made: ${replacements}`);
  console.log(`🧾 Detailed log: ${LOG_FILE}`);
}

main().catch((error) => {
  console.error('Failed to convert concatenations:', error);
  process.exitCode = 1;
});
