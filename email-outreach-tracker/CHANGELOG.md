# Outreach changelog

Every version of the outreach tracker, newest first. The same list is in the sheet: **📧 Outreach → What's new**.

## v39 · 2026-10-22 · Guided tour, Earnings, delivered first, ready for other teams

- **New:** Guided tour for new people: 12 short steps through every part of the system, with buttons that open each tab and window, a Do & don't page, and a checklist of where you are. First-timers are pointed to it when they open the sheet. _Where: Outreach → 🎓 Start here_
- **New:** Earnings: record each sale (client, amount, what they bought). See your total, this month and your orders. Clicking "Customer" in the Replies window asks for the amount too. _Where: Outreach → 💰 Earnings, and the new Earnings tab_
- **New:** Team Earnings Board: everyone who has made a sale, most earned first, with the team total. The admin publishes it; it appears in everyone's sheet (Team Earnings tab) and in the Earnings window. _Where: Outreach → 💰 Earnings → Team Earnings Board, and the Team Earnings tab_
- **Changed:** Delivered (sent minus bounces) comes first everywhere: the Dashboard's "Delivered today" cards on every layout, and the Leaderboard now ranks by delivered. _Where: Dashboard, Leaderboard_
- **New:** Other admins can run this for their own team: one settings block at the top of Code.gs (admins, team name, currency, board link) and a step-by-step ADMIN-GUIDE.md. _Where: Code.gs → YOUR TEAM'S SETTINGS_

