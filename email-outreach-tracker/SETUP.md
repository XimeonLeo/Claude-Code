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
| **Dashboard** | Goal progress, sent, delivered, bounced, replies, reply rate, days left, how many per day you still need, a day-by-day table and chart, and **Results by angle** (which email approach gets the most replies; see `prompts/README.md`) |
| **Leads** | One row per person: their personalised message and follow-ups, status, which Gmail it's assigned to, date of each email, next follow-up date, reply text, bounce reason, your notes |
| **Inboxes** | One row per Gmail: daily limit, sent today, total sent, bounce %, reply %, health (🟢 🟡 🔴) |
| **Settings** | Goal, dates, daily limits, follow-up timing, send hours, signature, backup follow-ups, pause switch |
| **Import** | Paste new leads here to add them |
| **Log** | Every action, timestamped: every send, reply, bounce, error |
| **Do Not Contact** | Bounced addresses and people who asked to be removed. Never emailed again. Add `@domain.com` to block a whole company |

**Lead statuses:** New → In sequence → Completed, or Replied, Bounced,
Unsubscribed, Do not contact. **Needs message** means the lead was imported
without a message; fill in its Message cell and set Status to New.

---

## What your lead files should contain

**Easiest: have everyone use `prompts/0-MASTER-PROMPT.txt`.** It always produces
the same columns (empty template: `lead-template.csv`) and leaves out any lead
without an email, name, message or follow-ups.

