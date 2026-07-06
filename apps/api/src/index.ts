import { buildServer } from './server';

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? '0.0.0.0';

const server = buildServer();

server.listen({ port, host }).catch((err) => {
  server.log.error(err);
  process.exit(1);
});
