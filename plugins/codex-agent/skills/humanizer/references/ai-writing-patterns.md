# AI Writing Patterns

A model picks the wording that fits the widest range of readers, so its defaults are even and generic. A person writing for one reader makes uneven, specific choices, and that unevenness is what makes text sound authored.

The patterns below are ordered strongest first. Patterns 1 to 5 justify an edit on one sighting. A pattern marked *weak alone* needs company from other tells in the same passage before you act; a careful writer uses these on purpose. Vocabulary drifts with each model release, so the structural habits lead.

## A. Staging instead of stating

### 1. Not X but Y

**Looks like:** "not just X, but Y"; "it isn't X, it's Y"; "X rather than Y"; the same contrast split across two sentences; a clipped negative tail such as ", no guessing".

**Why it reads as machine-written:** the negative half names something nobody claimed, which makes the positive half sound larger without adding a claim. Keep a contrast only when it corrects something the reader believes or when both halves carry information.

**Before:** The plugin is not merely a prompt library; it is a coordination layer.
**After:** The plugin coordinates work across skills and agents.

### 2. Staged openers and invented candor

**Looks like:** "Let's dive in", "Here's what you need to know", "Now let's look at", "Quick note", "Heads up", a standalone "Honestly?", "Here's the thing", "Real talk".

**Why it reads as machine-written:** the sentence announces the point, or performs a moment of candor, instead of making the point. The word "honestly" inside a sentence is ordinary; the standalone opener before a routine claim is the tell.

**Before:** Let's dive into how routing works here. Here's what you need to know.
**After:** Routing resolves the requested model to one provider link and key.

### 3. One-line closers and fragment rows

**Looks like:** a sentence alone in its own paragraph that restates the paragraph above ("That is the real win."); "Read that again."; a row of fragments ("No caching. No retries."); the same closer after several sections.

**Why it reads as machine-written:** the line asks the reader to pause on a claim rather than adding to it. A short sentence earns its place only when it carries a new fact.

**Before:**

> The retry covers brief outages.
>
> That is the real win.

**After:** The retry covers brief outages.

### 4. Arguing with no one

**Looks like:** "This isn't about X", "I'm not saying", "To be clear", "Don't get me wrong", "You might think... but", "A tempting approach would be to".

**Why it reads as machine-written:** the text answers an objection or rejects an option that appears nowhere else, usually left over from an earlier draft. Remove the defense; if it holds a claim, state the claim.

**Before:** This is not to say that documentation does not matter. The question is whether the agent can use the instruction while it acts.
**After:** The question is whether the agent can use the instruction while it acts.

### 5. Stacked qualifiers

**Looks like:** "could potentially", "might arguably", "in some cases it may", "to be fair", "this is an inference". *Weak alone.*

**Why it reads as machine-written:** qualifiers accumulate during editing, usually to soften an earlier overstatement, until no claim is left. Keep a qualifier when the source supports it and the meaning needs it, and keep real corrections, scope statements, and safety notices. Ordinary hedges such as "perhaps" or "tends to" are human habits.

**Before:** This could potentially be argued to have some effect on startup time.
**After:** This may affect startup time.

## B. Rhythm by rule

### 6. Forced triads

**Looks like:** three adjectives, three parallel examples, or three short facts followed by a lesson, whether or not the meaning has three parts.

**Why it reads as machine-written:** threes sound complete, so the pattern appears even when two items or four would be accurate. Check that every item adds a distinct idea; merge, develop the strongest one, or vary the structure when it does not.

**Before:** The change improves clarity, consistency, and maintainability.
**After:** The change removes the duplicated validation path.

### 7. Repeated sentence openings

**Looks like:** several consecutive sentences with the same subject or the same first three words. *Weak alone.*

**Why it reads as machine-written:** repetition is handled by rule instead of by ear. Merge the sentences, change the subject, or open with the action. A deliberate repeat for rhythm is fine.

**Before:** The hook reads the payload. The hook validates the payload. The hook forwards the payload.
**After:** The hook validates the payload and forwards it.

### 8. Dashes as the universal connector

**Looks like:** em or en dashes, spaced dashes, or a double hyphen used as a dash, appearing in every paragraph.

**Why it reads as machine-written:** a dash lets the writer skip deciding how two clauses relate, so it becomes the default. Use a period, comma, colon, or parentheses, or rewrite the sentence. Keep dashes inside code, commands, paths, and quotations.

**Before:** The migration — announced without warning — rewrites the index -- and removes the legacy root.
**After:** The migration rewrites the index and removes the legacy root without warning.

## C. Inflation and borrowed authority

### 9. Overused AI vocabulary

**Looks like:** delve, deep dive, crucial, pivotal, robust, seamless, landscape, tapestry, testament, underscore, showcase, foster, garner, interplay, meticulous, vibrant, "align with", "stands as".

**Why it reads as machine-written:** models reach for these words far more often than people do, especially in clusters. This is the only vocabulary list here, and a single formal word outside it is not a tell. Technical uses of "robust", "gate", or "key" are ordinary.

**Before:** Additionally, the loader plays a pivotal role in the caching landscape.
**After:** The loader reads each file once and caches the parsed result.

