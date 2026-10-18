# Email Outreach Tracker: Setup & Daily Guide

One master Google Sheet sends your outreach from up to 15+ Gmail accounts
and tracks everything: who got which email, from which Gmail, when, when
the next follow-up is due, who replied, who bounced, and how close you
are to the goal.

No paid tools. One script file (`Code.gs`). About 30 minutes of setup the
first time, then about 5 minutes per Gmail.

---

## What you get (tabs in the sheet)

| Tab | What it shows |
|---|---|
| **Dashboard** | Goal progress, sent, delivered, bounced, replies, reply rate, days left, how many per day you still need, a day-by-day table and chart |
| **Leads** | One row per person: status, which Gmail it's assigned to, date of each email, next follow-up date, reply text, bounce reason, your notes |
| **Inboxes** | One row per Gmail: daily limit, sent today, total sent, bounce %, reply %, health (🟢 🟡 🔴) |
| **Templates** | Your first email and follow-ups, with optional A/B versions |
| **Settings** | Goal, dates, daily limits, follow-up timing, send hours, pause switch |
| **Import** | Paste new leads here to add them |
| **Log** | Every action, timestamped: every send, reply, bounce, error |
| **Do Not Contact** | Bounced addresses and people who asked to be removed. Never emailed again. Add `@domain.com` to block a whole company |

**Lead statuses:** New → In sequence → Completed, or Replied, Bounced,
Unsubscribed, Do not contact.

---

## Part 1: Create the master sheet (once, about 15 minutes)

Use the Gmail that will **own** the sheet (it can also be one of your 15 senders).

1. Go to **sheets.new** to make a blank Google Sheet. Name it, e.g. "Outreach Master".
2. **File → Settings → Time zone**: pick your time zone. Send hours use it.
3. Click **Extensions → Apps Script**. A code editor opens.
4. Delete everything in the editor, then paste in all of `Code.gs`. Click 💾 **Save**.
5. On the left, click the **+** next to **Services**. Pick **Gmail API**, then click **Add**.
6. Go back to the sheet tab and **reload the page**. A new menu **📧 Outreach** appears (it can take about 10 seconds).
7. Click **📧 Outreach → 1. Set up / repair this sheet**.
   - Google will ask for permission. Click **Continue**, pick your Gmail, then
     **Advanced → Go to (project name) (unsafe) → Allow**.
     It says "unsafe" because this is your own private script, not one from
     the Google store. Nobody else can see your data.
   - Click the menu item again after allowing.
8. All the tabs are created. Open **Settings** and check the values (see below).
9. Open **Templates** and write your emails (see below).

## Part 2: Connect each Gmail (about 5 minutes each)

Do this for **every** sending Gmail, including the owner's.

> **Important:** use a separate browser window for each Gmail: a separate
> Chrome profile, or an Incognito window where only that Gmail is signed in.
> If several Gmails are signed in to the same window, Google can run the
> script as the wrong account.

1. In the master sheet click **Share** and add all 15 Gmails as **Editor**. (Owner only, once.)
2. In a window signed in to **only** Gmail #1, open the master sheet.
3. Click **📧 Outreach → Which Gmail am I using?** and make sure it shows the right address.
4. Click **📧 Outreach → Connect THIS Gmail (start sending)**.
   - Allow the permissions, same as in Part 1 step 7.
   - Type the **sender name** people should see (e.g. "Sarah Jones").
5. Click **📧 Outreach → Send a test email to myself**. Check that Gmail's
   inbox: you'll get a preview of the full sequence with real lead data.
6. Repeat for Gmail #2 through #15.
7. Finally click **📧 Outreach → Spread waiting leads across inboxes**.

Each connected Gmail now runs **by itself every hour** during your send
window, even when your computer is off. It sends only the leads assigned
to it, at a human pace, and checks its own inbox for replies and bounces.

To stop one Gmail, open the sheet as that Gmail and click **Disconnect THIS Gmail**,
or set its Status to **Paused** on the Inboxes tab.
To stop everything, set **Pause everything** to `TRUE` in Settings.

## Part 3: Add leads (any time)

**Option A (paste):** open your CSV or sheet, copy everything including the
header row, paste into the **Import** tab at cell A1, then click
**📧 Outreach → Import leads from the Import tab**.

**Option B (link):** click **📧 Outreach → Import leads from a link** and paste
a link to a Google Sheet, or to a CSV file in your Google Drive.

The importer:
- finds the Email, First Name, Last Name / Full Name and Company columns automatically
- skips duplicates (even across different files), invalid emails, and anyone on Do Not Contact
- tidies names (`JOHN` → `John`)
- keeps every other column (Job Title, Website, City...) so you can use it in templates as `{{job_title}}`, `{{website}}`...
- assigns each lead to the Gmail with the fewest waiting leads
- records which file each lead came from (Source column)

**Run every list through an email verifier before importing**
(NeverBounce, ZeroBounce, MillionVerifier, etc.). Bounces are the fastest
way to get free Gmail accounts flagged.

---

## Settings explained

