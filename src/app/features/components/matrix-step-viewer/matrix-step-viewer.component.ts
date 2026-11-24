import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatrixStep } from '../../../core/models/matrix.model';

@Component({
  selector: 'app-matrix-step-viewer',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './matrix-step-viewer.component.html',
  styleUrls: ['./matrix-step-viewer.component.scss']
})
export class MatrixStepViewerComponent {
  @Input() step!: MatrixStep;

  formatVal(val: number): string {
    if (val === null || val === undefined || Math.abs(val) < 1e-10) return '0';
    const rounded = Math.round((val + Number.EPSILON) * 1000) / 1000;
    return Math.abs(rounded) < 1e-10 ? '0' : String(rounded);
  }

  getRefRow(step: MatrixStep): number | undefined {
    return step.leadingRow ?? (step as any).leadingRow;
  }

  getTargetRow(step: MatrixStep): number | undefined {
    return step.highlightRow;
  }

  getActiveCol(step: MatrixStep): number | undefined {
    return step.leadingCol ?? (step as any).leadingCol;
  }

  getNormalizedOp(step: MatrixStep): 'initial' | 'swap' | 'scale' | 'eliminate' | 'complete' {
    const op = step.operationType as string;
    if (op === 'multiply') return 'scale';
    if (op === 'add-multiple') return 'eliminate';
    if (op === 'initial' || op === 'swap' || op === 'complete') return op;
    return 'initial';
  }

  getRowRole(step: MatrixStep, rowIndex: number): 'swap' | 'source' | 'target' | 'none' {
    if (!step) return 'none';
    const op = this.getNormalizedOp(step);
    const refRow = this.getRefRow(step);
    const targetRow = this.getTargetRow(step);

    if (op === 'swap') {
      if (rowIndex === refRow || rowIndex === targetRow) return 'swap';
      return 'none';
    }
    if (op === 'scale' && rowIndex === refRow) {
      return 'source';
    }
    if (op === 'eliminate') {
      if (rowIndex === refRow) return 'source';
      if (rowIndex === targetRow) return 'target';
    }
    return 'none';
  }

  isActiveCol(step: MatrixStep, colIndex: number): boolean {
    const activeCol = this.getActiveCol(step);
    const op = this.getNormalizedOp(step);
    return activeCol !== undefined && activeCol === colIndex && (op === 'scale' || op === 'eliminate');
  }

  isPivotCell(step: MatrixStep, rowIndex: number, colIndex: number): boolean {
    const op = this.getNormalizedOp(step);
    return (
      (op === 'scale' || op === 'eliminate') &&
      rowIndex === this.getRefRow(step) &&
      colIndex === this.getActiveCol(step)
    );
  }

  isTargetCell(step: MatrixStep, rowIndex: number, colIndex: number): boolean {
    return (
      this.getNormalizedOp(step) === 'eliminate' &&
      rowIndex === this.getTargetRow(step) &&
      colIndex === this.getActiveCol(step)
    );
  }
}