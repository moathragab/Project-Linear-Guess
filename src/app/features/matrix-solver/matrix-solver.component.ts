import { Component, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatrixInputComponent } from '../components/matrix-input/matrix-input.component';
import { MatrixStepViewerComponent } from '../components/matrix-step-viewer/matrix-step-viewer.component';
import { MatrixVideoPlayerComponent } from '../components/matrix-video-player/matrix-video-player.component';
import { MatrixResultComponent } from '../components/matrix-result/matrix-result.component';
import { SolvabilityModalComponent } from './component/solvability-modal/solvability-modal.component';
import { GaussSolverService } from '../../core/services/gauss-solver.service';
import { MatrixPdfService } from '../../core/services/matrix-pdf.service';
import { MatrixStep, FinalSolution } from '../../core/models/matrix.model';

@Component({
  selector: 'app-matrix-solver',
  standalone: true,
  imports: [
    CommonModule, 
    MatrixInputComponent, 
    MatrixStepViewerComponent, 
    MatrixVideoPlayerComponent,
    MatrixResultComponent,
    SolvabilityModalComponent
  ],
  templateUrl: './matrix-solver.component.html',
  styleUrls: ['./matrix-solver.component.scss']
})
export class MatrixSolverComponent {
  solutionSteps: MatrixStep[] = [];
  finalSolution: FinalSolution | null = null;
  viewMode: 'video' | 'list' | 'pdf' = 'video';
  isGeneratingPdf: boolean = false;
  pdfError: string | null = null;
  
  showPreCheckModal: boolean = false;
  pendingNumEq: number = 0;
  pendingNumVar: number = 0;

  currentPage: number = 1;
  pageSize: number = 10;

  constructor(
    private solverService: GaussSolverService,
    private pdfService: MatrixPdfService,
    private cdr: ChangeDetectorRef
  ) {}

  onSolveRequested(event: { matrix: number[][]; rref: boolean; variableNames: string[] }): void {
    const result = this.solverService.solveSystem(event.matrix, event.rref, event.variableNames);
    
    this.solutionSteps = result.steps;
    this.finalSolution = result.finalSolution;
    this.pendingNumEq = event.matrix.length;
    this.pendingNumVar = event.variableNames.length;
    this.currentPage = 1;
    this.pdfError = null;

    this.showPreCheckModal = true;
  }

  get totalPages(): number {
    return Math.ceil(this.solutionSteps.length / this.pageSize);
  }

  get paginatedSteps(): MatrixStep[] {
    const start = (this.currentPage - 1) * this.pageSize;
    return this.solutionSteps.slice(start, start + this.pageSize);
  }

  setPage(page: number): void {
    if (page >= 1 && page <= this.totalPages) {
      this.currentPage = page;
    }
  }

  confirmAndShowSteps(): void {
    this.showPreCheckModal = false;
  }

  closeModal(): void {
    this.showPreCheckModal = false;
    this.solutionSteps = [];
    this.finalSolution = null;
    this.pdfError = null;
  }

  async exportPdf(action: 'download' | 'open'): Promise<void> {
    if (!this.solutionSteps.length || !this.finalSolution || this.isGeneratingPdf) return;
    this.isGeneratingPdf = true;
    this.pdfError = null;
    this.cdr.detectChanges();

    try {
      await this.pdfService.generateSolutionPdf(this.solutionSteps, this.finalSolution, action);
    } catch (err: any) {
      this.pdfError = err?.message || 'Failed to generate PDF report. Please try again.';
    } finally {
      this.isGeneratingPdf = false;
      this.cdr.detectChanges();
    }
  }
}