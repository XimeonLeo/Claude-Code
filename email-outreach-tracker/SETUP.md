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
| `CHANGELOG.md` | Everyone | Every version and what changed (also in the sheet: **📧 Outreach → What's new**) |

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
0. If you changed `Code.gs` yourself: raise `CORE_BUILD` and `CORE_VERSION` near the top by one (e.g. 34 → 35, `'v35'`),
   and add what changed at the top of `CHANGELOG` (search for `var CHANGELOG`). That's what people see in What's new.
1. Test it first: paste the new `Code.gs` into a test sheet's script and check it works.
2. In Google Drive, right-click your `Code.gs` → **File information** → **Manage versions** →
   **Upload new version** → choose the new file. (This keeps the same link.)
3. Every sheet and every Gmail gets it **within an hour**, by itself.
   To check: **📧 Outreach → Which Gmail am I using?** shows the version. To get it right away:
   **📧 Outreach → Check for updates now**.

If an update can't be downloaded or has a mistake in it, every sheet keeps running the version it already has.

**What people see after an update:** a notice in the corner of the sheet ("Outreach updated") and a highlighted
first menu item, **📧 Outreach → 🆕 What's new in v35**. It shows what's new, improved, fixed or removed, and
**where** to find each thing, plus the full history. If the update changes the sheet itself (new Settings rows, the
Dashboard), it has an **Apply the update to this sheet** button. It's the same as Set up / repair and keeps all leads.

**Want it right away?** Click **📧 Outreach → Check for updates now** first, then reload the sheet. Otherwise a sheet
can keep using the old version for up to an hour, and a repair in that hour still builds the old Dashboard.


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

Each connected Gmail now sends **by itself every 15 minutes** during the send window,
even when your computer is off. (Gmails connected with an older version switch from hourly to every
15 minutes by themselves on their next run.)

**Updates arrive by themselves** within an hour. Nobody pastes code again.

**Already using the old way (Code.gs pasted in)?** Switch once: in the master sheet's script and in
each Gmail's copy, replace everything with `Loader.gs`. Copy your `MASTER_SHEET` and `SENDER_NAME`
lines across in the Gmail copies. Save, choose **updateNow** in the dropdown, click **▶ Run** and **Allow**.
Sending keeps working; nothing else changes.

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
   choose the file (or **several files at once**: hold Ctrl or Cmd while clicking) → choose a Gmail
   (or "spread evenly") → **Check files** → **Import**.
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

**Mistake guards:** if you try to edit something the script fills in (the Dashboard, the Log, column names, sent
dates and counts), Google asks **"Edit anyway?"**. Click **Cancel** unless you're sure. Settings refuse values
that don't make sense (for example a daily limit of 500) and say what's allowed.

**Change how the Dashboard looks:** **📧 Outreach → Choose dashboard layout** shows a preview of 6 layouts
(Classic, Executive, Scoreboard, Funnel, Inbox Command, Compact). Click one, then **Use this layout**.
Colours: Settings → **Colour theme**, then **📧 Outreach → Apply colour theme**. Layouts and themes mix freely.

**Something looks wrong?** **📧 Outreach → Reset to default settings (keeps your leads).** It puts the settings back
to normal (your campaign name, goal, dates and colour theme stay), shows hidden rows and columns, removes filters
and repairs the tabs. Leads, sends, replies, Gmails and Do Not Contact are never touched.

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
**Send failed** = Gmail refused this email twice (read the **Notes** cell). Fix the email or message, then set
Status back to New (or In sequence for a follow-up). Other leads keep sending in the meantime.

## Settings

| Setting | Default | Meaning |
|---|---|---|
| Goal | 5000 | Target on the Dashboard |
| Campaign start date / length | today / 11 | For "days left" |
| Default daily limit per inbox | 35 | Most emails per Gmail per day, **1 to 500**. 35 or less is safest for a free Gmail. To give **one Gmail its own limit**, type it in its **Daily Limit** cell on the Inboxes tab (blank = this default) |
| Warm-up: day 1 limit / increase | 20 / 5 | New Gmails start at 20 a day, +5 a day |
| Days before follow-up 1 / 2 | 3 / 4 | Follow-ups go in the same email thread |
| Send window | 8 to 18 | Sending hours, in the sheet's time zone |
| Sending pace | Steady | **Steady** spreads each Gmail's emails across the send window (safest). **Fast** sends each Gmail's daily limit as soon as it can, usually within 1 to 2 hours |
| Auto-pause inbox at bounce rate | 5% | A Gmail stops if this share of its **last 7 days'** emails bounce (at least 20 sends). Sends from before it was turned back on don't count |
| Restart a Gmail paused for bounces after (days) | 2 | It restarts by itself and warms up again from day 1. Blank = never |
| Move waiting leads off stuck Gmails | TRUE | A working Gmail takes over **New** leads from a Gmail that is paused, removed, or hasn't run for 3 hours |
| Send on weekends | TRUE | |
| Signature | `{{sender_name}}` | Each Gmail signs with its own name |
| Opt-out line | (a P.S. line) | Added to every email |
| Daily standard (emails sent per day) | (blank) | What "My last 24 hours" checks against. Blank = what your active Gmails can send today |
| Pause everything | FALSE | Set to TRUE to stop all sending |

## Follow-ups

Follow-ups go out **by themselves**: follow-up 1 three days after the first email, follow-up 2 four days after that
(Settings), from the same Gmail, in the same email thread. They go before new leads and stop as soon as someone
replies, bounces or asks to be removed. The text comes from the lead's **Follow-up 1 / 2 Message** cells
(or the default in Settings).

**How they're going:** the Dashboard's **Follow-ups** section (near the bottom, every layout):

| Card | Meaning |
|---|---|
| Follow-ups sent today | Plus all time |
| Due today | Follow-ups that should go out today (plus the next 3 days) |
| Overdue (over 1 day) | Should have gone more than a day ago. **Should be 0.** If not, the Gmail that sent those leads' first email has stopped: check its Last Run / Last Result on Inboxes |
| Replies after a follow-up | People who replied only after a follow-up, and their share of all replies |
| Follow-up reply rate | Those replies ÷ leads that got follow-up 1 |
| Waiting for a follow-up / Finished all emails | Leads In sequence / Completed |

The same numbers are in **My last 24 hours** and, for the admin, on the **Leaderboard** (Follow-ups sent, today,
late, replies after follow-up). Each lead's row shows when each email went (**Email 1 Sent**, **Follow-up 1 Sent**,
**Follow-up 2 Sent**) and when the next is due (**Next Send**).

