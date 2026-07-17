# Market Cap X Cycle Design

## Objective

Announce the launch of WCORE's Market Cap Crypto and Market Cap Stock pages with a product-led X post, then identify a small set of authentic community conversations where WCORE can contribute useful replies.

## Scope

- Create one 1200x675 illustrated product post.
- Use real product views from the deployed Crypto and Stock market-cap pages.
- Prepare the final post in the X composer as a draft.
- Run a read-only scan of notifications and relevant live searches.
- Select at most three external reply candidates and provide exact proposed replies for review.
- Do not publish, like, repost, follow, or reply automatically.

## Editorial Direction

The post is a product announcement, not a general market education thread.

Headline:

> Two markets. One clean ranking.

Supporting claims:

- 5,000 crypto assets.
- 5,000 public companies.
- Search, rankings, logos, and explicit data freshness.
- Two markets available from one WCORE navigation.

Avoid claims that the pages are real-time. Do not place volatile asset prices in the promotional copy.

## Visual Design

- Canvas: 1200x675.
- Preserve the established WCORE v12 visual language: dark background, lime accents, restrained grid and glow treatment.
- Place the official WCORE badge at the upper left.
- Use the headline and the two coverage figures in the left column.
- Place two real product previews in the right column, with Crypto above Stock.
- Keep rankings, logos, and market-cap columns legible without exposing unnecessary browser chrome.
- Use `Search. Compare. Stay informed.` and `wcore.xyz` as the footer message.
- Verify spacing, clipping, text contrast, and output dimensions before preparing the draft.

## Post Copy

```text
Today's WCORE update.

Market Cap Crypto and Market Cap Stock are live.

Explore 5,000 crypto assets and 5,000 public companies with search, rankings, logos and clear data freshness.

Two markets. One clean view.

wcore.xyz
```

The copy must contain no em dash, en dash, non-breaking space, or ellipsis.

## Community Scan

Search in read-only mode for recent, authentic conversations about:

- comparing crypto and stock market capitalizations;
- discovering or ranking crypto assets;
- fragmented portfolio and market research tools;
- evaluating market value without promotional noise.

Reject candidates that are project shills, engagement bait, automated posts, unrelated promotions, or threads already answered by `@WCORExyz`.

For each accepted candidate, record the target URL, author, relevant context, reason for selection, and exact reply draft. Select no more than three.

## Safety And Execution

- Use the dedicated X CDP profile on port 9224.
- Keep scan scripts read-only.
- Verify target author, status ID, and visible thread before proposing a reply.
- Never like WCORE's own content.
- Never publish a reply without explicit approval of the exact text and target.
- Prepare the main post in a clean composer with text and image attached to the same composer.
- Re-read the actual composer text and verify the attachment.
- Leave the final Post action to the user.

## Deliverables

- `wcore-web/apps/web/public/wcore-post-market-cap.svg`
- `wcore-web/apps/web/public/wcore-post-market-cap.png`
- A portable build script under `wcore-web/scripts/`.
- A draft-preparation script under `wcore-web/scripts/x-cycle/`.
- One prepared X draft containing the approved text and image.
- A concise list of zero to three reviewed reply candidates. Zero is valid when no authentic target is found.

## Acceptance Criteria

- The SVG and PNG are exactly 1200x675.
- The visual shows both live product views and the approved headline.
- All visible text fits and remains legible.
- The PNG matches the latest SVG output.
- The post copy passes typography safety checks.
- The X composer contains the complete copy and exactly one intended image.
- No X interaction is published automatically.
- Every proposed reply has passed duplicate, author, relevance, and shill checks.
