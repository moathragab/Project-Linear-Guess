import { Injectable } from '@angular/core';
import { FinalSolution, MatrixStep } from '../models/matrix.model';

@Injectable({
  providedIn: 'root'
})
export class MatrixPdfService {
  /**
   * Generates a vector PDF report and either downloads it or opens it
   * in a dedicated browser PDF viewer tab (immune to async popup blockers).
   */
  async generateSolutionPdf(
    steps: MatrixStep[],
    solution: FinalSolution,
    action: 'download' | 'open' = 'download'
  ): Promise<void> {
    if (!steps || steps.length === 0 || !solution) {
      throw new Error('Cannot export PDF: Solve the linear system first.');
    }

    // Open target window synchronously during the user click gesture
    let previewWindow: Window | null = null;
    if (action === 'open') {
      previewWindow = window.open('', '_blank');
      if (previewWindow) {
        previewWindow.document.write(`
          <!DOCTYPE html>
          <html lang="en">
            <head><title>Generating PDF Report...</title></head>
            <body style="margin:0;background:#0f172a;color:#38bdf8;font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;">
              <div style="text-align:center;padding:24px;">
                <h2 style="margin:0 0 8px 0;">⏳ Generating Academic PDF Report...</h2>
                <p style="margin:0;color:#94a3b8;font-size:14px;">Preparing vector tables and step-by-step matrices...</p>
              </div>
            </body>
          </html>
        `);
        previewWindow.document.close();
      }
    }

    try {
      const pdfMake = await this.loadPdfMake();
      const docDefinition = this.buildDocDefinition(steps, solution);
      const pdfDocGenerator = pdfMake.createPdf(docDefinition);
      const blob = await this.getPdfBlob(pdfDocGenerator);

      const timestamp = new Date().toISOString().slice(0, 10);
      const fileName = `Linear-System-Solution-${timestamp}.pdf`;
      const blobUrl = URL.createObjectURL(blob);

      if (action === 'open') {
        if (previewWindow && !previewWindow.closed) {
          previewWindow.location.href = blobUrl;
        } else {
          // Automatic fallback if browser blocks all popups
          this.triggerBlobDownload(blobUrl, fileName);
        }
      } else {
        this.triggerBlobDownload(blobUrl, fileName);
      }

      setTimeout(() => URL.revokeObjectURL(blobUrl), 120000);
    } catch (err) {
      if (previewWindow && !previewWindow.closed) {
        previewWindow.close();
      }
      throw err;
    }
  }

  /**
   * Compatible with both pdfmake v0.2.x (callback) and v0.3.x+ (Promise).
   */
  private getPdfBlob(pdfDocGenerator: any): Promise<Blob> {
    return new Promise<Blob>((resolve, reject) => {
      try {
        let settled = false;
        const result = pdfDocGenerator.getBlob((blob: Blob) => {
          if (!settled && blob) {
            settled = true;
            resolve(blob);
          }
        });

        if (result && typeof result.then === 'function') {
          result
            .then((blob: Blob) => {
              if (!settled) {
                settled = true;
                resolve(blob);
              }
            })
            .catch((err: any) => {
              if (!settled) {
                settled = true;
                reject(err);
              }
            });
        }
      } catch (err) {
        reject(err);
      }
    });
  }

