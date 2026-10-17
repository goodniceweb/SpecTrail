---
name: "OPSX: Idea"
description: "Save a raw idea to the ideas folder. No exploring, no questions, no change."
category: "Workflow"
tags: ["workflow", "idea"]
---

Save the idea to `{{IDEAS_DIR}}/`. Only save it.

**Input:** $ARGUMENTS

If the input is empty, use the idea text of the last user message. If there is no idea text, ask for it in one short sentence and stop.

**Do not:**
- explore the idea, give opinions, or suggest improvements;
- ask questions about the idea;
- read code, specs, or other ideas (except to find an existing slug, step 1);
- make an OpenSpec change or any file other than the idea file.

**Steps**

1. **Find the file.**
   - List the files in `{{IDEAS_DIR}}/`. A file name is `<YYYY-MM-DD>-<slug>.md`.
   - If the input starts with the slug of an existing file and a colon (for example `seat-swap: ...`), add to that file (step 3).
   - Otherwise, make a new slug from the main topic: two to five words, kebab-case. If that slug exists, add `-2`, `-3`, and so on. Then make a new file (step 2).

2. **New file:** write `{{IDEAS_DIR}}/<today>-<slug>.md`. Make the folder if it does not exist.

   `````markdown
   ---
   title: <a short title, eight words or fewer>
   created: <today>
   ---

   ## <today>

   ### Notes

   - <one bullet for each point>

   ### Raw

   ````text
   <the input, exactly as the user wrote it>
   ````
   `````

3. **Existing file:** add a new `## <today>` section at the end, with the same `### Notes` and `### Raw` parts. Do not change the earlier sections or the frontmatter.

4. **Reply** with one line: the path of the file, and "new" or "updated".

**Rules for the Notes**
- Keep every point of the input, in the same order.
- Fix typos. Split long sentences. Use the writing rules of the project, if it has them (for example in `CLAUDE.md`).
- Do not add points, conclusions, or opinions. Do not drop a point because it looks unclear; keep it as the user said it.

**Rules for the Raw part**
- Copy the input exactly. Do not fix anything.

**Later:** when an OpenSpec change starts from this idea, add `change: <change-name>` to the frontmatter. The spectrail board then shows the idea on the card of that change, and not in the Exploring column. If the change has the same name as the idea slug, the board links them without the key.
