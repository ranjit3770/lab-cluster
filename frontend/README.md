# Cluster UI

React + TypeScript + Vite + Tailwind frontend for the Ray job platform described in `../NEW/FRONTEND/`.

```bash
npm install
npm run dev      # dev server
npm test         # Vitest (jsdom + Testing Library), single run
npm run build    # type-check + production build
npm run lint     # oxlint
```

Run one test file: `npx vitest run src/components/common/FeedbackButton.test.tsx`
Filter by name: `npx vitest run -t "submits the trimmed message"`

The API base URL defaults to `http://localhost:8000` and can be overridden with `VITE_API_URL`.
