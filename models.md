# Database Models

This document defines the database models for the **Web-Based Bus Transportation Management System with Digital Remittance Recording and AI-Supported Passenger Demand Forecasting**.

---

## 1. User

Represents all system users across roles (Owner, Secretary, Audit Teller, Conductor, Driver).

| Column         | Type                                                              | Constraints        |
| -------------- | ----------------------------------------------------------------- | ------------------ |
| id             | INTEGER                                                           | PK, Auto Increment |
| employee_id    | STRING                                                            | NOT NULL, Unique   |
| username       | STRING                                                            | NOT NULL, Unique   |
| password       | STRING                                                            | NOT NULL (hashed)  |
| role           | ENUM('owner', 'secretary', 'audit_teller', 'conductor', 'driver') | NOT NULL           |
| first_name     | STRING                                                            | NOT NULL           |
| middle_name    | STRING                                                            | NULLABLE           |
| last_name      | STRING                                                            | NOT NULL           |
| suffix         | ENUM('Jr.', 'Sr.', 'I', 'II', 'III', 'IV', 'V')                   | NULLABLE           |
| email          | STRING                                                            | NOT NULL, Unique   |
| contact_number | STRING                                                            | NULLABLE           |
| is_active      | BOOLEAN                                                           | DEFAULT true       |
| created_at     | DATE                                                              | Auto               |
| updated_at     | DATE                                                              | Auto               |

**Associations:**

- Has many `Trip` as driver (`driver_id`)
- Has many `Trip` as conductor (`conductor_id`)
- Has many `Remittance` as conductor (`conductor_id`)
- Has many `Remittance` as approver (`approved_by`)

---

## 2. Bus

Represents a physical bus unit managed by the owner.

| Column       | Type                                            | Constraints        |
| ------------ | ----------------------------------------------- | ------------------ |
| id           | INTEGER                                         | PK, Auto Increment |
| bus_number   | STRING                                          | NOT NULL, Unique   |
| plate_number | STRING                                          | NOT NULL, Unique   |
| capacity     | INTEGER                                         | NOT NULL           |
| status       | ENUM('active', 'inactive', 'under_maintenance') | DEFAULT 'active'   |
| created_at   | DATE                                            | Auto               |
| updated_at   | DATE                                            | Auto               |

**Associations:**

- Has many `Trip`

---

## 3. Route

Represents a bus route from an origin to a destination.

| Column      | Type    | Constraints        |
| ----------- | ------- | ------------------ |
| id          | INTEGER | PK, Auto Increment |
| origin      | STRING  | NOT NULL           |
| destination | STRING  | NOT NULL           |
| distance_km | DECIMAL | NULLABLE           |
| created_at  | DATE    | Auto               |
| updated_at  | DATE    | Auto               |

**Associations:**

- Has many `Trip`
- Has many `FareRate`

---

## 4. Trip

Represents a single trip made within a day. Linked to a daily Remittance record.

| Column              | Type                                                   | Constraints                                              |
| ------------------- | ------------------------------------------------------ | -------------------------------------------------------- |
| id                  | INTEGER                                                | PK, Auto Increment                                       |
| remittance_id       | INTEGER                                                | FK → Remittance, NULLABLE                                |
| bus_id              | INTEGER                                                | FK → Bus, NOT NULL                                       |
| route_id            | INTEGER                                                | FK → Route, NOT NULL                                     |
| driver_id           | INTEGER                                                | FK → User (driver), NOT NULL                             |
| conductor_id        | INTEGER                                                | FK → User (conductor), NOT NULL                          |
| trip_number         | INTEGER                                                | NOT NULL (sequence within the day)                       |
| ticket_number_start | STRING                                                 | NULLABLE                                                 |
| ticket_number_end   | STRING                                                 | NULLABLE                                                 |
| grand_total         | INTEGER                                                | NOT NULL, DEFAULT 0 (total passengers from ticket stubs) |
| departure_time      | DATE                                                   | NOT NULL                                                 |
| arrival_time        | DATE                                                   | NULLABLE                                                 |
| status              | ENUM('scheduled', 'ongoing', 'completed', 'cancelled') | DEFAULT 'scheduled'                                      |
| created_at          | DATE                                                   | Auto                                                     |
| updated_at          | DATE                                                   | Auto                                                     |

**Associations:**

- Belongs to `Remittance`
- Belongs to `Bus`
- Belongs to `Route`
- Belongs to `User` (as driver)
- Belongs to `User` (as conductor)
- Has many `PassengerCount`

---

## 5. FareRate

Stores fare rates per passenger category, per route.