## Replies

Each Gmail checks for replies about every 25 minutes. A reply turns the lead **Replied**, stops
its follow-ups, and gets the Gmail label **Outreach Replies**.
"Stop" or "remove me" replies go to Do Not Contact automatically.

**Answer replies yourself**, from the Gmail in the lead's **Assigned Inbox**, the same day.

**Set outcomes without searching the Leads tab:** **📧 Outreach → Replies: set outcomes & follow-ups**.
It has two lists:
- **📬 Need an outcome:** every reply you haven't marked yet, newest first, with what they wrote.
- **🔁 To follow up:** everyone marked **Interested** or **Follow up later**, waiting longest first.

Click an outcome (Interested, Meeting booked, Not interested...) and it's saved to the lead. Type a note first
(e.g. "call Tuesday") to add it to the lead's Notes. **Open in Gmail** opens that person's emails in the right Gmail.
When a follow-up turns into a meeting, click **Meeting booked** and it leaves the list.

The Dashboard's top band shows how many replies need an outcome and how many are waiting to be followed up.

## Daily routine (10 minutes)

1. **Dashboard:** on pace? Bounce rate under 2%?
2. **Inboxes:** any 🟡 or 🔴? Read **Last Result**.
3. **📧 Outreach → Replies: set outcomes & follow-ups.** Answer them, click the outcome. Then the To follow up list.
4. Running low on New leads? Make and upload a new batch.

## Team meeting: "My last 24 hours"

**📧 Outreach → My last 24 hours (report)** shows a snapshot of exactly the last 24 hours, up to the minute you
click it, so everyone can read their numbers out:
- **Last 24 hours:** emails sent (first emails and follow-ups), the daily standard ✅ met or ❌ how many short,
  replies, bounces, new leads uploaded.
- **New leads waiting.** If the standard wasn't met it also says **why**: no leads left, a Gmail paused or not
  running, or sending paused.
- **Campaign so far:** progress to the goal, days left and how many a day are needed, total sent, total replies,
  total bounces, Gmails connected and sending, replies needing an outcome, people to follow up.

**Copy as text** copies it all, ready to paste into WhatsApp or an email.
The numbers come from the Log and Leads tabs, so they're the same whenever anyone clicks.

## Rules for free Gmails

- 35 a day per Gmail is the safe level. You **can** go higher (up to 500, per Gmail on the Inboxes tab), but the
  higher you go, the more likely Google flags the Gmail. Raise it slowly, keep the warm-up on, and watch Health.
- The warm-up counts from the **Campaign start date** (20 on day 1, +5 a day). Early in a campaign a Gmail can't
  reach a high limit yet, and its **Last Result** says "warming up: +5 a day until 60". Later in a campaign a new
  limit applies straight away, so raise it a little at a time (e.g. +10 every few days).
- Check every list with an email checker before uploading.
- A Gmail gets a warning or a phone check? Set it to **Paused** on Inboxes for a few days.
  Its waiting leads move to your other Gmails by themselves.

## Speed, stops and bounce pauses

**Why it doesn't send everything at once.** Each Gmail sends at most its daily limit (35), spread
over the send window. That's what keeps free Gmails out of spam. To send **more per day, add more Gmails**:
10 Gmails × 35 = 350 a day. To send the same amount **sooner** in the day, set **Sending pace** to **Fast**.

**It fixes itself when sending stops.** You no longer need "Spread waiting leads" to get things moving:
- A lead Gmail keeps refusing becomes **Send failed** instead of blocking every lead behind it.
- Leads waiting on a Gmail that is paused or has stopped running are taken over by a working Gmail
  (Log event `LEADS_MOVED`).
