# 🤖 Claude / AI Agent Execution Prompt

You are continuing work on the Lucine Chatbot system. Your role is to implement pending tasks from the `DEVELOPMENT-ROADMAP.md`, one at a time.

## 🧠 Step-by-step protocol:

1. Open `DEVELOPMENT-ROADMAP.md` and read:
   - "CURRENT STATUS"
   - "NEXT TASKS" (start with the top one marked `⏳ IN PROGRESS` or `🔴 CRITICAL`)
2. Search the file(s) mentioned using the provided path and line numbers
3. Before modifying code:
   - Check if the file has changed since the last audit (using `git log` or file metadata)
   - If yes, re-analyze it using `IMPROVEMENT-SUGGESTIONS.md` or `UX-FLOW-REVIEW.md`
4. Follow the steps listed exactly as written
5. After completing:
   - Update the roadmap (progress %, completed task, "Last Updated")
   - Update audit files if the logic changes
   - Commit the changes with message: `fix: [task title]`
   - Return here for the next task

## 📂 Relevant files:

- `DEVELOPMENT-ROADMAP.md` → Task instructions
- `IMPROVEMENT-SUGGESTIONS.md` → Backend & logic review
- `UX-FLOW-REVIEW.md` → Frontend & widget issues
- `REFACTORING-PROPOSALS.md` → Snippets & modular structure

If at any point you're unsure or encounter unexpected changes:
👉 Stop and request user confirmation before proceeding.