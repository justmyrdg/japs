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

  connecting = signal(false);
  connectError = signal('');
  printing = signal(false);
  showConfirmation = signal(false);
  showTroubleshooting = signal(false);

  isConnected(): boolean {
    return this.printerSetup.isConnected();
  }

  deviceName(): string {
    return this.printerSetup.deviceName();
  }

  isConfigured(): boolean {
    return this.printerSetup.isConfigured();
  }

  async connectPrinter(): Promise<void> {
    this.connectError.set('');
    this.connecting.set(true);
    try {
      await this.printerSetup.connect();
    } catch (err) {
      this.connectError.set(err instanceof Error ? err.message : 'Failed to connect to printer.');
    } finally {
      this.connecting.set(false);
    }
  }

  async sendTestPrint(): Promise<void> {
    this.showTroubleshooting.set(false);
    this.printing.set(true);

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

    try {
      await this.printerSetup.sendToPrinter(sampleText);
      this.showConfirmation.set(true);
    } catch (err) {
      this.connectError.set(err instanceof Error ? err.message : 'Failed to send test print.');
    } finally {
      this.printing.set(false);
    }
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

  reconfigure(): void {
    this.printerSetup.reset();
    this.showConfirmation.set(false);
    this.showTroubleshooting.set(false);
  }
}
