const { test, expect } = require("@playwright/test");

// Every test starts from an empty browser profile, so localStorage is clean.
test.beforeEach(async ({ page }) => {
  page.on("dialog", (d) => d.accept());
  await page.goto("/");
});

function isoDate(offsetDays) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

test("add, complete, and delete an assignment", async ({ page }) => {
  await page.fill("#fTitle", "Chapter 4 Quiz");
  await page.fill("#fSubject", "Biology");
  await page.selectOption("#fType", "quiz");
  await page.fill("#fDate", isoDate(3));
  await page.click("#addForm button[type=submit]");

  const card = page.locator(".item-card", { hasText: "Chapter 4 Quiz" });
  await expect(card).toBeVisible();
  await expect(card.locator(".item-subject")).toHaveText("Biology");
  await expect(page.locator("#statWeek")).toHaveText("1");

  await card.locator(".item-check").click();
  await expect(page.locator(".item-card.done", { hasText: "Chapter 4 Quiz" })).toBeVisible();
  await expect(page.locator("#progressPct")).toHaveText("100%");

  await page.locator(".item-card", { hasText: "Chapter 4 Quiz" }).locator(".delete-btn").click();
  await expect(page.locator(".item-card")).toHaveCount(0);
});

test("assignments survive a reload", async ({ page }) => {
  await page.fill("#fTitle", "Lab Report");
  await page.fill("#fSubject", "Chemistry");
  await page.fill("#fDate", isoDate(1));
  await page.click("#addForm button[type=submit]");
  await page.reload();
  await expect(page.locator(".item-card", { hasText: "Lab Report" })).toBeVisible();
});

test("theme toggle flips and persists", async ({ page }) => {
  const html = page.locator("html");
  const before = await html.getAttribute("data-theme");
  await page.click("#themeToggle");
  const after = before === "dark" ? "light" : "dark";
  await expect(html).toHaveAttribute("data-theme", after);
  await page.reload();
  await expect(html).toHaveAttribute("data-theme", after);
});

test("flashcards group into a deck and flip in study mode", async ({ page }) => {
  await page.click('[data-section="flashcards"]');
  await page.fill("#cSubject", "Spanish");
  await page.fill("#cFront", "perro");
  await page.fill("#cBack", "dog");
  await page.click("#cardForm button[type=submit]");

  const deck = page.locator(".deck-card", { hasText: "Spanish" });
  await expect(deck.locator(".deck-count")).toHaveText("1 card");
  await deck.locator(".study-deck-btn").click();

  await expect(page.locator("#studyModeBackdrop")).toBeVisible();
  await expect(page.locator("#flipFront")).toHaveText("perro");
  await page.click("#flipCard");
  await expect(page.locator("#flipCard")).toHaveClass(/flipped/);
  await page.click("#studyModeClose");
  await expect(page.locator("#studyModeBackdrop")).toBeHidden();
});

test("Canvas .ics import parses course and type, and re-import does not duplicate", async ({ page }) => {
  const ics = [
    "BEGIN:VCALENDAR",
    "BEGIN:VEVENT",
    "UID:event-assignment-123",
    "SUMMARY:Midterm Exam [HIST 101]",
    `DTSTART:${isoDate(5).replace(/-/g, "")}T150000Z`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
  const file = { name: "canvas.ics", mimeType: "text/calendar", buffer: Buffer.from(ics) };

  await page.setInputFiles("#importInput", file);
  const card = page.locator(".item-card", { hasText: "Midterm Exam" });
  await expect(card).toHaveCount(1);
  await expect(card.locator(".item-subject")).toHaveText("HIST 101");
  await expect(card.locator(".item-type")).toHaveText("exam");

  await page.setInputFiles("#importInput", []);
  await page.setInputFiles("#importInput", file);
  await expect(page.locator(".item-card", { hasText: "Midterm Exam" })).toHaveCount(1);
});

test("Ask Jarvis shows the hosted-version link offline", async ({ page }) => {
  await page.click('[data-section="ask"]');
  await expect(page.locator("#chatUnavailable")).toBeVisible();
});
