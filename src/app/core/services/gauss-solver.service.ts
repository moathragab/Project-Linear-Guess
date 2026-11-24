import { Injectable } from '@angular/core';
import { MatrixStep, FinalSolution } from '../models/matrix.model';
import { EquationParserService } from './equation-parser.service';

@Injectable({
  providedIn: 'root'
})
export class GaussSolverService {

  constructor(private parserService: EquationParserService) {}

  /**
   * Formats numbers for readability, converting clean decimals into simple fractions
   * and rounding non-simple decimals to 2 decimal places.
   */
  public formatNum(num: number): string {
    if (Math.abs(num) < 1e-10) return '0';
    
    const clean = Math.round((num + Number.EPSILON) * 10000) / 10000;
    if (Math.abs(clean) < 1e-10) return '0';
    if (Number.isInteger(clean)) return clean.toString();

    const absVal = Math.abs(clean);
    const sign = clean < 0 ? '-' : '';

    for (let denominator = 2; denominator <= 12; denominator++) {
      const numerator = Math.round(absVal * denominator);
      if (Math.abs(absVal - numerator / denominator) < 1e-4) {
        if (numerator === denominator) return `${sign}1`;
        return `${sign}${numerator}/${denominator}`;
      }
    }

    const rounded = Math.round((clean + Number.EPSILON) * 100) / 100;
    return rounded.toString();
  }

