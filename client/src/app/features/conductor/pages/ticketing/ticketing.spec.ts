import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { TicketingPage } from './ticketing';
import { PrinterSetupService } from '../../../../core/services/printer-setup.service';
import { environment } from '../../../../../environments/environment';

describe('TicketingPage', () => {
  let component: TicketingPage;
  let fixture: ComponentFixture<TicketingPage>;
  let httpMock: HttpTestingController;
  let sendToPrinter: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    sendToPrinter = vi.fn();

    await TestBed.configureTestingModule({
      imports: [TicketingPage, HttpClientTestingModule],
      providers: [
        provideRouter([]),
        {
          provide: PrinterSetupService,
          useValue: {
            sendToPrinter,
            buildReceiptText: () => 'RECEIPT TEXT',
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(TicketingPage);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();

    // Satisfy ngOnInit's fare-settings + trips requests.
    httpMock.expectOne(`${environment.apiUrl}/api/fare-settings`).flush({
      minimum_fare: 10,
      base_distance_km: 4,
      rate_per_km: 2,
      regular_multiplier: 100,
      student_multiplier: 80,
      senior_citizen_multiplier: 80,
      pwd_multiplier: 80,
      discounted_multiplier: 80,
    });
    httpMock.expectOne(`${environment.apiUrl}/api/conductor/trips`).flush([]);
    await fixture.whenStable();
  });

  afterEach(() => httpMock.verify());

  it('sends the receipt to the printer after a successful ticket submission', () => {
    component.selectedTripId.set(1);
    component.trips.set([
      {
        id: 1,
        trip_number: 1,
        status: 'ongoing',
        departure_time: new Date().toISOString(),
        grand_total: 0,
        ticket_number_start: null,
        ticket_number_end: null,
        BusModel: { id: 1, bus_number: 'BUS-01', plate_number: 'ABC-123', capacity: 40 },
        Route: { id: 1, origin: 'Manila', destination: 'Baguio', distance_km: 250 },
      },
    ]);
    component.ticketForm.setValue({ category: 'regular', distance: 5, fare: 20 });

    component.printTicketSubmit();

    const req = httpMock.expectOne(`${environment.apiUrl}/api/conductor/trips/1/tickets`);
    req.flush({ ticket: { ticket_number: 7 } });

    expect(sendToPrinter).toHaveBeenCalledWith('RECEIPT TEXT');

    // printTicketSubmit()'s success handler also refreshes trips & passenger counts.
    httpMock.expectOne(`${environment.apiUrl}/api/conductor/trips`).flush([]);
    httpMock.expectOne(`${environment.apiUrl}/api/conductor/trips/1/passenger-counts`).flush([]);
  });
});
