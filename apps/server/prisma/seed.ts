/**
 * The former generic seed deleted broad sets of rows and was unsafe to expose
 * through a routine npm command. Fixtures now live in seed-local.js, which has
 * strict environment and database-host guards.
 */
throw new Error(
  'Le seed générique est désactivé. Utilisez `npm run prisma:seed:local` sur une base locale jetable.',
);
