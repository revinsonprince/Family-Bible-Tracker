# 📖 Family Bible Tracker

A private, collaborative space for families to track, confirm, and encourage Bible reading together.

**Live Website:** [familybibletracker.netlify.app](https://familybibletracker.netlify.app)

---

## ✨ Features

- **🔐 Private Family Groups**: Create or join a group using a unique room code.
- **🛡️ Admin Controls**: Admins can approve or reject new members to keep the space private.
- **📝 Reading Logs**: Easily log your daily Bible reading with book, chapter, and personal reflections.
- **💬 Community Encouragement**: Comment on family members' reading logs to share insights and encouragement.
- **📊 Family Dashboard**: Track progress with a shared dashboard showing total chapters read and verification rates.
- **🤖 AI Avatars**: Generate unique, hand-drawn style avatars using Google's Gemini AI.
- **📱 Mobile-First Design**: A clean, responsive interface that works beautifully on all devices.
- **🔔 Daily Reminders**: Visual indicators for members who haven't logged a reading today.

## 🛠️ Tech Stack

- **Frontend**: React 18, TypeScript, Tailwind CSS
- **Backend/Database**: Firebase Firestore
- **Authentication**: Firebase Auth (Google Sign-In)
- **AI Integration**: Google Gemini API (for avatar generation)
- **Animations**: Framer Motion
- **Icons**: Lucide React

## 🚀 Getting Started

### Prerequisites

- Node.js (v18 or higher)
- A Firebase Project
- A Google AI Studio API Key (for Gemini features)

### Installation

1. **Clone the repository**:
   ```bash
   git clone https://github.com/your-username/family-bible-tracker.git
   cd family-bible-tracker
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Configure Environment Variables**:
   Create a `.env` file in the root directory and add your keys:
   ```env
   GEMINI_API_KEY=your_gemini_api_key
   ```

4. **Firebase Setup**:
   Ensure your `firebase-applet-config.json` contains your Firebase project credentials.

5. **Run the development server**:
   ```bash
   npm run dev
   ```

## 🔒 Security Rules

The application uses strict Firestore Security Rules to ensure:
- Only approved members can read or write to their family group.
- Users can only edit their own profile and reading logs.
- Admins have the authority to manage group membership.

---

Built with ❤️ for families growing together in the God.
