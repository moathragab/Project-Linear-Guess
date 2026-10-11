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
  playbackSpeed: number = 1000; // السرعة الافتراضية بالمللي ثانية
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
    this.stopAutoplay(); // إلغاء أي مؤقت سابق لضمان عدم التداخل

    // إذا وصلنا لنهاية الفريمات وأعدنا التشغيل، نرجع للبداية
    if (this.currentIndex >= this.steps.length - 1) {
      this.currentIndex = 0;
    }

    this.isPlaying = true;
    this.timer = setInterval(() => {
      if (this.currentIndex < this.steps.length - 1) {
        this.currentIndex++;
        this.cdr.detectChanges(); // تحديث الواجهة فوراً عند كل فريم
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
    // تحويل القيمة لرقم صريح لمنع تحول النوع إلى String
    this.currentIndex = Number(index);
    this.cdr.detectChanges();
  }

  setSpeed(ms: number): void {
    this.playbackSpeed = Number(ms);
    // إذا كان الفيديو يعمل بالفعل، نعيد تشغيل المؤقت بالسرعة الجديدة مباشرة
    if (this.isPlaying) {
      this.startAutoplay();
    }
  }

  get currentStep(): MatrixStep {
    return this.steps[this.currentIndex] || this.steps[0];
  }
}