  /**
   * Solves a system of linear equations using Elementary Row Operations:
   * - isRREF = false => Gaussian Elimination (Row-Echelon Form + Back-Substitution)
   * - isRREF = true  => Gauss-Jordan Elimination (Reduced Row-Echelon Form)
   */
  solveSystem(
    matrix: number[][], 
    isRREF: boolean, 
    variableNames: string[]
  ): { steps: MatrixStep[]; finalSolution: FinalSolution } {
    
    const m = matrix.length;
    const n = matrix[0].length - 1; 
    const steps: MatrixStep[] = [];
    const targetFormName = isRREF ? 'Reduced Row-Echelon Form (RREF)' : 'Row-Echelon Form (REF)';

    let currentMatrix = this.cloneHighPrecision(matrix);
    let stepCount = 1;

    const initialDisplay = this.formatDisplayMatrix(currentMatrix);
    steps.push({
      stepNumber: stepCount++,
      description: 'Initial System State',
      detailedExplanation: `Constructed augmented matrix [A|b] to transform into ${targetFormName}.`,
      equations: this.parserService.matrixToEquations(initialDisplay, variableNames),
      operationType: 'initial',
      matrix: initialDisplay
    });

    let leadingRow = 0;

    for (let col = 0; col < n && leadingRow < m; col++) {
      
      // 1) Find the first non-zero entry in the current column starting from leadingRow
      let firstNonZeroRow = -1;
      for (let i = leadingRow; i < m; i++) {
        if (Math.abs(currentMatrix[i][col]) > 1e-10) {
          firstNonZeroRow = i;
          break;
        }
      }

      if (firstNonZeroRow === -1) continue;

      // 2) Elementary Operation 2: Interchange two rows if the leading entry is 0
      if (firstNonZeroRow !== leadingRow) {
        const temp = currentMatrix[leadingRow];
        currentMatrix[leadingRow] = currentMatrix[firstNonZeroRow];
        currentMatrix[firstNonZeroRow] = temp;

        const displayMat = this.formatDisplayMatrix(currentMatrix);
        steps.push({
          stepNumber: stepCount++,
          description: `Interchange Row ${leadingRow + 1} with Row ${firstNonZeroRow + 1} (Operation 2)`,
          formulaDetail: `R${leadingRow + 1} ↔ R${firstNonZeroRow + 1}`,
          detailedExplanation: `Swapped Row ${leadingRow + 1} with Row ${firstNonZeroRow + 1} because the initial leading entry was 0.`,
          equations: this.parserService.matrixToEquations(displayMat, variableNames),
          operationType: 'swap',
          leadingRow: leadingRow,
          leadingCol: col,
          highlightRow: firstNonZeroRow,
          matrix: displayMat
        });
      }

      // 3) Elementary Operation 1: Multiply row by reciprocal to create a Leading 1 (skip if already 1)
      const currentVal = currentMatrix[leadingRow][col];
      
      if (Math.abs(currentVal - 1) > 1e-10) {
        const reciprocal = 1 / currentVal;
        currentMatrix[leadingRow] = currentMatrix[leadingRow].map(val => {
          const res = val * reciprocal;
          return Math.abs(res) < 1e-10 ? 0 : res;
        });

        const formulaStr = `(${this.formatNum(reciprocal)}) × R${leadingRow + 1} → R${leadingRow + 1}`;
        const displayMat = this.formatDisplayMatrix(currentMatrix);

        steps.push({
          stepNumber: stepCount++,
          description: `Create Leading 1 at Row ${leadingRow + 1} (Operation 1)`,
          formulaDetail: formulaStr,
          detailedExplanation: `Multiplied Row ${leadingRow + 1} by (${this.formatNum(reciprocal)}) to obtain a Leading 1.`,
          equations: this.parserService.matrixToEquations(displayMat, variableNames),
          operationType: 'multiply',
          leadingRow: leadingRow,
          leadingCol: col,
          matrix: displayMat
        });
      }

      // 4) Elementary Operation 3: Add a multiple of the leading row to other rows
      const startRow = isRREF ? 0 : leadingRow + 1;
      for (let r = startRow; r < m; r++) {
        if (r !== leadingRow) {
          const factor = currentMatrix[r][col];
          if (Math.abs(factor) > 1e-10) {
            currentMatrix[r] = currentMatrix[r].map((val, cIdx) => {
              const res = val - factor * currentMatrix[leadingRow][cIdx];
              return Math.abs(res) < 1e-10 ? 0 : res;
            });

            let opStr = '';
            if (factor > 0) {
              opStr = `R${r + 1} - (${this.formatNum(factor)}) × R${leadingRow + 1} → R${r + 1}`;
            } else {
              opStr = `R${r + 1} + (${this.formatNum(-factor)}) × R${leadingRow + 1} → R${r + 1}`;
            }

            const positionText = r < leadingRow ? 'above' : 'below';
            const displayMat = this.formatDisplayMatrix(currentMatrix);

            steps.push({
              stepNumber: stepCount++,
              description: `Zero out entry at Row ${r + 1}, Column ${col + 1} (Operation 3)`,
              formulaDetail: opStr,
              detailedExplanation: `Applied Operation 3 to create a 0 ${positionText} Leading 1 at Row ${r + 1}, Column ${col + 1}.`,
              equations: this.parserService.matrixToEquations(displayMat, variableNames),
              operationType: 'add-multiple',
              leadingRow: leadingRow,
              leadingCol: col,
              highlightRow: r,
              matrix: displayMat
            });
          }
        }
      }

      leadingRow++;
    }

    // Derive solution directly from Echelon / Reduced Echelon form without Rank
    const { finalSolution, derivationSteps } = this.deriveSolutionFromEchelon(
      currentMatrix, 
      m, 
      n, 
      variableNames, 
      isRREF
    );

    if (finalSolution.status === 'unique' && !isRREF && derivationSteps.length > 0) {
      const displayMat = this.formatDisplayMatrix(currentMatrix);
      steps.push({
        stepNumber: stepCount++,
        description: 'Back-Substitution',
        formulaDetail: derivationSteps.join('  |  '),
        detailedExplanation: 'Reached Row-Echelon Form (REF). Solved for each variable from the bottom equation upward using Back-Substitution.',
        equations: finalSolution.variableEquations,
        operationType: 'complete',
        matrix: displayMat
      });
    } else if (finalSolution.status === 'infinite') {
      const displayMat = this.formatDisplayMatrix(currentMatrix);
      steps.push({
        stepNumber: stepCount++,
        description: 'Parametric Solution via Back-Substitution',
        formulaDetail: finalSolution.variableEquations.join('  |  '),
        detailedExplanation: 'Assigned free parameters to variables without Leading 1s and expressed every variable as an equation.',
        equations: finalSolution.variableEquations,
        operationType: 'complete',
        matrix: displayMat
      });
    } else if (isRREF && finalSolution.status === 'unique') {
      const displayMat = this.formatDisplayMatrix(currentMatrix);
      steps.push({
        stepNumber: stepCount++,
        description: 'Reduced Row-Echelon Form (RREF) Complete',
        formulaDetail: finalSolution.variableEquations.join('  |  '),
        detailedExplanation: 'All entries above and below every Leading 1 are 0. Variable values are read directly.',
        equations: finalSolution.variableEquations,
        operationType: 'complete',
        matrix: displayMat
      });
    }

    return { steps, finalSolution };
  }

