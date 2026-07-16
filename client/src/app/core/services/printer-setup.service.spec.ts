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

  it('sendToPrinter navigates to a rawbt: URL containing the encoded text', () => {
    const originalHref = window.location.href;
    let capturedHref = '';
    Object.defineProperty(window, 'location', {
      value: { ...window.location, set href(v: string) { capturedHref = v; }, get href() { return capturedHref || originalHref; } },
      writable: true,
    });

    service.sendToPrinter('Hello Printer');
    expect(capturedHref).toBe(`rawbt:${encodeURIComponent('Hello Printer')}`);
  });
});