  private triggerBlobDownload(blobUrl: string, fileName: string): void {
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = fileName;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  private async loadPdfMake(): Promise<any> {
    const pdfMakeModule: any = await import('pdfmake/build/pdfmake');
    const pdfFontsModule: any = await import('pdfmake/build/vfs_fonts');

    const pdfMake = pdfMakeModule.default || pdfMakeModule;
    const vfs =
      pdfFontsModule?.pdfMake?.vfs ||
      pdfFontsModule?.default?.pdfMake?.vfs ||
      pdfFontsModule?.vfs ||
      pdfFontsModule?.default;

    if (!pdfMake || typeof pdfMake.createPdf !== 'function') {
      throw new Error('PDF engine failed to initialize.');
    }

    if (vfs) {
      pdfMake.vfs = vfs;
    }

    return pdfMake;
  }

  private formatVal(val: number): string {
    if (val === null || val === undefined || Math.abs(val) < 1e-10) return '0';
    const rounded = Math.round((val + Number.EPSILON) * 1000) / 1000;
    return Math.abs(rounded) < 1e-10 ? '0' : String(rounded);
  }

  private getRefRow(step: MatrixStep): number | undefined {
    return (step as any).pivotRow ?? step.leadingRow;
  }

  private getActiveCol(step: MatrixStep): number | undefined {
    return (step as any).pivotCol ?? step.leadingCol;
  }

  private getNormalizedOp(step: MatrixStep): string {
    const op = step.operationType as string;
    if (op === 'multiply') return 'scale';
    if (op === 'add-multiple') return 'eliminate';
    return op;
  }

  private buildDocDefinition(steps: MatrixStep[], solution: FinalSolution): any {
    const numEq = steps[0]?.matrix?.length || 0;
    const numVars = Math.max(1, (steps[0]?.matrix?.[0]?.length || 2) - 1);
    const variableNames =
      solution.variableNames && solution.variableNames.length === numVars
        ? solution.variableNames
        : Array.from({ length: numVars }, (_, i) => `x${i + 1}`);

    const isRref = steps.some(
      s =>
        (s.description || '').toLowerCase().includes('rref') ||
        (s.description || '').toLowerCase().includes('above')
    );

    const methodLabel = isRref
      ? 'Gauss-Jordan Elimination (Reduced Row-Echelon Form - RREF)'
      : 'Gaussian Elimination (Row-Echelon Form - REF & Back-Substitution)';

    const generatedDate = new Date().toLocaleDateString('en-GB', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });

    const content: any[] = [];

    // 1. Report Header Banner
    content.push({
      table: {
        widths: ['*', 'auto'],
        body: [
          [
            {
              stack: [
                {
                  text: 'LINEAR SYSTEM SOLUTION & MATRIX ANALYSIS REPORT',
                  fontSize: 14.5,
                  bold: true,
                  color: '#FFFFFF',
                  margin: [0, 0, 0, 4]
                },
                {
                  text: methodLabel,
                  fontSize: 9.5,
                  color: '#38BDF8',
                  bold: true
                }
              ],
              border: [false, false, false, false]
            },
            {
              stack: [
                { text: `Dimensions: ${numEq} × ${numVars}`, fontSize: 9, color: '#E2E8F0', alignment: 'right' },
                { text: `Total Steps: ${steps.length}`, fontSize: 9, color: '#E2E8F0', alignment: 'right' },
                { text: `Generated: ${generatedDate}`, fontSize: 8.5, color: '#94A3B8', alignment: 'right' }
              ],
              border: [false, false, false, false]
            }
          ]
        ]
      },
      layout: {
        fillColor: () => '#0F172A',
        paddingLeft: () => 14,
        paddingRight: () => 14,
        paddingTop: () => 12,
        paddingBottom: () => 12
      },
      margin: [0, 0, 0, 12]
    });

    // 2. KPI Metrics Strip
    const leadingCount = (solution as any).leadingCount ?? 0;
    const freeParamsCount = (solution as any).freeParametersCount ?? 0;

    content.push({
      table: {
        widths: ['*', '*', '*', '*'],
        body: [
          [
            this.buildKpiCell('Equations (m)', String(numEq), '#0F172A'),
            this.buildKpiCell('Variables (n)', String(numVars), '#0F172A'),
            this.buildKpiCell('Leading 1s', String(leadingCount), '#0369A1'),
            this.buildKpiCell('Free Parameters', String(freeParamsCount), '#7E22CE')
          ]
        ]
      },
      layout: {
        fillColor: () => '#F8FAFC',
        hLineColor: () => '#CBD5E1',
        vLineColor: () => '#CBD5E1',
        paddingTop: () => 7,
        paddingBottom: () => 7
      },
      margin: [0, 0, 0, 12]
    });

    // 3. Input Linear System Equations
    const initialEquations = steps[0]?.equations || [];
    if (initialEquations.length > 0) {
      content.push({
        unbreakable: true,
        table: {
          widths: ['*'],
          body: [
            [
              {
                stack: [
                  {
                    text: '1. INPUT LINEAR SYSTEM EQUATIONS',
                    fontSize: 9.5,
                    bold: true,
                    color: '#0369A1',
                    margin: [0, 0, 0, 5]
                  },
                  {
                    text: initialEquations.join('    |    '),
                    fontSize: 9.5,
                    bold: true,
                    color: '#0F172A'
                  }
                ]
              }
            ]
          ]
        },
        layout: {
          fillColor: () => '#F8FAFC',
          hLineColor: () => '#CBD5E1',
          vLineColor: () => '#CBD5E1',
          paddingLeft: () => 12,
          paddingRight: () => 12,
          paddingTop: () => 8,
          paddingBottom: () => 8
        },
        margin: [0, 0, 0, 12]
      });
    }

    // 4. Final System Outcome
    const statusPalette: Record<string, { bg: string; text: string; border: string }> = {
      unique: { bg: '#DCFCE7', text: '#166534', border: '#16A34A' },
      infinite: { bg: '#E0F2FE', text: '#075985', border: '#0284C7' },
      'no-solution': { bg: '#FEE2E2', text: '#991B1B', border: '#DC2626' }
    };
    const palette = statusPalette[solution.status] || statusPalette['unique'];

    const varCardsStack: any[] = [];
    if ((solution.status === 'unique' || solution.status === 'infinite') && variableNames.length > 0) {
      const varRows: any[][] = [];
      const colsPerRow = 3;
      for (let i = 0; i < variableNames.length; i += colsPerRow) {
        const rowCells: any[] = [];
        for (let c = 0; c < colsPerRow; c++) {
          const vName = variableNames[i + c];
          if (vName && solution.variables[vName] !== undefined) {
            rowCells.push({
              text: [
                { text: `${vName} `, bold: true, color: '#0369A1' },
                { text: '= ', color: '#64748B' },
                { text: String(solution.variables[vName]), bold: true, color: '#15803D' }
              ],
              fontSize: 9.5,
              fillColor: '#FFFFFF',
              margin: [4, 3, 4, 3]
            });
          } else {
            rowCells.push({ text: '', border: [false, false, false, false] });
          }
        }
        varRows.push(rowCells);
      }

      varCardsStack.push({
        table: {
          widths: ['*', '*', '*'],
          body: varRows
        },
        layout: {
          hLineColor: () => '#CBD5E1',
          vLineColor: () => '#CBD5E1'
        },
        margin: [0, 8, 0, 0]
      });
    }

    content.push({
      unbreakable: true,
      table: {
        widths: ['*'],
        body: [
          [
            {
              stack: [
                {
                  text: `2. FINAL SYSTEM OUTCOME: ${solution.status.toUpperCase()}`,
                  fontSize: 10,
                  bold: true,
                  color: palette.text,
                  margin: [0, 0, 0, 4]
                },
                {
                  text: solution.statusMessage,
                  fontSize: 9.5,
                  color: '#1E293B'
                },
                ...varCardsStack
              ]
            }
          ]
        ]
      },
      layout: {
        fillColor: () => palette.bg,
        hLineColor: () => palette.border,
        vLineColor: () => palette.border,
        paddingLeft: () => 12,
        paddingRight: () => 12,
        paddingTop: () => 9,
        paddingBottom: () => 9
      },
      margin: [0, 0, 0, 14]
    });

    // 5. Step-by-Step Section
    content.push({
      text: `3. STEP-BY-STEP ELEMENTARY ROW OPERATIONS (${steps.length} STEPS)`,
      fontSize: 11,
      bold: true,
      color: '#0F172A',
      margin: [0, 0, 0, 8]
    });

    for (const step of steps) {
      content.push(this.buildStepCard(step, variableNames));
    }

    return {
      pageSize: 'A4',
      pageOrientation: numVars > 6 ? 'landscape' : 'portrait',
      pageMargins: [30, 30, 30, 34],
      footer: (currentPage: number, pageCount: number) => ({
        text: `Page ${currentPage} of ${pageCount}  •  Linear System Matrix Solver`,
        alignment: 'center',
        fontSize: 8.5,
        color: '#64748B',
        margin: [0, 10, 0, 0]
      }),
      content
    };
  }

