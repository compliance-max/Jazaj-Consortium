import crypto from "crypto";
import path from "path";
import { promises as fs } from "fs";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

type UploadInput = {
  buffer: Buffer;
  filename: string;
  contentType: string;
  keyPrefix: string;
};

type UploadOutput = {
  storageKey: string;
  sizeBytes: number;
};

const LOCAL_STORAGE_ROOT = path.join(process.cwd(), ".local-storage");

let s3ClientSingleton: S3Client | null | undefined;

function isS3Configured() {
  return Boolean(
    process.env.S3_BUCKET &&
      process.env.S3_REGION &&
      process.env.S3_ACCESS_KEY &&
      process.env.S3_SECRET_KEY
  );
}

function getS3Client() {
  if (s3ClientSingleton !== undefined) return s3ClientSingleton;
  if (!isS3Configured()) {
    s3ClientSingleton = null;
    return s3ClientSingleton;
  }

  s3ClientSingleton = new S3Client({
    region: process.env.S3_REGION,
    endpoint: process.env.S3_ENDPOINT || undefined,
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY as string,
      secretAccessKey: process.env.S3_SECRET_KEY as string
    },
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true"
  });
  return s3ClientSingleton;
}

function sanitizeFilename(input: string) {
  return input.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function createStorageKey(input: { keyPrefix: string; filename: string }) {
  const cleanName = sanitizeFilename(input.filename);
  const random = crypto.randomBytes(12).toString("hex");
  const prefix = input.keyPrefix.replace(/^\/+|\/+$/g, "");
  return `${prefix}/${Date.now()}-${random}-${cleanName}`;
}

function localSignedToken(storageKey: string, expiresAt: number) {
  const secret = process.env.NEXTAUTH_SECRET || "dev-doc-secret";
  return crypto.createHmac("sha256", secret).update(`${storageKey}|${expiresAt}`).digest("hex");
}

export function verifyLocalSignedToken(input: { storageKey: string; expiresAt: number; signature: string }) {
  const expected = localSignedToken(input.storageKey, input.expiresAt);
  if (Date.now() > input.expiresAt * 1000) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(input.signature));
}

export async function uploadDocumentBinary(input: UploadInput): Promise<UploadOutput> {
  const storageKey = createStorageKey({
    keyPrefix: input.keyPrefix,
    filename: input.filename
  });

  const s3 = getS3Client();
  const bucket = process.env.S3_BUCKET;
  if (s3 && bucket) {
    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: storageKey,
        Body: input.buffer,
        ContentType: input.contentType
      })
    );
    return {
      storageKey,
      sizeBytes: input.buffer.byteLength
    };
  }

  const localPath = path.join(LOCAL_STORAGE_ROOT, storageKey);
  await fs.mkdir(path.dirname(localPath), { recursive: true });
  await fs.writeFile(localPath, input.buffer);
  return {
    storageKey,
    sizeBytes: input.buffer.byteLength
  };
}

export async function buildDocumentDownloadUrl(input: {
  storageKey: string;
  filename: string;
  contentType: string;
  expiresInSeconds?: number;
}) {
  const expiresInSeconds = input.expiresInSeconds || 900;
  const s3 = getS3Client();
  const bucket = process.env.S3_BUCKET;
  if (s3 && bucket) {
    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: input.storageKey,
      ResponseContentType: input.contentType,
      ResponseContentDisposition: `attachment; filename="${sanitizeFilename(input.filename)}"`
    });
    return getSignedUrl(s3, command, { expiresIn: expiresInSeconds });
  }

  const appUrl = process.env.APP_URL || "http://localhost:3000";
  const expiresAt = Math.floor(Date.now() / 1000) + expiresInSeconds;
  const sig = localSignedToken(input.storageKey, expiresAt);
  const params = new URLSearchParams({
    key: input.storageKey,
    exp: String(expiresAt),
    sig,
    filename: sanitizeFilename(input.filename)
  });
  return `${appUrl}/api/documents/raw?${params.toString()}`;
}

export async function readLocalDocument(storageKey: string) {
  const localPath = path.join(LOCAL_STORAGE_ROOT, storageKey);
  return fs.readFile(localPath);
}
