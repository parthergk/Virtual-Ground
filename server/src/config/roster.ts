export interface RosterEntry {
  code: string;
  characterId: string;
  name: string;
}

export const VALID_CODES: Record<string, RosterEntry> = {
  "GROUND-01": { code: "GROUND-01", characterId: "char_1", name: "Aarav" },
  "GROUND-02": { code: "GROUND-02", characterId: "char_2", name: "Kabir" },
  "RAMLILA-1": { code: "GROUND-01", characterId: "char_1", name: "Aarav" },
  "RAMLILA-2": { code: "GROUND-02", characterId: "char_2", name: "Kabir" },
};

export const ALLOWED_EMOTES = new Set([
  "Wave",
  "Laugh",
  "Heart",
  "Like",
  "Clap",
  "Sad",
  "Surprised",
  "Dance",
  // Emoji equivalents
  "👋",
  "😂",
  "❤️",
  "🔥",
  "👏",
  "🙏",
  "😮",
  "🪔",
]);

export const EMOTE_NAME_TO_EMOJI: Record<string, string> = {
  Wave: "👋",
  Laugh: "😂",
  Heart: "❤️",
  Like: "🔥",
  Clap: "👏",
  Sad: "🙏",
  Surprised: "😮",
  Dance: "🪔",
};
