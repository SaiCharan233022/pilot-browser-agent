/**
 * Pilot PDF Document & Text Extraction Engine
 * Parses PDF documents safely to extract text, sections, and metadata.
 */

import { promises as fs } from 'fs';
import { join, resolve, isAbsolute, basename } from 'path';

/**
 * Extract readable text from a PDF file.
 */
export async function extractPdfText(filePath, maxPages = 20) {
  try {
    let targetPath = filePath;
    if (!isAbsolute(filePath)) {
      targetPath = resolve(process.cwd(), filePath);
    }

    const buffer = await fs.readFile(targetPath);
    if (!buffer || buffer.length === 0) {
      return { success: false, error: 'File is empty.' };
    }

    // Fast robust text stream extraction from PDF binary buffer
    const raw = buffer.toString('binary');
    const textChunks = [];
    const streamRegex = /stream[\r\n]+([\s\S]*?)[\r\n]+endstream/g;
    let match;

    while ((match = streamRegex.exec(raw)) !== null) {
      const streamContent = match[1];
      // Extract string literals inside parentheses: (Text) Tj or [(Text)...] TJ
      const tjMatches = streamContent.match(/\(([^)]+)\)\s*Tj/g);
      if (tjMatches) {
        for (const tj of tjMatches) {
          const text = tj.replace(/^\(/, '').replace(/\)\s*Tj$/, '').trim();
          if (text.length > 0) {
            textChunks.push(text);
          }
        }
      }
    }

    let extractedText = textChunks.join(' ');
    if (!extractedText || extractedText.length < 20) {
      // Fallback ASCII extraction for clean strings
      const asciiStrings = raw.match(/[\x20-\x7E]{4,}/g) || [];
      const filtered = asciiStrings.filter(s => !s.startsWith('/') && !s.includes('obj') && !s.includes('endobj'));
      extractedText = filtered.slice(0, 300).join('\n');
    }

    return {
      success: true,
      path: targetPath,
      name: basename(targetPath),
      size: (buffer.length / 1024).toFixed(1) + ' KB',
      charCount: extractedText.length,
      content: extractedText.slice(0, 5000) || '(No legible text streams detected in PDF)',
    };
  } catch (err) {
    return { success: false, error: `Failed to extract PDF: ${err.message}` };
  }
}
