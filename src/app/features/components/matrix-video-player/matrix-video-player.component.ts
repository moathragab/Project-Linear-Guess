import { Component, Input, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatrixStep } from '../../../core/models/matrix.model';

@Component({
  selector: 'app-matrix-video-player',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './matrix-video-player.component.html',
  styleUrls: ['./matrix-video-player.component.scss']
})
export class MatrixVideoPlayerComponent implements OnInit, OnDestroy {
  @Input() steps: MatrixStep[] = [];

  currentIndex: number = 0;
  isPlaying: boolean = false;
  playbackSpeed: number = 1000;
  private timer: any = null;

  constructor(private cdr: ChangeDetectorRef) {}

  ngOnInit(): void {}

  ngOnDestroy(): void {
    this.stopAutoplay();
  }

  togglePlay(): void {
    if (this.isPlaying) {
      this.stopAutoplay();
    } else {
      this.startAutoplay();
    }
  }

  startAutoplay(): void {
    this.stopAutoplay();

    if (this.currentIndex >= this.steps.length - 1) {
      this.currentIndex = 0;
    }

    this.isPlaying = true;
    this.timer = setInterval(() => {
      if (this.currentIndex < this.steps.length - 1) {
        this.currentIndex++;
        this.cdr.detectChanges();
      } else {
        this.stopAutoplay();
      }
    }, this.playbackSpeed);
  }

  stopAutoplay(): void {
    this.isPlaying = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.cdr.detectChanges();
  }

  prevStep(): void {
    if (this.currentIndex > 0) {
      this.currentIndex = Number(this.currentIndex) - 1;
    }
  }

  nextStep(): void {
    if (this.currentIndex < this.steps.length - 1) {
      this.currentIndex = Number(this.currentIndex) + 1;
    }
  }

  seekTo(index: any): void {
    this.currentIndex = Number(index);
    this.cdr.detectChanges();
  }

  setSpeed(ms: number): void {
    this.playbackSpeed = Number(ms);
    if (this.isPlaying) {
      this.startAutoplay();
    }
  }

  get currentStep(): MatrixStep {
    return this.steps[this.currentIndex] || this.steps[0];
  }

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
    const op = step.operationType;
    if (op === 'multiply') return 'scale';
    if (op === 'add-multiple') return 'eliminate';
    return op;
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