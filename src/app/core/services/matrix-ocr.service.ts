import { Injectable } from '@angular/core';
import { LatexMathParserService } from './latex-math-parser.service';

export interface SmartExtractionResult {
  detectedType: 'equations' | 'matrix';
  matrix: number[][];
  variableNames: string[];
  equationsText: string;
  rawCleanedText: string;
  confidence: number;
}

export class OcrExtractionError extends Error {
  constructor(message: string, public readonly rawText: string = '') {
    super(message);
    this.name = 'OcrExtractionError';
  }
}

@Injectable({
  providedIn: 'root'
})
export class MatrixOcrService {
  private texifyPipeline: any = null;

  constructor(private latexParser: LatexMathParserService) {}

  async extractFromSource(
    source: File | HTMLCanvasElement,
    onProgress?: (percent: number, stage: string) => void
  ): Promise<SmartExtractionResult> {
    if (!source) {
      throw new OcrExtractionError('No image or file provided for extraction.');
    }

    if (source instanceof HTMLCanvasElement) {
      return this.extractWithNeuralLatex(source, onProgress);
    }

    const fileType = source.type.toLowerCase();
    const fileName = source.name.toLowerCase();

    if (fileType === 'application/pdf' || fileName.endsWith('.pdf')) {
      return this.extractFromPdf(source, onProgress);
    }

    if (fileType.startsWith('image/') || /\.(png|jpe?g|webp|bmp|gif)$/i.test(fileName)) {
      return this.extractWithNeuralLatex(source, onProgress);
    }

    if (fileType.startsWith('text/') || /\.(txt|csv)$/i.test(fileName)) {
      onProgress?.(45, 'Reading text file...');
      const rawText = await source.text();
      onProgress?.(90, 'Parsing mathematical structure...');
      const res = this.parseExtractedMathText(rawText, 99);
      onProgress?.(100, 'Extraction complete!');
      return res;
    }

    throw new OcrExtractionError(
      'Unsupported file format. Please upload an Image (PNG/JPG/WebP), PDF, or TXT/CSV file.'
    );
  }

  private async extractWithNeuralLatex(
    source: File | Blob | HTMLCanvasElement,
    onProgress?: (percent: number, stage: string) => void
  ): Promise<SmartExtractionResult> {
    onProgress?.(10, 'Optimizing image lighting & borders...');
    const normalizedDataUrl = await this.prepareImageForNeuralVision(source);

    if (!this.texifyPipeline) {
      onProgress?.(20, 'Loading Neural Math AI model (cached locally after first run)...');
      const { pipeline, env } = await import('@huggingface/transformers');
      env.allowLocalModels = false;

      this.texifyPipeline = await pipeline('image-to-text', 'Xenova/texify', {
        progress_callback: (info: any) => {
          if (info?.status === 'progress' && typeof info.progress === 'number') {
            const pct = Math.min(82, Math.round(22 + info.progress * 0.6));
            onProgress?.(pct, `Downloading Math AI weights (${Math.round(info.progress)}%)...`);
          }
        }
      });
    }

    onProgress?.(85, 'Neural AI analyzing equations & matrix structure...');
    const output = await this.texifyPipeline(normalizedDataUrl, { max_new_tokens: 512 });
    const generatedLatex: string = Array.isArray(output)
      ? output[0]?.generated_text || ''
      : output?.generated_text || '';

    onProgress?.(95, 'Structuring matrix coefficients & variables...');
    const result = this.parseExtractedMathText(generatedLatex, 97);
    onProgress?.(100, 'Extraction complete!');
    return result;
  }

  private async extractFromPdf(
    file: File,
    onProgress?: (percent: number, stage: string) => void
  ): Promise<SmartExtractionResult> {
    onProgress?.(15, 'Opening PDF document...');
    const pdfjsLib: any = await import('pdfjs-dist');

    if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
      try {
        const mjsCheck = await fetch('assets/pdfjs/pdf.worker.min.mjs', { method: 'HEAD' });
        pdfjsLib.GlobalWorkerOptions.workerSrc = mjsCheck.ok
          ? 'assets/pdfjs/pdf.worker.min.mjs'
          : 'assets/pdfjs/pdf.worker.min.js';
      } catch {
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'assets/pdfjs/pdf.worker.min.mjs';
      }
    }

