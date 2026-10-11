import { Injectable } from '@angular/core';
import { MatrixStep, FinalSolution, SolutionStatus } from '../models/matrix.model';
import { EquationParserService } from './equation-parser.service';

@Injectable({
  providedIn: 'root'
})
export class GaussSolverService {

  constructor(private parserService: EquationParserService) {}

  private cleanNumber(val: number, decimals: number = 4): number {
    if (Math.abs(val) < 1e-10) return 0;
    const factor = Math.pow(10, decimals);
    return Math.round((val + Number.EPSILON) * factor) / factor;
  }

  solveSystem(
    initialMatrix: number[][], 
    toRREF: boolean = false, 
    variableNames: string[] = []
  ): { steps: MatrixStep[]; finalSolution: FinalSolution } {
    
    const steps: MatrixStep[] = [];
    let m = initialMatrix.map(row => row.map(val => this.cleanNumber(val)));
    const rows = m.length;
    const cols = m[0].length;
    
    // Auto-generate variable names if not provided
    const vars = variableNames.length === cols - 1 
      ? variableNames 
      : Array.from({ length: cols - 1 }, (_, i) => `x${i + 1}`);

    let stepCount = 1;
    steps.push({
      stepNumber: 0,
      matrix: m.map(row => [...row]),
      equations: this.parserService.matrixToEquations(m, vars),
      description: 'System Representation',
      detailedExplanation: 'This is the initial system represented in both Augmented Matrix format and Linear Equations form.',
      operationType: 'initial'
    });

    let pivotRow = 0;

    // Phase 1: Forward Elimination (REF)
    for (let col = 0; col < cols - 1 && pivotRow < rows; col++) {
      let maxRow = pivotRow;
      for (let i = pivotRow + 1; i < rows; i++) {
        if (Math.abs(m[i][col]) > Math.abs(m[maxRow][col])) maxRow = i;
      }

      if (Math.abs(m[maxRow][col]) < 1e-10) continue;

      if (maxRow !== pivotRow) {
        [m[pivotRow], m[maxRow]] = [m[maxRow], m[pivotRow]];
        steps.push({
          stepNumber: stepCount++,
          matrix: m.map(row => [...row]),
          equations: this.parserService.matrixToEquations(m, vars),
          description: `Swap Row ${pivotRow + 1} and Row ${maxRow + 1}`,
          detailedExplanation: `Swapped Row ${pivotRow + 1} with Row ${maxRow + 1} (R${pivotRow + 1} ↔️ R${maxRow + 1}) to place a larger absolute coefficient at the pivot position (${m[pivotRow][col]}). This improves numerical stability.`,
          operationType: 'swap',
          highlightRow: pivotRow,
          pivotRow: maxRow,
          formulaDetail: `R${pivotRow + 1} ↔️ R${maxRow + 1}`,
        });
      }

      for (let i = pivotRow + 1; i < rows; i++) {
        const factor = m[i][col] / m[pivotRow][col];
        if (Math.abs(factor) > 1e-10) {
          for (let j = col; j < cols; j++) {
            m[i][j] = this.cleanNumber(m[i][j] - factor * m[pivotRow][j]);
          }
          const factorStr = this.cleanNumber(factor).toString();
          steps.push({
            stepNumber: stepCount++,
            matrix: m.map(row => [...row]),
            equations: this.parserService.matrixToEquations(m, vars),
            description: `Eliminate term in Row ${i + 1}`,
            detailedExplanation: `Subtracted (${factorStr}) times Row ${pivotRow + 1} from Row ${i + 1} to create a zero in column ${col + 1} under pivot ${this.cleanNumber(m[pivotRow][col])}.`,
            operationType: 'eliminate',
            highlightRow: i,
            pivotRow: pivotRow,
            pivotCol: col,
            formulaDetail: `R${i + 1} → R${i + 1} - (${factorStr}) · R${pivotRow + 1}`,
          });
        }
      }
      pivotRow++;
    }

    // Phase 2: Back Substitution (RREF)
    if (toRREF) {
      for (let i = rows - 1; i >= 0; i--) {
        let pivotCol = -1;
        for (let j = 0; j < cols - 1; j++) {
          if (Math.abs(m[i][j]) > 1e-10) { pivotCol = j; break; }
        }

        if (pivotCol !== -1) {
          const pivotVal = m[i][pivotCol];
          if (Math.abs(pivotVal - 1) > 1e-10) {
            for (let j = pivotCol; j < cols; j++) {
              m[i][j] = this.cleanNumber(m[i][j] / pivotVal);
            }
            const scaleStr = this.cleanNumber(1 / pivotVal).toString();
            steps.push({
              stepNumber: stepCount++,
              matrix: m.map(row => [...row]),
              equations: this.parserService.matrixToEquations(m, vars),
              description: `Scale Row ${i + 1} Pivot to 1`,
              detailedExplanation: `Divided Row ${i + 1} by ${pivotVal} to make the leading coefficient equal to 1.`,
              operationType: 'scale',
              highlightRow: i,
              pivotCol: pivotCol,
              formulaDetail: `R${i + 1} → (${scaleStr}) · R${i + 1}`,
            });
          }

          for (let k = i - 1; k >= 0; k--) {
            const factor = m[k][pivotCol];
            if (Math.abs(factor) > 1e-10) {
              for (let j = pivotCol; j < cols; j++) {
                m[k][j] = this.cleanNumber(m[k][j] - factor * m[i][j]);
              }
              const factorStr = this.cleanNumber(factor).toString();
              steps.push({
                stepNumber: stepCount++,
                matrix: m.map(row => [...row]),
                equations: this.parserService.matrixToEquations(m, vars),
                description: `Eliminate entry above pivot in Row ${k + 1}`,
                detailedExplanation: `Cleared entry above pivot at column ${pivotCol + 1} by performing R${k + 1} → R${k + 1} - (${factorStr}) · R${i + 1}.`,
                operationType: 'eliminate',
                highlightRow: k,
                pivotRow: i,
                pivotCol: pivotCol,
                formulaDetail: `R${k + 1} → R${k + 1} - (${factorStr}) · R${i + 1}`,
              });
            }
          }
        }
      }
    }

    // Completion Step
    steps.push({
      stepNumber: stepCount,
      matrix: m.map(row => [...row]),
      equations: this.parserService.matrixToEquations(m, vars),
      description: toRREF ? 'RREF Form Reached' : 'REF Form Reached',
      detailedExplanation: `Reduction completed successfully. The system is now fully in ${toRREF ? 'Reduced Row Echelon Form (RREF)' : 'Row Echelon Form (REF)'}.`,
      operationType: 'complete'
    });

    // Analyze Final Solution
    const finalSolution = this.analyzeSolution(m, vars);

    return { steps, finalSolution };
  }

