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

  getObjectKeys(obj: any): string[] {
    return Object.keys(obj);
  }
}