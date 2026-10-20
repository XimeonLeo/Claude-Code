# Outreach System: Setup & Daily Guide

One Google Sheet sends your outreach from up to 15 Gmails, by itself, and tracks
everything: who got which email, from which Gmail, follow-ups, replies and bounces.

**The files:**

| File | Who uses it | What it's for |
|---|---|---|
| `Loader.gs` | Everyone | Pasted **once** into each sheet and each Gmail's script. It downloads the latest code by itself |
| `Code.gs` | Admin only | The real code. It lives in the admin's Google Drive. Update it there and everyone gets the update |
| `LEAD-PROMPT.txt` | Everyone | The prompt for getting leads |
| `SETUP.md` | Everyone | This guide |

---

## Part 0 (admin only, once): publish the code

1. Open `Code.gs` and check your admin Gmail is filled in near the top: `var ADMINS = 'you@gmail.com';`
2. Upload `Code.gs` to your **Google Drive**.
3. Right-click it → **Share** → General access: **Anyone with the link** → **Viewer** → **Copy link** → Done.
4. Open `Loader.gs` and paste that link into the line near the top:
   ```
   var CODE_URL = 'paste the Drive link here';
   ```
5. Save `Loader.gs` and give **that** file to your team. They never need `Code.gs`.

**To send out an update later** (for example when you get a new `Code.gs`):
1. Test it first: paste the new `Code.gs` into a test sheet's script and check it works.
2. In Google Drive, right-click your `Code.gs` → **File information** → **Manage versions** →
   **Upload new version** → choose the new file. (This keeps the same link.)
3. Every sheet and every Gmail gets it **within an hour**, by itself.
   To check: **📧 Outreach → Which Gmail am I using?** shows the version. To get it right away:
   **📧 Outreach → Check for updates now**.

If an update can't be downloaded or has a mistake in it, every sheet keeps running the version it already has.


## Part 1: Make the master sheet (once, 15 minutes)

Do this signed in to the Gmail that will **own** the sheet.

1. Go to **sheets.new**. Name the sheet, e.g. "Outreach Master".
2. **File → Settings → Time zone**: choose your time zone. Click Save.
3. **Extensions → Apps Script**. Delete everything in the editor, paste all of `Loader.gs` (from your admin), click 💾 **Save**.
4. On the left, click **+** next to **Services** → choose **Gmail API** → **Add**.
5. Go back to the sheet and **reload the page**. Wait for the **📧 Outreach** menu.
   The first time, it only shows **Finish setup: download the code**. Click it, allow it (see step 6), then reload again.
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
4. Delete what's there, paste all of `Loader.gs`, then fill in the two lines at the top:
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

**Updates arrive by themselves** within an hour. Nobody pastes code again.

**Already using the old way (Code.gs pasted in)?** Switch once: in the master sheet's script and in
each Gmail's copy, replace everything with `Loader.gs`. Copy your `MASTER_SHEET` and `SENDER_NAME`
lines across in the Gmail copies. Save, choose **updateNow** in the dropdown, click **▶ Run** and **Allow**.
Hourly sending keeps working; nothing else changes.

## Part 3: Get leads and upload them

1. **Make the leads.** Copy everything in `LEAD-PROMPT.txt` below the dashed line,
   paste it into a new AI chat (Claude, ChatGPT, Gemini or Grok), and answer the questions.
   Not sure? Type **SKIP**. Download the file it gives you.
   **Already have leads** (Apollo, Apify, a spreadsheet)? Answer **1** to the first question and
   upload your list. The AI writes the emails for those people only.
   **Have your own email?** Answer **2** to "How should I write the emails?" and paste it. The AI keeps your
   structure and fills in personal details for each lead. It shows you one lead's emails first, for your OK.
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

**Never change row 1** (the column names) of Leads, Inboxes, Log or Do Not Contact. Don't rename, delete or move
columns, and when you sort, use **Data → Sort range** with **"Data has header row"** ticked. The script finds everything by those names.

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

## Admin: watch your team's sheets

