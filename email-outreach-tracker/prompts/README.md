# Lead Prompts: Quick Start

These prompts find or research leads, write a personalised 3-email sequence
for each one, and give you a CSV to import into your master sheet.

## Start here: the master prompt (for everyone)

**`0-MASTER-PROMPT.txt`** is the one prompt the whole team uses. Nobody edits it.

1. Copy everything below the dashed line.
2. Paste it into a new chat (Claude, ChatGPT, Gemini or Grok).
3. Answer the questions: your name, what you offer, who, where, how many.
   Not sure? Type **SKIP**.
4. Download the file and click **📧 Outreach → Upload a lead file (CSV)**.

If you SKIP the extra offer details, the AI writes the simple email that works well:
*"I have a way [your offer] can help your business... I have samples of what it
looks like. Would you be interested in checking them out?"*
If you give details, it rotates 4 styles (A, B, C, D) so you can see which wins.

The file always has the same columns (see `../lead-template.csv`), and only
complete leads with a real email. Which Gmail sends them and skipping people
already contacted are handled by the sheet when you import.

## Other prompts (advanced)

| You have... | Use |
|---|---|
| **No leads yet, and Vibe Prospecting** | `1-find-leads-vibe-prospecting.txt` |
| **A list from Apollo, Apify, LinkedIn or anywhere else** | `2-enrich-imported-leads.txt` |

## 5 steps, every time

1. **Open a new Claude chat.**
   - Prompt 1: turn on the **Vibe Prospecting** connector.
   - Prompt 2: turn on **web search** and attach your lead file.
2. **Copy the whole prompt and paste it in.** Don't edit anything. If the
   `[ ]` boxes are empty, Claude asks you the questions one at a time.
   Just answer them.
3. **Wait** for the CSV file and the short report.
4. **Spot-check 3 rows:** read the emails, and click one Personalization
   Source link to make sure the fact is true.
5. **Import** into the master sheet: **📧 Outreach → Upload a lead file (CSV)**
   (or Import leads from a link, or paste into the Import tab). Then type **NEXT BATCH** in Claude for more.

**Save time next round:** once Claude has your answers, ask it to *"give me
this prompt with my settings filled in"*. Save that copy for this niche, so
next time you only paste it in.

---

## The email angles (what you're testing)

Every lead gets **one angle** for all three of its emails. Claude rotates the
angles evenly, and the master sheet records which angle each lead got.

| Angle | What it does | Ends with |
|---|---|---|
| **A - Direct pitch** | Says plainly what you do and the result, tied to their pain point | "Open to a quick call?" |
| **B - Idea offer** | Doesn't pitch. "I had an idea for how you could improve your course with AI video" | "Would you like me to send it over?" |
| **C - Sample offer** | Offers to make a small sample for them at no cost | "Want me to put one together?" |
| **D - Problem question** | Opens with a question about their pain point, then how you fix it | "Is that something you're working on?" |
| **E - Proof story** | Opens with a real result for a similar business (only if you have one) | "Open to a quick call?" |

- By default it tests **A, B, C, D**. Change **ANGLES TO TEST** to pick others.
- **C** is only used if you fill in **SAMPLE I CAN OFFER**. **E** is only used
  if you fill in **PROOF I CAN MENTION**.
- Every angle's Follow-up 1 includes your portfolio link, and Follow-up 2 is a
  short last note.

## Finding the winner

The master sheet's **Dashboard** has a **Results by angle** table: leads
emailed, replies, reply rate, and interested + meetings (from the Outcome
column you fill in).

1. **Wait until each angle has about 100 leads emailed** before judging.
   Smaller numbers are mostly luck.
2. Look at **Positive rate** (interested + meetings) first, and reply rate
   second. An angle that gets lots of "no thanks" replies isn't a winner.
3. **Keep the best one or two.** Set **ANGLES TO TEST** to those letters,
   e.g. `B, D`.
4. To keep improving, add back one new or changed angle at a time and test
   it against your winner.

Set the **Outcome** column (Interested, Meeting booked, Not interested) on the
Leads tab whenever someone replies. Without it, the positive rate stays at 0.

---

## The CSV columns

```
Email, First Name, Last Name, Company, Subject, Message, Follow-up 1, Follow-up 2,
Angle, Job Title, Website, Location, Pain Points, Personalization Source,
Fit Score, Email Status, Lead Source
```

You don't need to touch these; the master sheet reads them automatically. To
pick the sending Gmail per lead, add a **Send From** column before importing.

## Tips

- **Verify emails before importing,** especially ones marked `unverified`
  (NeverBounce, ZeroBounce, MillionVerifier). Bounces are the biggest risk for
  free Gmail accounts.
- **Start a new chat for each niche or location,** and after 3–5 batches. Long
  chats get less careful.
- **If the emails feel weak,** lower LEADS PER BATCH to 15–20 so Claude
  researches each lead more.
- **Only write true things** in PROOF I CAN MENTION and SAMPLE I CAN OFFER.
  Claude uses them as promises.
