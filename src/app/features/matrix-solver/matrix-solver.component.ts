import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatrixInputComponent } from '../components/matrix-input/matrix-input.component';
import { MatrixStepViewerComponent } from '../components/matrix-step-viewer/matrix-step-viewer.component';
import { MatrixVideoPlayerComponent } from '../components/matrix-video-player/matrix-video-player.component';
import { MatrixResultComponent } from '../components/matrix-result/matrix-result.component';
import { GaussSolverService } from '../../core/services/gauss-solver.service';
import { MatrixStep, FinalSolution } from '../../core/models/matrix.model';

@Component({
  selector: 'app-matrix-solver',
  standalone: true,
  imports: [
    CommonModule, 
    MatrixInputComponent, 
    MatrixStepViewerComponent, 
    MatrixVideoPlayerComponent,
    MatrixResultComponent
  ],
  templateUrl: './matrix-solver.component.html',
  styleUrls: ['./matrix-solver.component.scss']
})
export class MatrixSolverComponent {
  solutionSteps: MatrixStep[] = [];
  finalSolution: FinalSolution | null = null;
  viewMode: 'video' | 'list' = 'video';

  constructor(private solverService: GaussSolverService) {}

  onSolveRequested(event: { matrix: number[][]; rref: boolean; variableNames: string[] }): void {
    const result = this.solverService.solveSystem(event.matrix, event.rref, event.variableNames);
    this.solutionSteps = result.steps;
    this.finalSolution = result.finalSolution;
  }
}
