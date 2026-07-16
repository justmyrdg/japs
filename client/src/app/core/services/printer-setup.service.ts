import { Injectable, signal } from '@angular/core';

export interface PrinterReceiptData {
  ticketNumber: string | number;
  busNumber: string;
  plateNumber: string;
  origin: string;
  destination: string;
  category: string;
  distance: number;
  fare: number;
  date: Date;
}

const STORAGE_KEY = 'japs.printerSetup.configured';

@Injectable({ providedIn: 'root' })
export class PrinterSetupService {
  private _configured = signal<boolean>(localStorage.getItem(STORAGE_KEY) === 'true');

  isConfigured(): boolean {
    return this._configured();
  }

  markConfigured(): void {
    localStorage.setItem(STORAGE_KEY, 'true');
    this._configured.set(true);
  }

  reset(): void {
    localStorage.removeItem(STORAGE_KEY);
    this._configured.set(false);
  }

  buildReceiptText(ticket: PrinterReceiptData): string {
    const lines = [
      'JAPS TRANSIT',
      'Bus Operations & Ticketing',
      `Date: ${ticket.date.toLocaleString()}`,
      '--------------------------------',
      `TICKET NO: #${ticket.ticketNumber}`,
      `BUS NO: ${ticket.busNumber}`,
      `PLATE NO: ${ticket.plateNumber}`,
      `ROUTE: ${ticket.origin} -> ${ticket.destination}`,
      '--------------------------------',
      `Distance: ${ticket.distance} km`,
      `Category: ${ticket.category}`,
      `TOTAL AMOUNT: PHP ${ticket.fare.toFixed(2)}`,
      '--------------------------------',
      'Thank you for riding JAPS Transit!',
    ];
    return lines.join('\n');
  }

  sendToPrinter(text: string): void {
    window.location.href = `rawbt:${encodeURIComponent(text)}`;
  }
}
