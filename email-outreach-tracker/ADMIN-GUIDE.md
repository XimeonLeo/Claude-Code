# Admin Guide: run this outreach system for your own team

This guide is for an **admin**: the person who sets the system up for a team, sends out updates and watches
everyone's numbers. Team members don't need it: they use `SETUP.md` and the guided tour in the sheet
(**📧 Outreach → 🎓 Start here**).

Following it gives you your **own** copy of the system. Your team gets updates from you, the Admin menu only
works for you, and your Leaderboard and Earnings Board only show your people.

**You need:** a Google account (Gmail), about 30 minutes, and these files:

| File | What it is |
|---|---|
| `Code.gs` | The system itself. Lives in **your** Google Drive |
| `Loader.gs` | What everyone pastes into their sheet. It downloads `Code.gs` from your Drive |
| `LEAD-PROMPT.txt` | The prompt your team uses in an AI chat to get leads |
| `SETUP.md` | The guide for team members |
| `CHANGELOG.md` | Every version and what changed |
| `ADMIN-GUIDE.md` | This guide |

---

## Step 1: Fill in your team's settings

Open `Code.gs` in a text editor (Notepad, TextEdit, or VS Code). At the very top is a block called
**YOUR TEAM'S SETTINGS**. Change these lines and nothing else:

```
var ADMINS = 'you@gmail.com';                 // your Gmail; co-admins separated by commas
var BRAND_NAME = 'Your Team Name';            // shown on the Dashboard, reports and boards
var BRAND_CREDIT = 'Run by Your Name';        // the small credit line
var CURRENCY = '$';                           // or '₦', '£', '€', ...
var TEAM_BOARD = '';                          // leave empty for now (step 5)
```

Keep the quote marks. If a name has an apostrophe, put a backslash before it: `'D\'Angelo'`.

> Optional: the logo on the Dashboard is the long `LOGO_PNG_B64` line further down. Leave it, or ask someone
> technical to swap it for your own logo (a 144×150 PNG as base64).

## Step 2: Put `Code.gs` in your Google Drive

1. Upload `Code.gs` to your Google Drive.
2. Right-click it → **Share** → General access: **Anyone with the link** → **Viewer** → **Copy link** → Done.

Only you can change it. Everyone else can only download it, which is what the Loader does.

## Step 3: Point `Loader.gs` at your `Code.gs`

1. Open `Loader.gs` in a text editor.
2. Near the top, replace the link in `var CODE_URL = '...';` with the link you just copied.
3. Save. This is the `Loader.gs` you give your team.

> Never give your team someone else's `Loader.gs`. It would download **their** `Code.gs`: their admins,
> their updates, their name.

## Step 4: Make your own master sheet, then add your team

1. Make your own master sheet with your `Loader.gs` (`SETUP.md`, Part 1). You'll be its admin.
2. Give each team member `Loader.gs`, `SETUP.md` and `LEAD-PROMPT.txt`. Each person makes their own master sheet
   (Part 1), connects their Gmails (Part 2), then **shares their master sheet with you as Viewer**.
3. In your sheet: **📧 Outreach → Admin: watch team sheets → Add a team member's sheet**. Type their name and paste
   their sheet link. Repeat for each person.
4. **Admin: watch team sheets → Turn on automatic checks (every 2 hours).**

You now have the **Team**, **Team Alerts**, **Team History** and **Leaderboard** tabs.

## Step 5: Share the Earnings Board with your team (once)

The first time you click **Admin → Check all team sheets now**, the system makes a separate Google Sheet called
**"Your Team Name - Earnings Board"** in your Drive. The pop-up shows its link.

1. Open that link → **Share** → add your team's Gmails (or **Anyone with the link**) as **Viewer**.
2. Paste the link into `TEAM_BOARD` at the top of `Code.gs`: `var TEAM_BOARD = 'https://docs.google.com/...';`
3. Upload `Code.gs` to Drive again **as a new version** (step 7 below, 2nd point).

From then on, every check (every 2 hours) updates the board. Each team member sees it in their own sheet, in the
**Team Earnings** tab and in **📧 Outreach → 💰 Earnings → Team Earnings Board**, refreshed every hour.

The board lists everyone who has made a sale, most earned first, with the team total. The amounts come from
each person's **Earnings** tab (they record sales with **💰 Earnings**).

## Step 6: Choose who shows on the boards

- **Team tab → On Leaderboard** (far right column): untick someone to leave them off the Leaderboard and the
  Earnings Board. They're still checked and still get alerts.
- **Admin → Leaderboard: my own numbers (click to switch)**: add or remove your own numbers.

Then click **Check all team sheets now** to rebuild the boards.

## Step 7: Sending out an update

1. Make your change to `Code.gs` (or get a new `Code.gs`), then **fill in your team's settings again** (step 1)
   if it's a fresh copy. Your settings are only in your copy.
2. Raise the version near the top: `var CORE_BUILD = 39;` → `40` and `var CORE_VERSION = 'v39';` → `'v40'`.
3. Add a line at the top of `var CHANGELOG = [` describing what changed and where to find it. Copy an existing
   entry and change the words. Put `repair: true` if people need to click Apply the update (new columns,
   Settings rows or Dashboard changes).
4. Test it: paste it into a test sheet's Apps Script and try it.
5. In Google Drive: right-click your `Code.gs` → **File information** → **Manage versions** →
   **Upload new version**. This keeps the same link.

Within about an hour, every sheet downloads it. Everyone then sees **🆕 Update ready** at the top of their menu,
a notice when they open the sheet, and (when `repair: true`) a yellow **UPDATE READY** banner on the Dashboard
until they click **Apply the update**.

To check who has it: their **📧 Outreach → Which Gmail am I using?** shows the version.

## What the Admin view flags

🔴 deleted leads, Log rows or Do Not Contact rows, total sent going down, tabs or columns removed, lost access.
🟡 daily limits above 35, warm-up off, opt-out line removed, sending paused, follow-ups late, nothing sent in 24
hours, no leads waiting, high bounce rate. Every alert is kept in **Team Alerts**, and **Team History** keeps
everyone's numbers over time. Details: `SETUP.md`, "Admin: watch your team's sheets".

## Checklist

- [ ] `ADMINS`, `BRAND_NAME`, `BRAND_CREDIT`, `CURRENCY` filled in
- [ ] `Code.gs` in your Drive, shared as Anyone with the link → Viewer
- [ ] `CODE_URL` in `Loader.gs` points to it
- [ ] Your own master sheet set up with your `Loader.gs`
- [ ] Each team member's sheet added on the Team tab, automatic checks on
- [ ] Earnings Board shared with the team, its link in `TEAM_BOARD`, `Code.gs` uploaded again