    const arrayBuffer = await file.arrayBuffer();
    const pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const maxPages = Math.min(pdfDoc.numPages, 3);
    let collectedText = '';

    for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
      onProgress?.(20 + pageNum * 12, `Reading PDF page ${pageNum} of ${maxPages}...`);
      const page = await pdfDoc.getPage(pageNum);
      const textContent = await page.getTextContent();

      const lineMap = new Map<number, { x: number; str: string }[]>();
      for (const item of textContent.items as any[]) {
        if (!item.str || !item.str.trim()) continue;
        const y = Math.round(item.transform[5] / 5) * 5;
        const x = item.transform[4];
        if (!lineMap.has(y)) lineMap.set(y, []);
        lineMap.get(y)!.push({ x, str: item.str });
      }

      const sortedYs = Array.from(lineMap.keys()).sort((a, b) => b - a);
      const pageLines = sortedYs.map(y =>
        lineMap
          .get(y)!
          .sort((a, b) => a.x - b.x)
          .map(i => i.str)
          .join(' ')
      );

      collectedText += pageLines.join('\n') + '\n';
    }

    if (collectedText.replace(/\s+/g, '').length >= 4) {
      const res = this.parseExtractedMathText(collectedText, 99);
      onProgress?.(100, 'PDF extraction complete!');
      return res;
    }

    onProgress?.(45, 'Scanned PDF detected. Rendering page 1...');
    const page1 = await pdfDoc.getPage(1);
    const viewport = page1.getViewport({ scale: 2.4 });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d')!;
    await page1.render({ canvasContext: ctx, viewport }).promise;

    return this.extractWithNeuralLatex(canvas, onProgress);
  }

  private prepareImageForNeuralVision(source: File | Blob | HTMLCanvasElement): Promise<string> {
    return new Promise((resolve, reject) => {
      const renderNormalized = (imgSrc: CanvasImageSource, srcW: number, srcH: number) => {
        const maxDim = 1600;
        const scale = Math.max(srcW, srcH) > maxDim ? maxDim / Math.max(srcW, srcH) : (srcW < 600 ? 1.6 : 1);
        const innerW = Math.round(srcW * scale);
        const innerH = Math.round(srcH * scale);
        const pad = 32;

        const canvas = document.createElement('canvas');
        canvas.width = innerW + pad * 2;
        canvas.height = innerH + pad * 2;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('HTML5 Canvas 2D context is unavailable.'));
          return;
        }

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(imgSrc, pad, pad, innerW, innerH);

        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;

        let lumSum = 0;
        for (let i = 0; i < data.length; i += 16) {
          lumSum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
        }
        const isDarkTheme = lumSum / (data.length / 16) < 118;

        if (isDarkTheme) {
          for (let i = 0; i < data.length; i += 4) {
            data[i] = 255 - data[i];
            data[i + 1] = 255 - data[i + 1];
            data[i + 2] = 255 - data[i + 2];
          }
          ctx.putImageData(imageData, 0, 0);
        }

        resolve(canvas.toDataURL('image/png'));
      };

      if (source instanceof HTMLCanvasElement) {
        renderNormalized(source, source.width, source.height);
        return;
      }

      const img = new Image();
      const url = URL.createObjectURL(source);
      img.onload = () => {
        URL.revokeObjectURL(url);
        renderNormalized(img, img.width, img.height);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('Failed to decode the uploaded image file.'));
      };
      img.src = url;
    });
  }

  /**
   * Parses LaTeX or user-edited linear equations / matrix rows into a validated system.
   * Reads every line, every modified term, and any newly added variables directly.
   */
  parseExtractedMathText(rawText: string, confidence: number = 97): SmartExtractionResult {
    // 1. Parse LaTeX if present (from initial AI extraction)
    if (rawText.includes('\\begin') || rawText.includes('\\frac') || rawText.includes('\\dfrac')) {
      const latexRes = this.latexParser.parseLatexToSystem(rawText);
      if (latexRes) {
        this.enforceStrictMatrixValidity(latexRes.matrix, latexRes.cleanDisplayText);
        const eqText = this.formatEquationsFromMatrix(latexRes.matrix, latexRes.variableNames);
        return {
          detectedType: latexRes.detectedType,
          matrix: latexRes.matrix,
          variableNames: latexRes.variableNames,
          equationsText: eqText,
          rawCleanedText: latexRes.detectedType === 'equations' ? eqText : latexRes.cleanDisplayText,
          confidence
        };
      }
    }

    const sanitizedLines = this.sanitizeMathLines(rawText);
    const fallbackEditableText = sanitizedLines.join('\n') || rawText.trim();

    if (sanitizedLines.length === 0) {
      throw new OcrExtractionError(
        'No readable equations or numbers detected. Edit below and click "Apply & Re-Parse".',
        fallbackEditableText
      );
    }

    const hasEquals = sanitizedLines.some(line => line.includes('='));
    const hasVariables = sanitizedLines.some(line => /[a-zA-Z]/.test(line));

    // 2. Direct Linear Equations Parser (reads all user edits & added variables)
    if (hasEquals || hasVariables) {
      const normalizedLines = sanitizedLines.map(line => this.normalizeEquationSyntax(line));
      const parsed = this.parseEquationsDirectly(normalizedLines, rawText);
      this.enforceStrictMatrixValidity(parsed.matrix, rawText);

      const formattedEqs = this.formatEquationsFromMatrix(parsed.matrix, parsed.variableNames);

      return {
        detectedType: 'equations',
        matrix: parsed.matrix,
        variableNames: parsed.variableNames,
        equationsText: formattedEqs,
        rawCleanedText: formattedEqs,
        confidence
      };
    }

    // 3. Augmented Matrix Parser
    const matrixRows = this.parseMatrixRows(sanitizedLines);
    if (matrixRows.length > 0) {
      const rawMatrixText = matrixRows.map(r => r.join('  ')).join('\n');
      this.enforceStrictMatrixValidity(matrixRows, rawMatrixText);

      const numVars = matrixRows[0].length - 1;
      const variableNames = Array.from({ length: numVars }, (_, i) => `x${i + 1}`);
      const equationsText = this.formatEquationsFromMatrix(matrixRows, variableNames);

      return {
        detectedType: 'matrix',
        matrix: matrixRows,
        variableNames,
        equationsText,
        rawCleanedText: rawMatrixText,
        confidence
      };
    }

    throw new OcrExtractionError(
      'Could not structure extracted text into valid equations or a matrix. Edit below and click "Apply & Re-Parse".',
      fallbackEditableText
    );
  }

  /**
   * Parses all linear equation lines directly, discovering every variable across all lines
   * (including newly added variables like z, w, x3, etc.) and supporting terms on both sides of '='.
   */
  private parseEquationsDirectly(
    lines: string[],
    originalRawText: string
  ): { matrix: number[][]; variableNames: string[] } {
    const equationsData: { coeffs: Map<string, number>; constant: number }[] = [];
    const allVariables = new Set<string>();

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const parts = line.split('=');

      if (parts.length !== 2 || !parts[0].trim() || !parts[1].trim()) {
        throw new OcrExtractionError(
          `Equation error on Line ${i + 1} ("${line}"): Each equation must contain "=" with both sides filled (e.g., 2x + y = 5).`,
          originalRawText
        );
      }

      const coeffs = new Map<string, number>();
      let rhsConstant = 0;

      // Left side: variables keep their sign, constants move to RHS with inverted sign
      this.extractTermsFromSide(parts[0], 1, i + 1, line, originalRawText, coeffs, c => {
        rhsConstant -= c;
      });

      // Right side: variables move to LHS with inverted sign, constants keep their sign
      this.extractTermsFromSide(parts[1], -1, i + 1, line, originalRawText, coeffs, c => {
        rhsConstant += c;
      });

      if (coeffs.size === 0) {
        throw new OcrExtractionError(
          `No variables found on Line ${i + 1} ("${line}"). Add at least one variable (e.g., x, y, z, x1).`,
          originalRawText
        );
      }

      coeffs.forEach((_, varName) => allVariables.add(varName));
      equationsData.push({ coeffs, constant: rhsConstant });
    }

    const variableNames = this.sortVariableNames(Array.from(allVariables));

    const matrix: number[][] = equationsData.map(eq => {
      const row = variableNames.map(v => {
        const val = eq.coeffs.get(v) ?? 0;
        return Math.abs(val) < 1e-12 ? 0 : Math.round((val + Number.EPSILON) * 1e8) / 1e8;
      });
      const b = Math.abs(eq.constant) < 1e-12 ? 0 : Math.round((eq.constant + Number.EPSILON) * 1e8) / 1e8;
      row.push(b);
      return row;
    });

    return { matrix, variableNames };
  }

  private extractTermsFromSide(
    sideExpr: string,
    signMultiplier: 1 | -1,
    lineNum: number,
    fullLine: string,
    originalRawText: string,
    coeffs: Map<string, number>,
    onConstant: (val: number) => void
  ): void {
    const cleaned = sideExpr
      .replace(/\*/g, '')
      .replace(/([+-])\s+/g, '$1')
      .replace(/\s+/g, ' ')
      .trim();

    if (!cleaned || cleaned === '0') return;

    const tokens = cleaned.split(/(?=[+-])/).map(t => t.trim()).filter(Boolean);

    for (const token of tokens) {
      if (token === '+' || token === '-') {
        throw new OcrExtractionError(
          `Incomplete operator "${token}" on Line ${lineNum} ("${fullLine}").`,
          originalRawText
        );
      }

      // Variable divided by constant, e.g., -x/2 or 3x1/4
      const varDivMatch = token.match(/^([+-]?(?:\d+(?:\.\d+)?)?)([a-zA-Z][a-zA-Z0-9]*)\s*\/\s*(\d+(?:\.\d+)?)$/);
      if (varDivMatch) {
        const num = varDivMatch[1] === '' || varDivMatch[1] === '+' ? 1 : varDivMatch[1] === '-' ? -1 : Number(varDivMatch[1]);
        const den = Number(varDivMatch[3]);
        if (den === 0) {
          throw new OcrExtractionError(`Division by zero on Line ${lineNum}.`, originalRawText);
        }
        const varName = varDivMatch[2].toLowerCase();
        coeffs.set(varName, (coeffs.get(varName) ?? 0) + (num / den) * signMultiplier);
        continue;
      }

      // Variable term, e.g., 2x, -y, +3z, 0.5x1, 1/2 x
      const varMatch = token.match(/^([+-]?(?:\d+(?:\.\d+)?(?:\/\d+(?:\.\d+)?)?)?)\s*([a-zA-Z][a-zA-Z0-9]*)$/);
      if (varMatch) {
        const coeff = this.parseNumberOrFraction(varMatch[1]);
        if (coeff === null) {
          throw new OcrExtractionError(
            `Invalid coefficient "${varMatch[1]}" on Line ${lineNum} ("${fullLine}").`,
            originalRawText
          );
        }
        const varName = varMatch[2].toLowerCase();
        coeffs.set(varName, (coeffs.get(varName) ?? 0) + coeff * signMultiplier);
        continue;
      }

      // Pure constant number or fraction
      const constVal = this.parseNumberOrFraction(token);
      if (constVal !== null) {
        onConstant(constVal);
        continue;
      }

      throw new OcrExtractionError(
        `Unrecognized term "${token}" on Line ${lineNum} ("${fullLine}").`,
        originalRawText
      );
    }
  }

  private parseNumberOrFraction(str: string): number | null {
    const s = str.trim();
    if (s === '' || s === '+') return 1;
    if (s === '-') return -1;

    if (s.includes('/')) {
      const [numS, denS] = s.split('/');
      const num = Number(numS);
      const den = Number(denS);
      if (!Number.isFinite(num) || !Number.isFinite(den) || den === 0) return null;
      return num / den;
    }

    if (!/^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(s)) return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }

  private sortVariableNames(vars: string[]): string[] {
    if (vars.every(v => /^[a-z]\d+$/.test(v))) {
      return [...vars].sort((a, b) => {
        const cmp = a[0].localeCompare(b[0]);
        return cmp !== 0 ? cmp : Number(a.slice(1)) - Number(b.slice(1));
      });
    }

    const standardOrder = ['x', 'y', 'z', 'w', 'u', 'v'];
    if (vars.every(v => standardOrder.includes(v))) {
      return [...vars].sort((a, b) => standardOrder.indexOf(a) - standardOrder.indexOf(b));
    }

    return vars;
  }

  formatEquationsFromMatrix(matrix: number[][], variableNames: string[]): string {
    return matrix
      .map(row => {
        const terms: string[] = [];
        for (let j = 0; j < variableNames.length; j++) {
          const coeff = row[j] ?? 0;
          if (Math.abs(coeff) < 1e-12) continue;
          const v = variableNames[j];
          const absVal = Math.abs(coeff);
          const coeffStr = absVal === 1 ? '' : String(absVal);

          if (terms.length === 0) {
            terms.push(coeff < 0 ? `-${coeffStr}${v}` : `${coeffStr}${v}`);
          } else {
            terms.push(coeff < 0 ? `- ${coeffStr}${v}` : `+ ${coeffStr}${v}`);
          }
        }
        const lhs = terms.length > 0 ? terms.join(' ') : '0';
        const rhs = row[variableNames.length] ?? 0;
        return `${lhs} = ${rhs}`;
      })
      .join('\n');
  }

  private enforceStrictMatrixValidity(matrix: number[][], rawText: string): void {
    if (!matrix || matrix.length === 0 || matrix[0].length < 2) {
      throw new OcrExtractionError(
        'Mandatory Rule: System must have at least 1 equation and 1 variable (2 columns minimum).',
        rawText
      );
    }

    let hasNonZeroCoeff = false;
    for (let r = 0; r < matrix.length; r++) {
      for (let c = 0; c < matrix[r].length; c++) {
        const val = matrix[r][c];
        if (typeof val !== 'number' || !Number.isFinite(val) || Number.isNaN(val)) {
          throw new OcrExtractionError(
            `Mandatory Rule: Invalid number at Row ${r + 1}, Column ${c + 1}.`,
            rawText
          );
        }
        if (c < matrix[r].length - 1 && Math.abs(val) > 1e-10) {
          hasNonZeroCoeff = true;
        }
      }
    }

    if (!hasNonZeroCoeff) {
      throw new OcrExtractionError(
        'Mandatory Rule: At least one variable coefficient must be non-zero.',
        rawText
      );
    }
  }

  private sanitizeMathLines(raw: string): string[] {
    const subMap: Record<string, string> = {
      '₀': '0', '₁': '1', '₂': '2', '₃': '3', '₄': '4',
      '₅': '5', '₆': '6', '₇': '7', '₈': '8', '₉': '9'
    };

    return raw
      .replace(/[٠-٩]/g, d => (d.charCodeAt(0) - 1632).toString())
      .replace(/[₀-₉]/g, s => subMap[s] || s)
      .replace(/[–—−‐]/g, '-')
      .replace(/×/g, 'x')
      .replace(/==|:=|≈/g, '=')
      .split(/\r?\n/)
      .map(line =>
        line
          .replace(/^[\[\(\{\|]+|[\]\)\}\|,;:]+$/g, '')
          .replace(/\|/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
      )
      .filter(line => line.length > 0 && /[0-9a-zA-Z]/.test(line));
  }

  private normalizeEquationSyntax(line: string): string {
    return line
      .replace(/([a-zA-Z])_\{?(\d+)\}?/g, '$1$2')
      .replace(/(\d)\s+([a-zA-Z])/g, '$1$2')
      .replace(/(\d)\s*\.\s*(\d)/g, '$1.$2')
      .replace(/(\d),(\d)/g, '$1.$2')
      .replace(/\+\s*-/g, '- ')
      .replace(/-\s*-/g, '+ ');
  }

  private parseMatrixRows(lines: string[]): number[][] {
    const parsedRows: number[][] = [];

    for (const line of lines) {
      const numericLine = line
        .replace(/(-?\d+)\s*\/\s*(\d+)/g, (_, num, den) => {
          const d = Number(den);
          return d === 0 ? num : String(Number(num) / d);
        })
        .replace(/-\s+(\d)/g, '-$1')
        .replace(/(\d)\s*\.\s*(\d)/g, '$1.$2')
        .replace(/(\d),(\d)/g, '$1.$2')
        .replace(/[;,]+/g, ' ')
        .trim();

      const tokens = numericLine.split(/\s+/).filter(Boolean);
      const nums: number[] = [];

      for (const tok of tokens) {
        const cleaned = tok.replace(/[^0-9.\-]/g, '');
        if (/^-?\d+(\.\d+)?$/.test(cleaned)) {
          nums.push(Number(cleaned));
        }
      }

      if (nums.length >= 2) {
        parsedRows.push(nums);
      }
    }

    if (parsedRows.length === 0) return [];

    const maxCols = Math.max(...parsedRows.map(r => r.length));
    if (maxCols < 2) return [];

    return parsedRows.map(row => {
      const copy = [...row];
      while (copy.length < maxCols) copy.push(0);
      return copy;
    });
  }
}