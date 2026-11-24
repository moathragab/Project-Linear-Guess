import { Injectable } from '@angular/core';
import { EquationParserService } from './equation-parser.service';

export interface ParsedLatexSystem {
  detectedType: 'equations' | 'matrix';
  matrix: number[][];
  variableNames: string[];
  equationsText: string;
  cleanDisplayText: string;
}

@Injectable({
  providedIn: 'root'
})
export class LatexMathParserService {
  constructor(private equationParser: EquationParserService) {}

  parseLatexToSystem(latex: string): ParsedLatexSystem | null {
    if (!latex || !latex.trim()) return null;

    const cleaned = this.cleanLatexWrappers(latex);

    const matrixEnvMatch = cleaned.match(
      /\\begin\{(?:b|p|v|V|small)?matrix\}([\s\S]*?)\\end\{(?:b|p|v|V|small)?matrix\}/i
    ) || cleaned.match(/\\begin\{array\}\{[^}]*\}([\s\S]*?)\\end\{array\}/i);

    if (matrixEnvMatch) {
      const matrix = this.parseLatexMatrixBody(matrixEnvMatch[1]);
      if (matrix.length > 0 && matrix[0].length >= 2) {
        const numVars = matrix[0].length - 1;
        const variableNames = Array.from({ length: numVars }, (_, i) => `x${i + 1}`);
        const equationsText = this.equationParser
          .matrixToEquations(matrix, variableNames)
          .join('\n');

        return {
          detectedType: 'matrix',
          matrix,
          variableNames,
          equationsText,
          cleanDisplayText: matrix.map(r => r.join('  ')).join('\n')
        };
      }
    }

    const eqBody = cleaned
      .replace(/\\begin\{(?:cases|aligned|align\*?|gather\*?|split|eqnarray\*?)\}/gi, '')
      .replace(/\\end\{(?:cases|aligned|align\*?|gather\*?|split|eqnarray\*?)\}/gi, '');

    const rawLines = eqBody
      .split(/\\\\|\r?\n/)
      .map(line => this.latexLineToPlainEquation(line))
      .filter(line => line.length > 0 && line.includes('='));

    if (rawLines.length > 0) {
      const parsed = this.equationParser.parseEquations(rawLines);
      if (parsed && parsed.matrix.length > 0 && parsed.variableNames.length > 0) {
        const equationsText = this.equationParser
          .matrixToEquations(parsed.matrix, parsed.variableNames)
          .join('\n');

        return {
          detectedType: 'equations',
          matrix: parsed.matrix,
          variableNames: parsed.variableNames,
          equationsText,
          cleanDisplayText: equationsText
        };
      }
    }

    return null;
  }

  private cleanLatexWrappers(latex: string): string {
    return latex
      .replace(/^\$\$|\$\$$/g, '')
      .replace(/^\$|\$$/g, '')
      .replace(/\\left\s*[\[\(\{\|]/g, '')
      .replace(/\\right\s*[\]\)\}\|]/g, '')
      .replace(/\\hline/g, '')
      .replace(/\\quad|\\qquad|\\,|\\;|\\!/g, ' ')
      .replace(/\\text\{([^}]*)\}/g, '$1')
      .replace(/\\mathrm\{([^}]*)\}/g, '$1')
      .replace(/\\mathbf\{([^}]*)\}/g, '$1')
      .trim();
  }

  private convertLatexFractions(expr: string): string {
    let result = expr;
    const fracRegex = /\\d?frac\{([^{}]+)\}\{([^{}]+)\}/g;
    let guard = 0;
    while (fracRegex.test(result) && guard < 10) {
      result = result.replace(fracRegex, (_, numStr, denStr) => {
        const num = Number(numStr.trim());
        const den = Number(denStr.trim());
        if (!Number.isNaN(num) && !Number.isNaN(den) && den !== 0) {
          return String(Math.round((num / den) * 10000) / 10000);
        }
        return `(${numStr}/${denStr})`;
      });
      guard++;
    }
    return result;
  }

  private parseLatexMatrixBody(body: string): number[][] {
    const rows = body
      .split(/\\\\|\r?\n/)
      .map(r => r.replace(/&/g, ' ').trim())
      .filter(r => r.length > 0);

    const matrix: number[][] = [];
    for (const row of rows) {
      const resolved = this.convertLatexFractions(row)
        .replace(/[–—−]/g, '-')
        .replace(/\|/g, ' ')
        .trim();

      const tokens = resolved.split(/\s+/).filter(Boolean);
      const nums: number[] = [];
      for (const tok of tokens) {
        const cleanNum = tok.replace(/[^0-9.\-]/g, '');
        if (/^-?\d+(\.\d+)?$/.test(cleanNum)) {
          nums.push(Number(cleanNum));
        }
      }
      if (nums.length >= 2) {
        matrix.push(nums);
      }
    }

    if (matrix.length === 0) return [];
    const maxCols = Math.max(...matrix.map(r => r.length));
    return matrix.map(r => {
      const copy = [...r];
      while (copy.length < maxCols) copy.push(0);
      return copy;
    });
  }

  private latexLineToPlainEquation(line: string): string {
    return this.convertLatexFractions(line)
      .replace(/&/g, '')
      .replace(/[–—−]/g, '-')
      .replace(/\\cdot|\\times/g, '')
      // Convert x_{12} or x_1 -> x12 or x1
      .replace(/([a-zA-Z])_\{(\d+)\}/g, '$1$2')
      .replace(/([a-zA-Z])_(\d+)/g, '$1$2')
      .replace(/[{}]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }
}