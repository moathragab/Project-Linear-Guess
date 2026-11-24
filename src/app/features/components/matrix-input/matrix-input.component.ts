import { Component, EventEmitter, Output, OnInit, OnDestroy, ChangeDetectorRef, ViewChild, ElementRef } from '@angular/core';
import { FormBuilder, FormGroup, FormArray, ReactiveFormsModule, FormsModule, Validators, AbstractControl } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { EquationParserService } from '../../../core/services/equation-parser.service';
import { MatrixOcrService, SmartExtractionResult, OcrExtractionError } from '../../../core/services/matrix-ocr.service';

@Component({
  selector: 'app-matrix-input',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule],
  templateUrl: './matrix-input.component.html',
  styleUrls: ['./matrix-input.component.scss']
})
export class MatrixInputComponent implements OnInit, OnDestroy {
  @Output() solveEvent = new EventEmitter<{ 
    matrix: number[][]; 
    rref: boolean; 
    variableNames: string[] 
  }>();

  @ViewChild('cropCanvas') cropCanvasRef?: ElementRef<HTMLCanvasElement>;

  inputMode: 'grid' | 'text' | 'import' = 'grid';
  matrixForm!: FormGroup;
  textEquations: string = '';
  
  numEquations: number = 3;
  numVariables: number = 3;

  validationError: string | null = null;
  syncStatusMessage: string | null = null;
  invalidCells = new Set<string>();

  // Smart Import (Neural Math-LaTeX AI + Interactive Crop/Rotate) State
  isDragOver: boolean = false;
  isExtracting: boolean = false;
  extractProgress: number = 0;
  extractStage: string = '';
  importedFileName: string | null = null;
  importedPreviewUrl: string | null = null;
  extractedRawText: string = '';
  extractionResult: SmartExtractionResult | null = null;
  reparseFeedback: string | null = null;

  // Interactive Image Crop & Rotate State
  loadedSourceImage: HTMLImageElement | null = null;
  rotationDeg: number = 0;
  cropRect: { x: number; y: number; w: number; h: number } | null = null;
  private isDraggingCrop: boolean = false;
  private cropStartPt: { x: number; y: number } = { x: 0, y: 0 };

  private customVariableNames: string[] | null = null;
  private isSyncing: boolean = false;

  constructor(
    private fb: FormBuilder,
    private parserService: EquationParserService,
    private ocrService: MatrixOcrService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.initForm();
  }

  ngOnDestroy(): void {
    if (this.importedPreviewUrl) {
      URL.revokeObjectURL(this.importedPreviewUrl);
    }
  }

  get totalCols(): number {
    return this.numVariables + 1;
  }

  get variableNames(): string[] {
    if (this.customVariableNames && this.customVariableNames.length === this.numVariables) {
      return this.customVariableNames;
    }
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

  switchMode(mode: 'grid' | 'text' | 'import'): void {
    if (this.inputMode === mode) return;
    this.validationError = null;
    this.reparseFeedback = null;

    if (this.inputMode === 'grid' && mode === 'text') {
      this.syncGridToText(true);
    } else if (this.inputMode === 'text' && mode === 'grid') {
      this.syncTextToGrid(true);
    }

    this.inputMode = mode;
    if (mode === 'import' && this.loadedSourceImage) {
      setTimeout(() => this.redrawCropCanvas(), 0);
    }
  }

  // ==================== SMART IMPORT + INTERACTIVE CROP/ROTATE ====================

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragOver = true;
  }

  onDragLeave(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragOver = false;
  }

