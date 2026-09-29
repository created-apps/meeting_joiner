import type { Page } from "playwright";

async function getParticipants(page: Page) {
  const names: string[] = [];
  
  const participantsList = page.getByRole("list", {
    name: "Participants",
  });

  const isVisible = await participantsList.isVisible().catch(() => false);
  
  if (!isVisible) {
    const peopleBtn = page.getByLabel("People");
    const showEveryoneBtn = page.getByLabel("Show everyone");

    let targetButton = peopleBtn;
    if (await showEveryoneBtn.isVisible()) {
      targetButton = showEveryoneBtn;
    }

    try {
      const isPressed = await targetButton.getAttribute("aria-pressed");
      if (isPressed !== "true") {
        await targetButton.click();
      }
    } catch (e) {
      await targetButton.click().catch(() => {});
    }
  }

  await participantsList.waitFor({
    state: "visible",
    timeout: 60000,
  }).catch(() => {});

  const isNowVisible = await participantsList.isVisible().catch(() => false);
  if (!isNowVisible) {
    return [];
  }

  const participants = await participantsList.getByRole("listitem").all();
  for (const participant of participants) {
    const name = await participant.getAttribute("aria-label");
    if (name) {
      names.push(name);
    }
  }
  return names;
}

export default getParticipants;
