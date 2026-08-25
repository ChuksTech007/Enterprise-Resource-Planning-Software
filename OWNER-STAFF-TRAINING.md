# Master's Technology — using the system

For the day you sit down with the owner and the staff, and for them to keep
afterwards.

The shop does three things to a customer's picture — **prints** it, mounts it
on **canvas**, and puts it in a **frame** — and often more than one of those
at once. The system is built around that, which is why the counter screen
looks like the invoice pad it replaces.

---

## Part 1 — The owner, before anyone trades

Work through this in order. Nothing can be quoted until step 4 is done.

### Sign in

- [ ] Open the shop's web address on any computer or phone with internet.
- [ ] Sign in with the owner username and password.
- [ ] **Go to `Staff` and change that password now.** The one you were given is
      written down in the project files, so treat it as public.

### Business details

- [ ] `Settings` — name, address, phone.
- [ ] Owner's WhatsApp number, in full international form: `2348012345678`.
      This is where the daily takings summary goes.
- [ ] Leave the currency as `₦` and the timezone as Lagos.

### Staff accounts

- [ ] `Staff` → add one account per person. Never a shared login.
- [ ] Give them the **cashier** role, not owner.
- [ ] A cashier cannot see cost prices, profit, expenses or the money screens.
      That is the point of the two roles, and it only holds if each person
      has their own account.
- [ ] When somebody leaves: `Staff` → **Disable**. Do not delete them — their
      name stays on the jobs they recorded.

### The price list — the important one

`Price list` is a grid: **sizes down the side, what you sell across the top.**

|  | Print | Canvas | Frame bold | Frame normal | Frame tiny | Acrylic | Board |
|---|---|---|---|---|---|---|---|
| 8/10 | | | | | | | |
| 12/15 | | | | | | | |

- [ ] Add every size the shop sells, written the way staff write it: `12/15`.
- [ ] Type the price into each box.
- [ ] **Leave a box empty if you do not sell that thing at that size.** An
      empty box is not a price of zero — zero would mean you do it for free.
- [ ] Press **Save**. Only the boxes you changed are saved.
- [ ] Switch to **Editing cost** to enter what each thing costs you to buy.
      Only you see those, and they are what the profit figures come from.

Take your time here. A half-filled price list is worse than an empty one:
staff trust the numbers that are there and guess the gaps.

### Stock

- [ ] `Stock` → add mouldings, glass, board, backing, fittings.
- [ ] Set a **reorder level** on each: the number at which you want warning.
- [ ] The Stock screen goes red on any item at or below that level.

### Suppliers

- [ ] `Suppliers` → who you buy from, their phone, and how many days they
      usually take to deliver.
- [ ] That screen then shows you **which supplier to ring today** and what to
      order from them.

### Open the till, once

- [ ] `Cash-up` → **Open the till** with the cash currently in the drawer.
- [ ] **It stays open.** Through closing the app, through restarts, for weeks.
      You do not open it every morning.
- [ ] You only close it when you actually want to count the drawer and start
      again — and closing is what checks the cash against the books.

---

## Part 2 — The counter, every day

### Quoting a customer

`Quote a frame` — this is the pad, on screen.

1. Pick the **size**.
2. Type a price under each column that applies — **Print**, **Canvas**,
   **Frame**, **Acrylic**, **Board** — and leave the rest blank.
3. The price list fills the boxes in for you. **Type over any of them** if
   this job is different. That does not change the shop's prices.
4. If there is a frame, choose **bold / normal / tiny** under the size.
5. **+ Add row** for each further picture the customer brought.
6. The total adds itself.

Then one of two buttons:

- **Save as quote** — they are thinking about it. Nothing is owed.
- **They said yes** — it becomes a job for the workshop.

Most people ask a price and walk away. A quote costs the shop nothing.

### You do not need every detail

**Nothing on that screen is required.** No name, no size, no price, no date.

Somebody hands over a picture and pays cash — write the size and the price,
give them a ticket, move on. Somebody wants a price for a size you have to go
and measure — save it with just the size and fill the price in later.

The only thing refused is a completely blank invoice.

### Taking money

- Cash needs the till open. Transfer, POS and credit do not.
- **Who owes me** lists everyone with money outstanding, oldest first, with a
  **Remind** button and a **Collect** button on each row.

### Jobs through the workshop

`Jobs & quotes` shows every job with its **size**, what it is, its status and
what is still owing. Overdue jobs are tinted red.

Move a job along as the work happens, and mark it **ready** when the customer
can collect.

### If the connection drops for a moment

The system runs online, so it needs internet.

If the signal goes while somebody is part-way through a sale, that sale is
held on the device and sent when the connection comes back — a bar across
the top says how many are waiting. It is a safety net for a bad minute, not
a way of working: leave the browser open until the bar clears.

---

## Part 3 — What the owner watches

### Every day

- **Dashboard** — taken today, owed to you, jobs today, and **Money left**:
  everything in, less everything out.
- **Cash-up → All money** — the same figure over any period, with where it
  came in and where it went.

**"Money left" is not profit.** It is money that actually moved. Work sold but
not yet paid for is not in it, and money you owe a supplier is only counted
once you have paid it. Reading it as profit is how a shop spends money it has
already promised to somebody else.

### Counting the drawer

`Cash-up` shows **Should be in drawer now** — only you see it.

When you close the till, the cashier types what they counted **before** the
system says what it expected. That order is deliberate: shown the expected
figure first, anybody would write that number down, and a shortfall would
never appear. A drawer that is short has to be explained before it will close.

### Every week or so

- **Reports** — any period, exportable to Excel.
- **Accounts** — profit and loss, balance sheet, trial balance and the
  journal. Note that "debits equal credits" only proves the arithmetic: every
  entry is refused unless its two sides match, so the books balance even if a
  whole sale was never posted. **Rebuild ledger** re-posts everything from the
  sales, payments and expenses themselves, which is what puts that right.
- **Stock movements** — every change to stock, who made it and why. A column
  of red here is stock leaving that nobody expected.

---

## Owner or cashier?

| | Owner | Cashier |
|---|---|---|
| Quote, sell, take payment | ✓ | ✓ |
| Jobs, customers, stock | ✓ | ✓ |
| Cost prices and profit | ✓ | — |
| Expenses, money screens | ✓ | — |
| Price list, staff, settings | ✓ | — |
| Reports and accounts | ✓ | — |

---

## Things worth saying out loud

- **Change the owner password today.**
- **Everyone gets their own login.** A shared account makes the audit log
  useless and the two roles pointless.
- **The till opens once**, not every morning.
- **An empty price box means "not sold", not "free".**
- **Record it even if you do not know everything.** A size alone is worth
  more than a note on paper that gets lost.
- **Nothing is ever deleted**, only cancelled or voided — and the log keeps
  who did it.
- Atlas does not back itself up. Take a copy regularly:
  ```bash
  mongodump --uri="YOUR_MONGODB_URI" --out=./backups/$(date +%F)
  ```
