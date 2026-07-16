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
const DEVICE_ID_KEY = 'japs.printerSetup.deviceId';

// GATT "Printer Service" UUID exposed by common cheap BLE thermal printers.
const PRINTER_SERVICE_UUID = '000018f0-0000-1000-8000-00805f9b34fb';

const ESC = 0x1b;
const GS = 0x1d;

@Injectable({ providedIn: 'root' })
export class PrinterSetupService {
  private _configured = signal<boolean>(localStorage.getItem(STORAGE_KEY) === 'true');
  private _connected = signal<boolean>(false);
  private _deviceName = signal<string>('');

  private device: BluetoothDevice | null = null;
  private characteristic: BluetoothRemoteGATTCharacteristic | null = null;

  isConfigured(): boolean {
    return this._configured();
  }

  isConnected(): boolean {
    return this._connected();
  }

  deviceName(): string {
    return this._deviceName();
  }

  markConfigured(): void {
    localStorage.setItem(STORAGE_KEY, 'true');
    this._configured.set(true);
  }

  reset(): void {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(DEVICE_ID_KEY);
    this._configured.set(false);
    this.disconnect();
  }

  /** Connects to a BLE thermal printer. Reuses a previously granted device if the
   *  browser supports it (no new chooser prompt); otherwise opens the device chooser
   *  (must be called from a user gesture, e.g. a button click). */
  async connect(): Promise<void> {
    if (!navigator.bluetooth) {
      throw new Error(
        window.isSecureContext
          ? 'This browser does not support Web Bluetooth. Use a Chromium-based browser (e.g. Chrome) on Android.'
          : 'Bluetooth requires a secure connection. Open this app over HTTPS (or localhost), not a plain http:// address.',
      );
    }

    const rememberedId = localStorage.getItem(DEVICE_ID_KEY);

    if (rememberedId && typeof navigator.bluetooth.getDevices === 'function') {
      const known = await navigator.bluetooth.getDevices();
      const match = known.find((d) => d.id === rememberedId);
      if (match) {
        await this.connectToDevice(match);
        return;
      }
    }

    const device = await navigator.bluetooth.requestDevice({
      filters: [{ services: [PRINTER_SERVICE_UUID] }],
      optionalServices: [PRINTER_SERVICE_UUID],
    });

    localStorage.setItem(DEVICE_ID_KEY, device.id);
    await this.connectToDevice(device);
  }

  disconnect(): void {
    if (this.device?.gatt?.connected) {
      this.device.gatt.disconnect();
    }
    this.device = null;
    this.characteristic = null;
    this._connected.set(false);
    this._deviceName.set('');
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

  /** Sends receipt text to the connected printer over its GATT write characteristic,
   *  encoded as ESC/POS commands, in small chunks (cheap BLE printers reject large writes). */
  async sendToPrinter(text: string): Promise<void> {
    if (!this.characteristic) {
      throw new Error('Printer not connected.');
    }

    const encoder = new TextEncoder();
    const payload = this.concatBuffers([
      new Uint8Array([ESC, 0x40]), // initialize
      new Uint8Array([ESC, 0x61, 0x01]), // center align
      encoder.encode(text + '\n'),
      new Uint8Array([ESC, 0x64, 0x03]), // feed 3 lines
    ]);

    const chunkSize = 100;
    for (let i = 0; i < payload.length; i += chunkSize) {
      const chunk = payload.slice(i, i + chunkSize);
      await this.characteristic.writeValue(chunk);
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }

  private async connectToDevice(device: BluetoothDevice): Promise<void> {
    device.addEventListener('gattserverdisconnected', () => {
      this._connected.set(false);
      this.characteristic = null;
    });

    const server = await device.gatt!.connect();
    const service = await server.getPrimaryService(PRINTER_SERVICE_UUID);
    const characteristics = await service.getCharacteristics();
    const writable = characteristics.find((c) => c.properties.write || c.properties.writeWithoutResponse);

    if (!writable) {
      throw new Error('No write characteristic found on this printer.');
    }

    this.device = device;
    this.characteristic = writable;
    this._connected.set(true);
    this._deviceName.set(device.name ?? 'Unknown Printer');
  }

  private concatBuffers(buffers: Uint8Array[]): Uint8Array {
    const total = buffers.reduce((sum, b) => sum + b.length, 0);
    const out = new Uint8Array(total);
    let offset = 0;
    for (const b of buffers) {
      out.set(b, offset);
      offset += b.length;
    }
    return out;
  }
}
