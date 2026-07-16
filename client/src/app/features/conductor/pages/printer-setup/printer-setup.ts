import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { PrinterSetupService } from '../../../../core/services/printer-setup.service';

@Component({
  selector: 'app-printer-setup',
  imports: [],
  templateUrl: './printer-setup.html',
  styleUrl: './printer-setup.css',
})
export class PrinterSetupPage {
  private printerSetup = inject(PrinterSetupService);
  private router = inject(Router);

  showConfirmation = signal(false);
  showTroubleshooting = signal(false);
  showMissingAppHint = signal(false);
  private hintTimer: ReturnType<typeof setTimeout> | undefined;

  sendTestPrint(): void {
    this.showTroubleshooting.set(false);
    this.showMissingAppHint.set(false);

    const sampleText = this.printerSetup.buildReceiptText({
      ticketNumber: 'TEST',
      busNumber: 'SAMPLE-BUS',
      plateNumber: 'SAMPLE-000',
      origin: 'Test Origin',
      destination: 'Test Destination',
      category: 'regular',
      distance: 1,
      fare: 0,
      date: new Date(),
    });

    this.printerSetup.sendToPrinter(sampleText);
    this.showConfirmation.set(true);

    clearTimeout(this.hintTimer);
    this.hintTimer = setTimeout(() => this.showMissingAppHint.set(true), 4000);
  }

  confirmSuccess(): void {
    this.printerSetup.markConfigured();
    this.showConfirmation.set(false);
    this.router.navigate(['/conductor/ticketing']);
  }

  confirmFailure(): void {
    this.showConfirmation.set(false);
    this.showTroubleshooting.set(true);
  }

  isConfigured(): boolean {
    return this.printerSetup.isConfigured();
  }

  reconfigure(): void {
    this.printerSetup.reset();
    this.showConfirmation.set(false);
    this.showTroubleshooting.set(false);
  }
}
