export const BIBLE_BOOKS = [
  "Genesis", "Exodus", "Leviticus", "Numbers", "Deuteronomy",
  "Joshua", "Judges", "Ruth", "1 Samuel", "2 Samuel",
  "1 Kings", "2 Kings", "1 Chronicles", "2 Chronicles",
  "Ezra", "Nehemiah", "Esther", "Job", "Psalms",
  "Proverbs", "Ecclesiastes", "Song of Solomon", "Isaiah",
  "Jeremiah", "Lamentations", "Ezekiel", "Daniel",
  "Hosea", "Joel", "Amos", "Obadiah", "Jonah",
  "Micah", "Nahum", "Habakkuk", "Zephaniah", "Haggai",
  "Zechariah", "Malachi",
  "Matthew", "Mark", "Luke", "John", "Acts",
  "Romans", "1 Corinthians", "2 Corinthians", "Galatians",
  "Ephesians", "Philippians", "Colossians", "1 Thessalonians",
  "2 Thessalonians", "1 Timothy", "2 Timothy", "Titus",
  "Philemon", "Hebrews", "James", "1 Peter", "2 Peter",
  "1 John", "2 John", "3 John", "Jude", "Revelation"
];

export interface Member {
  uid: string;
  displayName: string;
  photoURL: string | null;
  role: 'admin' | 'member';
  status: 'pending' | 'approved';
  joinedAt: string;
  lastReadAt: string | null;
}

export interface ReadingLog {
  id: string;
  memberUid: string;
  memberName: string;
  memberPhoto: string | null;
  book: string;
  chapter: number;
  readAt: string;
  confirmedByUid: string | null;
  confirmerName: string | null;
}

export interface FamilyGroup {
  id: string;
  name: string;
  adminUid: string;
  createdAt: string;
}
