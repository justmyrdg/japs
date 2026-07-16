import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { PrinterSetupPage } from './printer-setup';
import { PrinterSetupService } from '../../../../core/services/printer-setup.service';

describe('PrinterSetupPage', () => {
  let component: PrinterSetupPage;
  let fixture: ComponentFixture<PrinterSetupPage>;
  let sendToPrinter: ReturnType<typeof vi.fn>;
  let markConfigured: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    sendToPrinter = vi.fn();
    markConfigured = vi.fn();

    await TestBed.configureTestingModule({
      imports: [PrinterSetupPage],
      providers: [
        provideRouter([]),
        {
          provide: PrinterSetupService,
          useValue: {
            buildReceiptText: () => 'SAMPLE RECEIPT',
            sendToPrinter,
            markConfigured,
            reset: vi.fn(),
            isConfigured: () => false,
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(PrinterSetupPage);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('sends a sample receipt when sendTestPrint is called', () => {
    component.sendTestPrint();
    expect(sendToPrinter).toHaveBeenCalledWith('SAMPLE RECEIPT');
    expect(component.showConfirmation()).toBe(true);
  });

  it('marks configured and clears confirmation on confirmSuccess', () => {
    component.sendTestPrint();
    component.confirmSuccess();
    expect(markConfigured).toHaveBeenCalled();
    expect(component.showConfirmation()).toBe(false);
  });

  it('shows troubleshooting and clears confirmation on confirmFailure', () => {
    component.sendTestPrint();
    component.confirmFailure();
    expect(markConfigured).not.toHaveBeenCalled();
    expect(component.showConfirmation()).toBe(false);
    expect(component.showTroubleshooting()).toBe(true);
  });
});