  private buildKpiCell(label: string, value: string, color: string): any {
    return {
      stack: [
        { text: label, fontSize: 8, color: '#64748B', alignment: 'center', margin: [0, 0, 0, 2] },
        { text: value, fontSize: 12, bold: true, color, alignment: 'center' }
      ]
    };
  }

  private buildStepCard(step: MatrixStep, variableNames: string[]): any {
    const op = this.getNormalizedOp(step);
    const refRow = this.getRefRow(step);
    const targetRow = step.highlightRow;

    let roleBadge: any = null;
    if (op === 'swap' && refRow !== undefined && targetRow !== undefined) {
      roleBadge = {
        text: `⇄ Swapped Rows: R${refRow + 1} ↔ R${targetRow + 1}`,
        fontSize: 8.5,
        bold: true,
        color: '#92400E',
        margin: [0, 0, 0, 5]
      };
    } else if (op === 'scale' && refRow !== undefined) {
      roleBadge = {
        text: `★ Scaled Row: R${refRow + 1}`,
        fontSize: 8.5,
        bold: true,
        color: '#075985',
        margin: [0, 0, 0, 5]
      };
    } else if (op === 'eliminate' && refRow !== undefined && targetRow !== undefined) {
      roleBadge = {
        text: [
          { text: `★ Reference Row: R${refRow + 1}     `, bold: true, color: '#075985' },
          { text: `✎ Modified Row: R${targetRow + 1}`, bold: true, color: '#6B21A8' }
        ],
        fontSize: 8.5,
        margin: [0, 0, 0, 5]
      };
    }

    const cardStack: any[] = [
      {
        columns: [
          {
            text: [
              { text: `Step ${step.stepNumber}: `, bold: true, color: '#0F172A' },
              { text: step.description, bold: true, color: '#0369A1' }
            ],
            fontSize: 9.8,
            width: '*'
          },
          step.formulaDetail
            ? {
                text: step.formulaDetail,
                fontSize: 9.2,
                bold: true,
                color: '#BE123C',
                alignment: 'right',
                width: 'auto'
              }
            : { text: '', width: 0 }
        ],
        margin: [0, 0, 0, 5]
      }
    ];

    if (roleBadge) {
      cardStack.push(roleBadge);
    }

    cardStack.push(this.buildVectorMatrixTable(step, variableNames));

    cardStack.push({
      text: [
        { text: 'Explanation: ', bold: true, color: '#0369A1' },
        { text: step.detailedExplanation, color: '#334155' }
      ],
      fontSize: 8.8,
      margin: [0, 5, 0, 0]
    });

    const isComplete = op === 'complete';

    return {
      unbreakable: true,
      table: {
        widths: ['*'],
        body: [[{ stack: cardStack }]]
      },
      layout: {
        fillColor: () => (isComplete ? '#F0FDF4' : '#FFFFFF'),
        hLineColor: () => (isComplete ? '#16A34A' : '#CBD5E1'),
        vLineColor: () => (isComplete ? '#16A34A' : '#CBD5E1'),
        paddingLeft: () => 10,
        paddingRight: () => 10,
        paddingTop: () => 8,
        paddingBottom: () => 8
      },
      margin: [0, 0, 0, 9]
    };
  }

