# PrintPress

Sales, stock, jobs and reporting for a printing and press business.
Next.js + MongoDB. Works on a phone, and keeps working when the network drops.

---

## Getting it running

You need **Node 18+** (you have 22) and a free **MongoDB Atlas** account.

### 1. Get a database

1. Sign up at [mongodb.com/atlas](https://www.mongodb.com/atlas) and create a **free M0 cluster**.
2. **Database Access** → add a database user, note the password.
3. **Network Access** → add IP address → *Allow access from anywhere* (`0.0.0.0/0`).
   Needed so the shop, the owner's phone and your host can all reach it.
4. **Connect → Drivers** → copy the connection string.

### 2. Configure

```bash
cp .env.example .env.local
```

Open `.env.local` and set:

- `MONGODB_URI` — the string from Atlas, with `<password>` replaced by the real password
- `AUTH_SECRET` — generate one with
  `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`
- `SEED_OWNER_PASSWORD` — the first password you will sign in with
- `APP_TIMEZONE` — leave as `Africa/Lagos`. Every "today", "this week" and
  "this month" is worked out in this zone. Hosts like Vercel run on UTC, and
  without this every daily total would be shifted by an hour.

### 3. Create the first account and sample data

```bash
npm run seed
```

This creates the owner login, default settings, a starter price list and a
sample stock list. Safe to run again — it only fills in what is missing.

### 4. Start it

```bash
npm run build && npm start
```

Open <http://localhost:3000> and sign in with the username and password printed
by the seed. **Change that password immediately** under *Staff*.

> **Use `npm start`, not `npm run dev`, for anything real.**
>
> `next dev` recompiles on demand and holds the whole module graph in memory —
> on a machine with 8 GB of RAM it climbed past Node's ~2 GB heap ceiling and
> died with *"Fatal process out of memory"* after a dozen screens.
>
> The production server serves prebuilt output instead: the same app on the
> same machine sits at about **155 MB**. Rerun `npm run build` after changing
> code. `npm run dev` is for editing code, and now uses Turbopack to keep its
> memory down; `npm run dev:webpack` is the old behaviour if ever needed.

---

## Putting it in the shop

```bash
npm run build && npm start
```

Deploy anywhere that runs Node — Vercel is the least work (import the repo, paste
the same environment variables, deploy). Once it is on a real URL, staff should
open it on their phone and choose **"Add to Home Screen"**. It then behaves like
an installed app and works offline.

---

## How the money side works

Worth understanding before you trust the numbers.

**Invoiced vs collected.** These are different and both are reported.
*Invoiced* is the value of work sold in the period. *Collected* is money that
actually arrived. They differ whenever someone pays half now and half on
collection — which in printing is most of the time.

**Payments are the source of truth.** An invoice's paid amount and balance are
recalculated from its payments, never edited directly. A refund is a negative
payment, not an edit — the original payment always stays visible.

**You cannot overpay an invoice.** Entering more than is owed is rejected. This
catches the trailing-zero typo (50,000 for 5,000) at the counter rather than in
next month's reconciliation.

**Non-cash payments need a reference.** Transfers, POS and Paystack payments all
require a reference, and a reference can only be used once in the whole system —
so one payment can never be claimed against two invoices.

**Cash needs an open till.** A cashier must open their till with a starting float
before taking cash. That is what makes the end-of-day count mean anything.

**Gross margin is not profit.** Reports show both, and label them:

```text
  Work invoiced
− materials used
− wastage & damage
= Gross margin
− running costs (Expenses)
= Net profit
```

Without expenses logged, net profit equals gross margin and the reports say so
plainly. Log diesel, rent, salaries and transport under **Expenses** and the
figure becomes real. In a shop running a generator, that difference is the
whole margin.

**Cash paid out of the till is not a shortfall.** If a cashier buys diesel with
money from the drawer, tick "paid from till" on the expense. The cash-up then
expects the drawer to be lower by that amount instead of flagging a loss.

---

## The three features that protect your money

### End-of-day cash reconciliation (*Cash-up*)

Each cashier opens a till with a float and closes it at the end of their shift.
At closing they enter **what is physically in the drawer first** — the expected
figure is only revealed afterwards. Showing it first would turn a count into a
copy and a shortfall would never surface.

Any difference must be explained in a note before the till can close. Every
close is stored as a snapshot, so the numbers cannot be quietly changed later.
The owner sees every shift and every variance.

### Daily takings summary

*Reports → Daily summary* produces a plain-text summary of the day: money in by
method, invoiced, profit estimate, what is owed, till shortfalls, and each
member of staff's takings.

- **Send on WhatsApp** — opens WhatsApp with the message already typed. Set your
  number under *Settings*.
- **Email it to me** — needs the `SMTP_*` variables in `.env.local`.

WhatsApp's official Business API needs template approval and a paid number,
which is more than a small press wants on day one. The `wa.me` link does the same
job with one tap and no approval process.

**To send it automatically at closing time**, schedule a daily request to:

```text
https://your-site/api/summary/daily?secret=YOUR_CRON_SECRET
```

Set `CRON_SECRET` in `.env.local` first. On Vercel, add to `vercel.json`:

```json
{ "crons": [{ "path": "/api/summary/daily?secret=YOUR_CRON_SECRET", "schedule": "0 19 * * *" }] }
```

(19:00 UTC = 8pm Lagos.) On a Windows machine, Task Scheduler running
`curl` daily does the same thing. This emails the summary, so SMTP must be set up.

### Deposit and balance reminders

*Who owes me* lists every unpaid balance, largest first, with how many days old
it is. **Remind** produces a ready-to-send WhatsApp or SMS message with the
invoice number, total, amount paid and balance. Every reminder is counted and
logged, so you can see who has been chased and how often.

---

## Roles

| | Owner | Cashier |
| --- | --- | --- |
| Record sales, take payments | ✅ | ✅ |
| Create jobs, move them along | ✅ | ✅ |
| Log stock movements & wastage | ✅ | ✅ |
| Chase balances | ✅ | ✅ |
| Record an expense (e.g. diesel from the till) | ✅ | ✅ |
| See expense totals and what things cost | ✅ | ❌ |
| See cost prices and profit | ✅ | ❌ |
| Reports | ✅ | ❌ |
| Accounts, P&L, balance sheet | ✅ | ❌ |
| Purchase orders, paying suppliers | ✅ | ❌ |
| Equipment register, depreciation | ✅ | ❌ |
| Refunds | ✅ | ❌ |
| Cancel jobs or invoices | ✅ | ❌ |
| Add stock items, set prices | ✅ | ❌ |
| Manage staff, settings | ✅ | ❌ |

Cost and profit are stripped **at the API**, not just hidden in the menu — a
cashier cannot reach them by typing a URL.

Every action is written to the **Activity log** with who did it and when.

---

## The accounts

A real double-entry ledger sits underneath everything. You never post to it by
hand — every sale, payment, refund, delivery, stock movement, expense, asset
purchase and till variance writes its own journal entry automatically.

**Accounts → Overview** gives you the profit & loss, the balance sheet and the
trial balance. Three things worth understanding:

**Profit & loss is accrual, not cash.** It counts work *sold* in the period,
whether or not the customer has paid. It will not match the takings figure on
the daily summary, and both are correct — the difference is deposits and
unpaid invoices.

**Buying a press is not a cost.** It swaps money for a machine worth the same.
The cost appears month by month as depreciation, which is why *Equipment →
Run depreciation* should be done once a month.

**Stock becomes a cost when it is used, not when it is bought.** Paper on the
shelf is inventory, an asset. It turns into cost of sales the moment a job
consumes it.

### If the books ever look wrong

Every posting rule is a pure function of one source record, so the entire
ledger can be regenerated from the transactions:

```bash
npm run rebuild-ledger
```

It deletes every posted entry, replays them from the sales, payments,
deliveries, movements and expenses, and prints the trial balance. Manual
journal entries you typed in yourself are preserved. There is also a **Rebuild
ledger** button on the Accounts screen.

If the trial balance ever does not balance, the reports say so in red rather
than quietly showing you a wrong number.

---

## Buying (purchase orders)

*Purchase orders* → raise an order → receive it when it arrives.

Receiving a delivery does three things at once: stock goes up through the
normal movement log, the supplier becomes owed money, and the material's cost
price is updated to a **weighted average** — so profit figures use what the
paper actually cost rather than a number typed in months ago.

*What I owe* is the mirror of *Who owes me*. Between them you can see the whole
cash position rather than half of it.

---

## Locked out?

Normally the owner resets a cashier's password under *Staff*. If the **owner**
forgets theirs, nobody in the app can fix it — so there is a command-line way
back in, available to anyone with server access:

```bash
npm run reset-password -- --list                  # see the accounts
npm run reset-password -- owner NewPassword123    # reset one
```

It also clears any lockout and re-enables a disabled account.

Five wrong passwords locks an account for 15 minutes. The count is per account,
not per IP, because a shop on mobile data shares one address across every phone.

---

## Job flow

```text
quote → approved → printing → finishing → done → delivered
```

**One order can hold several products.** "500 flyers + 100 cards + 1 banner" is
one job, one deadline and one invoice with three lines — not three jobs. Each
item carries its own size, paper, colour and finishing.

**Repeat this job** clones a past order onto a new one — customers ask for
"same as last time" constantly. The deadline and rush flag are deliberately not
copied; they belonged to the old order.

**Send to customer** builds the quote, job details or receipt as a WhatsApp
message with everything itemised, ready to send.

- A **quote** is not money owed and raises no invoice. Approving it creates one.
- Reaching **done** deducts the job's materials from stock, once and only once,
  and marks the job *ready for pickup*.
- **Collected** can only be set on finished work, and only once — so a job
  cannot be handed out twice. If a balance is owed, you are warned before
  handing over.
- Cancelling a job returns its materials to stock. If money has been paid, you
  must refund it first.

---

## Offline

Built for unreliable power and network.

**Reads** — the service worker keeps the app openable and shows the last data it
loaded.

**Writes** — a sale, payment or job recorded with no network is stored on the
device and sent automatically when the signal returns. A bar at the top of the
screen always says whether anything is still waiting, so "I entered it" and "it
is saved" never drift apart.

**No duplicates.** Every queued write carries a device-generated id, and the
database has a unique index on it. If a request reached the server but its
response was lost, the replay returns the original record instead of creating a
second one. Taking the same money twice is the worst thing this app could do, so
it is guarded in the database, not just in code.

---

## Reports & export

*Reports* covers any period — today, yesterday, this week, this month, or a
custom date range — and shows sales, money by payment method, profit estimate,
jobs done, outstanding balances, best-selling job types, top customers, stock
used, wastage, per-staff performance and till shortfalls.

- **CSV export** for summary, sales, payments, jobs, stock movements, expenses,
  debtors and customers. Opens directly in Excel.
- **PDF / print** — use *Print / PDF* and choose "Save as PDF". Receipts,
  invoices, job tickets and reports all have print styling.

---

## Backups

Atlas M0 does not include automated backups. Take one regularly:

```bash
mongodump --uri="YOUR_MONGODB_URI" --out=./backups/$(date +%F)
```

Restore with `mongorestore`. Paid Atlas tiers add continuous backups — worth it
once the business depends on this.

---

## Project layout

```text
app/
  (app)/          screens (dashboard, sales, jobs, stock, reports, …)
  api/            REST endpoints
  login/
components/       shared UI, app shell, offline banner
lib/
  models.js       every schema + the shared dropdown vocabularies
  invoicing.js    invoices, payments, refunds — the money rules
  jobs.js         turning an order into items + its summary figures
  stock.js        movements and automatic deduction
  reports.js      the reporting aggregations
  rollups.js      recalculating balances and customer totals
  share.js        the WhatsApp messages customers receive
  client.js       browser fetch + offline queue
  http.js         route wrapper: auth, roles, errors
  rbac.js         what each role may see (unit-tested on its own)
  util.js         money rounding + all timezone-aware date maths
scripts/
  seed.mjs            first-run setup
  reset-password.mjs  the way back in when nobody can sign in
tests/checks.mjs  run with `npm test` — no database needed
public/sw.js      service worker (reads only, by design)
```

`lib/models.js` holds the dropdown lists (job types, payment methods, units,
finishes). Add a job type there and it appears everywhere at once.

---

## First hour with the owner

1. *Settings* — business name, address, phone, WhatsApp number.
2. *Staff* — change the owner password, add each cashier.
3. *Price list* — replace the samples with real prices. This is what keeps
   quotes consistent between staff.
4. *Stock* — replace the sample materials with real paper and consumables, and
   set a reorder level on each.
5. *Suppliers* — add real suppliers with delivery lead times.
6. *Expenses* — enter this month's rent and a few days of diesel. Until
   something is in here, "net profit" is only gross margin.

Then have a cashier open their till and record one real sale end to end.

**Don't show him all fourteen screens on day one.** Train the counter on three —
*New sale*, *Jobs*, *Cash-up* — and leave Suppliers, the activity log and stock
movements dark for a fortnight. A cashier confident on three screens will use
the system; one shown fourteen goes back to the notebook.
