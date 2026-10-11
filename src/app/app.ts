import { Component } from '@angular/core';
import { MatrixSolverComponent } from './features/matrix-solver/matrix-solver.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [MatrixSolverComponent],
  templateUrl: './app.html',
  styleUrls: ['./app.scss']
})
export class App {
  title = 'Interactive Linear Algebra Matrix Engine';
}