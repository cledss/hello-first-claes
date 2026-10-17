export type PreMcpIntent = "identify" | "capabilities" | "contact" | "message";

export const PRE_MCP_TEMPLATES: ReadonlyArray<{ intent: PreMcpIntent; question: string }> = [
  { intent: "identify", question: "Who are you?" },
  { intent: "capabilities", question: "What can you do?" },
  { intent: "contact", question: "How can I reach First Claes?" },
  { intent: "message", question: "Leave a message" },
];

const answers: Record<PreMcpIntent, string> = {
  identify:
    "Hej! Jag är Second Claes, personlig digital assistent till First Claes. Jag representerar honom här och kan ta emot meddelanden åt honom.",
  capabilities:
    "Just nu kan jag berätta vem jag är, ta emot meddelanden till First Claes och bekräfta att de lagts i hans meddelandekö. Jag är ingen allmän AI-chatt.",
  contact:
    "Du kan lämna ett meddelande här till First Claes. Jag sparar det i hans kö. Jag kan inte lova när han läser eller besvarar det.",
  message:
    "Skriv ditt meddelande till First Claes här och välj Skicka. Jag bekräftar först när det har sparats i kön.",
};

const normalize = (value: string) =>
  value
    .toLocaleLowerCase("sv-SE")
    .normalize("NFKC")
    .trim()
    .replace(/[.!?]+$/g, "")
    .replace(/\s+/g, " ");

const phrases: Record<PreMcpIntent, readonly string[]> = {
  identify: ["who are you", "vem är du", "who is second claes", "vem är second claes"],
  capabilities: ["what can you do", "vad kan du göra", "vad gör du", "what do you do"],
  contact: [
    "how can i reach first claes",
    "can i speak to first claes",
    "how do i contact first claes",
    "hur når jag first claes",
    "hur kontaktar jag first claes",
    "kan jag prata med first claes",
  ],
  message: ["leave a message", "lämna meddelande", "jag vill lämna ett meddelande"],
};

// Match complete, known questions only. Other text is a message to First Claes,
// never an invented AI response or a substring-triggered classification.
export function preMcpResponse(input: string): { intent: PreMcpIntent; reply: string } | null {
  const normalized = normalize(input);
  for (const intent of PRE_MCP_TEMPLATES.map((template) => template.intent)) {
    if (phrases[intent].includes(normalized)) return { intent, reply: answers[intent] };
  }
  return null;
}
