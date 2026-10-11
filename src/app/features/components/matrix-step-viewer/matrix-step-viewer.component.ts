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
}