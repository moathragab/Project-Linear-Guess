import { Component, Input, OnInit, OnDestroy } from '@angular/core';
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
  currentIndex = 0;
  isPlaying = false;
  playbackSpeed = 1000; // ms per step
  private timer: any;

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
    this.isPlaying = true;
    this.timer = setInterval(() => {
      if (this.currentIndex < this.steps.length - 1) {
        this.currentIndex++;
      } else {
        this.stopAutoplay();
      }
    }, this.playbackSpeed);
  }

  stopAutoplay(): void {
    this.isPlaying = false;
    if (this.timer) clearInterval(this.timer);
  }

  prevStep(): void {
    if (this.currentIndex > 0) this.currentIndex--;
  }

  nextStep(): void {
    if (this.currentIndex < this.steps.length - 1) this.currentIndex++;
  }

  seekTo(index: number): void {
    this.currentIndex = index;
  }

  setSpeed(ms: number): void {
    this.playbackSpeed = ms;
    if (this.isPlaying) {
      this.stopAutoplay();
      this.startAutoplay();
    }
  }

  get currentStep(): MatrixStep {
    return this.steps[this.currentIndex] || this.steps[0];
  }
}