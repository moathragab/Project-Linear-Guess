import { Component, EventEmitter, Output, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, FormArray, ReactiveFormsModule, FormsModule, Validators } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { EquationParserService } from '../../../core/services/equation-parser.service';

@Component({
  selector: 'app-matrix-input',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule],
  templateUrl: './matrix-input.component.html',
  styleUrls: ['./matrix-input.component.scss']
})
export class MatrixInputComponent implements OnInit {
  @Output() solveEvent = new EventEmitter<{ 
    matrix: number[][]; 
    rref: boolean; 
    variableNames: string[] 
  }>();
  inputMode: 'grid' | 'text' = 'grid';
  matrixForm!: FormGroup;
  textEquations = "2x + y - z = 8\n-3x - y + 2z = -11\n-2x + y + 2z = -3";
  
  rows = 3;
  cols = 4;

  constructor(
    private fb: FormBuilder,
    private parserService: EquationParserService
  ) {}

  ngOnInit(): void {
    this.initForm();
  }

  initForm(): void {
    this.matrixForm = this.fb.group({
      grid: this.fb.array([])
    });
    this.generateGrid();
  }

  get grid(): FormArray {
    return this.matrixForm.get('grid') as FormArray;
  }

  getRowArray(rowIndex: number): FormArray {
    return this.grid.at(rowIndex) as FormArray;
  }

  generateGrid(): void {
    this.grid.clear();
    for (let i = 0; i < this.rows; i++) {
      const row = this.fb.array([]);
      for (let j = 0; j < this.cols; j++) {
        row.push(this.fb.control(0, Validators.required));
      }
      this.grid.push(row);
    }
  }

  // Custom Steppers for Smooth Control
  adjustDimension(type: 'rows' | 'cols', delta: number): void {
    if (type === 'rows') {
      const newVal = this.rows + delta;
      if (newVal >= 1 && newVal <= 10) {
        this.rows = newVal;
        this.generateGrid();
      }
    } else {
      const newVal = this.cols + delta;
      if (newVal >= 2 && newVal <= 11) {
        this.cols = newVal;
        this.generateGrid();
      }
    }
  }

  adjustCellValue(rowIndex: number, colIndex: number, delta: number): void {
    const control = this.getRowArray(rowIndex).at(colIndex);
    const curr = Number(this.toEnglishDigits(String(control.value))) || 0;
    control.setValue(curr + delta);
  }

  loadSample(): void {
    this.rows = 3;
    this.cols = 4;
    const sample = [
      [2, 1, -1, 8],
      [-3, -1, 2, -11],
      [-2, 1, 2, -3]
    ];
    this.grid.clear();
    for (let i = 0; i < this.rows; i++) {
      const row = this.fb.array([]);
      for (let j = 0; j < this.cols; j++) {
        row.push(this.fb.control(sample[i][j]));
      }
      this.grid.push(row);
    }
  }

  randomize(): void {
    for (let i = 0; i < this.rows; i++) {
      const row = this.getRowArray(i);
      for (let j = 0; j < this.cols; j++) {
        row.at(j).setValue(Math.floor(Math.random() * 19) - 9);
      }
    }
  }

  submit(toRREF: boolean): void {
    if (this.inputMode === 'grid') {
      const matrixData: number[][] = this.grid.value.map((row: any[]) =>
        row.map(cell => Number(cell) || 0)
      );
      const vars = Array.from({ length: this.cols - 1 }, (_, i) => `x${i + 1}`);
      this.solveEvent.emit({ matrix: matrixData, rref: toRREF, variableNames: vars });
    } else {
      const parsed = this.parserService.parseEquations(this.textEquations.split('\n'));
      if (parsed) {
        this.solveEvent.emit({ 
          matrix: parsed.matrix, 
          rref: toRREF, 
          variableNames: parsed.variableNames 
        });
      } else {
        alert('Could not parse textual equations. Please check format (e.g. 2x + 3y = 7).');
      }
    }
  }

  // دالة تحويل الأرقام العربية الشرقية إلى أرقام إنجليزية لاتينية
  toEnglishDigits(str: string): string {
    if (!str) return '';
    return str
      .replace(/[٠-٩]/g, d => (d.charCodeAt(0) - 1632).toString()) // تحويل الأرقام الشرقية
      .replace(/[^-0-9.]/g, ''); // السماح فقط بالأرقام والنقطة والعلامة السالبة
  }
  
  // عند كتابة أو تغيير القيمة داخل الخلية
  onCellInput(event: Event, rowIndex: number, colIndex: number): void {
    const inputEl = event.target as HTMLInputElement;
    const convertedValue = this.toEnglishDigits(inputEl.value);
    
    // تحديث القيمة المعروضة وقيمة النموذج فوراً
    inputEl.value = convertedValue;
    this.getRowArray(rowIndex).at(colIndex).setValue(convertedValue, { emitEvent: false });
  }
}