  private buildVectorMatrixTable(step: MatrixStep, variableNames: string[]): any {
    const matrix = step.matrix || [];
    if (matrix.length === 0) return { text: '' };

    const op = this.getNormalizedOp(step);
    const refRow = this.getRefRow(step);
    const targetRow = step.highlightRow;
    const activeCol = this.getActiveCol(step);
    const totalCols = matrix[0].length;

    const widths: any[] = ['auto', ...Array(totalCols).fill('auto')];

    const headerRow: any[] = [
      { text: '', border: [false, false, false, false] },
      ...Array.from({ length: totalCols }, (_, cIdx) => {
        const isLast = cIdx === totalCols - 1;
        const colTitle = isLast ? 'b' : (variableNames[cIdx] || `x${cIdx + 1}`);
        return {
          text: colTitle,
          fontSize: 8,
          bold: true,
          color: isLast ? '#15803D' : '#0369A1',
          alignment: 'center',
          border: [false, false, false, false],
          margin: [6, 0, 6, 2]
        };
      })
    ];

    const dataRows: any[][] = matrix.map((row, rIdx) => {
      let rowFill = '#F8FAFC';
      let rowLabel = `R${rIdx + 1}`;
      let labelColor = '#64748B';

      if (op === 'swap' && (rIdx === refRow || rIdx === targetRow)) {
        rowFill = '#FEF3C7';
        rowLabel = `R${rIdx + 1} ⇄`;
        labelColor = '#B45309';
      } else if (op === 'scale' && rIdx === refRow) {
        rowFill = '#E0F2FE';
        rowLabel = `R${rIdx + 1} ★`;
        labelColor = '#0369A1';
      } else if (op === 'eliminate') {
        if (rIdx === refRow) {
          rowFill = '#E0F2FE';
          rowLabel = `R${rIdx + 1} ★`;
          labelColor = '#0369A1';
        } else if (rIdx === targetRow) {
          rowFill = '#F3E8FF';
          rowLabel = `R${rIdx + 1} ✎`;
          labelColor = '#7E22CE';
        }
      }

      const rowCells: any[] = [
        {
          text: rowLabel,
          fontSize: 8.5,
          bold: true,
          color: labelColor,
          alignment: 'right',
          border: [false, false, false, false],
          margin: [0, 3, 6, 3]
        }
      ];

      row.forEach((val, cIdx) => {
        const isLast = cIdx === totalCols - 1;
        const isPivotCell =
          (op === 'scale' || op === 'eliminate') && rIdx === refRow && cIdx === activeCol;
        const isTargetCell =
          op === 'eliminate' && rIdx === targetRow && cIdx === activeCol;

        rowCells.push({
          text: this.formatVal(val),
          fontSize: 9.2,
          bold: isLast || isPivotCell || isTargetCell,
          color: isLast ? '#166534' : '#0F172A',
          fillColor: isLast && rowFill === '#F8FAFC' ? '#F0FDF4' : rowFill,
          alignment: 'center',
          border: [isLast, true, true, true],
          borderColor: [
            isLast ? '#16A34A' : '#CBD5E1',
            isPivotCell ? '#0284C7' : isTargetCell ? '#9333EA' : '#CBD5E1',
            isPivotCell ? '#0284C7' : isTargetCell ? '#9333EA' : '#CBD5E1',
            isPivotCell ? '#0284C7' : isTargetCell ? '#9333EA' : '#CBD5E1'
          ],
          margin: [8, 3, 8, 3]
        });
      });

      return rowCells;
    });

    return {
      table: {
        widths,
        body: [headerRow, ...dataRows]
      },
      layout: {
        paddingLeft: () => 2,
        paddingRight: () => 2,
        paddingTop: () => 1,
        paddingBottom: () => 1
      },
      margin: [0, 2, 0, 2]
    };
  }
}