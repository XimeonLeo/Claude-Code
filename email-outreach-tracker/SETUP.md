# Outreach System: Setup & Daily Guide

One Google Sheet sends your outreach from up to 15 Gmails, by itself, and tracks
everything: who got which email, from which Gmail, follow-ups, replies and bounces.

**You need 3 files:**

| File | What it's for |
|---|---|
| `Code.gs` | The script. You paste it into Google once per Gmail. |
| `LEAD-PROMPT.txt` | The prompt your team pastes into an AI chat to get leads. |
| `SETUP.md` | This guide. |

---

## Part 1: Make the master sheet (once, 15 minutes)

Do this signed in to the Gmail that will **own** the sheet.

1. Go to **sheets.new**. Name the sheet, e.g. "Outreach Master".
2. **File → Settings → Time zone**: choose your time zone. Click Save.
3. **Extensions → Apps Script**. Delete everything in the editor, paste all of `Code.gs`, click 💾 **Save**.
4. On the left, click **+** next to **Services** → choose **Gmail API** → **Add**.
5. Go back to the sheet and **reload the page**. Wait for the **📧 Outreach** menu.
6. Click **📧 Outreach → 1. Set up / repair this sheet**.
   Google asks for permission: **Continue** → choose your Gmail → **Advanced** →
   **Go to … (unsafe)** → **Allow**. ("Unsafe" only means it's your own private script.)
   Then click Set up again.
7. Open the **Settings** tab and check the values (see "Settings" below).
   Type numbers as plain numbers, e.g. `5000`.

## Part 2: Connect every Gmail (5 minutes each)

**The owner's Gmail:** click **📧 Outreach → Connect THIS Gmail**. Done.

**Every other Gmail** needs its own copy of the script (Google blocks a script that belongs to someone else):

1. As the owner, click **Share** on the master sheet and add every sending Gmail as **Editor**.
   Copy the sheet's link from the address bar.
2. Open an **Incognito window** and sign in to **only** the next Gmail.
3. Go to **script.google.com** → **New project**.
4. Delete what's there, paste all of `Code.gs`, then fill in the two lines at the top:
   ```
   var MASTER_SHEET = 'paste the master sheet link here';
   var SENDER_NAME = 'Sarah Jones';
   ```
   Click 💾 **Save**.
5. Click **+** next to **Services** → **Gmail API** → **Add**.
6. In the dropdown at the top, choose **connectInbox**, then click **▶ Run**.
   Allow it (Advanced → Go to … (unsafe) → Allow).
   The log at the bottom says **"Connected"**.
7. Repeat for each Gmail.
8. In the master sheet, click **📧 Outreach → Spread waiting leads across inboxes**.

Each connected Gmail now sends **by itself every hour** during the send window,
even when your computer is off.

**If you get a new Code.gs later,** paste it into the master sheet's script **and**
into every Gmail's copy (keep the two lines at the top filled in), then click Set up again.

## Part 3: Get leads and upload them

1. **Make the leads.** Copy everything in `LEAD-PROMPT.txt` below the dashed line,
   paste it into a new AI chat (Claude, ChatGPT, Gemini or Grok), and answer the questions.
   Not sure? Type **SKIP**. Download the file it gives you.
2. **Check the emails.** Run the file through an email checker (e.g. MillionVerifier).
   Keep only **Deliverable**. Bounces get Gmails blocked.
3. **Upload.** In the master sheet: **📧 Outreach → Upload a lead file (CSV)** →
   choose the file → choose a Gmail (or "spread evenly") → **Check file** → **Import**.
   No file? Paste the CSV text into the box instead.

The upload skips duplicates, bad emails and anyone on Do Not Contact, and warns you
if a column is missing. If it says columns are missing, make the file again with the prompt.

## Part 4: Test before going live (15 minutes)

1. Upload 2–3 leads that use **your own** email addresses.
2. During sending hours (8:00 to 18:00), click **📧 Outreach → Run now for THIS Gmail.**
   Check the email arrived (not in spam). It sends a few per run, so click again for the rest.
3. Reply to it, then **📧 Outreach → Check replies & bounces now.** The lead's Status turns **Replied**.
4. Delete the test rows from the Leads and Log tabs.
5. First real day: set **Default daily limit** to `5` in Settings. Raise it back to `35` once all looks right.

---

## The tabs

| Tab | What it shows | Can I type in it? |
|---|---|---|
| **Dashboard** | Progress to goal, bounce rate, reply rate, results by email style | No |
| **Leads** | One row per person: messages, status, Gmail, dates, replies | Only **Outcome** and **Notes** |
| **Inboxes** | One row per Gmail: sent today, health 🟢🟡🔴, **Last Result** | Status and Daily Limit |
| **Settings** | All the controls | Column B only |
| **Log** | Every send, reply, bounce and error | No |
| **Do Not Contact** | Bounced and opted-out people. Never emailed again | Add people who ask by other means |

**Lead status:** New → In sequence → Completed. Or **Replied**, Bounced, Unsubscribed.
**Needs message** = no message text; fill in the Message cell and set Status to New.

## Settings

| Setting | Default | Meaning |
|---|---|---|
| Goal | 5000 | Target on the Dashboard |
| Campaign start date / length | today / 11 | For "days left" |
| Default daily limit per inbox | 35 | Most emails per Gmail per day |
| Warm-up: day 1 limit / increase | 20 / 5 | New Gmails start at 20 a day, +5 a day |
| Days before follow-up 1 / 2 | 3 / 4 | Follow-ups go in the same email thread |
| Send window | 8 to 18 | Sending hours, in the sheet's time zone |
| Send on weekends | TRUE | |
| Signature | `{{sender_name}}` | Each Gmail signs with its own name |
| Opt-out line | (a P.S. line) | Added to every email |
| Pause everything | FALSE | Set to TRUE to stop all sending |

## Replies

Each Gmail checks for replies every hour. A reply turns the lead **Replied**, stops
its follow-ups, and gets the Gmail label **Outreach Replies**.
"Stop" or "remove me" replies go to Do Not Contact automatically.

**Answer replies yourself**, from the Gmail in the lead's **Assigned Inbox**, the same day.
Then set the **Outcome** (Interested, Meeting booked, Not interested).

## Daily routine (10 minutes)

1. **Dashboard:** on pace? Bounce rate under 2%?
2. **Inboxes:** any 🟡 or 🔴? Read **Last Result**.
3. **Leads:** filter Status = **Replied**. Answer them, set Outcome.
4. Running low on New leads? Make and upload a new batch.

## Rules for free Gmails

- Never more than 35 a day per Gmail. Keep the warm-up on.
- Check every list with an email checker before uploading.
- A Gmail gets a warning or a phone check? Set it to **Paused** on Inboxes for a few days.
- Use each Gmail like a person too: open it, reply to a few normal emails.

## New campaign with other Gmails

**File → Make a copy** of the master sheet. In the copy, clear the Leads and Log
tabs (keep the header rows), update Settings, and connect the new Gmails (Part 2).

## Troubleshooting

| Problem | Fix |
|---|---|
| No 📧 Outreach menu | Reload the sheet and wait 10 seconds |
| "Gmail API service is not added" | Apps Script → Services **+** → Gmail API → Add |
| A Gmail isn't sending | Read its **Last Result** on Inboxes. Check Pause everything, the send window and time zone, and that it has New leads |
| "This app is blocked" | That Gmail is using someone else's script. Give it its own copy (Part 2) |
| Wrong Gmail connected | Use an Incognito window with only that Gmail signed in |
| "Missing columns" on upload | Make the file again with `LEAD-PROMPT.txt` |
| Excel file won't upload | Open it in Google Sheets → File → Download → CSV, then upload that |
| `#VALUE!` on Dashboard | The Goal in Settings must be a plain number, e.g. 5000 |
| Leads with no Gmail | Connect your Gmails, then "Spread waiting leads across inboxes" |
