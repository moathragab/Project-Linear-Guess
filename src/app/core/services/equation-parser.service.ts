import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class EquationParserService {
    parseEquations(lines: string[]): { matrix: number[][]; variableNames: string[] } | null {
    const cleanedLines = lines.map(l => l.trim()).filter(l => l.length > 0);
    if (cleanedLines.length === 0) return null;

    // Detect unique variables (e.g., x, y, z or x1, x2)
    const varSet = new Set<string>();
    const varRegex = /([a-zA-Z]\d*)/g;

    cleanedLines.forEach(line => {
      const parts = line.split('=');
      if (parts[0]) {
        let match;
        while ((match = varRegex.exec(parts[0])) !== null) {
          varSet.add(match[1]);
        }
      }
    });

    const variableNames = Array.from(varSet).sort();
    if (variableNames.length === 0) return null;

    const matrix: number[][] = [];

    for (const line of cleanedLines) {
      const parts = line.split('=');
      if (parts.length !== 2) return null; // Invalid equation format

      const leftSide = parts[0];
      const rightSide = parseFloat(parts[1].trim()) || 0;
      const rowCoeffs: number[] = new Array(variableNames.length).fill(0);

      variableNames.forEach((varName, idx) => {
        // Regex to extract coefficient for each variable
        const coeffRegex = new RegExp(`([+-]?\\s*\\d*\\.?\\d*)\\s*\\*?\\s*${varName}(?![0-9a-zA-Z])`, 'g');
        const match = coeffRegex.exec(leftSide);
        if (match) {
          let rawCoeff = match[1].replace(/\s+/g, '');
          if (rawCoeff === '' || rawCoeff === '+') rowCoeffs[idx] = 1;
          else if (rawCoeff === '-') rowCoeffs[idx] = -1;
          else rowCoeffs[idx] = parseFloat(rawCoeff) || 0;
        }
      });

      rowCoeffs.push(rightSide); // Append constant value
      matrix.push(rowCoeffs);
    }

    return { matrix, variableNames };
  }

  /**
   * Generates text equations from matrix representation
   */
  matrixToEquations(matrix: number[][], variableNames: string[]): string[] {
    const cols = matrix[0].length;
    return matrix.map(row => {
      let terms: string[] = [];
      for (let j = 0; j < cols - 1; j++) {
        const val = row[j];
        const varName = variableNames[j] || `x${j + 1}`;
        if (val !== 0) {
          const sign = val < 0 ? '- ' : (terms.length > 0 ? '+ ' : '');
          const absVal = Math.abs(val);
          const coeffStr = absVal === 1 ? '' : `${absVal}`;
          terms.push(`${sign}${coeffStr}${varName}`);
        }
      }
      const leftExpr = terms.length > 0 ? terms.join(' ') : '0';
      const rightVal = row[cols - 1];
      return `${leftExpr} = ${rightVal}`;
    });
  }
}