  onFileDrop(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragOver = false;
    const file = event.dataTransfer?.files?.[0];
    if (file) {
      this.processUploadedFile(file);
    }
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) {
      this.processUploadedFile(file);
      input.value = '';
    }
  }

  onImportPaste(event: ClipboardEvent): void {
    const items = event.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith('image/')) {
        const blob = items[i].getAsFile();
        if (blob) {
          event.preventDefault();
          const pastedFile = new File([blob], 'pasted-screenshot.png', { type: blob.type });
          this.processUploadedFile(pastedFile);
          return;
        }
      }
    }
  }

  async processUploadedFile(file: File): Promise<void> {
    this.validationError = null;
    this.reparseFeedback = null;
    this.extractionResult = null;
    this.importedFileName = file.name;
    this.rotationDeg = 0;
    this.cropRect = null;
    this.loadedSourceImage = null;

    if (this.importedPreviewUrl) {
      URL.revokeObjectURL(this.importedPreviewUrl);
      this.importedPreviewUrl = null;
    }

    if (file.type.startsWith('image/')) {
      this.importedPreviewUrl = URL.createObjectURL(file);
      await this.loadImageForCropper(this.importedPreviewUrl);
    }

    await this.runExtractionPipeline(file);
  }

  private loadImageForCropper(url: string): Promise<void> {
    return new Promise(resolve => {
      const img = new Image();
      img.onload = () => {
        this.loadedSourceImage = img;
        this.cdr.detectChanges();
        setTimeout(() => this.redrawCropCanvas(), 0);
        resolve();
      };
      img.onerror = () => resolve();
      img.src = url;
    });
  }

  rotateImage(deltaDeg: number): void {
    if (!this.loadedSourceImage) return;
    this.rotationDeg = (this.rotationDeg + deltaDeg) % 360;
    this.cropRect = null;
    this.redrawCropCanvas();
  }

  resetCropAndRotation(): void {
    this.rotationDeg = 0;
    this.cropRect = null;
    this.redrawCropCanvas();
  }

  onCropMouseDown(event: MouseEvent): void {
    const canvas = this.cropCanvasRef?.nativeElement;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    this.isDraggingCrop = true;
    this.cropStartPt = {
      x: (event.clientX - rect.left) * scaleX,
      y: (event.clientY - rect.top) * scaleY
    };
    this.cropRect = { x: this.cropStartPt.x, y: this.cropStartPt.y, w: 0, h: 0 };
  }

  onCropMouseMove(event: MouseEvent): void {
    if (!this.isDraggingCrop) return;
    const canvas = this.cropCanvasRef?.nativeElement;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    const currX = Math.max(0, Math.min(canvas.width, (event.clientX - rect.left) * scaleX));
    const currY = Math.max(0, Math.min(canvas.height, (event.clientY - rect.top) * scaleY));

    this.cropRect = {
      x: Math.min(this.cropStartPt.x, currX),
      y: Math.min(this.cropStartPt.y, currY),
      w: Math.abs(currX - this.cropStartPt.x),
      h: Math.abs(currY - this.cropStartPt.y)
    };
    this.redrawCropCanvas();
  }

  onCropMouseUp(): void {
    if (!this.isDraggingCrop) return;
    this.isDraggingCrop = false;
    if (this.cropRect && (this.cropRect.w < 15 || this.cropRect.h < 15)) {
      this.cropRect = null;
      this.redrawCropCanvas();
    }
  }

  redrawCropCanvas(): void {
    const canvas = this.cropCanvasRef?.nativeElement;
    const img = this.loadedSourceImage;
    if (!canvas || !img) return;

    const rad = (this.rotationDeg * Math.PI) / 180;
    const sin = Math.abs(Math.sin(rad));
    const cos = Math.abs(Math.cos(rad));

    const rotW = Math.round(img.width * cos + img.height * sin);
    const rotH = Math.round(img.width * sin + img.height * cos);

    const maxDisplayW = 540;
    const displayScale = rotW > maxDisplayW ? maxDisplayW / rotW : 1;

    canvas.width = Math.round(rotW * displayScale);
    canvas.height = Math.round(rotH * displayScale);

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate(rad);
    ctx.scale(displayScale, displayScale);
    ctx.drawImage(img, -img.width / 2, -img.height / 2);
    ctx.restore();

    if (this.cropRect && this.cropRect.w > 10 && this.cropRect.h > 10) {
      ctx.fillStyle = 'rgba(15, 23, 42, 0.55)';
      ctx.fillRect(0, 0, canvas.width, this.cropRect.y);
      ctx.fillRect(0, this.cropRect.y + this.cropRect.h, canvas.width, canvas.height - (this.cropRect.y + this.cropRect.h));
      ctx.fillRect(0, this.cropRect.y, this.cropRect.x, this.cropRect.h);
      ctx.fillRect(this.cropRect.x + this.cropRect.w, this.cropRect.y, canvas.width - (this.cropRect.x + this.cropRect.w), this.cropRect.h);

      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.strokeRect(this.cropRect.x, this.cropRect.y, this.cropRect.w, this.cropRect.h);
      ctx.setLineDash([]);
    }
  }

  async extractFromCroppedOrFullImage(): Promise<void> {
    const img = this.loadedSourceImage;
    const displayCanvas = this.cropCanvasRef?.nativeElement;
    if (!img || !displayCanvas) return;

    const rad = (this.rotationDeg * Math.PI) / 180;
    const sin = Math.abs(Math.sin(rad));
    const cos = Math.abs(Math.cos(rad));
    const fullW = Math.round(img.width * cos + img.height * sin);
    const fullH = Math.round(img.width * sin + img.height * cos);

    const fullCanvas = document.createElement('canvas');
    fullCanvas.width = fullW;
    fullCanvas.height = fullH;
    const fCtx = fullCanvas.getContext('2d')!;
    fCtx.fillStyle = '#ffffff';
    fCtx.fillRect(0, 0, fullW, fullH);
    fCtx.translate(fullW / 2, fullH / 2);
    fCtx.rotate(rad);
    fCtx.drawImage(img, -img.width / 2, -img.height / 2);

    if (this.cropRect && this.cropRect.w > 15 && this.cropRect.h > 15) {
      const ratioX = fullW / displayCanvas.width;
      const ratioY = fullH / displayCanvas.height;

      const sx = Math.round(this.cropRect.x * ratioX);
      const sy = Math.round(this.cropRect.y * ratioY);
      const sw = Math.round(this.cropRect.w * ratioX);
      const sh = Math.round(this.cropRect.h * ratioY);

      const croppedOut = document.createElement('canvas');
      croppedOut.width = sw;
      croppedOut.height = sh;
      croppedOut.getContext('2d')!.drawImage(fullCanvas, sx, sy, sw, sh, 0, 0, sw, sh);
      await this.runExtractionPipeline(croppedOut);
    } else {
      await this.runExtractionPipeline(fullCanvas);
    }
  }

  private async runExtractionPipeline(source: File | HTMLCanvasElement): Promise<void> {
    this.validationError = null;
    this.reparseFeedback = null;
    this.extractionResult = null;
    this.isExtracting = true;
    this.extractProgress = 5;
    this.extractStage = 'Initializing Neural Math AI...';
    this.cdr.detectChanges();

    try {
      const result = await this.ocrService.extractFromSource(source, (pct, stage) => {
        this.extractProgress = pct;
        this.extractStage = stage;
        this.cdr.detectChanges();
      });

      this.extractionResult = result;
      this.extractedRawText = result.rawCleanedText;
      this.applyExtractedSystem(result, false);
      this.reparseFeedback = `Extracted ${result.detectedType === 'equations' ? 'Linear Equations' : 'Augmented Matrix'} (${this.numEquations} × ${this.numVariables}) via Neural Math AI.`;
    } catch (err: any) {
      this.validationError = err?.message || 'Failed to extract equations or matrix.';
      if (err instanceof OcrExtractionError && err.rawText) {
        this.extractedRawText = err.rawText;
      }
    } finally {
      this.isExtracting = false;
      this.cdr.detectChanges();
    }
  }

  reparseExtractedText(): boolean {
    this.validationError = null;
    this.reparseFeedback = null;

    const raw = (this.extractedRawText || '').trim();
    if (!raw) {
      this.validationError = 'Mandatory Rule: Extracted text box is empty.';
      return false;
    }

    if (raw.includes('=') || /[a-zA-Z]/.test(raw)) {
      const parsedEq = this.parseEditedEquations(raw);
      if (!parsedEq) {
        this.validationError = 'Invalid equation syntax. Ensure each line has "=" and valid terms (e.g., 2x + y = 5).';
        return false;
      }

      const eqText = parsedEq.matrix.map(row => {
        const lhs = parsedEq.variableNames
          .map((v, idx) => `${row[idx]}${v}`)
          .join(' + ')
          .replace(/\+\s*-/g, '- ');
        return `${lhs} = ${row[parsedEq.variableNames.length]}`;
      }).join('\n');

      const result: SmartExtractionResult = {
        detectedType: 'equations',
        matrix: parsedEq.matrix,
        variableNames: parsedEq.variableNames,
        equationsText: eqText,
        rawCleanedText: raw,
        confidence: 100
      };

      this.extractionResult = result;
      this.applyExtractedSystem(result, false);
      this.reparseFeedback = `Applied (${this.numEquations} × ${this.numVariables})`;
      this.cdr.detectChanges();
      return true;
    }

    try {
      const result = this.ocrService.parseExtractedMathText(raw, 100);
      this.extractionResult = result;
      this.extractedRawText = result.rawCleanedText;
      this.applyExtractedSystem(result, false);
      this.reparseFeedback = `Applied (${this.numEquations} × ${this.numVariables})`;
      return true;
    } catch (err: any) {
      this.validationError = err?.message || 'Unable to parse the edited text.';
      return false;
    } finally {
      this.cdr.detectChanges();
    }
  }

  private parseEditedEquations(rawText: string): { matrix: number[][]; variableNames: string[] } | null {
    const subMap: Record<string, string> = {
      '₀': '0', '₁': '1', '₂': '2', '₃': '3', '₄': '4',
      '₅': '5', '₆': '6', '₇': '7', '₈': '8', '₉': '9'
    };

    const lines = rawText
      .replace(/[٠-٩]/g, d => (d.charCodeAt(0) - 1632).toString())
      .replace(/[₀-₉]/g, s => subMap[s] || s)
      .replace(/[–—−‐]/g, '-')
      .replace(/([a-zA-Z])_\{?(\d+)\}?/g, '$1$2')
      .split(/\r?\n/)
      .map(l => l.replace(/[,;]+$/g, '').trim())
      .filter(Boolean);

    if (lines.length === 0) return null;

    const eqList: { coeffs: Map<string, number>; constant: number }[] = [];
    const varSet = new Set<string>();

    const evalNum = (s: string): number | null => {
      const t = s.trim();
      if (t === '' || t === '+') return 1;
      if (t === '-') return -1;
      if (t.includes('/')) {
        const [n, d] = t.split('/').map(Number);
        return Number.isFinite(n) && Number.isFinite(d) && d !== 0 ? n / d : null;
      }
      if (!/^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(t)) return null;
      const num = Number(t);
      return Number.isFinite(num) ? num : null;
    };

    const parseSide = (
      expr: string,
      varSign: 1 | -1,
      coeffs: Map<string, number>,
      onConst: (v: number) => void
    ): boolean => {
      const compact = expr.replace(/\*/g, '').replace(/([+-])\s+/g, '$1').trim();
      if (!compact || compact === '0') return true;
      const tokens = compact.split(/(?=[+-])/).map(t => t.trim()).filter(Boolean);

      for (const tok of tokens) {
        const varMatch = tok.match(/^([+-]?(?:\d+(?:\.\d+)?(?:\/\d+(?:\.\d+)?)?)?)\s*([a-zA-Z][a-zA-Z0-9]*)$/);
        if (varMatch) {
          const c = evalNum(varMatch[1]);
          if (c === null) return false;
          const v = varMatch[2];
          coeffs.set(v, (coeffs.get(v) ?? 0) + c * varSign);
          continue;
        }
        const cVal = evalNum(tok);
        if (cVal !== null) {
          onConst(cVal);
          continue;
        }
        return false;
      }
      return true;
    };

    for (const line of lines) {
      const parts = line.split('=');
      if (parts.length !== 2 || !parts[0].trim() || !parts[1].trim()) return null;

      const coeffs = new Map<string, number>();
      let rhs = 0;

      if (!parseSide(parts[0], 1, coeffs, c => { rhs -= c; })) return null;
      if (!parseSide(parts[1], -1, coeffs, c => { rhs += c; })) return null;
      if (coeffs.size === 0) return null;

      coeffs.forEach((_, v) => varSet.add(v));
      eqList.push({ coeffs, constant: rhs });
    }

    const variableNames = Array.from(varSet);
    const matrix = eqList.map(eq => [
      ...variableNames.map(v => eq.coeffs.get(v) ?? 0),
      eq.constant
    ]);

    return { matrix, variableNames };
  }

  applyExtractedSystem(result: SmartExtractionResult, switchToGrid: boolean = false): void {
    this.isSyncing = true;
    this.numEquations = result.matrix.length;
    this.numVariables = result.variableNames.length;
    this.customVariableNames = result.variableNames;

    this.grid.clear();
    this.invalidCells.clear();

    for (let i = 0; i < this.numEquations; i++) {
      const row = this.fb.array([]);
      for (let j = 0; j < this.totalCols; j++) {
        const val = result.matrix[i][j] ?? 0;
        row.push(this.fb.control(val, [
          Validators.required,
          Validators.pattern(/^-?\d+(\.\d+)?$/)
        ]));
      }
      this.grid.push(row);
    }

    this.textEquations = result.equationsText;
    this.syncStatusMessage = `Imported (${result.detectedType === 'equations' ? 'Equations' : 'Matrix'}): ${this.numEquations} × ${this.numVariables}`;
    this.isSyncing = false;

    if (switchToGrid) {
      this.inputMode = 'grid';
    }
  }

  // ==================== GRID & TEXT INPUT LOGIC ====================

  generateGrid(): void {
    const previousValues = this.grid ? this.grid.value : [];
    this.grid.clear();
    this.invalidCells.clear();
    this.validationError = null;

    for (let i = 0; i < this.numEquations; i++) {
      const row = this.fb.array([]);
      for (let j = 0; j < this.totalCols; j++) {
        const rawPrev = (previousValues[i] && previousValues[i][j] !== undefined) 
          ? previousValues[i][j] 
          : 0;
        const cleanPrev = this.parseStrictNumber(rawPrev) ?? 0;
        row.push(this.fb.control(cleanPrev, [
          Validators.required,
          Validators.pattern(/^-?\d+(\.\d+)?$/)
        ]));
      }
      this.grid.push(row);
    }

    this.syncGridToText();
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
      this.customVariableNames = null;
      this.generateGrid();
    }
  }

  promptValue(type: 'equations' | 'variables'): void {
    const current = type === 'equations' ? this.numEquations : this.numVariables;
    const input = prompt(`Enter number of ${type} (1 - 1000):`, String(current));
    if (input !== null) {
      const sanitized = this.toEnglishDigits(input).replace(/[^0-9]/g, '');
      const val = parseInt(sanitized, 10);
      if (!isNaN(val) && val >= 1 && val <= 1000) {
        if (type === 'equations') {
          this.numEquations = val;
        } else {
          this.numVariables = val;
          this.customVariableNames = null;
        }
        this.generateGrid();
      } else {
        this.validationError = `Invalid ${type} count. Please enter an integer between 1 and 1000.`;
      }
    }
  }

  adjustCellValue(rowIndex: number, colIndex: number, delta: number): void {
    const control = this.getRowArray(rowIndex).at(colIndex);
    const curr = this.parseStrictNumber(control.value) ?? 0;
    const nextVal = Math.round((curr + delta) * 10000) / 10000;
    control.setValue(nextVal);
    this.invalidCells.delete(`${rowIndex}-${colIndex}`);
    this.validationError = null;
    this.syncGridToText();
  }

  loadSample(): void {
    this.numEquations = 3;
    this.numVariables = 3;
    this.customVariableNames = null;
    const sample = [
      [2, 1, -1, 8],
      [-3, -1, 2, -11],
      [-2, 1, 2, -3]
    ];
    this.grid.clear();
    this.invalidCells.clear();
    this.validationError = null;

    for (let i = 0; i < this.numEquations; i++) {
      const row = this.fb.array([]);
      for (let j = 0; j < this.totalCols; j++) {
        row.push(this.fb.control(sample[i][j], [
          Validators.required,
          Validators.pattern(/^-?\d+(\.\d+)?$/)
        ]));
      }
      this.grid.push(row);
    }

    this.syncGridToText(true);
  }

  randomize(): void {
    this.invalidCells.clear();
    this.validationError = null;
    for (let i = 0; i < this.numEquations; i++) {
      const row = this.getRowArray(i);
      for (let j = 0; j < this.totalCols; j++) {
        row.at(j).setValue(Math.floor(Math.random() * 19) - 9);
      }
    }

    this.syncGridToText(true);
  }

  syncGridToText(force: boolean = false): void {
    if (this.isSyncing) return;

    const totalElements = this.numEquations * this.numVariables;
    if (!force && totalElements > 900) return;

    this.isSyncing = true;
    const numericMatrix: number[][] = this.grid.value.map((row: any[]) =>
      row.map(cell => this.parseStrictNumber(cell) ?? 0)
    );
    const equations = this.parserService.matrixToEquations(numericMatrix, this.variableNames);
    this.textEquations = equations.join('\n');
    this.syncStatusMessage = `Synced: ${this.numEquations} × ${this.numVariables} system`;
    this.isSyncing = false;
  }

  onTextEquationsChange(): void {
    if (this.isSyncing) return;
    this.syncTextToGrid(false);
  }

  syncTextToGrid(fromTabSwitch: boolean = false): void {
    if (this.isSyncing) return;

    const lines = this.textEquations
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0);

    if (lines.length === 0) {
      this.syncStatusMessage = null;
      return;
    }

    const parsed = this.parserService.parseEquations(lines);
    if (!parsed || parsed.matrix.length === 0) {
      if (fromTabSwitch) {
        this.validationError = 'Some text equations could not be parsed into the matrix. Check equation syntax (e.g., 2x1 + x2 = 5).';
      } else {
        this.syncStatusMessage = 'Typing equations... (complete each equation with "= value" to sync with matrix)';
      }
      return;
    }

    this.isSyncing = true;
    this.numEquations = parsed.matrix.length;
    this.numVariables = parsed.variableNames.length;
    this.customVariableNames = parsed.variableNames;

    this.grid.clear();
    this.invalidCells.clear();
    this.validationError = null;

    for (let i = 0; i < this.numEquations; i++) {
      const row = this.fb.array([]);
      for (let j = 0; j < this.totalCols; j++) {
        const val = parsed.matrix[i][j] ?? 0;
        row.push(this.fb.control(val, [
          Validators.required,
          Validators.pattern(/^-?\d+(\.\d+)?$/)
        ]));
      }
      this.grid.push(row);
    }

    this.syncStatusMessage = `Synced to Matrix: ${this.numEquations} equations × ${this.numVariables} variables`;
    this.isSyncing = false;
  }

  onCellKeyDown(event: KeyboardEvent): void {
    const allowedKeys = [
      'Backspace', 'Delete', 'Tab', 'Escape', 'Enter',
      'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'
    ];

    if (allowedKeys.includes(event.key)) return;
    if ((event.ctrlKey || event.metaKey) && ['a', 'c', 'v', 'x'].includes(event.key.toLowerCase())) return;

    const inputEl = event.target as HTMLInputElement;
    const currentVal = inputEl.value;
    const selStart = inputEl.selectionStart ?? 0;
    const selEnd = inputEl.selectionEnd ?? 0;
    const hasSelection = selEnd > selStart;

    if (/^[0-9٠-٩]$/.test(event.key)) return;

    if (event.key === '-') {
      if (selStart === 0 && (!currentVal.includes('-') || hasSelection)) return;
      event.preventDefault();
      return;
    }

    if (event.key === '.') {
      if (!currentVal.includes('.') || hasSelection) return;
      event.preventDefault();
      return;
    }

    event.preventDefault();
  }

  onCellPaste(event: ClipboardEvent, rowIndex: number, colIndex: number): void {
    event.preventDefault();
    const pasted = event.clipboardData?.getData('text') || '';
    const cleanStr = this.toEnglishDigits(pasted);
    const inputEl = event.target as HTMLInputElement;
    inputEl.value = cleanStr;
    this.updateCellControl(rowIndex, colIndex, cleanStr);
  }

  onCellInput(event: Event, rowIndex: number, colIndex: number): void {
    const inputEl = event.target as HTMLInputElement;
    const convertedValue = this.toEnglishDigits(inputEl.value);
    if (inputEl.value !== convertedValue) {
      inputEl.value = convertedValue;
    }
    this.updateCellControl(rowIndex, colIndex, convertedValue);
  }

  onCellBlur(event: Event, rowIndex: number, colIndex: number): void {
    const inputEl = event.target as HTMLInputElement;
    const parsed = this.parseStrictNumber(inputEl.value);
    const finalNum = parsed !== null ? parsed : 0;

    inputEl.value = String(finalNum);
    this.getRowArray(rowIndex).at(colIndex).setValue(finalNum, { emitEvent: false });
    this.invalidCells.delete(`${rowIndex}-${colIndex}`);
    this.syncGridToText();
  }

  private updateCellControl(rowIndex: number, colIndex: number, sanitizedStr: string): void {
    const control: AbstractControl = this.getRowArray(rowIndex).at(colIndex);
    control.setValue(sanitizedStr, { emitEvent: false });

    const key = `${rowIndex}-${colIndex}`;
    if (this.parseStrictNumber(sanitizedStr) === null) {
      this.invalidCells.add(key);
    } else {
      this.invalidCells.delete(key);
      this.validationError = null;
      this.syncGridToText();
    }
  }

  private validateMatrixRules(matrix: number[][]): string | null {
    if (!matrix || matrix.length === 0 || !matrix[0] || matrix[0].length < 2) {
      return 'Mandatory Rule: Matrix must contain at least 1 equation and 1 variable.';
    }

    const rows = matrix.length;
    const cols = matrix[0].length;
    let hasNonZeroCoefficient = false;

    for (let i = 0; i < rows; i++) {
      if (!matrix[i] || matrix[i].length !== cols) {
        return `Mandatory Rule: Row ${i + 1} has an inconsistent column count.`;
      }

      for (let j = 0; j < cols; j++) {
        const val = matrix[i][j];
        if (typeof val !== 'number' || !Number.isFinite(val) || Number.isNaN(val)) {
          this.invalidCells.add(`${i}-${j}`);
          return `Mandatory Rule: Cell at Row ${i + 1}, Column ${j + 1} must be a valid number.`;
        }

        if (j < cols - 1 && Math.abs(val) > 1e-10) {
          hasNonZeroCoefficient = true;
        }
      }
    }

    if (!hasNonZeroCoefficient) {
      return 'Mandatory Rule: At least one variable coefficient must be non-zero.';
    }

    return null;
  }

  submit(toRREF: boolean): void {
    this.validationError = null;
    this.invalidCells.clear();

    if (this.inputMode === 'import' && !this.extractionResult) {
      this.validationError = 'Mandatory Rule: Upload an image/PDF or click "Apply & Re-Parse" before solving.';
      return;
    }

    if (this.inputMode === 'text') {
      const parsed = this.parserService.parseEquations(this.textEquations.split('\n'));
      if (!parsed) {
        this.validationError = 'Mandatory Rule: Invalid equation format. Enter valid linear equations (e.g., 2x + 3y = 7).';
        return;
      }

      const ruleError = this.validateMatrixRules(parsed.matrix);
      if (ruleError) {
        this.validationError = ruleError;
        return;
      }

      this.syncTextToGrid(true);
      this.solveEvent.emit({ 
        matrix: parsed.matrix, 
        rref: toRREF, 
        variableNames: parsed.variableNames 
      });
      return;
    }

    const matrixData: number[][] = [];
    let hasInvalidCell = false;

    for (let i = 0; i < this.numEquations; i++) {
      const rowArr = this.getRowArray(i);
      const numericRow: number[] = [];

      for (let j = 0; j < this.totalCols; j++) {
        const rawVal = rowArr.at(j).value;
        const parsed = this.parseStrictNumber(rawVal);

        if (parsed === null) {
          this.invalidCells.add(`${i}-${j}`);
          hasInvalidCell = true;
          numericRow.push(NaN);
        } else {
          rowArr.at(j).setValue(parsed, { emitEvent: false });
          numericRow.push(parsed);
        }
      }
      matrixData.push(numericRow);
    }

    if (hasInvalidCell) {
      this.validationError = 'Mandatory Rule: All matrix cells must contain valid numbers only.';
      return;
    }

    const ruleError = this.validateMatrixRules(matrixData);
    if (ruleError) {
      this.validationError = ruleError;
      return;
    }

    this.syncGridToText(true);
    this.solveEvent.emit({ 
      matrix: matrixData, 
      rref: toRREF, 
      variableNames: this.variableNames 
    });
  }

  toEnglishDigits(str: string): string {
    if (str === null || str === undefined) return '';
    let cleaned = String(str)
      .replace(/[٠-٩]/g, d => (d.charCodeAt(0) - 1632).toString())
      .replace(/[^0-9.-]/g, '');

    const isNegative = cleaned.startsWith('-');
    cleaned = cleaned.replace(/-/g, '');

    const dotParts = cleaned.split('.');
    if (dotParts.length > 2) {
      cleaned = `${dotParts[0]}.${dotParts.slice(1).join('')}`;
    }

    return (isNegative ? '-' : '') + cleaned;
  }

  private parseStrictNumber(value: unknown): number | null {
    if (value === null || value === undefined) return null;
    const str = String(value).trim();
    if (str === '' || str === '-' || str === '.' || str === '-.') return null;
    if (!/^-?\d+(\.\d+)?$/.test(str)) return null;
    const num = Number(str);
    return Number.isFinite(num) ? (Math.abs(num) < 1e-12 ? 0 : num) : null;
  }
}