- A slow reply check can't use up the run any more: sending always gets its turn.
- If Google cuts a run off, **Last Result** says so instead of showing an old message.

**Bounce pauses.** When a Gmail is paused for bounces (Status **Paused - bounces**, Health 🔴):
- It restarts **by itself** after 2 days (Settings), warming up again from 20 a day.
- Or set Status back to **Active** yourself. It's judged on its **new** emails only, so it won't be paused
  again straight away for the old bounces.
- Paused 3 times in 14 days? It stays paused until you set it to Active. Check your lead lists with an
  email checker first: bounces almost always come from unchecked lists.
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

You get four new tabs:

| Tab | What it shows |
|---|---|
| **Leaderboard** | Everyone ranked in one place (most sent first, then most replies): leads, sent today, last 7 days, total sent, replies, reply %, bounces, bounce %, meetings, status, plus a team total. 🥇🥈🥉 for the top three. Updated with every check |
| **Team** | One row per person: 🟢 OK / 🟡 Check / 🔴 Problem, what's wrong now, sent today, last 7 days, total, bounce %, replies, meetings, leads waiting, active Gmails, last email sent, and a link to open their dashboard |
| **Team Alerts** | Every problem found, with the date and time and how to check it. It's kept even after they fix it |
| **Team History** | Their numbers at every check, so you can see progress over time |

The numbers are worked out from their raw Leads and Log tabs, not their Dashboard, so editing the Dashboard doesn't hide anything.
The history is stored in **your** sheet, so they can't change it.

**What gets flagged:**
- 🔴 Leads, Log rows or Do Not Contact rows deleted. Total sent going down. A tab, column or Settings row deleted or renamed.
- 🔴 The Leads tab and the Log don't agree (one of them was edited or cleared).
- 🔴 You can't open their sheet any more (they removed your access).
- 🟡 Daily limit above 35 (in Settings, or for a Gmail on Inboxes), warm-up off, opt-out line removed, follow-ups off, sending paused.
- 🟡 Leads set back to New after being emailed, leads marked Replied by hand, duplicate leads.
- 🟡 High bounce rate, Gmails paused, nothing sent in 24 hours, no leads waiting.

**Your own numbers on the Leaderboard:** **📧 Outreach → Admin: watch team sheets → Leaderboard: my own
numbers are OFF (click to switch)**. Type the name to show (e.g. "Simeon (admin)"). Your sheet joins the
ranking with a ⭐. Click it again to take yourself off. Either way the Leaderboard is rebuilt straight away.
The Leaderboard also shows each person's **Need outcome** and **To follow up** counts.

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
| Last Result says "Started, did not finish" | Google stopped that run. It tries again in 15 minutes. If it keeps happening, click **Run now for THIS Gmail** from that Gmail and read the message |
| Leads show **Send failed** | Read the lead's **Notes**. Usually a mistyped email. Fix it, then set Status back to New |
| Last Run on Inboxes is hours old | That Gmail's automatic run stopped. Its waiting leads move to other Gmails by themselves. To fix it: in that Gmail's script, choose **connectInbox** → **Run** (or **📧 Outreach → Connect THIS Gmail** for the owner) |
| "This app is blocked" | That Gmail is using someone else's script. Give it its own copy (Part 2) |
| Wrong Gmail connected | Use an Incognito window with only that Gmail signed in |
| "Missing columns" on upload | Make the file again with `LEAD-PROMPT.txt` |
| Excel file won't upload | Open it in Google Sheets → File → Download → CSV, then upload that |
| Team tab: "Cannot open this sheet" | They haven't shared it with you, removed your access, or the link is wrong |
| Team tab: "columns/rows deleted or renamed" right after adding someone | Their sheet was set up by an older version. Have them click Set up / repair |
| "You do not have permission to call UrlFetchApp.fetch" (or any "permission" error) | A permission was unticked on Google's Allow screen. **Extensions → Apps Script → choose updateNow → Run** → on Google's screen tick **Select all** → **Allow**. If no Google screen appears: go to **myaccount.google.com/permissions**, remove the script's access, then Run again |
| "Could not update" or the menu only shows "Finish setup" | Check `CODE_URL` in the loader, and that the Drive file is shared as **Anyone with the link → Viewer** |
| Leads or data look missing after Set up / repair | Nothing is deleted: row 1 (the column names) had been changed, so the old script added new empty columns. **File → Version history → See version history** → pick a version from before the repair → **Restore this version**. Then run Set up / repair again (it now checks before changing anything) |
| "Nothing was changed. Set up / repair stopped..." | Row 1 of a tab was sorted, renamed or deleted. Do what the message says (Version history is easiest), then run Set up / repair again |
| `#REF!` in Results by Angle ("Array result was not expanded") | Fixed in v34. **Check for updates now**, reload, then **What's new → Apply the update to this sheet** |
| `#VALUE!` on Dashboard | The Goal in Settings must be a plain number, e.g. 5000 |
| Leads with no Gmail | Connect your Gmails, then "Spread waiting leads across inboxes" |
