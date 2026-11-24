/// <reference lib="webworker" />

addEventListener('message', ({ data }) => {
  const { matrixFlat, rows, cols, isRREF } = data;
  
  // استخدام Float64Array المباشرة للذاكرة الفائقة
  const a = new Float64Array(matrixFlat);
  const stepsSummary: string[] = [];
  
  const getVal = (r: number, c: number) => a[r * cols + c];
  const setVal = (r: number, c: number, v: number) => { a[r * cols + c] = v; };

  let pivotRow = 0;
  const startTime = performance.now();

  for (let col = 0; col < cols - 1 && pivotRow < rows; col++) {
    // البحث عن أقصى عنصر محور (Partial Pivoting)
    let maxRow = pivotRow;
    for (let i = pivotRow + 1; i < rows; i++) {
      if (Math.abs(getVal(i, col)) > Math.abs(getVal(maxRow, col))) {
        maxRow = i;
      }
    }

    if (Math.abs(getVal(maxRow, col)) < 1e-12) continue;

    // تبديل الصفوف بالذاكرة المباشرة
    if (maxRow !== pivotRow) {
      for (let k = 0; k < cols; k++) {
        const tmp = getVal(pivotRow, k);
        setVal(pivotRow, k, getVal(maxRow, k));
        setVal(maxRow, k, tmp);
      }
    }

    // جعل عنصر المحور = 1
    const pivotVal = getVal(pivotRow, col);
    for (let k = col; k < cols; k++) {
      setVal(pivotRow, k, getVal(pivotRow, k) / pivotVal);
    }

    // صفر العناصر تحت المحور (أو فوقه وت تحته لو RREF)
    const startR = isRREF ? 0 : pivotRow + 1;
    for (let r = startR; r < rows; r++) {
      if (r !== pivotRow) {
        const factor = getVal(r, col);
        if (Math.abs(factor) > 1e-12) {
          for (let k = col; k < cols; k++) {
            setVal(r, k, getVal(r, k) - factor * getVal(pivotRow, k));
          }
        }
      }
    }

    pivotRow++;
  }

  const executionTime = (performance.now() - startTime).toFixed(2);

  // إرسال النتيجة فوراً للواجهة الرئيسية بدون استهلاك ذاكرة
  postMessage({
    resultFlat: Array.from(a),
    executionTimeMs: executionTime,
    completedPivotRows: pivotRow
  });
});