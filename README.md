This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Auth interno

Toda la app queda protegida por login excepto `/encuesta/*` (encuesta pública),
`/login` y `/api/auth/login` / `/api/auth/logout`. Sesión mínima por cookie
httpOnly firmada (sin base de datos), ver `lib/auth/session.ts` y `proxy.ts`.

Variables de entorno (`.env.local`):

- `PICKUP_ADMIN_USER` — usuario de acceso interno.
- `PICKUP_ADMIN_PASSWORD` (o `PICKUP_ADMIN_PIN`) — contraseña o PIN.

En desarrollo, si faltan estas variables se usa un fallback fijo
(`admin` / `pickup4x4-dev`) solo cuando `NODE_ENV !== "production"`. En
producción, si faltan, el acceso interno queda bloqueado (503) en vez de
quedar abierto.

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
