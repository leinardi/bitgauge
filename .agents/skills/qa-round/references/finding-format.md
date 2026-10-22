# Finding format and the QA file

## Severity

- **High:** wrong or unsafe — a number the result contradicts or shown without its qualifier, a
  result saved that must not be or lost that must be kept, a run that cannot be stopped or
  finished, a header, limit or CORS rule that fails open, a request to anything but the origin, a
  body or header in the server's log, or a task the user cannot complete.
- **Medium:** misleading, or a broken flow with a workaround — a notice that contradicts the state
  beside it, a stale screen after a run, a missing not-found or error state, an overflow that hides
  content, an accessibility failure on a main path.
- **Low:** cosmetic, copy, or an accessibility nit off the main path.

## Evidence

- **Verified:** re-checked against the run's Download JSON, the API, `/metrics`, the server log or
  the code after it was seen.
- **Observed:** seen, with the cause located but not re-checked. Say why it could not be.

## One finding

```markdown
### QA-NN: <the defect, as one sentence a reader can act on>

- **Observed:** what happens, with the stack (port and configuration, or demo scenario), route,
  browser, viewport and theme that reproduce it.
- **Expected:** what the spec says, cited as a link with its line or section.
- **Cause:** the file and line that causes it, when found.
- **Evidence:** verified (how) / observed (why not re-checked).
- **Status:** Open.
```

High and medium findings get a section each. Low findings go in one table with the columns
**ID | Finding | Location | Status**, a finding in one sentence or a short list of nits.

## The QA file

`docs/engineering/qa/<date>-<name>.md`. Prose wraps at 100 columns; tables may run longer.

1. **Title and status:** `# Exploratory QA — <name>, <date>`, then **Open.** and a short paragraph
   saying what the round was for and which round it follows.
2. **The setup:** commit under test, stacks (each port's configuration, the demo, the proxy),
   browsers and viewports, areas, what was not covered (real Safari and iOS, a real slow link), and
   every process and side effect.
3. **How to use this file:** a fix commit names the ID in its body (`Fixes QA-NN.`) and the Status
   line records the short hash; a deferral gives its reason; what *verified* and *observed* mean.
4. **Decisions:** D-n entries, each with the context and the decision. While a question is open it
   is a Q-n under **Open questions**, and the findings it blocks say "Blocked on Q-n".
5. **High**, **Medium** (sections), **Low** (table).
6. **To investigate:** seen once, or possibly by design; the next round gives each a verdict.
7. **By design, no action:** link the earlier round's entry rather than repeating it.
8. **Previous round's fixes re-checked:** a table of the ones that are not fully holding and the
   new ID that tracks what is left.
9. **Suggested plan split:** added once the user agrees it (SKILL.md §9).

When every finding is fixed, the last fix plan writes the hashes into the Status lines, folds the
verdicts into To investigate, and flips **Open.** to **Closed.**
