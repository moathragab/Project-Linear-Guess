export type SolutionStatus = 'unique' | 'infinite' | 'no-solution';

export interface MatrixStep {
  stepNumber: number;
  matrix: number[][];
  equations: string[];
  description: string;
  detailedExplanation: string;
  operationType: 'initial' | 'swap' | 'multiply' | 'add-multiple' | 'complete';
  highlightRow?: number;
  leadingRow?: number;
  leadingCol?: number;
  formulaDetail?: string;
}

export interface FinalSolution {
  status: SolutionStatus;
  statusMessage: string;
  variables: { [key: string]: number | string };
  variableEquations: string[];
  leadingCount: number;
  freeParametersCount: number;
  finalMatrix: number[][];
  variableNames: string[];
}