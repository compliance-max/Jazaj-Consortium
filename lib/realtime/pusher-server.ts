import Pusher from "pusher";

let serverSingleton: Pusher | null | undefined;

function isConfigured() {
  return Boolean(
    process.env.PUSHER_APP_ID &&
      process.env.PUSHER_KEY &&
      process.env.PUSHER_SECRET &&
      process.env.PUSHER_CLUSTER
  );
}

export function getPusherServer() {
  if (serverSingleton !== undefined) return serverSingleton;
  if (!isConfigured()) {
    serverSingleton = null;
    return serverSingleton;
  }
  serverSingleton = new Pusher({
    appId: process.env.PUSHER_APP_ID as string,
    key: process.env.PUSHER_KEY as string,
    secret: process.env.PUSHER_SECRET as string,
    cluster: process.env.PUSHER_CLUSTER as string,
    useTLS: true
  });
  return serverSingleton;
}

export async function triggerRealtimeEvent(channel: string, event: string, payload: unknown) {
  const server = getPusherServer();
  if (!server) return;
  await server.trigger(channel, event, payload);
}
