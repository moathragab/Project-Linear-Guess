import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FinalSolution } from '../../../core/models/matrix.model';

@Component({
  selector: 'app-matrix-result',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './matrix-result.component.html',
  styleUrls: ['./matrix-result.component.scss']
})
export class MatrixResultComponent {
  @Input() solution!: FinalSolution;

  getOrderedVariableNames(): string[] {
    if (!this.solution) return [];
    if (this.solution.variableNames && this.solution.variableNames.length > 0) {
      return this.solution.variableNames;
    }
    return Object.keys(this.solution.variables || {});
  }
}