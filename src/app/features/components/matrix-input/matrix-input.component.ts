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
  
  numEquations: number = 3;
  numVariables: number = 3;

  constructor(
    private fb: FormBuilder,
    private parserService: EquationParserService
  ) {}

  ngOnInit(): void {
    this.initForm();
  }

  get totalCols(): number {
    return this.numVariables + 1;
  }

  get variableNames(): string[] {
    return Array.from({ length: this.numVariables }, (_, i) => `x${i + 1}`);
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
    const previousValues = this.grid ? this.grid.value : [];
    this.grid.clear();

    for (let i = 0; i < this.numEquations; i++) {
      const row = this.fb.array([]);
      for (let j = 0; j < this.totalCols; j++) {
        const existingVal = (previousValues[i] && previousValues[i][j] !== undefined) 
          ? previousValues[i][j] 
          : 0;
        row.push(this.fb.control(existingVal, Validators.required));
      }
      this.grid.push(row);
    }
  }

  adjustEquations(delta: number): void {
    const newVal = this.numEquations + delta;
    if (newVal >= 1 && newVal <= 1000) {
      this.numEquations = newVal;
      this.generateGrid();
    }
  }

  adjustVariables(delta: number): void {
    const newVal = this.numVariables + delta;
    if (newVal >= 1 && newVal <= 1000) {
      this.numVariables = newVal;
      this.generateGrid();
    }
  }

  promptValue(type: 'equations' | 'variables'): void {
    const current = type === 'equations' ? this.numEquations : this.numVariables;
    const input = prompt(`Enter number of ${type} (1 - 1000):, String(current)`);
    if (input !== null) {
      const val = parseInt(this.toEnglishDigits(input), 10);
      if (!isNaN(val) && val >= 1 && val <= 1000) {
        if (type === 'equations') {
          this.numEquations = val;
        } else {
          this.numVariables = val;
        }
        this.generateGrid();
      } else {
        alert('Please enter a valid number between 1 and 1000.');
      }
    }
  }

  adjustCellValue(rowIndex: number, colIndex: number, delta: number): void {
    const control = this.getRowArray(rowIndex).at(colIndex);
    const curr = Number(this.toEnglishDigits(String(control.value))) || 0;
    control.setValue(curr + delta);
  }

  loadSample(): void {
    this.numEquations = 3;
    this.numVariables = 3;
    const sample = [
      [2, 1, -1, 8],
      [-3, -1, 2, -11],
      [-2, 1, 2, -3]
    ];
    this.grid.clear();
    for (let i = 0; i < this.numEquations; i++) {
      const row = this.fb.array([]);
      for (let j = 0; j < this.totalCols; j++) {
        row.push(this.fb.control(sample[i][j]));
      }
      this.grid.push(row);
    }
  }
  randomize(): void {
    for (let i = 0; i < this.numEquations; i++) {
      const row = this.getRowArray(i);
      for (let j = 0; j < this.totalCols; j++) {
        row.at(j).setValue(Math.floor(Math.random() * 19) - 9);
      }
    }
  }

  submit(toRREF: boolean): void {
    if (this.inputMode === 'grid') {
      const matrixData: number[][] = this.grid.value.map((row: any[]) =>
        row.map(cell => Number(this.toEnglishDigits(String(cell))) || 0)
      );
      this.solveEvent.emit({ 
        matrix: matrixData, 
        rref: toRREF, 
        variableNames: this.variableNames 
      });
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

  toEnglishDigits(str: string): string {
    if (!str) return '';
    return str
      .replace(/[٠-٩]/g, d => (d.charCodeAt(0) - 1632).toString())
      .replace(/[^-0-9.]/g, '');
  }

  onCellInput(event: Event, rowIndex: number, colIndex: number): void {
    const inputEl = event.target as HTMLInputElement;
    const convertedValue = this.toEnglishDigits(inputEl.value);
    inputEl.value = convertedValue;
    this.getRowArray(rowIndex).at(colIndex).setValue(convertedValue, { emitEvent: false });
  }
}