  private analyzeSolution(matrix: number[][], vars: string[]): FinalSolution {
    const rows = matrix.length;
    const cols = matrix[0].length;
    let matrixRank = 0;
    let augmentedRank = 0;
    let isInconsistent = false;

    for (let i = 0; i < rows; i++) {
      const isCoeffZero = matrix[i].slice(0, cols - 1).every(val => Math.abs(val) < 1e-10);
      const constVal = matrix[i][cols - 1];

      if (!isCoeffZero) {
        matrixRank++;
        augmentedRank++;
      } else if (Math.abs(constVal) > 1e-10) {
        augmentedRank++;
        isInconsistent = true; // Row like [0 0 0 | 5] means 0 = 5 (Inconsistent)
      }
    }

    let status: SolutionStatus = 'unique';
    let statusMessage = '';
    const solutionVars: { [key: string]: number | string } = {};

    if (isInconsistent) {
      status = 'no-solution';
      statusMessage = 'System is Inconsistent (No Solution exists). Zero coefficient row equals non-zero constant.';
    } else if (matrixRank < vars.length) {
      status = 'infinite';
      statusMessage = `Infinitely Many Solutions exist. Free variables present (${vars.length - matrixRank} degrees of freedom).`;
      vars.forEach(v => solutionVars[v] = 'Parametric (Free Variable)');
    } else {
      status = 'unique';
      statusMessage = 'Unique Solution found for all system variables.';
      // Simple back substitution values extraction if matrix is reduced
      for (let i = 0; i < Math.min(rows, vars.length); i++) {
        solutionVars[vars[i]] = matrix[i][cols - 1];
      }
    }

    return {
      status,
      statusMessage,
      variables: solutionVars,
      matrixRank,
      augmentedRank,
      finalMatrix: matrix,
      variableNames: vars
    };
  }
}