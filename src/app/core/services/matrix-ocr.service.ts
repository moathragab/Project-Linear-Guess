import { Injectable } from '@angular/core';
import { EquationParserService } from './equation-parser.service';
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

  constructor(
    private parserService: EquationParserService,
    private latexParser: LatexMathParserService
  ) {}

  /**
   * Unified Neural Math-LaTeX AI extraction pipeline for Images, Cropped Canvases, PDFs, and Text files.
   */
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

  /**
   * Deep Neural Math-to-LaTeX Vision Engine (@huggingface/transformers - Xenova/texify).
   * Handles printed & handwritten matrices, subscripts (x_1, x_2), fractions, and complex systems.
   */
  private async extractWithNeuralLatex(
    source: File | Blob | HTMLCanvasElement,
    onProgress?: (percent: number, stage: string) => void
  ): Promise<SmartExtractionResult> {
    onProgress?.(10, 'Optimizing image lighting & borders for Neural Math AI...');
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

    onProgress?.(45, 'Scanned PDF detected. Rendering page 1 for Neural Math AI...');
    const page1 = await pdfDoc.getPage(1);
    const viewport = page1.getViewport({ scale: 2.4 });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d')!;
    await page1.render({ canvasContext: ctx, viewport }).promise;

    return this.extractWithNeuralLatex(canvas, onProgress);
  }

  /**
   * Prepares an image for Vision-Transformer LaTeX recognition:
   * - Adds a 32px white quiet-zone border
   * - Auto-inverts dark-mode screenshots to clean dark-on-white ink
   * - Preserves smooth grayscale anti-aliasing required by Neural Vision encoders
   */
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

        // Detect dark-mode screenshot
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
   * Parses LaTeX or manually edited math text into validated Linear Equations or an Augmented Matrix.
   */
  parseExtractedMathText(rawText: string, confidence: number = 97): SmartExtractionResult {
    // 1. Parse LaTeX environments & expressions first
    const latexRes = this.latexParser.parseLatexToSystem(rawText);
    if (latexRes) {
      this.enforceStrictMatrixValidity(latexRes.matrix, latexRes.cleanDisplayText);
      return {
        detectedType: latexRes.detectedType,
        matrix: latexRes.matrix,
        variableNames: latexRes.variableNames,
        equationsText: latexRes.equationsText,
        rawCleanedText: latexRes.cleanDisplayText,
        confidence
      };
    }

    // 2. Parse plain linear equations or augmented matrix rows
    const sanitizedLines = this.sanitizeMathLines(rawText);
    const fallbackEditableText = sanitizedLines.join('\n') || rawText.trim();

    if (sanitizedLines.length === 0) {
      throw new OcrExtractionError(
        'No readable equations or matrix rows were detected. Crop tightly around the math area and try again.',
        fallbackEditableText
      );
    }

    const hasEquals = sanitizedLines.some(line => line.includes('='));
    const hasVariables = sanitizedLines.some(line => /[a-zA-Z]/.test(line));

    if (hasEquals || hasVariables) {
      const normalizedEqLines = sanitizedLines.map(line => this.normalizeEquationSyntax(line));
      const parsed = this.parserService.parseEquations(normalizedEqLines);

      if (parsed && parsed.matrix.length > 0 && parsed.variableNames.length > 0) {
        this.enforceStrictMatrixValidity(parsed.matrix, normalizedEqLines.join('\n'));

        const cleanEqText = this.parserService
          .matrixToEquations(parsed.matrix, parsed.variableNames)
          .join('\n');

        return {
          detectedType: 'equations',
          matrix: parsed.matrix,
          variableNames: parsed.variableNames,
          equationsText: cleanEqText,
          rawCleanedText: cleanEqText,
          confidence
        };
      }

      if (hasEquals) {
        throw new OcrExtractionError(
          'Detected equations but could not parse all terms. Correct any symbol below and click "Apply & Re-Parse".',
          normalizedEqLines.join('\n')
        );
      }
    }

    const matrixRows = this.parseMatrixRows(sanitizedLines);
    if (matrixRows.length > 0) {
      const rawMatrixText = matrixRows.map(r => r.join('  ')).join('\n');
      this.enforceStrictMatrixValidity(matrixRows, rawMatrixText);

      const numVars = matrixRows[0].length - 1;
      const variableNames = Array.from({ length: numVars }, (_, i) => `x${i + 1}`);
      const equationsText = this.parserService
        .matrixToEquations(matrixRows, variableNames)
        .join('\n');

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
      .replace(/(-?\d+)\s*\/\s*(\d+)/g, (_, num, den) => {
        const d = Number(den);
        if (d === 0) return num;
        return String(Math.round((Number(num) / d) * 10000) / 10000);
      })
      .split(/\r?\n/)
      .map(line =>
        line
          .replace(/^[\[\(\{\|]+|[\]\)\}\|]+$/g, '')
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