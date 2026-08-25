# Putting it online

Vercel runs the app; MongoDB Atlas holds the records. Both have a free tier
that a single shop will not outgrow.

Read step 1 before doing anything else — it is the one that is expensive to
get wrong.

---

## 1. A database of its own

In Atlas, decide the **database name** now and write it down.

The connection string ends with it:

```
mongodb+srv://user:password@cluster0.xxxxx.mongodb.net/framing?retryWrites=true&w=majority
                                                       ^^^^^^^
```

Use **`framing`** for the shop, and something else — `framing_dev` — for
anything you are testing with. They are the same string apart from that one
word, which is exactly why they get confused, and a test run against the live
database is how a shop loses its books.

Then, under **Network Access**, add `0.0.0.0/0`. Vercel's functions do not
have fixed addresses, so there is nothing narrower to allow.

---

## 2. Deploy

1. Push to GitHub (already done — `main`).
2. On Vercel: **Add New → Project**, pick the repository, **Import**.
3. Framework is detected as Next.js. Leave the build settings alone.
4. Add the environment variables below **before** the first deploy.

### Environment variables

| Name | Value |
|---|---|
| `MONGODB_URI` | The Atlas string from step 1, password filled in |
| `APP_TIMEZONE` | `Africa/Lagos` |
| `AUTH_SECRET` | A fresh random string — see below |
| `CRON_SECRET` | Another fresh random string |
| `SEED_OWNER_NAME` | The owner's name |
| `SEED_OWNER_USERNAME` | `owner` |
| `SEED_OWNER_PASSWORD` | Something only you two know |

Generate the two secrets separately:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

**Use a different `AUTH_SECRET` on Vercel than on any machine you develop on.**
Anyone holding it can mint a session and sign in as the owner.

`SMTP_*` is optional. Without it the daily summary still runs, it simply has
nowhere to send; the WhatsApp button works regardless.

---

## 3. Region

`vercel.json` puts the functions in Frankfurt (`fra1`). Every page makes
several database round trips, so **the app should sit in the same region as
the Atlas cluster** — app in the US and database in Europe adds an Atlantic
crossing to each one, and the shop feels slow for no visible reason.

Check the cluster's region in Atlas (Database → your cluster, under the name)
and match it:

| Atlas region | Vercel |
|---|---|
| AWS eu-central-1 (Frankfurt) | `fra1` |
| AWS eu-west-1 (Ireland) | `dub1` |
| AWS eu-west-2 (London) | `lhr1` |
| AWS us-east-1 (N. Virginia) | `iad1` |

Frankfurt is usually the best of these for Nigeria.

---

## 4. First sign-in

The database starts empty apart from the owner login.

1. Open the Vercel URL, sign in with the seed credentials.
2. **Staff → change the password immediately.**
3. **Settings** — business name, address, phone, the owner's WhatsApp number.
4. **Price list** — enter the real rates. Nothing can be quoted until this is
   done, and the grid is the fastest way in: sizes down the side, Print,
   Canvas, Frame, Acrylic and Board across the top.

Leave a cell empty where the shop does not sell that thing at that size. An
empty cell is not a price of zero — zero means the shop does it for nothing.

---

## 5. Before trading

- **Change the seed password.** It is written in `.env.example` in a public
  repository.
- **Take a backup habit.** Atlas M0 has no automated backups:
  ```bash
  mongodump --uri="YOUR_MONGODB_URI" --out=./backups/$(date +%F)
  ```
- **Check the books balance** once real work has gone through: Accounts →
  *Check the books*. It compares every sale, payment and expense against the
  ledger and names anything missing.

---

## Starting over

If the shop needs to be emptied — after training, or a botched import:

```bash
npm run wipe            # shows what would go, changes nothing
npm run wipe -- --yes   # erases the records, keeps the logins
```

It prints the database name before touching anything. Read that line every
single time.
