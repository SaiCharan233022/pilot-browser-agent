/**
 * Pilot Unified Document Intelligence Engine
 * Parses, extracts, and summarizes structured text from PDF, CSV, TSV, JSON, Markdown, and text files.
 */

import { promises as fs } from 'fs';
import { resolve, extname, basename, isAbsolute } from 'path';
import { extractPdfText } from './pdfExtractor.js';
import { resolveDirectory } from './fileExplorer.js';

/**
 * Format bytes to readable string.
 */
function formatBytes(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

/**
 * Parse CSV or TSV text into Markdown table and statistics.
 */
function parseDelimitedText(raw, delimiter = ',') {
  const lines = raw.split(/\r?\n/).filter(l => l.trim().length > 0);
  if (lines.length === 0) return { rowCount: 0, preview: 'Empty data file.' };

  const parseRow = (line) => {
    const cells = [];
    let inQuotes = false;
    let current = '';
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === delimiter && !inQuotes) {
        cells.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    cells.push(current.trim());
    return cells;
  };

  const headers = parseRow(lines[0]);
  const rows = lines.slice(1, 16).map(parseRow); // Preview first 15 rows

  let mdTable = '| ' + headers.join(' | ') + ' |\n';
  mdTable += '| ' + headers.map(() => '---').join(' | ') + ' |\n';
  rows.forEach(r => {
    mdTable += '| ' + r.map(c => c.slice(0, 40)).join(' | ') + ' |\n';
  });

  return {
    headers,
    totalRows: lines.length - 1,
    previewRows: rows.length,
    table: mdTable,
  };
}

/**
 * Parse any document file into structured text and summaries.
 * @param {string} filePath - Path to the document
 * @param {Object} options - { maxLines, baseDirQuery }
 */
export async function parseDocument(filePath, options = {}) {
  try {
    let resolvedPath = filePath;
    if (!isAbsolute(filePath)) {
      const baseDir = resolveDirectory(options.baseDirQuery || 'project');
      resolvedPath = resolve(baseDir, filePath);
    }

    const stat = await fs.stat(resolvedPath);
    const ext = extname(resolvedPath).toLowerCase();
    const fileName = basename(resolvedPath);

    // 1. PDF Document
    if (ext === '.pdf') {
      const pdfRes = await extractPdfText(resolvedPath, options.maxChars || 8000);
      if (pdfRes.success) {
        return {
          success: true,
          type: 'pdf',
          path: resolvedPath,
          name: fileName,
          size: formatBytes(stat.size),
          charCount: pdfRes.charCount,
          content: pdfRes.content,
          summary: `Extracted PDF "${fileName}" (${formatBytes(stat.size)}, ${pdfRes.charCount} chars).`,
        };
      }
      return pdfRes;
    }

    // 2. CSV / TSV Spreadsheets
    if (ext === '.csv' || ext === '.tsv') {
      const raw = await fs.readFile(resolvedPath, 'utf8');
      const delimiter = ext === '.tsv' ? '\t' : ',';
      const parsed = parseDelimitedText(raw, delimiter);
      return {
        success: true,
        type: 'spreadsheet',
        path: resolvedPath,
        name: fileName,
        size: formatBytes(stat.size),
        totalRows: parsed.totalRows,
        headers: parsed.headers,
        content: `📊 **${fileName}** (${parsed.totalRows} rows, ${parsed.headers.length} columns):\n\n${parsed.table}${parsed.totalRows > 15 ? `\n*... and ${parsed.totalRows - 15} more rows.*` : ''}`,
      };
    }

    // 3. JSON Data
    if (ext === '.json') {
      const raw = await fs.readFile(resolvedPath, 'utf8');
      let parsedJson;
      try {
        parsedJson = JSON.parse(raw);
      } catch {
        parsedJson = null;
      }

      if (parsedJson) {
        const isArray = Array.isArray(parsedJson);
        const count = isArray ? parsedJson.length : Object.keys(parsedJson).length;
        const formatted = JSON.stringify(parsedJson, null, 2);
        const lines = formatted.split('\n');
        const preview = lines.slice(0, 60).join('\n');
        return {
          success: true,
          type: 'json',
          path: resolvedPath,
          name: fileName,
          size: formatBytes(stat.size),
          itemCount: count,
          content: `🗂️ **JSON Document:** ${fileName} (${count} ${isArray ? 'items' : 'keys'}):\n\n\`\`\`json\n${preview}${lines.length > 60 ? '\n// ... truncated' : ''}\n\`\`\``,
        };
      }
    }

    // 4. Plain text, Markdown, Logs, Code
    const raw = await fs.readFile(resolvedPath, 'utf8');
    const lines = raw.split('\n');
    const maxLines = options.maxLines || 150;
    const preview = lines.slice(0, maxLines).join('\n');

    return {
      success: true,
      type: 'text',
      path: resolvedPath,
      name: fileName,
      size: formatBytes(stat.size),
      totalLines: lines.length,
      content: `📄 **${fileName}** (${lines.length} lines, ${formatBytes(stat.size)}):\n\n\`\`\`${ext.replace('.', '')}\n${preview}${lines.length > maxLines ? '\n... (truncated)' : ''}\n\`\`\``,
    };
  } catch (err) {
    return {
      success: false,
      path: filePath,
      error: `Could not parse document: ${err.message}`,
    };
  }
}
