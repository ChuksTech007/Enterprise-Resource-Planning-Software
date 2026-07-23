# Owner and Staff Training Guide

A step-by-step checklist for introducing the app to the owner and staff. Use this document when presenting the system and as a reference for the team later.

---

## 1. Owner setup checklist

### Before you begin
- [ ] Confirm the app is running and accessible at `http://localhost:3000`.
- [ ] Have the owner username and initial password ready.
- [ ] Remind the owner to change the password immediately after first login.

### Owner login
- [ ] Open `http://localhost:3000`.
- [ ] Sign in with the owner account.
- [ ] If this is first use, go to `Staff` and change the owner password.

### Set business details
- [ ] Open `Settings`.
- [ ] Update `Business name`.
- [ ] Update `Address`.
- [ ] Update `Phone` and `Email`.
- [ ] Confirm the correct `Currency symbol`.
- [ ] Add a `Receipt footer` if needed.
- [ ] Set `Your WhatsApp number`.
 - [ ] Set `Your email address`.
- [ ] Save settings.

### Add staff accounts
- [ ] Open `Staff`.
- [ ] Click `Add staff`.
- [ ] Enter the staff member's full name.
- [ ] Choose a username (lowercase, no spaces).
- [ ] Enter a password.
- [ ] Set role to `Cashier`.
- [ ] Add a phone number if available.
- [ ] Save.
- [ ] Repeat for every cashier.
- [ ] Confirm each cashier can sign in.
- [ ] Use `Staff` to reset or disable accounts when needed.

### Build the price list
- [ ] Open `Price list`.
- [ ] Replace sample items with actual services/products.
- [ ] Set correct sell prices.
- [ ] Set job type and item details.
- [ ] Save changes.
- [ ] Make sure the price list matches the shop's actual menu.

### Add stock materials
- [ ] Open `Stock` or `Inventory`.
- [ ] Replace sample materials with real paper, ink, and consumables.
- [ ] Set reorder levels for each item.
- [ ] Save stock records.
- [ ] Confirm low-stock warnings appear when levels are low.

### Add suppliers
- [ ] Open `Suppliers`.
- [ ] Add supplier names.
- [ ] Add contact details.
- [ ] Add lead time for deliveries.
- [ ] Save.

### Enter expenses
- [ ] Open `Expenses`.
- [ ] Add rent, diesel, transport, and other running costs.
- [ ] Save expenses.
- [ ] Confirm that net profit appears correctly once expenses are entered.

### Owner-only review
- [ ] Open `Reports`.
- [ ] Open `Daily summary`.
- [ ] Review cash, sales, jobs, and customer balances.
- [ ] Confirm the owner can export or share summaries.

### First-hour owner priority
- [ ] `Settings`
- [ ] `Staff`
- [ ] `Price list`
- [ ] `Stock`
- [ ] `Suppliers`
- [ ] `Expenses`

> Note: Keep the owner’s first training short. Teach the setup screens, then move on to a real cashier workflow.

---

## 2. Cashier training checklist

### Before staff logs in
- [ ] Owner has created the cashier account in `Staff`.
- [ ] Owner has given the cashier their username and password.
- [ ] Owner has confirmed the till workflow.

### Cashier login
- [ ] Open `http://localhost:3000`.
- [ ] Sign in with the assigned cashier username.
- [ ] If the till is not open, go to `Cash-up` first.

### Dashboard orientation
- [ ] Review `Today’s takings`.
- [ ] Review `Owed to you`.
- [ ] Review `Jobs today`.
- [ ] Review `Ready for pickup`.
- [ ] Observe if the till warning appears.

### Open till and cash-up
- [ ] Open `Cash-up`.
- [ ] Start a till with the opening float.
- [ ] Confirm the till is open before taking cash.
- [ ] Close the till at the end of the shift.

### Record a sale
- [ ] Open `New sale`.
- [ ] Select the correct item from the price list.
- [ ] Confirm quantity and price.
- [ ] Add a customer name/phone if the sale will be on credit.
- [ ] Choose payment method:
  - [ ] Cash
  - [ ] Card
  - [ ] Other
- [ ] Submit the sale.
- [ ] If offline, confirm the app saves locally and syncs later.

### Create and manage jobs/quotes
- [ ] Open `Jobs`.
- [ ] Click `New job`.
- [ ] Enter the customer name.
- [ ] Add each print job item with:
  - [ ] Job type
  - [ ] Description
  - [ ] Quantity
  - [ ] Size / paper / colour / sides / finishing
  - [ ] Price
- [ ] Add a deadline if needed.
- [ ] Mark as `Rush` for urgent jobs.
- [ ] Save as a quote or approve as a job.
- [ ] Use `repeat order` when appropriate.

### Collect balances
- [ ] Open `Debts`.
- [ ] Find the customer who owes money.
- [ ] Record a payment against outstanding invoices.

### Cashier warnings and restrictions
- [ ] Do not access `Reports`.
- [ ] Do not access `Settings`, `Staff`, or `Suppliers`.
- [ ] Do not issue refunds or cancel jobs.
- [ ] Do not edit costs or profit figures.

### Recommended daily workflow for cashiers
- [ ] Open the till.
- [ ] Record sales.
- [ ] Create jobs for print orders.
- [ ] Collect payments and record customer balances.
- [ ] Close the till at the end of shift.

---

## 3. Presentation notes

- Focus the owner on setup first, not every screen.
- Teach cashiers only their main counter screens:
  - `New sale`
  - `Jobs`
  - `Cash-up`
- Use a real sale or a real job to demonstrate the flow.
- Keep the first session simple and practical.
- This document is your follow-up reference for the owner and staff.

---

## 4. Quick reference for owner vs cashier

| Feature | Owner | Cashier |
|---|---|---|
| Business settings | ✅ | ❌ |
| Staff management | ✅ | ❌ |
| Price list | ✅ | ✅ (use only) |
| Inventory / stock | ✅ | ✅ (view/use) |
| Suppliers | ✅ | ❌ |
| Expenses | ✅ | ❌ |
| Reports | ✅ | ❌ |
| New sale | ✅ | ✅ |
| New job | ✅ | ✅ |
| Cash-up | ✅ | ✅ |
| Daily summary | ✅ | ❌ |

---

## 5. Helpful reminders

- `Staff` is where passwords are reset and accounts are disabled.
- `Price list` keeps quotes consistent across all users.
- `Cash-up` must be used before any cash payment.
- `Debts` is for tracking owed money and collecting payments.
- `Reports` and `Daily summary` are owner-only review tools.
- Train the cashier on three screens first, then add extras later.
