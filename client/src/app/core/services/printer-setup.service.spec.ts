import { TestBed } from '@angular/core/testing';
import { PrinterSetupService } from './printer-setup.service';

describe('PrinterSetupService', () => {
  let service: PrinterSetupService;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
    service = TestBed.inject(PrinterSetupService);
  });

  it('reports not configured by default', () => {
    expect(service.isConfigured()).toBe(false);
  });

  it('reports configured after markConfigured and persists across instances', () => {
    service.markConfigured();
    expect(service.isConfigured()).toBe(true);

    const fresh = TestBed.inject(PrinterSetupService);
    expect(fresh.isConfigured()).toBe(true);
  });

  it('reports not configured after reset', () => {
    service.markConfigured();
    service.reset();
    expect(service.isConfigured()).toBe(false);
  });

  it('builds receipt text containing key ticket fields', () => {
    const text = service.buildReceiptText({
      ticketNumber: 42,
      busNumber: 'BUS-01',
      plateNumber: 'ABC-1234',
      origin: 'Manila',
      destination: 'Baguio',
      category: 'regular',
      distance: 12.5,
      fare: 85.5,
      date: new Date('2026-07-16T08:00:00Z'),
    });

    expect(text).toContain('TICKET NO: #42');
    expect(text).toContain('BUS-01');
    expect(text).toContain('ABC-1234');
    expect(text).toContain('Manila');
    expect(text).toContain('Baguio');
    expect(text).toContain('12.5 km');
    expect(text).toContain('85.50');
  });

  it('sendToPrinter throws when no printer is connected', async () => {
    await expect(service.sendToPrinter('Hello Printer')).rejects.toThrow('Printer not connected.');
  });

  it('connects to a printer over Web Bluetooth and reports connected state', async () => {
    const writeValue = vi.fn().mockResolvedValue(undefined);
    const characteristic = { properties: { write: true, writeWithoutResponse: false }, writeValue };
    const service_ = {
      getCharacteristics: vi.fn().mockResolvedValue([characteristic]),
    };
    const gatt = {
      connected: true,
      connect: vi.fn().mockResolvedValue({ getPrimaryService: vi.fn().mockResolvedValue(service_) }),
      disconnect: vi.fn(),
    };
    const device = {
      id: 'device-1',
      name: 'Cheap Thermal Printer',
      gatt,
      addEventListener: vi.fn(),
    };

    (navigator as any).bluetooth = {
      requestDevice: vi.fn().mockResolvedValue(device),
    };

    await service.connect();

    expect(service.isConnected()).toBe(true);
    expect(service.deviceName()).toBe('Cheap Thermal Printer');

    await service.sendToPrinter('Hello Printer');
    expect(writeValue).toHaveBeenCalled();
  });

  it('disconnect clears connection state', async () => {
    const characteristic = { properties: { write: true, writeWithoutResponse: false }, writeValue: vi.fn() };
    const gatt = {
      connected: true,
      connect: vi
        .fn()
        .mockResolvedValue({ getPrimaryService: vi.fn().mockResolvedValue({ getCharacteristics: vi.fn().mockResolvedValue([characteristic]) }) }),
      disconnect: vi.fn(),
    };
    const device = { id: 'device-1', name: 'Printer', gatt, addEventListener: vi.fn() };
    (navigator as any).bluetooth = { requestDevice: vi.fn().mockResolvedValue(device) };

    await service.connect();
    expect(service.isConnected()).toBe(true);

    service.disconnect();
    expect(service.isConnected()).toBe(false);
    expect(gatt.disconnect).toHaveBeenCalled();
  });
});