After this update, click **📧 Outreach → 1. Set up / repair this sheet** (or **Apply the update to this sheet** in What's new).

## v38 · 2026-10-22 · Simpler 24-hour report, update prompt, choose who is on the Leaderboard

- **Changed:** The 24-hour report is simpler and counts DELIVERED emails (sent, minus bounces), not just sent. One table: last 24 hours next to so far, for delivered (first emails and follow-ups), replies and bounces. The daily standard is checked against delivered. _Where: Outreach → My last 24 hours (report)_
- **New:** When an update is ready, everyone is told: a yellow banner across the top of the Dashboard, a notice when the sheet opens, and "🆕 Update ready" at the top of the menu, until they click Apply the update. _Where: Dashboard banner and Outreach → 🆕 Update ready_
- **New:** Admin: choose who shows on the Leaderboard with a tick box per person. Unticked people are still checked and alerted. _Where: Team tab → On Leaderboard column, then Outreach → Admin → Check all team sheets now_

After this update, click **📧 Outreach → 1. Set up / repair this sheet** (or **Apply the update to this sheet** in What's new).

## v37 · 2026-10-22 · Choose your own warm-up

- **New:** Each Gmail can have its own warm-up: how many on day 1, and how many more each day. Blank = the Settings warm-up. 0 on day 1 = no warm-up for that Gmail. _Where: Inboxes tab → Warm-up Day 1 and Warm-up Per Day columns (far right). Click "Apply the update to this sheet" below to add them_
- **Changed:** The Settings warm-up accepts 0 to 500 on day 1 (it was 0 to 50). _Where: Settings → Warm-up: day 1 limit_
- **Changed:** Admin: Gmails with their warm-up turned off are flagged 🟡. _Where: Team tab (admin)_

After this update, click **📧 Outreach → 1. Set up / repair this sheet** (or **Apply the update to this sheet** in What's new).

## v36 · 2026-10-22 · Choose your own daily limit

- **Changed:** The daily limit can now be anything from 1 to 500 (it was 1 to 50). 35 or less is still safest for a free Gmail. _Where: Settings → Default daily limit per inbox_
- **New:** Each Gmail can have its own daily limit: type it in that Gmail's Daily Limit cell. Blank = the Settings default. _Where: Inboxes tab → Daily Limit column_
- **Improved:** When warm-up keeps a Gmail below its limit, Last Result now says so ("warming up: +5 a day until 60") instead of just "Daily limit reached". _Where: Inboxes tab → Last Result_
- **Improved:** With a high limit, the pauses between emails get shorter, so a Gmail never runs out of Google's daily script time and stops halfway through the day. _Where: Automatic_
- **Changed:** Admin: a daily limit above 35 is still flagged 🟡, now with which Gmails and their limits. _Where: Team tab (admin)_

After this update, click **📧 Outreach → 1. Set up / repair this sheet** (or **Apply the update to this sheet** in What's new).

## v35 · 2026-10-21 · Follow-up tracking

- **New:** A Follow-ups section on the Dashboard (every layout): sent today and all time, due today and in the next 3 days, overdue, replies after a follow-up, follow-up reply rate, leads waiting for a follow-up, and leads that finished all emails. _Where: Dashboard → Follow-ups (near the bottom). Click "Apply the update to this sheet" below_
- **New:** The 24-hour report has a Follow-ups part: sent, due today, overdue and replies after a follow-up. Late follow-ups are listed under "To check". _Where: Outreach → My last 24 hours (report)_
- **New:** Leaderboard columns: Follow-ups sent, Follow-ups today, Follow-ups late, Replies after follow-up. Team checks flag follow-ups more than a day late. _Where: Leaderboard and Team tabs (admin)_
- **Fixed:** The Dashboard footer showed "vv34". _Where: Dashboard footer_

After this update, click **📧 Outreach → 1. Set up / repair this sheet** (or **Apply the update to this sheet** in What's new).

## v34 · 2026-10-21 · Changelog, and the Results by Angle fix

- **New:** This "What's new" window. It opens from the menu after every update, shows what changed and where to find it, and keeps the full history. _Where: Outreach → What's new_
- **New:** Version numbers now count up (v34, v35...) instead of dates. _Where: Outreach → Which Gmail am I using?_
- **Fixed:** Results by Angle showed #REF! ("Array result was not expanded") when the Leads tab had more angles than the panel has rows. It now lists the most-used angles that fit and says how many there are in total. _Where: Dashboard (Classic layout) → Results by Angle. Click "Apply the update to this sheet" below_

After this update, click **📧 Outreach → 1. Set up / repair this sheet** (or **Apply the update to this sheet** in What's new).

## v33 · 2026-10-21 · Results by Angle: first fix

- **Fixed:** First attempt at the Results by Angle #REF! error. Replaced by v34. _Where: Dashboard → Results by Angle_

After this update, click **📧 Outreach → 1. Set up / repair this sheet** (or **Apply the update to this sheet** in What's new).

## v32 · 2026-10-21 · Replies window, 24-hour report, admin on the Leaderboard

- **New:** Replies window: every reply that needs an outcome, and everyone to follow up (Interested / Follow up later). One click sets the outcome, with an optional note. No more searching the Leads tab. _Where: Outreach → Replies: set outcomes & follow-ups_
- **New:** "My last 24 hours" report for team meetings: sent, daily standard met or not (and why), replies, bounces, leads waiting, goal progress and totals. Copy as text for WhatsApp. _Where: Outreach → My last 24 hours (report)_
- **New:** Setting "Daily standard (emails sent per day)" for the report. Blank = what your active Gmails can send today. _Where: Settings tab_
- **New:** Dashboard top band shows replies needing an outcome, people to follow up, interested and meetings. _Where: Dashboard, under the title_
- **New:** Admin: add or remove your own numbers on the Leaderboard. Leaderboard also shows Need outcome and To follow up. _Where: Outreach → Admin: watch team sheets → Leaderboard: my own numbers_

After this update, click **📧 Outreach → 1. Set up / repair this sheet** (or **Apply the update to this sheet** in What's new).

## v31 · 2026-10-21 · Faster sending, self-repair, bounce-pause fix

- **Improved:** Each Gmail runs every 15 minutes instead of every hour. Connected Gmails switch by themselves. _Where: Automatic_
- **New:** Setting "Sending pace": Steady (spread over the day) or Fast (daily limit in about 1-2 hours). _Where: Settings → Sending pace_
- **Fixed:** One lead Gmail refused could block a Gmail for good. It now becomes "Send failed" (reason in Notes) and the rest keep sending. _Where: Leads tab → Status "Send failed"_
- **Fixed:** A slow reply check could use up the whole run so nothing was sent. It now has a time limit. _Where: Automatic_
- **New:** Working Gmails take over New leads from Gmails that are paused or have stopped running (Log: LEADS_MOVED). No more re-spreading by hand. _Where: Settings → Move waiting leads off stuck Gmails_
- **Fixed:** A Gmail set back to Active after a bounce pause was paused again straight away. Only its last 7 days, since it was turned back on, now count. _Where: Inboxes tab → Status_
- **New:** Gmails paused for bounces restart by themselves after 2 days, warming up again. _Where: Settings → Restart a Gmail paused for bounces after (days)_
- **Improved:** Last Result says when Google cut a run off. _Where: Inboxes tab → Last Result_

After this update, click **📧 Outreach → 1. Set up / repair this sheet** (or **Apply the update to this sheet** in What's new).

## v30 · 2026-10-20 · Five more Dashboard layouts

- **New:** Layouts Executive, Scoreboard, Funnel, Inbox Command and Compact, with a preview of each. _Where: Outreach → Choose dashboard layout_

## v29 · 2026-10-20 · Notion and ClickUp themes

- **New:** Colour themes "Notion Style" and "ClickUp Style". _Where: Settings → Colour theme, then Outreach → Apply colour theme_
- **Changed:** Warm-up increase and bounce-pause rate accept any value. _Where: Settings tab_

## v28 · 2026-10-20 · Multi-file upload, reset, Leaderboard, mistake guards

- **Improved:** Upload several CSV files at once. _Where: Outreach → Upload a lead file (CSV)_
- **New:** Reset to default settings, keeping your leads. _Where: Outreach → Reset to default settings_
- **New:** Admin Leaderboard ranking every team member. _Where: Leaderboard tab (admin)_
- **New:** Google asks "Edit anyway?" before you change parts the script fills in. Settings refuse values that make no sense. _Where: Dashboard, Log, Leads, Inboxes, Settings_

After this update, click **📧 Outreach → 1. Set up / repair this sheet** (or **Apply the update to this sheet** in What's new).

## v27 · 2026-10-20 · Emails Sent read correctly

- **Fixed:** When the Emails Sent column was formatted as a date, leads were marked Completed without sending. _Where: Leads tab → Emails Sent_

After this update, click **📧 Outreach → 1. Set up / repair this sheet** (or **Apply the update to this sheet** in What's new).

## v26 · 2026-10-20 · New leads always start at email 1

- **Fixed:** A lead pasted over an old row kept the old count and was never emailed. New leads now always start at email 1. _Where: Leads tab_

## v25 · 2026-10-20 · Ask again for missing permissions

- **Fixed:** If a permission was unticked on Google's Allow screen, the script now asks again instead of failing. _Where: Any menu item_

## v24 · 2026-10-20 · Goal tracker and colour themes

- **New:** Goal tracker band: delivered vs goal, where you should be by today, on track or behind. _Where: Dashboard_
- **New:** Colour themes Navy, Emerald and Burgundy & Gold. _Where: Settings → Colour theme, then Outreach → Apply colour theme_

After this update, click **📧 Outreach → 1. Set up / repair this sheet** (or **Apply the update to this sheet** in What's new).

## v23 · 2026-10-20 · Navy and gold look

- **New:** Paramount Orbit Scouting Centre design: logo, 16 cards (today, all time, results, pipeline), day by day with replies and bounces. _Where: Dashboard_
- **New:** About window. _Where: Outreach → About_

After this update, click **📧 Outreach → 1. Set up / repair this sheet** (or **Apply the update to this sheet** in What's new).

## v22 · 2026-10-20 · Loader v3: spare slots

- **Improved:** New menu items can arrive through updates without anyone pasting a new Loader. _Where: Automatic_

## v21 · 2026-10-20 · Upload window permission fix

- **Fixed:** "Not sufficient permissions to call Ui.showModalDialog" when opening the upload window. _Where: Outreach → Upload a lead file (CSV)_

## v20 · 2026-10-20 · Lead prompt: help me decide

- **New:** Not sure what to offer or who to target? The AI researches and gives options to pick from. _Where: LEAD-PROMPT.txt, question 3_

## v19 · 2026-10-20 · Code link set

- **Changed:** The Loader points at the admin's Drive copy of Code.gs. _Where: Loader.gs → CODE_URL_

## v18 · 2026-10-20 · Automatic updates

- **New:** Everyone pastes Loader.gs once. It downloads the latest code from the admin's Drive every hour. _Where: Outreach → Check for updates now_

## v17 · 2026-10-20 · Better, more personal emails

- **Improved:** The lead prompt researches real details per lead, writes shorter natural emails, or follows your own email. Shows one lead first for your OK. _Where: LEAD-PROMPT.txt_

## v16 · 2026-10-19 · Safe Set up / repair

- **Fixed:** Repair on a sheet with a changed header row added empty columns, so data looked missing. It now checks first and explains how to restore. _Where: Outreach → 1. Set up / repair this sheet_

## v15 · 2026-10-19 · Admin Gmail set

- **Changed:** Admin set to the owner's Gmail. _Where: Code.gs → ADMINS_

## v14 · 2026-10-19 · Admin menu locked

- **New:** Only Gmails listed as admins can use the Admin menu. Team Alerts and Team History are protected. _Where: Outreach → Admin: watch team sheets_

## v13 · 2026-10-19 · Admin view

- **New:** Watch team members' sheets: Team, Team Alerts and Team History tabs, checks every 2 hours, flags deleted rows and changed settings. _Where: Outreach → Admin: watch team sheets_

## v12 · 2026-10-19 · Leads you already have

- **New:** The lead prompt can write emails for your own list (Apollo, Apify, a spreadsheet). _Where: LEAD-PROMPT.txt, answer 1 to the first question_

## v11 · 2026-10-19 · Three files only

- **Removed:** Extra files, the Import tab and import-from-link. One way to import. _Where: Outreach → Upload a lead file (CSV)_

## v10 · 2026-10-19 · Simpler lead prompt

- **Improved:** The lead prompt asks a few plain questions (type SKIP if unsure). _Where: LEAD-PROMPT.txt_

## v9 · 2026-10-19 · Master lead prompt and foolproof upload

- **New:** One lead prompt for the whole team, and an upload window that checks columns and empty cells. _Where: Outreach → Upload a lead file (CSV)_

## v8 · 2026-10-18 · Last Result on Inboxes

- **New:** Each Gmail shows why it did or did not send on its last run. _Where: Inboxes tab → Last Result_

After this update, click **📧 Outreach → 1. Set up / repair this sheet** (or **Apply the update to this sheet** in What's new).

## v7 · 2026-10-18 · Email angles

- **New:** Leads carry an angle (direct pitch, idea offer...) and the Dashboard compares results by angle. _Where: Dashboard → Results by Angle_

After this update, click **📧 Outreach → 1. Set up / repair this sheet** (or **Apply the update to this sheet** in What's new).

## v6 · 2026-10-18 · Lead research prompts

- **New:** Prompts that find leads and write their emails as a CSV for the sheet. _Where: LEAD-PROMPT.txt_

## v5 · 2026-10-18 · Choose the sending Gmail on import

- **New:** Pick which Gmail sends a file, or spread evenly. Spread waiting leads can keep your choices. _Where: Upload window, and Outreach → Spread waiting leads across inboxes_

## v4 · 2026-10-18 · Each Gmail runs its own copy

- **Changed:** Sending Gmails other than the owner use their own script copy (Google blocks shared scripts). _Where: SETUP.md, Part 2_

## v3 · 2026-10-18 · Upgrade adds new columns

- **Improved:** Set up / repair adds new columns to an existing sheet. _Where: Outreach → 1. Set up / repair this sheet_

After this update, click **📧 Outreach → 1. Set up / repair this sheet** (or **Apply the update to this sheet** in What's new).

## v2 · 2026-10-18 · Personal messages per lead

- **New:** Each lead has its own subject, message and follow-ups. Signature per Gmail. "Needs message" status. _Where: Leads tab_

After this update, click **📧 Outreach → 1. Set up / repair this sheet** (or **Apply the update to this sheet** in What's new).

## v1 · 2026-10-18 · First version

- **New:** The outreach tracker: sends from many Gmails with follow-ups, and tracks replies, bounces and opt-outs. _Where: SETUP.md_

After this update, click **📧 Outreach → 1. Set up / repair this sheet** (or **Apply the update to this sheet** in What's new).
