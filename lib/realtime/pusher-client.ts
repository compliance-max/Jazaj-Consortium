"use client";

import Pusher from "pusher-js";

let clientSingleton: Pusher | null | undefined;

export function getPusherClient() {
  if (clientSingleton !== undefined) return clientSingleton;
  const key = process.env.NEXT_PUBLIC_PUSHER_KEY;
  const cluster = process.env.NEXT_PUBLIC_PUSHER_CLUSTER;
  if (!key || !cluster) {
    clientSingleton = null;
    return clientSingleton;
  }

  clientSingleton = new Pusher(key, {
    cluster
  });
  return clientSingleton;
}