### 10. Inflated significance

**Looks like:** "pivotal moment", "stands as a testament", "plays a key role", "marks a shift", "sets the stage for", "indelible mark", "despite these challenges, it continues to thrive", stock "challenges and outlook" sections, and send-offs such as "the future looks bright".

**Why it reads as machine-written:** an ordinary detail is said to mark a change, prove a legacy, or promise a future. Keep the fact and drop the significance; end on the last concrete fact.

**Before:** The retry limit was added, marking a pivotal moment in the client's evolution.
**After:** The client retries a failed request twice.

### 11. Borrowed authority and vague association

**Looks like:** "experts argue", "observers have noted", "industry reports suggest", "associated with", "in connection with", "linked to", a list of prestigious outlets standing in for what was actually said.

**Why it reads as machine-written:** a name or an unnamed authority substitutes for a claim. When the source names the real relationship, use it; otherwise drop the claim. Never invent a source, and keep the vague wording when the source itself is vague.

**Before:** The retry behavior is widely considered essential for reliability.
**After:** The client retries twice before it reports a failure.

### 12. Shallow -ing riders

**Looks like:** a fact followed by ", highlighting", ", underscoring", ", ensuring", ", reflecting", ", contributing to", or ", showcasing".

**Why it reads as machine-written:** the rider makes a simple fact sound deeper without adding information. Keep it only when the source supports what it claims.

**Before:** The command prints the resolved route, showcasing the transparency of the router.
**After:** The command prints the resolved route.

### 13. Simple verbs replaced

**Looks like:** "serves as", "stands as", "functions as", "operates as", "represents", "boasts", "features", "offers", "maintains".

**Why it reads as machine-written:** a longer phrase stands in for "is", "has", or "does". Use the plain verb.

**Before:** The catalog serves as the canonical source and boasts nine entries.
**After:** The catalog is the canonical source and has nine entries.

## D. Formatting by rule

### 14. Bold as decoration

**Looks like:** every list item with a bold label and a colon, or bold scattered on words that carry no special meaning.

**Why it reads as machine-written:** the formatting adds no information and makes unrelated items look parallel. Remove the bold, and turn a labeled list into prose when the labels are noise.

**Before:**
- **Discovery:** Finds the relevant files.
- **Verification:** Runs the required checks.

**After:** Discovery finds the relevant files, and verification runs the required checks.

### 15. Decorative headings and structure

**Looks like:** Title Case headings, emoji or arrows in headings and bullets, a horizontal rule between every section, a heading repeated by a one-line paragraph, or a closing summary that repeats the sections.

**Why it reads as machine-written:** the document is decorated by rule rather than by the structure of the content. Use sentence case, drop the decoration, remove the repeated line, and let the heading stand once.

### 16. Curly quotation marks

**Looks like:** typographic quotes where the writer or the target format uses straight quotes. *Weak alone.*

**Why it reads as machine-written:** editors auto-curl quotes, so this is weak evidence on its own. Match the surrounding file.

## E. Leftovers

### 17. Chatbot residue

**Looks like:** "Great question!", "Certainly!", "You're absolutely right", "I hope this helps", "Let me know if you'd like me to expand", "Would you like me to continue?", "Here is a...".

**Why it reads as machine-written:** a chat wrapper remains in text that should stand alone. This is the most certain tell and the easiest to miss when it wraps real content. Remove the wrapper and keep the content.

**Before:**

> Great question! Here is the configuration overview. I hope this helps! Let me know if you want more detail on any setting.

**After:**

> The configuration has three sections: providers, models, and keys.

### 18. Knowledge-limit disclaimers and guesses

**Looks like:** "as of my last update", "while specific details are limited", "based on available information", "not widely documented", "maintains a low profile", "likely studied", "it is believed that".

**Why it reads as machine-written:** the text narrates where the knowledge ends and then fills the gap with a plausible guess. State plainly what is unknown, or remove the sentence, and never present a guess as fact.

**Before:** The upstream's retry default is not widely documented, so it likely retries twice.
**After:** The available sources do not state the upstream's retry default. Verify it against the installed client.

### 19. Writing about the previous version

**Looks like:** comments or documentation describing the approach the text or code replaced.

**Why it reads as machine-written:** the reader needs the current behavior, not the draft history. Keep replacement framing for changelogs, release notes, and migration guides.

**Before:** This function replaces the earlier approach of iterating every item, which was slow.
**After:** This function uses a hash map, so lookup does not scan the collection.

## When not to act

Each pattern describes a default choice that a person can also make on purpose.

- Leave a watched phrase alone inside a quotation, a title, a proper name, or a passage that discusses the phrase rather than uses it.
- Act on a *weak alone* tell only when other tells share the passage.
- Keep specific details, mixed feelings, dated references, and genuine asides; they carry the writer's voice.
- Never touch code, commands, paths, metadata, data, or link targets to satisfy a style rule.
- Never trade evidence for smoothness. A validation result, severity, residual risk, or unresolved blocker survives every rewrite.
- A supplied writing sample overrides this catalog, including the rule on dashes.
