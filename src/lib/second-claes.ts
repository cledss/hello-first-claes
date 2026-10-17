export type ConversationMessage = {
  id: number;
  role: "user" | "assistant";
  body: string;
  created_at: string;
  queue_status?: "pending" | "handled" | null;
};

export const VOICEMAIL_GREETING =
  "Hej! Jag är Second Claes, assistent till First Claes. " +
  "Tack för ditt meddelande. Jag har tagit emot det och lagt det i kön för First Claes. " +
  "Du kan återkomma här för att se dina meddelanden.";