| Column         | Type                                                              | Constraints          |
| -------------- | ----------------------------------------------------------------- | -------------------- |
| id             | INTEGER                                                           | PK, Auto Increment   |
| route_id       | INTEGER                                                           | FK → Route, NOT NULL |
| category       | ENUM('regular', 'student', 'senior_citizen', 'pwd', 'discounted') | NOT NULL             |
| rate           | DECIMAL                                                           | NOT NULL             |
| effective_date | DATE                                                              | NOT NULL             |
| created_at     | DATE                                                              | Auto                 |
| updated_at     | DATE                                                              | Auto                 |

**Associations:**

- Belongs to `Route`

---

## 6. PassengerCount

Records the number of passengers per fare category for a given trip.

| Column     | Type                                                              | Constraints         |
| ---------- | ----------------------------------------------------------------- | ------------------- |
| id         | INTEGER                                                           | PK, Auto Increment  |
| trip_id    | INTEGER                                                           | FK → Trip, NOT NULL |
| category   | ENUM('regular', 'student', 'senior_citizen', 'pwd', 'discounted') | NOT NULL            |
| count      | INTEGER                                                           | NOT NULL, DEFAULT 0 |
| created_at | DATE                                                              | Auto                |
| updated_at | DATE                                                              | Auto                |

**Associations:**

- Belongs to `Trip`

---

## 7. RemittanceExpense

Records the specific operational expenses for a daily remittance report. Expense types match the fixed categories on the physical remittance form.

| Column        | Type                                                                                                                                     | Constraints               |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| id            | INTEGER                                                                                                                                  | PK, Auto Increment        |
| remittance_id | INTEGER                                                                                                                                  | FK → Remittance, NOT NULL |
| expense_type  | ENUM('officer', 'toll_fees', 'parking', 'pwd', 'washing', 'diesel', 'caller_grand_terminal', 'caller_calamba_terminal', 'miscellaneous') | NOT NULL                  |
| amount        | DECIMAL                                                                                                                                  | NOT NULL                  |
| created_at    | DATE                                                                                                                                     | Auto                      |
| updated_at    | DATE                                                                                                                                     | Auto                      |

**Associations:**

- Belongs to `Remittance`

---

## 8. Remittance

A daily financial report per bus covering all trips for that day, submitted by the conductor and verified by the Audit Teller. Mirrors the physical remittance report form.

| Column                  | Type                                       | Constraints                                     |
| ----------------------- | ------------------------------------------ | ----------------------------------------------- |
| id                      | INTEGER                                    | PK, Auto Increment                              |
| bus_id                  | INTEGER                                    | FK → Bus, NOT NULL                              |
| driver_id               | INTEGER                                    | FK → User (driver), NOT NULL                    |
| conductor_id            | INTEGER                                    | FK → User (conductor), NOT NULL                 |
| date                    | DATEONLY                                   | NOT NULL                                        |
| no_of_trips             | INTEGER                                    | NOT NULL                                        |
| gross_income            | DECIMAL                                    | NOT NULL (total revenue from all trips)         |
| total_expenses          | DECIMAL                                    | NOT NULL (sum of all RemittanceExpense records) |
| net_gross               | DECIMAL                                    | NOT NULL (gross_income − total_expenses)        |
| driver_commission       | DECIMAL                                    | NOT NULL (driver's % share of net_gross)        |
| conductor_commission    | DECIMAL                                    | NOT NULL (conductor's % share of net_gross)     |
| bonus_allowance         | DECIMAL                                    | DEFAULT 0                                       |
| other_deductions        | DECIMAL                                    | DEFAULT 0                                       |
| cash_deposit            | DECIMAL                                    | NOT NULL (cash deposited by conductor)          |
| total_less              | DECIMAL                                    | NOT NULL (total deductions from cash deposit)   |
| net_collection          | DECIMAL                                    | NOT NULL (cash_deposit − total_less)            |
| driver_officer_share    | DECIMAL                                    | NOT NULL (driver's 10% officer share)           |
| conductor_officer_share | DECIMAL                                    | NOT NULL (conductor's 10% officer share)        |
| status                  | ENUM('submitted', 'approved', 'finalized') | DEFAULT 'submitted'                             |
| submitted_at            | DATE                                       | NOT NULL                                        |
| approved_by             | INTEGER                                    | FK → User (audit_teller), NULLABLE              |
| approved_at             | DATE                                       | NULLABLE                                        |
| created_at              | DATE                                       | Auto                                            |
| updated_at              | DATE                                       | Auto                                            |

**Associations:**

- Belongs to `Bus`
- Belongs to `User` (as driver)
- Belongs to `User` (as conductor)
- Belongs to `User` (as approver)
- Has many `Trip`
- Has many `RemittanceExpense`

---

## Entity Relationship Summary

```
User ──< Trip (as driver)
User ──< Trip (as conductor)
Bus ──< Trip
Route ──< Trip
Route ──< FareRate
Trip ──< PassengerCount
Remittance ──< Trip
Remittance ──< RemittanceExpense
Bus ──< Remittance
User ──< Remittance (as driver)
User ──< Remittance (as conductor)
User ──< Remittance (as approver)
```
