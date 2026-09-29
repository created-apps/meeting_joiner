export async function dispatchMeeting(workerUrl, meetLink, fetchImpl = fetch) {
  const response = await fetchImpl(`${workerUrl}/api/meet/join`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ meet_link: meetLink }),
  });
  const body = await response.json().catch(() => ({}));
  if (![200, 202, 409].includes(response.status)) {
    throw new Error(
      `Worker rejected ${meetLink} with HTTP ${response.status}: ${JSON.stringify(body)}`
    );
  }
  return { statusCode: response.status, body };
}
