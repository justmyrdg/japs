import { Component, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AlertModal } from './shared/components/alert-modal/alert-modal';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, AlertModal],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  protected readonly title = signal('client');
}
