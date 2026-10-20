import { test, expect } from "@playwright/test";

test("a registered user can create a project and see a new task on the board", async ({ page }) => {
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  const email = `e2e-${suffix}@example.test`;
  const name = `E2E User ${suffix}`;
  const password = "TeamFlowE2E123!";
  const projectName = `E2E Project ${suffix}`;
  const taskName = `E2E task appears ${suffix}`;

  await page.goto("/");
  await page.getByRole("button", { name: "Create an account" }).click();
  await page.getByLabel("Full name").fill(name);
  await page.getByLabel("Work email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText("Account created. Sign in to open your workspace.")).toBeVisible();

  await page.getByLabel("Work email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: /Sign in to TeamFlow/ }).click();
  await page.getByRole("button", { name: "Create your first project" }).click();
  await page.getByLabel(/Project name/).fill(projectName);
  await page.getByRole("button", { name: /Create project/ }).last().click();
  await expect(page.getByRole("heading", { name: projectName })).toBeVisible();

  await page.getByRole("button", { name: "New task" }).click();
  await page.getByLabel(/Task title/).fill(taskName);
  await page.getByRole("button", { name: "Create task" }).click();
  await expect(page.getByRole("button", { name: taskName })).toBeVisible();
});
