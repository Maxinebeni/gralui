# GRAL Operations Platform — Frontend

Next.js + React + TypeScript + Tailwind CSS. Front end only for now; it uses
sample data until the backend is connected.

## How to run it

You need [Node.js](https://nodejs.org) (version 20 or newer).

1. Clone the repo and go into the folder:

   ```bash
   git clone https://github.com/Maxinebeni/gralui.git
   cd gralui
   ```

2. Install dependencies (first time only):

   ```bash
   npm install
   ```

3. Start the app:

   ```bash
   npm run dev
   ```

4. Open http://localhost:3000 and sign in with **any** email and password.

Stop the app with `Ctrl+C` in the terminal.

## Where things are

| What | File |
| --- | --- |
| Login / forgot password | `src/app/login/`, `src/app/forgot-password/` |
| Top bar and menu | `src/components/gral/shell.tsx` |
| Which roles see which menu tabs | `src/lib/permissions.ts` |
| Clients page and All Clients page | `src/app/(app)/clients/` |
| Client table, search, profile panel | `src/components/gral/client-list.tsx`, `client-file.tsx` |
| Sample data | `src/lib/mock-data.ts` |
| Data functions (swap for backend API later) | `src/lib/api.ts` |

Use the **Role** pill at the top of each page to preview what different roles see.