  private cloneHighPrecision(mat: number[][]): number[][] {
    return mat.map(row =>
      row.map(val => (Math.abs(val) < 1e-10 ? 0 : val))
    );
  }

  private formatDisplayMatrix(mat: number[][]): number[][] {
    return mat.map(row => 
      row.map(val => {
        if (Math.abs(val) < 1e-10) return 0;
        return Math.round((val + Number.EPSILON) * 1000) / 1000;
      })
    );
  }

  /**
   * Determines solvability directly from REF / RREF structure (without Rank):
   * 1. Contradictory row [0 ... 0 | c] with c != 0 => No Solution.
   * 2. Every variable column has a Leading 1 => Unique Solution.
   * 3. Any variable column lacks a Leading 1 => Infinitely Many Solutions (full equation per variable).
   */
  private deriveSolutionFromEchelon(
    matrix: number[][], 
    m: number, 
    n: number, 
    variableNames: string[],
    isRREF: boolean
  ): { finalSolution: FinalSolution; derivationSteps: string[] } {
    let isInconsistent = false;
    const leadingEntries: { row: number; col: number }[] = [];

    for (let i = 0; i < m; i++) {
      const rowCoeffs = matrix[i].slice(0, n);
      const constVal = matrix[i][n];
      const firstNonZeroCol = rowCoeffs.findIndex(v => Math.abs(v) > 1e-6);

      if (firstNonZeroCol !== -1) {
        leadingEntries.push({ row: i, col: firstNonZeroCol });
      } else if (Math.abs(constVal) > 1e-6) {
        isInconsistent = true;
      }
    }

    const displayFinalMatrix = this.formatDisplayMatrix(matrix);
    const variablesResult: { [key: string]: number | string } = {};
    const variableEquations: string[] = [];
    const derivationSteps: string[] = [];
    const leadingColsSet = new Set<number>(leadingEntries.map(entry => entry.col));
    const leadingCount = leadingColsSet.size;
    const freeParametersCount = Math.max(0, n - leadingCount);

    // Case 1: Contradictory row (0 = c where c != 0)
    if (isInconsistent) {
      return {
        finalSolution: {
          status: 'no-solution',
          statusMessage: 'The system has no solution because row reduction produced a contradictory row (0 = c where c ≠ 0).',
          variableNames,
          variables: {},
          variableEquations: [],
          leadingCount,
          freeParametersCount,
          finalMatrix: displayFinalMatrix
        },
        derivationSteps: []
      };
    }

    // Case 2: Every variable column has a Leading 1 => Unique Solution
    if (leadingCount === n) {
      const solvedValues: number[] = new Array(n).fill(0);

      for (let idx = leadingEntries.length - 1; idx >= 0; idx--) {
        const { row: r, col: c } = leadingEntries[idx];
        let sumAbove = 0;
        const subtractedTerms: string[] = [];

        for (let j = c + 1; j < n; j++) {
          const coeff = matrix[r][j];
          if (Math.abs(coeff) > 1e-10) {
            sumAbove += coeff * solvedValues[j];
            subtractedTerms.push(`(${this.formatNum(coeff)})(${this.formatNum(solvedValues[j])})`);
          }
        }

        const val = matrix[r][n] - sumAbove;
        solvedValues[c] = Math.abs(val) < 1e-10 ? 0 : val;

        if (!isRREF) {
          const varName = variableNames[c] || `x${c + 1}`;
          const formattedVal = this.formatNum(solvedValues[c]);
          const rhsStr = this.formatNum(matrix[r][n]);
          if (subtractedTerms.length > 0) {
            derivationSteps.unshift(`${varName} = ${rhsStr} - [${subtractedTerms.join(' + ')}] = ${formattedVal}`);
          } else {
            derivationSteps.unshift(`${varName} = ${formattedVal}`);
          }
        }
      }

      // Store strictly Left-to-Right (x1 -> xn)
      for (let j = 0; j < n; j++) {
        const varName = variableNames[j] || `x${j + 1}`;
        const formattedVal = this.formatNum(solvedValues[j]);
        variablesResult[varName] = formattedVal;
        variableEquations.push(`${varName} = ${formattedVal}`);
      }

      return {
        finalSolution: {
          status: 'unique',
          statusMessage: isRREF
            ? 'Every variable column has a Leading 1. Unique solution obtained directly from Reduced Row-Echelon Form.'
            : 'Every variable column has a Leading 1. Unique solution obtained via Row-Echelon Form and Back-Substitution.',
          variableNames,
          variables: variablesResult,
          variableEquations,
          leadingCount,
          freeParametersCount: 0,
          finalMatrix: displayFinalMatrix
        },
        derivationSteps
      };
    }

    // Case 3: Infinitely Many Solutions => Full parametric equation for every variable (x1 -> xn)
    const freeCols: number[] = [];
    for (let j = 0; j < n; j++) {
      if (!leadingColsSet.has(j)) {
        freeCols.push(j);
      }
    }

    const paramLabelByCol: { [col: number]: string } = {};
    freeCols.forEach((fCol, idx) => {
      paramLabelByCol[fCol] = freeCols.length === 1 ? 't' : `t${idx + 1}`;
    });

    const expressions: { constant: number; paramCoeffs: { [fCol: number]: number } }[] = Array.from(
      { length: n },
      () => ({ constant: 0, paramCoeffs: {} })
    );

    for (const fCol of freeCols) {
      expressions[fCol].paramCoeffs[fCol] = 1;
    }

    for (let idx = leadingEntries.length - 1; idx >= 0; idx--) {
      const { row: r, col: pCol } = leadingEntries[idx];
      let constant = matrix[r][n];
      const paramCoeffs: { [fCol: number]: number } = {};

      for (const fCol of freeCols) {
        paramCoeffs[fCol] = 0;
      }

      for (let j = pCol + 1; j < n; j++) {
        const a = matrix[r][j];
        if (Math.abs(a) > 1e-10) {
          constant -= a * expressions[j].constant;
          for (const fCol of freeCols) {
            const subCoeff = expressions[j].paramCoeffs[fCol] || 0;
            paramCoeffs[fCol] -= a * subCoeff;
          }
        }
      }

      expressions[pCol] = { constant, paramCoeffs };
    }

    // Store equations for all variables strictly Left-to-Right (x1 -> xn)
    for (let j = 0; j < n; j++) {
      const varName = variableNames[j] || `x${j + 1}`;
      if (!leadingColsSet.has(j)) {
        const paramName = paramLabelByCol[j];
        variablesResult[varName] = paramName;
        variableEquations.push(`${varName} = ${paramName}`);
      } else {
        const rhsExpr = this.formatParametricExpression(
          expressions[j].constant,
          expressions[j].paramCoeffs,
          freeCols,
          paramLabelByCol
        );
        variablesResult[varName] = rhsExpr;
        variableEquations.push(`${varName} = ${rhsExpr}`);
      }
    }

    const paramsList = freeCols.map(fCol => paramLabelByCol[fCol]).join(', ');

    return {
      finalSolution: {
        status: 'infinite',
        statusMessage: `The system has infinitely many solutions. Every variable is expressed as an equation in terms of ${paramsList} ∈ ℝ.`,
        variableNames,
        variables: variablesResult,
        variableEquations,
        leadingCount,
        freeParametersCount,
        finalMatrix: displayFinalMatrix
      },
      derivationSteps: variableEquations
    };
  }

  private formatParametricExpression(
    constant: number,
    paramCoeffs: { [fCol: number]: number },
    freeCols: number[],
    paramLabelByCol: { [col: number]: string }
  ): string {
    const parts: string[] = [];

    if (Math.abs(constant) > 1e-10) {
      parts.push(this.formatNum(constant));
    }

    for (const fCol of freeCols) {
      const c = paramCoeffs[fCol] || 0;
      if (Math.abs(c) > 1e-10) {
        const paramName = paramLabelByCol[fCol];
        const absC = Math.abs(c);
        const coeffStr = Math.abs(absC - 1) < 1e-10 ? '' : this.formatNum(absC);

        if (parts.length === 0) {
          parts.push(c < 0 ? `-${coeffStr}${paramName}` : `${coeffStr}${paramName}`);
        } else {
          parts.push(c < 0 ? `- ${coeffStr}${paramName}` : `+ ${coeffStr}${paramName}`);
        }
      }
    }

    return parts.length > 0 ? parts.join(' ') : '0';
  }
}