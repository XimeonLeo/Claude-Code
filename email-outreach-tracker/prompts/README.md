# Lead Prompts

Two reusable prompts that turn leads into a CSV your master sheet can import,
with a personalised first email and two follow-ups for every lead.

| Prompt | Use it when | Where leads come from |
|---|---|---|
| `1-find-leads-vibe-prospecting.txt` | You need new leads | Claude finds them with the Vibe Prospecting connector |
| `2-enrich-imported-leads.txt` | You already have a list | Apollo, Apify (e.g. Google Maps scraper), LinkedIn exports, any CSV/Excel |

Both prompts:
- research each lead and list 1–3 **pain points** your service could solve
- qualify leads (pass/fail checks plus a 1–5 **Fit Score**) and drop weak ones
- write the **Subject, Message, Follow-up 1 and Follow-up 2**, with varied
  wording, no signature, and the portfolio link only in Follow-up 1
- output a CSV with **exactly** the columns the master sheet expects
- work in **batches** (default 30). Type `NEXT BATCH` for more

## How to use

1. **Copy the prompt** and fill in the **CAMPAIGN SETTINGS** block: your service,
   niche, location, job titles, proof, link, call to action, etc. Save your
   filled-in copy for each niche, so next time you only change the batch number.
2. **Open a new Claude chat.**
   - Prompt 1: turn on the **Vibe Prospecting** connector.
   - Prompt 2: attach your exported file. Turn on **web search** so Claude
     can read each lead's website.
   - Turn on **file creation** in Claude settings so it can give you a
     downloadable CSV. Without it, Claude outputs a CSV block you can copy
     into a file.
3. **Paste the prompt** and let it run. Read the short report and the review list.
4. **Spot-check 3–5 rows**: open the Personalization Source link and make sure
   the fact in the email is true and the email reads well.
5. **Import into the master sheet**: open the CSV in Google Sheets, then use
   **📧 Outreach → Import leads from a link** (or paste it into the Import tab).
   Choose the sending Gmail, or leave the box blank to spread the leads evenly.
6. Type `NEXT BATCH` in the same chat for more leads. It won't repeat anyone
   from earlier batches in that chat.

## The CSV columns

```
Email, First Name, Last Name, Company, Subject, Message, Follow-up 1, Follow-up 2,
Job Title, Website, Location, Pain Points, Personalization Source, Fit Score,
Email Status, Lead Source
```

The first eight columns fill the master sheet's own columns. The rest are
saved with each lead (in Extra Fields), so you always know where a lead came
from, why it qualified, and what the email was based on.

To choose the sending Gmail per lead, add a **Send From** column with a
Gmail address before importing.

## Tips

- **Verify emails before importing,** especially leads marked `unverified`
  (NeverBounce, ZeroBounce, MillionVerifier). Bounces are the biggest risk for
  free Gmail accounts.
- **Fill in ALREADY CONTACTED** with the emails from your master sheet's
  Leads tab. That saves research credits on people you already have. The
  importer skips duplicates anyway.
- **Start a new chat for each niche or location.** Long chats get slower and
  less careful. 3–5 batches per chat is a good limit.
- **Keep PROOF I CAN MENTION true.** The prompts use it word for word as a claim.
- **Smaller batches give better research.** If quality drops, lower LEADS PER BATCH to 15–20.