See `sample-leads.csv` for an example. Each row in your CSV or Google Sheet is one person, **with the message the AI
wrote for them**. The importer recognises these column names (capitals,
spaces and dashes don't matter):

| Column | Required? | Also recognised as |
|---|---|---|
| **Email** | Yes | Email Address, Work Email |
| **First Name** | Recommended | First, or a **Full Name** / Name column |
| **Last Name** | Optional | Surname |
| **Company** | Optional | Company Name, Business Name, Organization |
| **Subject** | Recommended | Subject Line, Email Subject |
| **Message** | **Yes** | Personalized Message, Personalised Email, Body, Email 1 |
| **Follow-up 1** | Optional | Follow Up, Follow-up 1 Message, Email 2 |
| **Follow-up 2** | Optional | Follow-up 2 Message, Email 3 |

Any other columns (Website, Industry, City, the research notes...) are kept
with the lead, in the Extra Fields column.

**If a lead has no follow-up text**, the script uses the backup follow-ups in
Settings ("Default follow-up 1 / 2"). Clear those to send no follow-up in that case.
**If a lead has no subject**, it uses "Default subject" from Settings.

### Tell your AI to write messages like this

- **Don't sign with a name.** Each Gmail adds its own name underneath
  (Settings → Signature = `{{sender_name}}`). That way the name always matches
  the Gmail it was sent from. If the AI must sign, have it write `{{sender_name}}`.
- Plain text, short (50–120 words), no links or at most one, no images, no attachments.
- No leftover blanks like `[Your Name]` or `[Company]`. Check a few rows before importing.
- Follow-ups are short and are sent as replies in the same thread, so they don't need a subject.
- The opt-out line from Settings is added automatically at the bottom.

Placeholders such as `{{first_name}}`, `{{company}}` or `{{website}}` (any
column name) still work inside messages if you want them, with a fallback
like `{{first_name|there}}`. You don't need them, though: the AI can write
the full text.

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

## Part 2: Connect each Gmail (about 5 minutes each)

**The owner's Gmail** (the one that created the master sheet) connects from
the sheet menu: **📧 Outreach → Connect THIS Gmail (start sending)**.

**Every other Gmail needs its own copy of the script.** Google only lets
the owner of a script approve Gmail access ("This app is blocked" otherwise).
So each Gmail creates its own small script project that points at the master sheet:

> Use a separate browser window for each Gmail: a separate Chrome profile,
> or an Incognito window where **only that Gmail** is signed in.

1. **Once, as the owner:** in the master sheet click **Share** and add all the
   sending Gmails as **Editor**. Copy the master sheet's link from the address bar.
2. In a window signed in to **only** Gmail #2, go to **script.google.com** and
   click **New project**. Name it, e.g. "Outreach - Gmail 2".
3. Delete what's in the editor and paste all of `Code.gs`.
4. At the top of the code, fill in the two lines:
   ```
   var MASTER_SHEET = 'paste the master sheet link here';
   var SENDER_NAME = 'Sarah Jones';
   ```
   Click 💾 **Save**.
5. Click the **+** next to **Services** → **Gmail API** → **Add**.
6. In the function dropdown at the top (next to **Run** / **Debug**), choose
   **connectInbox**, then click **▶ Run**.
   - Google asks for permission: **Review permissions** → pick this Gmail →
     **Advanced** → **Go to Outreach - Gmail 2 (unsafe)** → **Allow**.
     It's "unsafe" only because it's your own private script.
   - The **Execution log** at the bottom should say **"Connected: ..."**.
7. Check the master sheet's **Inboxes** tab: this Gmail now has a row, with
   Status **Active** and Connected **Yes**.
8. Repeat steps 2–7 for each remaining Gmail.
9. Finally, in the master sheet, click **📧 Outreach → Spread waiting leads across inboxes**.

**Handy functions in a Gmail's own script** (choose from the dropdown, click ▶ Run,
read the result in the Execution log):
- **sendTestEmail**: sends this Gmail a preview of what a lead will get (after you've imported leads)
- **runNow**: runs one sending round right away
- **checkNow**: checks this Gmail for replies and bounces right away
- **disconnectInbox**: stops this Gmail from sending
- **whoAmI**: shows which Gmail the script is running as

From the owner's Gmail, the same actions are in the **📧 Outreach** menu.

Each connected Gmail now runs **by itself every hour** during your send
window, even when your computer is off. It sends only the leads assigned
to it, at a human pace, and checks its own inbox for replies and bounces.

To stop one Gmail, set its Status to **Paused** on the Inboxes tab (or run
**disconnectInbox** in its script). To stop everything, set **Pause everything**
to `TRUE` in Settings.

**If you change the script later,** paste the new version into the master
sheet's script **and** into each Gmail's own copy, keeping the two lines at
the top filled in.

## Part 3: Add leads (any time)

**Option 1 (easiest): upload the file.** Click **📧 Outreach → Upload a lead file (CSV)**.
Choose the CSV file (or paste the CSV text, or rows copied from a sheet, into the box),
choose the Gmail, click **Check file**, then **Import**.
The check shows which required columns are there (✔/✘), how many cells are empty,
and the first lead, before anything is imported.
Excel file? Open it in Google Sheets, then File → Download → CSV first.

**Option A (paste):** open your CSV or sheet, copy everything including the
header row, paste into the **Import** tab at cell A1, then click
**📧 Outreach → Import leads from the Import tab**.
If the pasted CSV lands all in column A, that's fine: the importer splits it.

**Option B (link):** click **📧 Outreach → Import leads from a link** and paste
a link to a Google Sheet, or to a CSV file in your Google Drive.

The importer:
- finds the Email, First Name, Last Name / Full Name and Company columns automatically
- skips duplicates (even across different files), invalid emails, and anyone on Do Not Contact
- tidies names (`JOHN` → `John`)
- brings in each lead's Subject, Message and Follow-ups
- keeps every other column (Website, Industry, City...) with the lead
- gives each lead a sending Gmail (see below)
- records which file each lead came from (Source column)

### Choosing which Gmail sends which leads

When you import, a box asks **"Which Gmail should send these leads?"**
- **Leave it blank** to spread them evenly across all active Gmails.
- **Type one Gmail address** to send the whole file from that Gmail.

Other ways to control it:
- **Per row, in your file:** add a **Send From** column with a Gmail address
  for each lead (also recognised: Sender Email, Assigned Inbox, From).
  It overrides the choice in the box. Rows naming a Gmail that isn't on the
  Inboxes tab are spread evenly instead.
- **After importing:** change a lead's **Assigned Inbox** on the Leads tab
  (it's a dropdown). Only do this for leads with status **New**. Once a lead
  has been emailed, its follow-ups must come from the same Gmail.

**Spread waiting leads across inboxes** then asks:
- **YES**: re-spread **all** waiting leads evenly (replaces any Gmail you picked).
- **NO**: only give a Gmail to waiting leads that have none, or whose Gmail is
  paused. **Your picks stay as they are.**

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
| Signature | `{{sender_name}}` | Added under every message: the Sender Name of the Gmail that sends it |
| Default subject | "Quick question, {{first_name\|there}}" | Only for leads with no Subject |
| Default follow-up 1 / 2 | short bump messages | Only for leads with no follow-up text. Clear to skip |
| Opt-out line | (a P.S. line) | Added to every email |
| Pause everything | FALSE | Emergency stop |

### The 5,000 math

15 Gmails × 11 days with warm-up (20, 25, 30, then 35 a day) ≈ **5,300 sent**,
or about **5,200 delivered** at a 2% bounce rate. That includes follow-ups.
With 2 follow-ups per lead you need about **2,000 to 2,500 leads** to reach
5,000 messages. The Dashboard's **"Needed per day to hit goal"** tells you if
you're falling behind. To catch up, raise the daily limit a little or add more Gmails.

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
2. Update Settings.
3. Connect each Gmail again in the copy. Disconnect them in the old sheet first,
   so a Gmail isn't sending from two campaigns at once.

## Troubleshooting

| Problem | Fix |
|---|---|
| No 📧 Outreach menu | Reload the sheet and wait 10 seconds |
| "Gmail API service is not added" | Apps Script → Services **+** → Gmail API → Add |
| A Gmail isn't sending | Check its Inboxes row: Status must be **Active**, and Last Run should update hourly. Check Settings → Pause everything, the send window, and that it has leads with status New |
| Wrong Gmail connected | Use a window where only one Gmail is signed in. Check with "Which Gmail am I using?" (or whoAmI) |
| "This app is blocked" | That Gmail is not the script's owner. Give it its own copy of the script (Part 2) |
| "Service invoked too many times" in Log | Google's daily limit for that Gmail was hit. It resumes tomorrow. Lower its Daily Limit |
| "Some columns are missing" on import | The file wasn't made with the master prompt. Make it again with `prompts/0-MASTER-PROMPT.txt`, or click Yes to import anyway and fill the gaps in Leads |
| Pasted leads all in one column | Fine, the importer splits them. Or use Upload a lead file instead |
| Leads with no inbox | Connect your Gmails, then "Spread waiting leads across inboxes" |
| Want to re-send to a lead | Set Status back to New and Emails Sent back to 0 (restarts the sequence) |

Note: `appsscript.json` is optional. It turns on the Gmail API service
automatically if you prefer pasting it (Apps Script → Project Settings →
"Show appsscript.json" → paste) instead of using step 5 of Part 1.
