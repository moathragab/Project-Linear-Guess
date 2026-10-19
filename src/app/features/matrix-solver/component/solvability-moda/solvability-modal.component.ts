import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FinalSolution } from '../../../../core/models/matrix.model';

@Component({
  selector: 'app-solvability-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './solvability-modal.component.html',
  styleUrls: ['./solvability-modal.component.scss']
})
export class SolvabilityModalComponent {
  @Input() solution!: FinalSolution;
  @Input() numEquations: number = 0;
  @Input() numVariables: number = 0;
  @Output() confirmEvent = new EventEmitter<void>();
  @Output() closeEvent = new EventEmitter<void>();

  onProceed(): void {
    this.confirmEvent.emit();
  }

  onCancel(): void {
    this.closeEvent.emit();
  }
}