export interface CharacterConfig {
  id: string;
  name: string;
  role: string;
  spriteUrl: string;
  description: string;
}

export interface AccessCodeEntry {
  code: string;
  character: CharacterConfig;
  assignedTo: string;
}

export const CHARACTERS: Record<string, CharacterConfig> = {
  char_1: {
    id: "char_1",
    name: "Aarav",
    role: "Resident",
    spriteUrl: "/assets/characters/me.png",
    description: "Classic Ramlila Ground regular with black hair and traditional style.",
  },
  char_2: {
    id: "char_2",
    name: "Kabir",
    role: "Explorer",
    spriteUrl: "/assets/characters/player2.png",
    description: "Festive visitor in a vibrant cyan & blue kurta.",
  },
};

/**
 * Permanent Personal Access Codes.
 * Codes are verified case-insensitively and whitespace-trimmed.
 */
export const ACCESS_CODES: Record<string, AccessCodeEntry> = {
  "GROUND-01": {
    code: "GROUND-01",
    character: CHARACTERS.char_1,
    assignedTo: "Player 1",
  },
  "GROUND-02": {
    code: "GROUND-02",
    character: CHARACTERS.char_2,
    assignedTo: "Player 2",
  },
  // Friendly aliases / testing codes
  "RAMLILA-1": {
    code: "RAMLILA-1",
    character: CHARACTERS.char_1,
    assignedTo: "Aarav",
  },
  "RAMLILA-2": {
    code: "RAMLILA-2",
    character: CHARACTERS.char_2,
    assignedTo: "Kabir",
  },
};
