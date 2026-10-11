export type SolutionStatus = 'unique' | 'infinite' | 'no-solution';

export interface MatrixStep {
  stepNumber: number;
  matrix: number[][];
  equations: string[];             // المعادلات الخطية المكتوبة المقابلة للمصفوفة
  description: string;             // ملخص قصير
  detailedExplanation: string;     // شرح خطوة بخطوة مفصل
  operationType: 'initial' | 'swap' | 'scale' | 'eliminate' | 'complete';
  highlightRow?: number;           // الصف المستهدف للتغيير
  pivotRow?: number;               // صف الارتكاز
  pivotCol?: number;               // عمود الارتكاز
  formulaDetail?: string;          // صيغة الصف الرياضية (R2 = R2 - 2R1)
}

export interface FinalSolution {
  status: SolutionStatus;
  statusMessage: string;
  variables: { [key: string]: number | string };
  matrixRank: number;
  augmentedRank: number;
  finalMatrix: number[][];
  variableNames: string[];
}