| Setting | Default | Meaning |
|---|---|---|
| Goal (delivered messages) | 5000 | Target on the Dashboard. Delivered = sent − bounced |
| Campaign start date / length | today / 11 | Drives "days left" and the day-by-day table |
| Default daily limit per inbox | 35 | Max emails (first + follow-ups) per Gmail per day. Override any Gmail in the Inboxes tab's Daily Limit column |
| Warm-up: day 1 limit / increase | 20 / 5 | Day 1 = 20, day 2 = 25, day 3 = 30, then 35. Clear the day 1 limit to turn this off |
| Follow-ups per lead | 2 | 0, 1 or 2 |
| Days before follow-up 1 / 2 | 3 / 4 | Follow-up 1 goes 3 days after email 1; follow-up 2 goes 4 days after follow-up 1 |
| Send window | 8 to 18 | Only sends between these hours |
| Send on weekends | TRUE | Needed to hit 5,000 in 11 days |
| Min / max seconds between emails | 20 / 60 | Random pause between sends |
| Auto-pause inbox at bounce rate | 5% | A Gmail stops itself if it bounces too much |
| Opt-out line | (a P.S. line) | Added to every email |
| Pause everything | FALSE | Emergency stop |

### The 5,000 math

15 Gmails × 11 days with warm-up (20, 25, 30, then 35 a day) ≈ **5,300 sent**,
or about **5,200 delivered** at a 2% bounce rate. That includes follow-ups.
With 2 follow-ups per lead you need about **2,000 to 2,500 leads** to reach
5,000 messages. The Dashboard's **"Needed per day to hit goal"** tells you if
you're falling behind. To catch up, raise the daily limit a little or add more Gmails.

## Writing templates

- **Step 1** = first email, **Step 2** = follow-up 1, **Step 3** = follow-up 2.
- Follow-ups are sent as replies in the **same email thread**, so their Subject is ignored.
- Add several rows for the same step with different **Variants** (A, B, C) and
  each lead gets one at random. Follow-ups use the matching variant if one exists.
  Different wording across thousands of emails helps deliverability.
- Untick **Active** to switch a template off.
- Placeholders: `{{first_name}}`, `{{last_name}}`, `{{company}}`, `{{email}}`,
  `{{sender_name}}`, `{{sender_first_name}}`, plus any column from your import
  file (e.g. `{{job_title}}`).
- Fallbacks: `{{first_name|there}}` writes "there" when the first name is empty.
- Plain text only. Keep links to zero or one. No images or attachments.

## How replies and bounces are tracked

Every hour, each Gmail checks its own mail from the last 4 days:
- **Reply**: status → Replied, reply date and text saved, follow-ups stop,
  and the email gets a Gmail label **"Outreach Replies"** so you can find it fast.
- **"No", "stop", "remove me", "unsubscribe"**: status → Unsubscribed, and the
  address is added to Do Not Contact.
- **Bounce**: status → Bounced, reason saved, address added to Do Not Contact.
  "Delayed" notices are ignored.
- **Out-of-office / auto-reply**: logged, but follow-ups continue.

You can also click **Check replies & bounces now** at any time.
Then mark the **Outcome** column yourself (Interested, Meeting booked, Not
interested...). The Dashboard counts these.

---

## Daily routine (about 10 minutes)

1. Open the **Dashboard**: check sent today, bounce rate (keep it **under 2%**), and needed per day.
2. Open **Inboxes**: any 🔴 or 🟡? Lower that Gmail's Daily Limit or set it to Paused.
3. Filter **Leads** by Status = **Replied**: answer them from the Gmail shown in Assigned Inbox, then set the Outcome.
4. Import new leads if "Leads by status → New" is running low.
5. Glance at **Log** for any `ERROR` rows.

## Rules for free Gmail accounts

- Free Gmail is the riskiest way to cold email. Google watches these accounts
  closely. Stay at or below 35 a day per account, keep the warm-up on, and
  verify every list.
- If an account gets a warning or is asked to verify its phone number, pause it
  for a few days (Inboxes → Status → Paused).
- Spread the load: run **Spread waiting leads across inboxes** whenever you
  add or pause a Gmail.
- Use each Gmail a little like a normal person would: open it, reply to a few
  emails, and send a few normal emails to friends or colleagues.
- Always honour removal requests. The script does this automatically, but
  also add anyone who asks by other means to **Do Not Contact**.

## Reusing for a new campaign

Make a copy of the master sheet: **File → Make a copy** (the script is copied
with it). Then, in the copy:
1. Clear the Leads and Log tabs (keep the header rows). Keep Do Not Contact.
2. Update Settings and Templates.
3. Connect each Gmail again in the copy. Disconnect them in the old sheet first,
   so a Gmail isn't sending from two campaigns at once.

## Troubleshooting

| Problem | Fix |
|---|---|
| No 📧 Outreach menu | Reload the sheet and wait 10 seconds |
| "Gmail API service is not added" | Apps Script → Services **+** → Gmail API → Add |
| A Gmail isn't sending | Check its Inboxes row: Status must be **Active**, and Last Run should update hourly. Check Settings → Pause everything, the send window, and that it has leads with status New |
| Wrong Gmail connected | Use a window where only one Gmail is signed in. Check with "Which Gmail am I using?" |
| "Service invoked too many times" in Log | Google's daily limit for that Gmail was hit. It resumes tomorrow. Lower its Daily Limit |
| Leads with no inbox | Connect your Gmails, then "Spread waiting leads across inboxes" |
| Want to re-send to a lead | Set Status back to New and Emails Sent back to 0 (restarts the sequence) |

Note: `appsscript.json` is optional. It turns on the Gmail API service
automatically if you prefer pasting it (Apps Script → Project Settings →
"Show appsscript.json" → paste) instead of using step 5 of Part 1.