If you've set this system up for other people, you can watch all their sheets from your own master sheet.

**First, lock it to you** (Part 0, step 1). In `Code.gs`, near the top:
```
var ADMINS = 'you@gmail.com';
```
Then only that Gmail can use the Admin menu. Because everyone downloads the code from your Drive, nobody else can change this.

**Each team member (once):** in their master sheet click **Share** → add your Gmail → **Viewer** → Send.
Share **only** with the admins. Nobody can watch a sheet that wasn't shared with them.
They must use `Loader.gs` and have clicked **Set up / repair** once.

**You (once):**
1. Make sure your own master sheet uses `Loader.gs` (Part 1).
2. **📧 Outreach → Admin: watch team sheets → Add a team member's sheet.** Type their name, paste their sheet link.
   Repeat for each person. (Or type names in column A and links in column B of the **Team** tab.)
3. **📧 Outreach → Admin: watch team sheets → Turn on automatic checks (every 2 hours).**

You get three new tabs:

| Tab | What it shows |
|---|---|
| **Team** | One row per person: 🟢 OK / 🟡 Check / 🔴 Problem, what's wrong now, sent today, last 7 days, total, bounce %, replies, meetings, leads waiting, active Gmails, last email sent, and a link to open their dashboard |
| **Team Alerts** | Every problem found, with the date and time and how to check it. It's kept even after they fix it |
| **Team History** | Their numbers at every check, so you can see progress over time |

The numbers are worked out from their raw Leads and Log tabs, not their Dashboard, so editing the Dashboard doesn't hide anything.
The history is stored in **your** sheet, so they can't change it.

**What gets flagged:**
- 🔴 Leads, Log rows or Do Not Contact rows deleted. Total sent going down. A tab, column or Settings row deleted or renamed.
- 🔴 The Leads tab and the Log don't agree (one of them was edited or cleared).
- 🔴 You can't open their sheet any more (they removed your access).
- 🟡 Daily limit above 35, warm-up off, opt-out line removed, follow-ups off, sending paused.
- 🟡 Leads set back to New after being emailed, leads marked Replied by hand, duplicate leads.
- 🟡 High bounce rate, Gmails paused, nothing sent in 24 hours, no leads waiting.

**Making someone else an admin:**
- **To let them see everything:** share your master sheet with them as **Viewer**.
  They see the Team, Team Alerts and Team History tabs, kept up to date by your automatic checks.
  They can't change anything. This is the easiest option.
- **To let them run checks themselves:** add their Gmail to `ADMINS`
  (`var ADMINS = 'you@gmail.com, partner@gmail.com';`), and have each team member share their sheet with them too.
- **To remove an admin:** stop sharing your master sheet with them, take them out of `ADMINS`,
  and ask your team to remove them from their Share list.

Team Alerts and Team History are locked: only you (the sheet's owner) can edit them, even if you give someone Editor access.

**To see exactly what someone changed:** open their sheet → **File → Version history → See version history**.
It shows who edited what and when, and you can restore an earlier version.

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
| Team tab: "Cannot open this sheet" | They haven't shared it with you, removed your access, or the link is wrong |
| Team tab: "columns/rows deleted or renamed" right after adding someone | Their sheet was set up by an older version. Have them click Set up / repair |
| "Could not update" or the menu only shows "Finish setup" | Check `CODE_URL` in the loader, and that the Drive file is shared as **Anyone with the link → Viewer** |
| Leads or data look missing after Set up / repair | Nothing is deleted: row 1 (the column names) had been changed, so the old script added new empty columns. **File → Version history → See version history** → pick a version from before the repair → **Restore this version**. Then run Set up / repair again (it now checks before changing anything) |
| "Nothing was changed. Set up / repair stopped..." | Row 1 of a tab was sorted, renamed or deleted. Do what the message says (Version history is easiest), then run Set up / repair again |
| `#VALUE!` on Dashboard | The Goal in Settings must be a plain number, e.g. 5000 |
| Leads with no Gmail | Connect your Gmails, then "Spread waiting leads across inboxes" |
